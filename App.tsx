// tslint:disable
/* eslint-disable */
import {
  ArrowLeft,
  HelpCircle,
  Menu,
  Play,
  RotateCw,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import Matter from 'matter-js';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {getConfig} from './constants';
import BackgroundMusic from './utils/BackgroundMusic';
import {
  createFixedStepper,
  gameAudio,
  GameState,
  MenuOverlay,
  Overlay,
  prepareCanvas,
  useAssets,
  useAutoFocus,
  useInput,
  useIsMobile,
} from './utils/helper';
import {
  usePlayground,
  usePlaygroundGameLifecycle,
  useRpc,
} from './utils/usePlayground';

const BGM_URL = 'assets/audio/bgm_classroom_showdown.mp3';

interface InkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  maxAlpha: number;
  decay: number;
}

interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  decay: number;
}

interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  color: string;
  alpha: number;
  decay: number;
}

interface FallingPen {
  isPlayer: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  scale: number;
  alpha: number;
  timer: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stepperRef = useRef<ReturnType<typeof createFixedStepper>>();
  const isMobile = useIsMobile();

  // --- PLAYGROUND SDK INTEGRATION ---
  const {sdk} = usePlayground();
  const [exitChat] = useRpc<Record<string, unknown>, void>('ExitChat');

  // --- ASSETS ---
  const ASSETS_MANIFEST: Record<string, string> = {
    desk_wood_background: 'assets/images/desk_wood_background.png',
    player_blue_pen: 'assets/images/player_blue_pen.png',
    rival_red_pen: 'assets/images/rival_red_pen.png',
    stationery_eraser: 'assets/images/stationery_eraser.png',
    stationery_sharpener: 'assets/images/stationery_sharpener.png',
    trophy_badge: 'assets/images/trophy_badge.png',
  };
  const {assets, isReady: assetsReady} = useAssets(ASSETS_MANIFEST);

  const canvasWidth = getConfig('baseCanvasWidth') as number;
  const canvasHeight = getConfig('baseCanvasHeight') as number;

  if (!stepperRef.current) {
    const stepMs = getConfig('stepMs') as number;
    const maxSubSteps = getConfig('maxSubSteps') as number;
    stepperRef.current = createFixedStepper(stepMs, maxSubSteps);
  }

  // --- REACT STATE FOR HUD & OVERLAYS ---
  const [gameState, setGameState] = useState<GameState>({
    status: 'START',
    score: 0,
    level: 1, // Current Round
  });
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const [playerRoundWins, setPlayerRoundWins] = useState(0);
  const [rivalRoundWins, setRivalRoundWins] = useState(0);
  const [turn, setTurn] = useState<'PLAYER' | 'RIVAL'>('PLAYER');
  const [turnBanner, setTurnBanner] = useState('PULL BACK BLUE PEN TO FLICK!');

  // Overlays
  const [isGameMenuOpen, setIsGameMenuOpen] = useState(false);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);
  const [isMusicMuted, setIsMusicMuted] = useState(false);
  const [isSfxMuted, setIsSfxMuted] = useState(gameAudio.getMuteState());

  // Input Hook
  const inputRef = useInput(canvasRef, true, {
    width: canvasWidth,
    height: canvasHeight,
  });

  // --- PHYSICS ENGINE REFS & GAMEPLAY SIMULATION STATE ---
  const engineRef = useRef<Matter.Engine | null>(null);
  const playerBodyRef = useRef<Matter.Body | null>(null);
  const rivalBodyRef = useRef<Matter.Body | null>(null);
  const eraserBodyRef = useRef<Matter.Body | null>(null);
  const sharpenerBodyRef = useRef<Matter.Body | null>(null);

  // Playfield Boundaries (Edges of the wooden table surface)
  const tableBounds = useRef({
    left: 70,
    right: 1306,
    top: 75,
    bottom: 695,
  });

  // Aiming State
  const isDraggingAimRef = useRef(false);
  const aimVectorRef = useRef({dx: 0, dy: 0, power: 0, angle: 0});
  const cancelAimHoverRef = useRef(false);

  // AI Turn State
  const aiStateRef = useRef<{
    phase: 'IDLE' | 'THINKING' | 'AIMING' | 'RELEASE';
    timer: number;
    targetAngle: number;
    targetPower: number;
    currentAimProgress: number;
  }>({
    phase: 'IDLE',
    timer: 0,
    targetAngle: 0,
    targetPower: 0,
    currentAimProgress: 0,
  });

  // Turn Execution State
  const phaseRef = useRef<'AIM' | 'SLIDING' | 'ROUND_OVER'>('AIM');
  const slideRestCounterRef = useRef(0);
  const roundResetTimerRef = useRef<number | null>(null);

  // Juice & Particles
  const particlesRef = useRef<{
    ink: InkParticle[];
    dust: DustParticle[];
    sparks: SparkParticle[];
    fallingPens: FallingPen[];
  }>({
    ink: [],
    dust: [],
    sparks: [],
    fallingPens: [],
  });

  const screenShakeRef = useRef({intensity: 0, duration: 0});

  // Track Back Key
  useEffect(() => {
    (window as any).canHandleBackKey = gameState.status !== 'START';
  }, [gameState.status]);

  // Audio Win/Lose Stingers
  useEffect(() => {
    if (gameState.status === 'GAME_OVER') {
      gameAudio.playDefeatMotif();
    } else if (gameState.status === 'VICTORY') {
      gameAudio.playVictoryFanfare();
    }
  }, [gameState.status]);

  // Keyboard Escape Handler for Game Menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (gameStateRef.current.status === 'PLAYING') {
          if (isHowToPlayOpen) {
            setIsHowToPlayOpen(false);
          } else {
            setIsGameMenuOpen((prev) => !prev);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHowToPlayOpen]);

  // --- INITIALIZE PHYSICS & RESET POSITIONS ---
  const spawnPenBodies = useCallback(
    (engine: Matter.Engine, roundNum: number) => {
      const world = engine.world;

      // Clear existing pen/obstacle bodies if present
      if (playerBodyRef.current) Matter.Composite.remove(world, playerBodyRef.current);
      if (rivalBodyRef.current) Matter.Composite.remove(world, rivalBodyRef.current);
      if (eraserBodyRef.current) Matter.Composite.remove(world, eraserBodyRef.current);
      if (sharpenerBodyRef.current) Matter.Composite.remove(world, sharpenerBodyRef.current);

      const surfaceFriction = getConfig('surfaceFriction') as number;
      const penRestitution = getConfig('penRestitution') as number;
      const penW = getConfig('assetPlayerPenWidth') as number;
      const penH = getConfig('assetPlayerPenHeight') as number;
      const rivalW = getConfig('assetRivalPenWidth') as number;
      const rivalH = getConfig('assetRivalPenHeight') as number;

      // Player Blue Pen on Left, facing Right
      const pX = 280;
      const pY = canvasHeight / 2 + (roundNum % 2 === 1 ? -40 : 40);
      const playerBody = Matter.Bodies.rectangle(pX, pY, penW, penH, {
        restitution: penRestitution,
        frictionAir: surfaceFriction,
        friction: 0.08,
        density: 0.002,
        label: 'playerPen',
        angle: 0,
      });
      playerBodyRef.current = playerBody;

      // Rival Red Pen on Right, facing Left
      const rX = canvasWidth - 280;
      const rY = canvasHeight / 2 + (roundNum % 2 === 1 ? 40 : -40);
      const rivalBody = Matter.Bodies.rectangle(rX, rY, rivalW, rivalH, {
        restitution: penRestitution,
        frictionAir: surfaceFriction,
        friction: 0.08,
        density: 0.002,
        label: 'rivalPen',
        angle: Math.PI,
      });
      rivalBodyRef.current = rivalBody;

      // Stationery Obstacles
      const eraserW = getConfig('assetEraserWidth') as number;
      const eraserH = getConfig('assetEraserHeight') as number;
      const sharpenerW = getConfig('assetSharpenerWidth') as number;
      const sharpenerH = getConfig('assetSharpenerHeight') as number;

      // Varied placements for replayability
      const eraserY = canvasHeight / 2 - 120 + ((roundNum * 37) % 50);
      const sharpenerY = canvasHeight / 2 + 120 - ((roundNum * 43) % 50);

      const eraserBody = Matter.Bodies.rectangle(
        canvasWidth / 2 - 40,
        eraserY,
        eraserW,
        eraserH,
        {
          isStatic: true,
          restitution: 0.85,
          friction: 0.2,
          label: 'eraser',
          angle: -0.2,
        },
      );
      eraserBodyRef.current = eraserBody;

      const sharpenerBody = Matter.Bodies.rectangle(
        canvasWidth / 2 + 50,
        sharpenerY,
        sharpenerW,
        sharpenerH,
        {
          isStatic: true,
          restitution: 0.75,
          friction: 0.2,
          label: 'sharpener',
          angle: 0.15,
        },
      );
      sharpenerBodyRef.current = sharpenerBody;

      Matter.Composite.add(world, [
        playerBody,
        rivalBody,
        eraserBody,
        sharpenerBody,
      ]);
    },
    [canvasHeight, canvasWidth],
  );

  const setupPhysicsEngine = useCallback(() => {
    if (engineRef.current) {
      Matter.World.clear(engineRef.current.world, false);
      Matter.Engine.clear(engineRef.current);
    }

    const engine = Matter.Engine.create({
      gravity: {x: 0, y: 0}, // Zero-G top-down table view
    });
    engineRef.current = engine;

    // Collision Event listener for authentic pen clashes & sounds
    Matter.Events.on(engine, 'collisionStart', (event) => {
      const pairs = event.pairs;
      for (let i = 0; i < pairs.length; i++) {
        const {bodyA, bodyB} = pairs[i];
        const isPenA = bodyA.label === 'playerPen' || bodyA.label === 'rivalPen';
        const isPenB = bodyB.label === 'playerPen' || bodyB.label === 'rivalPen';

        // Pen-to-Pen clash
        if (isPenA && isPenB) {
          gameAudio.playShieldBlock();
          gameAudio.playMeleePunch();
          screenShakeRef.current = {intensity: 9, duration: 0.25};

          // Spawn collision sparks and ink burst
          const contactX = (bodyA.position.x + bodyB.position.x) / 2;
          const contactY = (bodyA.position.y + bodyB.position.y) / 2;
          for (let s = 0; s < 12; s++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 3 + Math.random() * 8;
            particlesRef.current.sparks.push({
              x: contactX,
              y: contactY,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd,
              length: 6 + Math.random() * 10,
              color: s % 2 === 0 ? '#38bdf8' : '#f87171',
              alpha: 1,
              decay: 0.05,
            });
          }
        } else if (isPenA || isPenB) {
          // Pen hits stationery obstacle
          gameAudio.playFootstepWood();
          screenShakeRef.current = {intensity: 4, duration: 0.15};
          const pen = isPenA ? bodyA : bodyB;
          for (let s = 0; s < 6; s++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 2 + Math.random() * 4;
            particlesRef.current.dust.push({
              x: pen.position.x,
              y: pen.position.y,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd,
              size: 4 + Math.random() * 5,
              alpha: 0.8,
              decay: 0.04,
            });
          }
        }
      }
    });

    spawnPenBodies(engine, 1);
  }, [spawnPenBodies]);

  // Reset / Next Round
  const startNextRound = useCallback(
    (roundNum: number) => {
      if (!engineRef.current) return;
      spawnPenBodies(engineRef.current, roundNum);

      phaseRef.current = 'AIM';
      setTurn('PLAYER');
      setTurnBanner('YOUR TURN: DRAG BLUE PEN TO FLICK!');
      aiStateRef.current = {
        phase: 'IDLE',
        timer: 0,
        targetAngle: 0,
        targetPower: 0,
        currentAimProgress: 0,
      };
      isDraggingAimRef.current = false;
      slideRestCounterRef.current = 0;
      roundResetTimerRef.current = null;
    },
    [spawnPenBodies],
  );

  const initGame = useCallback(() => {
    setPlayerRoundWins(0);
    setRivalRoundWins(0);
    setGameState((prev) => ({
      ...prev,
      status: 'PLAYING',
      score: 0,
      level: 1,
    }));
    setIsGameMenuOpen(false);
    setIsHowToPlayOpen(false);
    particlesRef.current = {ink: [], dust: [], sparks: [], fallingPens: []};

    setupPhysicsEngine();
    startNextRound(1);

    if (sdk) {
      sdk.startGame();
    }
  }, [sdk, setupPhysicsEngine, startNextRound]);

  // Autoplay handler
  const hasAutoplayed = useRef(false);
  useEffect(() => {
    if (
      !hasAutoplayed.current &&
      new URLSearchParams(window.location.search).has('autoplay')
    ) {
      hasAutoplayed.current = true;
      initGame();
    }
  }, [initGame]);

  // SDK Lifecycle reporting
  usePlaygroundGameLifecycle(gameState, sdk);

  // --- MAIN SIMULATION UPDATE ---
  const update = (dt: number) => {
    if (gameState.status !== 'PLAYING' || isGameMenuOpen || isHowToPlayOpen) return;

    const engine = engineRef.current;
    if (!engine) return;

    // Update screen shake
    if (screenShakeRef.current.duration > 0) {
      screenShakeRef.current.duration -= dt;
      if (screenShakeRef.current.duration <= 0) {
        screenShakeRef.current.intensity = 0;
      }
    }

    // Step physics
    Matter.Engine.update(engine, dt * 1000);

    const playerBody = playerBodyRef.current;
    const rivalBody = rivalBodyRef.current;

    // Update Juice / Particles
    const particles = particlesRef.current;

    // Ink Trails for fast-moving pens
    if (playerBody && Matter.Vector.magnitude(playerBody.velocity) > 1.2) {
      const nibX = playerBody.position.x + Math.cos(playerBody.angle) * 75;
      const nibY = playerBody.position.y + Math.sin(playerBody.angle) * 75;
      particles.ink.push({
        x: nibX,
        y: nibY,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: 2 + Math.random() * 2,
        color: '#1d4ed8',
        alpha: 0.75,
        maxAlpha: 0.75,
        decay: 0.008, // Slow fade leaves satisfying doodles
      });
      // Slide dust
      if (Math.random() < 0.35) {
        particles.dust.push({
          x: playerBody.position.x,
          y: playerBody.position.y,
          vx: -playerBody.velocity.x * 0.2 + (Math.random() - 0.5) * 1.5,
          vy: -playerBody.velocity.y * 0.2 + (Math.random() - 0.5) * 1.5,
          size: 3 + Math.random() * 3,
          alpha: 0.5,
          decay: 0.03,
        });
      }
    }

    if (rivalBody && Matter.Vector.magnitude(rivalBody.velocity) > 1.2) {
      const nibX = rivalBody.position.x + Math.cos(rivalBody.angle) * 75;
      const nibY = rivalBody.position.y + Math.sin(rivalBody.angle) * 75;
      particles.ink.push({
        x: nibX,
        y: nibY,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: 2 + Math.random() * 2,
        color: '#dc2626',
        alpha: 0.75,
        maxAlpha: 0.75,
        decay: 0.008,
      });
      if (Math.random() < 0.35) {
        particles.dust.push({
          x: rivalBody.position.x,
          y: rivalBody.position.y,
          vx: -rivalBody.velocity.x * 0.2 + (Math.random() - 0.5) * 1.5,
          vy: -rivalBody.velocity.y * 0.2 + (Math.random() - 0.5) * 1.5,
          size: 3 + Math.random() * 3,
          alpha: 0.5,
          decay: 0.03,
        });
      }
    }

    // Step particle arrays
    for (let i = particles.ink.length - 1; i >= 0; i--) {
      const p = particles.ink[i];
      p.alpha -= p.decay;
      if (p.alpha <= 0) particles.ink.splice(i, 1);
    }
    for (let i = particles.dust.length - 1; i >= 0; i--) {
      const p = particles.dust[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      if (p.alpha <= 0) particles.dust.splice(i, 1);
    }
    for (let i = particles.sparks.length - 1; i >= 0; i--) {
      const p = particles.sparks[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      if (p.alpha <= 0) particles.sparks.splice(i, 1);
    }
    for (let i = particles.fallingPens.length - 1; i >= 0; i--) {
      const fp = particles.fallingPens[i];
      fp.x += fp.vx * dt * 60;
      fp.y += fp.vy * dt * 60;
      fp.vy += 0.4; // Downward gravity off table
      fp.angle += fp.angularVelocity * dt;
      fp.scale = Math.max(0.2, fp.scale - dt * 0.6);
      fp.alpha = Math.max(0, fp.alpha - dt * 0.9);
      fp.timer += dt;
      if (fp.alpha <= 0 || fp.timer > 2.5) {
        particles.fallingPens.splice(i, 1);
      }
    }

    // --- GAMEPLAY FLOW & TURN EXECUTION ---
    const pointer = inputRef.current.pointer;
    const maxFlickPower = getConfig('maxFlickPower') as number;
    const flickSensitivity = getConfig('flickSensitivity') as number;

    // Check Edge Fall Knockouts during sliding or aim
    const bounds = tableBounds.current;

    const checkFall = (body: Matter.Body | null, isPlayer: boolean): boolean => {
      if (!body) return false;
      const {x, y} = body.position;
      // If pen center is beyond the desk edge
      if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) {
        // Trigger Falling animation
        particles.fallingPens.push({
          isPlayer,
          x,
          y,
          vx: body.velocity.x * 0.8,
          vy: body.velocity.y * 0.8 + 2.5,
          angle: body.angle,
          angularVelocity: (body.angularVelocity || 0.1) * 3,
          scale: 1.0,
          alpha: 1.0,
          timer: 0,
        });

        // Knockout Sound & Shake
        gameAudio.playJumpLandingThud();
        screenShakeRef.current = {intensity: 12, duration: 0.35};

        // Remove from physical world to avoid ghost collisions
        Matter.Composite.remove(engine.world, body);
        if (isPlayer) {
          playerBodyRef.current = null;
        } else {
          rivalBodyRef.current = null;
        }
        return true;
      }
      return false;
    };

    if (phaseRef.current === 'SLIDING') {
      const playerFell = checkFall(playerBodyRef.current, true);
      const rivalFell = checkFall(rivalBodyRef.current, false);

      if (playerFell || rivalFell) {
        phaseRef.current = 'ROUND_OVER';
        const pointsToWin = getConfig('pointsToWin') as number;

        if (rivalFell && !playerFell) {
          // Player scores!
          gameAudio.playLevelUpStinger();
          const nextScore = gameState.score + 1;
          const nextPScore = playerRoundWins + 1;
          setPlayerRoundWins(nextPScore);
          setGameState((prev) => ({...prev, score: nextScore}));
          setTurnBanner('💥 KNOCKOUT! BLUE SCORES A POINT!');

          if (nextPScore >= pointsToWin) {
            roundResetTimerRef.current = window.setTimeout(() => {
              setGameState((prev) => ({...prev, status: 'VICTORY'}));
            }, 1200);
            return;
          }
        } else if (playerFell && !rivalFell) {
          // Rival scores!
          gameAudio.playGeneralDamage();
          const nextRScore = rivalRoundWins + 1;
          setRivalRoundWins(nextRScore);
          setTurnBanner('💥 TUMBLE! RED SCORES A POINT!');

          if (nextRScore >= pointsToWin) {
            roundResetTimerRef.current = window.setTimeout(() => {
              setGameState((prev) => ({...prev, status: 'GAME_OVER'}));
            }, 1200);
            return;
          }
        } else {
          // Double knockout
          gameAudio.playGeneralDamage();
          setTurnBanner('💥 DOUBLE TUMBLE! NO POINTS AWARDED!');
        }

        // Delay then respawn for next round
        roundResetTimerRef.current = window.setTimeout(() => {
          setGameState((prev) => ({...prev, level: prev.level + 1}));
          startNextRound(gameState.level + 1);
        }, 1800);
        return;
      }

      // Check if motion has stopped
      const pSpeed = playerBody ? Matter.Vector.magnitude(playerBody.velocity) : 0;
      const rSpeed = rivalBody ? Matter.Vector.magnitude(rivalBody.velocity) : 0;
      const pAng = playerBody ? Math.abs(playerBody.angularVelocity) : 0;
      const rAng = rivalBody ? Math.abs(rivalBody.angularVelocity) : 0;

      if (pSpeed < 0.18 && rSpeed < 0.18 && pAng < 0.04 && rAng < 0.04) {
        slideRestCounterRef.current += dt;
        if (slideRestCounterRef.current > 0.35) {
          // Zero out residual micro-drifts
          if (playerBody) {
            Matter.Body.setVelocity(playerBody, {x: 0, y: 0});
            Matter.Body.setAngularVelocity(playerBody, 0);
          }
          if (rivalBody) {
            Matter.Body.setVelocity(rivalBody, {x: 0, y: 0});
            Matter.Body.setAngularVelocity(rivalBody, 0);
          }

          // Switch Turns
          phaseRef.current = 'AIM';
          slideRestCounterRef.current = 0;
          if (turn === 'PLAYER') {
            setTurn('RIVAL');
            setTurnBanner('RIVAL IS SIZING UP THE SHOT...');
            aiStateRef.current = {
              phase: 'THINKING',
              timer: 0.7,
              targetAngle: 0,
              targetPower: 0,
              currentAimProgress: 0,
            };
          } else {
            setTurn('PLAYER');
            setTurnBanner('YOUR TURN: DRAG BLUE PEN TO FLICK!');
          }
        }
      } else {
        slideRestCounterRef.current = 0;
      }
    }

    // --- PLAYER AIMING (SLINGSHOT) ---
    if (phaseRef.current === 'AIM' && turn === 'PLAYER' && playerBody) {
      if (pointer.down) {
        const pPos = playerBody.position;
        const distToPen = Math.hypot(pointer.x - pPos.x, pointer.y - pPos.y);

        if (!isDraggingAimRef.current) {
          // Initiate slingshot pull if touching near the pen
          if (distToPen < 90) {
            isDraggingAimRef.current = true;
            gameAudio.playCrispClick();
          }
        } else {
          // Currently pulling backward like a slingshot
          // Vector from pen to finger:
          const pullX = pointer.x - pPos.x;
          const pullY = pointer.y - pPos.y;
          const pullDist = Math.hypot(pullX, pullY);

          // Slingshot shoots opposite of pull
          const angle = Math.atan2(-pullY, -pullX);
          const power = Math.min(maxFlickPower, pullDist * flickSensitivity);

          aimVectorRef.current = {
            dx: pullX,
            dy: pullY,
            power,
            angle,
          };
        }
      } else if (isDraggingAimRef.current) {
        // Pointer released! Launch the pen!
        isDraggingAimRef.current = false;
        const {power, angle} = aimVectorRef.current;

        if (power > 3 && !cancelAimHoverRef.current) {
          const vx = Math.cos(angle) * power;
          const vy = Math.sin(angle) * power;

          Matter.Body.setVelocity(playerBody, {x: vx, y: vy});
          // Add off-center flick torque based on angle relative to pen orientation
          const torqueFactor = Math.sin(angle - playerBody.angle) * 0.12;
          Matter.Body.setAngularVelocity(playerBody, torqueFactor);

          gameAudio.playCrispClick();
          gameAudio.playFootstepWood();

          // Launch dust particles
          for (let d = 0; d < 8; d++) {
            particles.dust.push({
              x: playerBody.position.x,
              y: playerBody.position.y,
              vx: -vx * 0.15 + (Math.random() - 0.5) * 2,
              vy: -vy * 0.15 + (Math.random() - 0.5) * 2,
              size: 4 + Math.random() * 4,
              alpha: 0.6,
              decay: 0.03,
            });
          }

          phaseRef.current = 'SLIDING';
          setTurnBanner('BLUE SLIDING ACROSS THE DESK!');
        }
        aimVectorRef.current = {dx: 0, dy: 0, power: 0, angle: 0};
      }
    }

    // --- AI RIVAL TURN EXECUTION ---
    if (phaseRef.current === 'AIM' && turn === 'RIVAL' && rivalBody && playerBody) {
      const ai = aiStateRef.current;
      const aiDifficulty = getConfig('aiDifficulty') as number;

      if (ai.phase === 'THINKING') {
        ai.timer -= dt;
        if (ai.timer <= 0) {
          // AI Evaluates Best Shot
          const rPos = rivalBody.position;
          const pPos = playerBody.position;

          // Direct line to player
          let directAngle = Math.atan2(pPos.y - rPos.y, pPos.x - rPos.x);
          const distToPlayer = Math.hypot(pPos.x - rPos.x, pPos.y - rPos.y);

          // Check if obstacle blocks line of sight
          const midX = (rPos.x + pPos.x) / 2;
          const midY = (rPos.y + pPos.y) / 2;
          const eraserPos = eraserBodyRef.current?.position;
          const sharpenerPos = sharpenerBodyRef.current?.position;

          let angleOffset = 0;
          if (eraserPos && Math.hypot(midX - eraserPos.x, midY - eraserPos.y) < 70) {
            angleOffset = 0.28; // Bank / curve around eraser
          } else if (
            sharpenerPos &&
            Math.hypot(midX - sharpenerPos.x, midY - sharpenerPos.y) < 70
          ) {
            angleOffset = -0.28;
          }

          // Add human-like error according to difficulty
          const error = (Math.random() - 0.5) * 0.22 * (1 - aiDifficulty * 0.7);
          const chosenAngle = directAngle + angleOffset + error;

          // Power scaled to distance + knock off edge punch
          const power = Math.min(
            maxFlickPower,
            Math.max(14, distToPlayer * 0.045 + 10 + Math.random() * 4),
          );

          ai.targetAngle = chosenAngle;
          ai.targetPower = power;
          ai.currentAimProgress = 0;
          ai.phase = 'AIMING';
          ai.timer = 0.65; // Aim duration for visual anticipation
        }
      } else if (ai.phase === 'AIMING') {
        ai.timer -= dt;
        ai.currentAimProgress = Math.min(1, 1 - ai.timer / 0.65);

        if (ai.timer <= 0) {
          ai.phase = 'RELEASE';
          const {targetAngle, targetPower} = ai;
          const vx = Math.cos(targetAngle) * targetPower;
          const vy = Math.sin(targetAngle) * targetPower;

          Matter.Body.setVelocity(rivalBody, {x: vx, y: vy});
          const torqueFactor = Math.sin(targetAngle - rivalBody.angle) * 0.12;
          Matter.Body.setAngularVelocity(rivalBody, torqueFactor);

          gameAudio.playCrispClick();
          gameAudio.playFootstepWood();

          for (let d = 0; d < 8; d++) {
            particles.dust.push({
              x: rivalBody.position.x,
              y: rivalBody.position.y,
              vx: -vx * 0.15 + (Math.random() - 0.5) * 2,
              vy: -vy * 0.15 + (Math.random() - 0.5) * 2,
              size: 4 + Math.random() * 4,
              alpha: 0.6,
              decay: 0.03,
            });
          }

          phaseRef.current = 'SLIDING';
          setTurnBanner('RED LAUNCHES A COUNTER-FLICK!');
        }
      }
    }
  };

  // --- DRAWING / RENDERING ---
  const draw = (ctx: CanvasRenderingContext2D) => {
    prepareCanvas(ctx, canvasWidth, canvasHeight);

    // Apply Screen Shake
    ctx.save();
    if (screenShakeRef.current.intensity > 0) {
      const shakeX = (Math.random() - 0.5) * screenShakeRef.current.intensity * 2;
      const shakeY = (Math.random() - 0.5) * screenShakeRef.current.intensity * 2;
      ctx.translate(shakeX, shakeY);
    }

    // 1. Draw Classroom Wooden Desk Background
    const bgImg = assets['desk_wood_background'];
    if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
      ctx.drawImage(bgImg, 0, 0, canvasWidth, canvasHeight);
    } else {
      ctx.fillStyle = '#b45309';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // Draw Subtle Table Playfield Danger Boundary Guide
    const bounds = tableBounds.current;
    ctx.save();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.22)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 8]);
    ctx.strokeRect(
      bounds.left,
      bounds.top,
      bounds.right - bounds.left,
      bounds.bottom - bounds.top,
    );
    ctx.restore();

    // 2. Draw Ink Trail Marks (Doodles on Desk)
    const particles = particlesRef.current;
    for (let i = 0; i < particles.ink.length; i++) {
      const p = particles.ink[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.radius), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. Draw Stationery Hazards (Eraser & Sharpener)
    const eraserBody = eraserBodyRef.current;
    if (eraserBody) {
      const {x, y} = eraserBody.position;
      const angle = eraserBody.angle;
      const w = getConfig('assetEraserWidth') as number;
      const h = getConfig('assetEraserHeight') as number;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      // Cast Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(-w / 2 + 5, -h / 2 + 6, w, h);

      const eraserImg = assets['stationery_eraser'];
      if (eraserImg && eraserImg.complete && eraserImg.naturalWidth > 0) {
        ctx.drawImage(eraserImg, -w / 2, -h / 2, w, h);
      } else {
        ctx.fillStyle = '#ec4899';
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      ctx.restore();
    }

    const sharpenerBody = sharpenerBodyRef.current;
    if (sharpenerBody) {
      const {x, y} = sharpenerBody.position;
      const angle = sharpenerBody.angle;
      const w = getConfig('assetSharpenerWidth') as number;
      const h = getConfig('assetSharpenerHeight') as number;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      // Cast Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(-w / 2 + 5, -h / 2 + 6, w, h);

      const sharpenerImg = assets['stationery_sharpener'];
      if (sharpenerImg && sharpenerImg.complete && sharpenerImg.naturalWidth > 0) {
        ctx.drawImage(sharpenerImg, -w / 2, -h / 2, w, h);
      } else {
        ctx.fillStyle = '#84cc16';
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      ctx.restore();
    }

    // 4. Draw Wood Slide Dust & Sparks
    for (let i = 0; i < particles.dust.length; i++) {
      const d = particles.dust[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, d.alpha);
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(d.x, d.y, Math.max(0.5, d.size), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (let i = 0; i < particles.sparks.length; i++) {
      const sp = particles.sparks[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, sp.alpha);
      ctx.strokeStyle = sp.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(sp.x + sp.vx * 2, sp.y + sp.vy * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 5. Draw Pens (Player & Rival)
    const playerBody = playerBodyRef.current;
    if (playerBody) {
      const {x, y} = playerBody.position;
      const angle = playerBody.angle;
      const w = getConfig('assetPlayerPenWidth') as number;
      const h = getConfig('assetPlayerPenHeight') as number;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      // Subtle drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.fillRect(-w / 2 + 4, -h / 2 + 6, w, h);

      // Glowing Halo if player turn
      if (turn === 'PLAYER' && phaseRef.current === 'AIM') {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.lineWidth = 3;
        ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
      }

      const pImg = assets['player_blue_pen'];
      if (pImg && pImg.complete && pImg.naturalWidth > 0) {
        ctx.drawImage(pImg, -w / 2, -h / 2, w, h);
      } else {
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      ctx.restore();
    }

    const rivalBody = rivalBodyRef.current;
    if (rivalBody) {
      const {x, y} = rivalBody.position;
      const angle = rivalBody.angle;
      const w = getConfig('assetRivalPenWidth') as number;
      const h = getConfig('assetRivalPenHeight') as number;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.fillRect(-w / 2 + 4, -h / 2 + 6, w, h);

      if (turn === 'RIVAL' && phaseRef.current === 'AIM') {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.lineWidth = 3;
        ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
      }

      const rImg = assets['rival_red_pen'];
      if (rImg && rImg.complete && rImg.naturalWidth > 0) {
        ctx.drawImage(rImg, -w / 2, -h / 2, w, h);
      } else {
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      ctx.restore();
    }

    // 6. Draw Falling Pens (3D-like scale & tumbling over edge)
    for (let i = 0; i < particles.fallingPens.length; i++) {
      const fp = particles.fallingPens[i];
      ctx.save();
      ctx.translate(fp.x, fp.y);
      ctx.rotate(fp.angle);
      ctx.scale(fp.scale, fp.scale);
      ctx.globalAlpha = Math.max(0, fp.alpha);

      // Deep distant fall shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 45, 60 * fp.scale, 15 * fp.scale, 0, 0, Math.PI * 2);
      ctx.fill();

      const img = fp.isPlayer
        ? assets['player_blue_pen']
        : assets['rival_red_pen'];
      const w = 168;
      const h = 25;
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      } else {
        ctx.fillStyle = fp.isPlayer ? '#2563eb' : '#dc2626';
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      ctx.restore();
    }

    // 7. Draw Trajectory Guides & Slingshot Elastic
    // (A) Player Aiming Slingshot
    if (isDraggingAimRef.current && playerBody) {
      const pPos = playerBody.position;
      const {power, angle, dx, dy} = aimVectorRef.current;
      const pointer = inputRef.current.pointer;
      const maxFlickPower = getConfig('maxFlickPower') as number;
      const powerRatio = Math.min(1, power / maxFlickPower);

      ctx.save();

      // Slingshot Pullback Elastic Band
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pPos.x, pPos.y);
      ctx.lineTo(pointer.x, pointer.y);
      ctx.stroke();

      // Finger anchor circle
      ctx.fillStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, 16, 0, Math.PI * 2);
      ctx.fill();

      // Forward Trajectory Projected Path
      const forwardLen = 60 + powerRatio * 240;
      const endX = pPos.x + Math.cos(angle) * forwardLen;
      const endY = pPos.y + Math.sin(angle) * forwardLen;

      // Trajectory gradient
      const grad = ctx.createLinearGradient(pPos.x, pPos.y, endX, endY);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.9)');
      grad.addColorStop(1, powerRatio > 0.8 ? '#ef4444' : '#facc15');

      ctx.strokeStyle = grad;
      ctx.lineWidth = 4 + powerRatio * 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(pPos.x, pPos.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Arrowhead
      ctx.fillStyle = powerRatio > 0.8 ? '#ef4444' : '#facc15';
      ctx.setLineDash([]);
      ctx.beginPath();
      const headSize = 14 + powerRatio * 4;
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - Math.cos(angle - 0.4) * headSize,
        endY - Math.sin(angle - 0.4) * headSize,
      );
      ctx.lineTo(
        endX - Math.cos(angle + 0.4) * headSize,
        endY - Math.sin(angle + 0.4) * headSize,
      );
      ctx.closePath();
      ctx.fill();

      // Power Percentage Text / Meter Arc
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        `${Math.round(powerRatio * 100)}% POWER`,
        pPos.x,
        pPos.y - 35,
      );

      ctx.restore();
    }

    // (B) AI Rival Aiming Animation Visual
    const ai = aiStateRef.current;
    if (ai.phase === 'AIMING' && rivalBody) {
      const rPos = rivalBody.position;
      const maxFlickPower = getConfig('maxFlickPower') as number;
      const powerRatio = (ai.targetPower / maxFlickPower) * ai.currentAimProgress;
      const forwardLen = 50 + powerRatio * 200;
      const angle = ai.targetAngle;

      const endX = rPos.x + Math.cos(angle) * forwardLen;
      const endY = rPos.y + Math.sin(angle) * forwardLen;

      ctx.save();
      // Rival aiming trajectory dotted line
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(rPos.x, rPos.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Arrowhead
      ctx.fillStyle = '#ef4444';
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - Math.cos(angle - 0.4) * 12,
        endY - Math.sin(angle - 0.4) * 12,
      );
      ctx.lineTo(
        endX - Math.cos(angle + 0.4) * 12,
        endY - Math.sin(angle + 0.4) * 12,
      );
      ctx.closePath();
      ctx.fill();

      // Rival Thought Bubble
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(rPos.x - 65, rPos.y - 55, 130, 26, 13);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CALCULATING...', rPos.x, rPos.y - 38);
      ctx.restore();
    }

    ctx.restore();
  };

  // --- GAME LOOP ---
  const updateRef = useRef(update);
  const drawRef = useRef(draw);
  updateRef.current = update;
  drawRef.current = draw;

  useEffect(() => {
    let raf = 0;
    const loop = (time: number) => {
      stepperRef.current?.(time, (dt) => updateRef.current(dt));
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) drawRef.current(ctx);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const pointsToWin = (getConfig('pointsToWin') as number) || 3;

  return (
    <div className="fixed inset-0 overflow-hidden touch-none flex flex-col items-center justify-between bg-amber-950 text-white font-sans select-none">
      {/* Background Music */}
      <BackgroundMusic
        url={BGM_URL}
        isPlaying={
          gameState.status === 'PLAYING' &&
          !isGameMenuOpen &&
          !isHowToPlayOpen
        }
        isMuted={isMusicMuted}
      />

      {/* Loading Overlay */}
      {!assetsReady && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-amber-950 text-amber-100">
          <div className="text-2xl font-black mb-2 animate-bounce">
            🎒 SHARPENING PENS...
          </div>
          <div className="text-sm text-amber-300">Setting up the school desk</div>
        </div>
      )}

      {/* --- HUD HEADER (DEDICATED PANEL OUTSIDE PLAYABLE CANVAS) --- */}
      <header className="w-full h-16 bg-amber-950/95 border-b-2 border-amber-900/80 px-4 flex items-center justify-between z-20 shrink-0 shadow-lg">
        {/* Left: Player (Blue) Score & Medal Caps */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-blue-950/90 border border-blue-500/60 rounded-full px-3 py-1">
            <span className="text-xs font-black tracking-wider text-blue-400">
              YOU (BLUE)
            </span>
            <div className="flex items-center gap-1 ml-1">
              {Array.from({length: pointsToWin}).map((_, i) => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border border-blue-300 transition-colors ${
                    i < playerRoundWins
                      ? 'bg-blue-400 shadow-[0_0_8px_#38bdf8]'
                      : 'bg-blue-950/40'
                  }`}
                />
              ))}
            </div>
            <span className="text-sm font-black text-white ml-1.5">
              {playerRoundWins}
            </span>
          </div>
        </div>

        {/* Center: Turn & Objective Banner */}
        <div className="hidden sm:flex flex-col items-center">
          <div className="flex items-center gap-2">
            <Zap
              size={14}
              className={turn === 'PLAYER' ? 'text-yellow-400' : 'text-red-400'}
            />
            <span
              className={`text-xs md:text-sm font-black uppercase tracking-wide ${
                turn === 'PLAYER' ? 'text-yellow-300' : 'text-red-300'
              }`}>
              {turnBanner}
            </span>
          </div>
          <span className="text-[10px] text-amber-300/80 uppercase font-bold tracking-widest">
            Round {gameState.level} • First to {pointsToWin} Knockouts
          </span>
        </div>

        {/* Right: Rival Score & Reserved Menu Button */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-red-950/90 border border-red-500/60 rounded-full px-3 py-1">
            <span className="text-xs font-black tracking-wider text-red-400">
              RIVAL (RED)
            </span>
            <div className="flex items-center gap-1 ml-1">
              {Array.from({length: pointsToWin}).map((_, i) => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border border-red-300 transition-colors ${
                    i < rivalRoundWins
                      ? 'bg-red-500 shadow-[0_0_8px_#ef4444]'
                      : 'bg-red-950/40'
                  }`}
                />
              ))}
            </div>
            <span className="text-sm font-black text-white ml-1.5">
              {rivalRoundWins}
            </span>
          </div>

          {/* Reserved Menu Button */}
          <button
            onClick={() => {
              gameAudio.playCrispClick();
              setIsGameMenuOpen(true);
            }}
            aria-label="Open Menu"
            className="min-w-[48px] min-h-[48px] w-12 h-12 rounded-xl bg-amber-900/80 hover:bg-amber-800 active:scale-95 border border-amber-700/80 text-amber-200 flex items-center justify-center transition-all shadow-md">
            <Menu size={22} />
          </button>
        </div>
      </header>

      {/* Mobile Sub-Banner for narrow screens */}
      <div className="sm:hidden w-full bg-amber-900/60 py-1 px-3 text-center border-b border-amber-800 text-[11px] font-bold text-yellow-300 truncate">
        {turnBanner}
      </div>

      {/* --- CANVAS VIEWPORT (SCALED RESPONSIVELY) --- */}
      <div className="flex-1 w-full min-h-0 flex items-center justify-center relative bg-stone-900">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          style={{
            aspectRatio: `${canvasWidth} / ${canvasHeight}`,
            width: `min(100%, calc(100vh * ${canvasWidth} / ${canvasHeight}))`,
          }}
          className="h-auto max-w-full max-h-full drop-shadow-2xl shadow-2xl"
        />

        {/* Mobile Aim Cancel Button (Visible when pulling slingshot) */}
        {isMobile && isDraggingAimRef.current && (
          <button
            onPointerDown={() => {
              cancelAimHoverRef.current = true;
              isDraggingAimRef.current = false;
              aimVectorRef.current = {dx: 0, dy: 0, power: 0, angle: 0};
              gameAudio.playCrispClick();
            }}
            className="absolute top-4 left-4 min-w-[48px] min-h-[48px] px-4 py-2 bg-red-600/90 text-white rounded-full font-bold text-xs shadow-lg border border-red-400 active:scale-90 flex items-center gap-1.5 z-30">
            <X size={16} /> CANCEL AIM
          </button>
        )}
      </div>

      {/* --- START MENU OVERLAY --- */}
      {gameState.status === 'START' && (
        <MenuOverlay tone="neutral" zIndex={40}>
          <div className="w-full max-w-md bg-stone-900/95 border-4 border-amber-600 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center backdrop-blur-md">
            {/* Title Badge */}
            <div className="bg-amber-600/30 border border-amber-500/50 rounded-full px-4 py-1 mb-3 text-amber-300 text-xs font-bold tracking-widest uppercase">
              Classroom Clash Arena
            </div>
            <h1 className="text-4xl sm:text-5xl font-black text-amber-400 mb-2 tracking-wider drop-shadow-md">
              DESK DUEL
            </h1>
            <p className="text-amber-200/90 text-sm sm:text-base font-medium mb-6">
              Flick ballpoint pens across the wooden desk and send your schoolyard
              rival tumbling over the edge!
            </p>

            {/* Visual Duel Graphic */}
            <div className="w-full bg-stone-950/70 rounded-2xl p-4 border border-amber-800/60 mb-6 flex items-center justify-around">
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs font-black text-blue-400">YOU</span>
                <span className="text-xs text-stone-400">Blue Ballpoint</span>
              </div>
              <span className="text-xl font-black text-amber-500">VS</span>
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs font-black text-red-400">RIVAL</span>
                <span className="text-xs text-stone-400">Red Ballpoint</span>
              </div>
            </div>

            {/* Quick Tips */}
            <div className="w-full text-left bg-amber-950/40 rounded-xl p-3 border border-amber-900 mb-6 text-xs text-amber-200/80 space-y-1.5">
              <p>🎯 Pull back from your Blue Pen to aim trajectory.</p>
              <p>🚀 Release to flick across the desk.</p>
              <p>🏆 First to score 3 knockouts wins the match!</p>
            </div>

            {/* Actions */}
            <div className="w-full flex flex-col gap-3">
              <button
                autoFocus
                onClick={() => {
                  gameAudio.playCrispClick();
                  initGame();
                }}
                className="w-full min-h-[48px] py-3.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 active:scale-95 text-stone-950 rounded-2xl font-black text-lg shadow-lg flex items-center justify-center gap-2 transition-all">
                <Play size={22} fill="currentColor" />
                START DUEL
              </button>

              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsHowToPlayOpen(true);
                }}
                className="w-full min-h-[48px] py-2.5 bg-stone-800 hover:bg-stone-700 active:scale-95 text-amber-200 border border-stone-700 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all">
                <HelpCircle size={18} />
                HOW TO PLAY
              </button>
            </div>
          </div>
        </MenuOverlay>
      )}

      {/* --- IN-GAME MENU OVERLAY (ESC OR ☰ BUTTON) --- */}
      {isGameMenuOpen && (
        <MenuOverlay tone="neutral" zIndex={40}>
          <div className="w-full max-w-md bg-stone-900 border-4 border-amber-600 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center">
            <h2 className="text-3xl font-black text-amber-400 mb-1 tracking-wider">
              GAME MENU
            </h2>
            <p className="text-stone-400 text-xs mb-6">Game Paused</p>

            <div className="w-full flex flex-col gap-3 mb-6">
              {/* Resume */}
              <button
                autoFocus
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsGameMenuOpen(false);
                }}
                className="w-full min-h-[48px] py-3 bg-amber-500 hover:bg-amber-400 active:scale-95 text-stone-950 rounded-2xl font-black text-base flex items-center justify-center gap-2 shadow-md transition-all">
                <Play size={20} fill="currentColor" />
                RESUME DUEL
              </button>

              {/* Music & SFX Toggles */}
              <div className="grid grid-cols-2 gap-3 w-full">
                <button
                  onClick={() => {
                    const next = !isMusicMuted;
                    setIsMusicMuted(next);
                    gameAudio.playCrispClick();
                  }}
                  className="min-h-[48px] py-2.5 bg-stone-800 hover:bg-stone-700 active:scale-95 border border-stone-700 rounded-2xl font-bold text-xs sm:text-sm text-amber-200 flex items-center justify-center gap-2 transition-all">
                  {isMusicMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  MUSIC: {isMusicMuted ? 'OFF' : 'ON'}
                </button>

                <button
                  onClick={() => {
                    const next = gameAudio.toggleMute();
                    setIsSfxMuted(next);
                    if (!next) gameAudio.playCrispClick();
                  }}
                  className="min-h-[48px] py-2.5 bg-stone-800 hover:bg-stone-700 active:scale-95 border border-stone-700 rounded-2xl font-bold text-xs sm:text-sm text-amber-200 flex items-center justify-center gap-2 transition-all">
                  {isSfxMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  SFX: {isSfxMuted ? 'OFF' : 'ON'}
                </button>
              </div>

              {/* How to Play */}
              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsHowToPlayOpen(true);
                }}
                className="w-full min-h-[48px] py-2.5 bg-stone-800 hover:bg-stone-700 active:scale-95 border border-stone-700 rounded-2xl font-bold text-sm text-amber-200 flex items-center justify-center gap-2 transition-all">
                <HelpCircle size={18} />
                HOW TO PLAY
              </button>

              {/* Try Match Again */}
              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  initGame();
                }}
                className="w-full min-h-[48px] py-2.5 bg-stone-800 hover:bg-stone-700 active:scale-95 border border-stone-700 rounded-2xl font-bold text-sm text-yellow-300 flex items-center justify-center gap-2 transition-all">
                <RotateCw size={18} />
                RESTART MATCH
              </button>

              {/* Quit to Main Menu */}
              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsGameMenuOpen(false);
                  setIsHowToPlayOpen(false);
                  setGameState((prev) => ({...prev, status: 'START'}));
                }}
                className="w-full min-h-[48px] py-2.5 bg-stone-900 hover:bg-red-950/60 active:scale-95 border border-red-900/60 rounded-2xl font-bold text-sm text-red-400 flex items-center justify-center gap-2 transition-all">
                <ArrowLeft size={18} />
                QUIT TO MENU
              </button>
            </div>
          </div>
        </MenuOverlay>
      )}

      {/* --- HOW TO PLAY GUIDE OVERLAY --- */}
      {isHowToPlayOpen && (
        <MenuOverlay tone="neutral" zIndex={50}>
          <div className="w-full max-w-lg bg-stone-900 border-4 border-amber-600 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col text-left">
            <div className="flex items-center justify-between pb-4 border-b border-stone-800 mb-4">
              <h2 className="text-2xl sm:text-3xl font-black text-amber-400 tracking-wide flex items-center gap-2">
                <HelpCircle size={28} />
                HOW TO PLAY
              </h2>
              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsHowToPlayOpen(false);
                }}
                aria-label="Close"
                className="min-w-[48px] min-h-[48px] w-12 h-12 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center">
                <X size={22} />
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm text-stone-300 leading-relaxed mb-6">
              <div className="bg-stone-950 p-3.5 rounded-2xl border border-stone-800 flex gap-3">
                <div className="text-2xl shrink-0">🎯</div>
                <div>
                  <h3 className="font-bold text-amber-300 mb-0.5">
                    1. Slingshot Aim
                  </h3>
                  <p>
                    On your turn, click or touch down on your Blue Pen and drag
                    backwards. The further back you pull, the higher the flick
                    velocity!
                  </p>
                </div>
              </div>

              <div className="bg-stone-950 p-3.5 rounded-2xl border border-stone-800 flex gap-3">
                <div className="text-2xl shrink-0">🚀</div>
                <div>
                  <h3 className="font-bold text-blue-400 mb-0.5">
                    2. Launch & Ricochet
                  </h3>
                  <p>
                    Release your finger or mouse to send the pen sliding across
                    the desk. Bounce off erasers and pencil sharpeners for clever
                    bank shots.
                  </p>
                </div>
              </div>

              <div className="bg-stone-950 p-3.5 rounded-2xl border border-stone-800 flex gap-3">
                <div className="text-2xl shrink-0">💥</div>
                <div>
                  <h3 className="font-bold text-yellow-400 mb-0.5">
                    3. Table Knockouts
                  </h3>
                  <p>
                    Ram your schoolyard rival's Red Pen over any desk boundary to
                    score a knockout. Be careful not to slide off yourself!
                  </p>
                </div>
              </div>

              <div className="bg-stone-950 p-3.5 rounded-2xl border border-stone-800 flex gap-3">
                <div className="text-2xl shrink-0">🏆</div>
                <div>
                  <h3 className="font-bold text-emerald-400 mb-0.5">
                    4. Victory Condition
                  </h3>
                  <p>
                    First player to score {pointsToWin} knockouts claims the
                    classroom desk championship!
                  </p>
                </div>
              </div>
            </div>

            <button
              autoFocus
              onClick={() => {
                gameAudio.playCrispClick();
                setIsHowToPlayOpen(false);
              }}
              className="w-full min-h-[48px] py-3 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-2xl font-black text-base flex items-center justify-center gap-2 shadow-lg transition-all">
              GOT IT, LET'S PLAY!
            </button>
          </div>
        </MenuOverlay>
      )}

      {/* --- MATCH VICTORY OVERLAY --- */}
      {gameState.status === 'VICTORY' && (
        <MenuOverlay tone="victory" zIndex={40}>
          <div className="w-full max-w-md bg-stone-900 border-4 border-emerald-500 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center">
            {/* Trophy Image Asset */}
            <div className="w-28 h-28 relative mb-3 flex items-center justify-center">
              {assets['trophy_badge'] ? (
                <img
                  src="assets/images/trophy_badge.png"
                  alt="Trophy"
                  className="w-full h-full object-contain animate-bounce"
                />
              ) : (
                <Trophy size={64} className="text-yellow-400 animate-bounce" />
              )}
            </div>

            <div className="bg-emerald-500/20 text-emerald-300 text-xs font-black px-4 py-1 rounded-full uppercase tracking-widest mb-2">
              Match Won!
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-yellow-400 mb-2">
              DESK CHAMPION!
            </h2>
            <p className="text-stone-300 text-sm mb-6">
              You knocked the rival pen off the table {playerRoundWins} times to{' '}
              {rivalRoundWins}!
            </p>

            <button
              autoFocus
              onClick={() => {
                gameAudio.playCrispClick();
                initGame();
              }}
              className="w-full min-h-[48px] py-3.5 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 active:scale-95 text-stone-950 rounded-2xl font-black text-lg flex items-center justify-center gap-2 shadow-lg transition-all">
              <RotateCw size={22} />
              PLAY AGAIN
            </button>
          </div>
        </MenuOverlay>
      )}

      {/* --- MATCH GAME OVER DEFEAT OVERLAY --- */}
      {gameState.status === 'GAME_OVER' && (
        <MenuOverlay tone="danger" zIndex={40}>
          <div className="w-full max-w-md bg-stone-900 border-4 border-red-600 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center">
            <div className="text-5xl mb-3">💥</div>
            <div className="bg-red-500/20 text-red-300 text-xs font-black px-4 py-1 rounded-full uppercase tracking-widest mb-2">
              Match Defeat
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-red-400 mb-2">
              KNOCKED OUT!
            </h2>
            <p className="text-stone-300 text-sm mb-6">
              Your rival sent your pen tumbling {rivalRoundWins} times to{' '}
              {playerRoundWins}. Take back the desk!
            </p>

            <button
              autoFocus
              onClick={() => {
                gameAudio.playCrispClick();
                initGame();
              }}
              className="w-full min-h-[48px] py-3.5 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-400 hover:to-rose-400 active:scale-95 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-2 shadow-lg transition-all">
              <RotateCw size={22} />
              TRY AGAIN
            </button>
          </div>
        </MenuOverlay>
      )}
    </div>
  );
}
