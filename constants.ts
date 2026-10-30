/**
 * Configuration for Desk Duel
 */
export const CONFIG = {
  // Game Setup
  title: {
    value: 'Desk Duel',
    type: 'string',
    label: 'Game Title',
    group: 'GAME',
  },
  baseCanvasWidth: {
    value: 1376,
    type: 'number',
    label: 'Base Canvas Width',
    group: 'GAME',
  },
  baseCanvasHeight: {
    value: 768,
    type: 'number',
    label: 'Base Canvas Height',
    group: 'GAME',
  },

  // System
  targetFPS: {
    value: 60,
    type: 'number',
    label: 'Target FPS',
    group: 'SYSTEM',
  },
  stepMs: {
    value: 1000 / 60,
    type: 'number',
    label: 'Step MS',
    group: 'SYSTEM',
  },
  maxSubSteps: {
    value: 5,
    type: 'number',
    label: 'Max Sub Steps',
    group: 'SYSTEM',
  },

  // Theme
  backgroundColor: {
    value: '#261b12',
    type: 'color',
    label: 'Background Color',
    group: 'THEME',
  },
  primaryColor: {
    value: '#2563eb',
    type: 'color',
    label: 'Primary Color',
    group: 'THEME',
  },
  accentColor: {
    value: '#dc2626',
    type: 'color',
    label: 'Accent Color',
    group: 'THEME',
  },
  fontFamily: {
    value: "'Permanent Marker', 'Fredoka', cursive, sans-serif",
    type: 'string',
    label: 'Font Family',
    group: 'THEME',
  },

  // Audio
  defaultMusicVolume: {
    value: 0.5,
    type: 'number',
    label: 'Default Music Volume',
    group: 'AUDIO',
  },
  defaultSfxVolume: {
    value: 0.6,
    type: 'number',
    label: 'Default SFX Volume',
    group: 'AUDIO',
  },

  // Rules
  pointsToWin: {
    value: 3,
    type: 'number',
    label: 'Points to Win',
    group: 'RULES',
  },
  maxFlickPower: {
    value: 32,
    type: 'number',
    label: 'Max Flick Power',
    group: 'RULES',
  },
  flickSensitivity: {
    value: 0.16,
    type: 'number',
    label: 'Flick Sensitivity',
    group: 'RULES',
  },
  surfaceFriction: {
    value: 0.035,
    type: 'number',
    label: 'Surface Friction',
    group: 'RULES',
  },
  penRestitution: {
    value: 0.72,
    type: 'number',
    label: 'Pen Restitution',
    group: 'RULES',
  },
  aiDifficulty: {
    value: 0.8,
    type: 'number',
    label: 'AI Difficulty',
    group: 'RULES',
  },

  // Assets (Dimensions & Aspect Ratios matching read_assets_metadata)
  assetDeskBgAspectRatio: {
    value: 1376 / 768, // 1.7916
    type: 'number',
    label: 'Desk BG Aspect Ratio',
    group: 'ASSETS',
  },
  assetDeskBgWidth: {
    value: 1376,
    type: 'number',
    label: 'Desk BG Width',
    group: 'ASSETS',
  },
  assetDeskBgHeight: {
    value: 768,
    type: 'number',
    label: 'Desk BG Height',
    group: 'ASSETS',
  },

  assetPlayerPenAspectRatio: {
    value: 838 / 125, // 6.704
    type: 'number',
    label: 'Player Pen Aspect Ratio',
    group: 'ASSETS',
  },
  assetPlayerPenWidth: {
    value: 168,
    type: 'number',
    label: 'Player Pen Width',
    group: 'ASSETS',
  },
  assetPlayerPenHeight: {
    value: 25, // 168 / 6.704 ≈ 25
    type: 'number',
    label: 'Player Pen Height',
    group: 'ASSETS',
  },

  assetRivalPenAspectRatio: {
    value: 902 / 112, // 8.0536
    type: 'number',
    label: 'Rival Pen Aspect Ratio',
    group: 'ASSETS',
  },
  assetRivalPenWidth: {
    value: 169,
    type: 'number',
    label: 'Rival Pen Width',
    group: 'ASSETS',
  },
  assetRivalPenHeight: {
    value: 21, // 169 / 8.0536 ≈ 21
    type: 'number',
    label: 'Rival Pen Height',
    group: 'ASSETS',
  },

  assetEraserAspectRatio: {
    value: 618 / 586, // 1.0546
    type: 'number',
    label: 'Eraser Aspect Ratio',
    group: 'ASSETS',
  },
  assetEraserWidth: {
    value: 84,
    type: 'number',
    label: 'Eraser Width',
    group: 'ASSETS',
  },
  assetEraserHeight: {
    value: 80, // 84 / 1.0546 ≈ 80
    type: 'number',
    label: 'Eraser Height',
    group: 'ASSETS',
  },

  assetSharpenerAspectRatio: {
    value: 454 / 528, // 0.8598
    type: 'number',
    label: 'Sharpener Aspect Ratio',
    group: 'ASSETS',
  },
  assetSharpenerWidth: {
    value: 69,
    type: 'number',
    label: 'Sharpener Width',
    group: 'ASSETS',
  },
  assetSharpenerHeight: {
    value: 80, // 69 / 0.8598 ≈ 80
    type: 'number',
    label: 'Sharpener Height',
    group: 'ASSETS',
  },

  assetTrophyAspectRatio: {
    value: 491 / 645, // 0.7612
    type: 'number',
    label: 'Trophy Aspect Ratio',
    group: 'ASSETS',
  },
  assetTrophyWidth: {
    value: 152,
    type: 'number',
    label: 'Trophy Width',
    group: 'ASSETS',
  },
  assetTrophyHeight: {
    value: 200, // 152 / 0.7612 ≈ 200
    type: 'number',
    label: 'Trophy Height',
    group: 'ASSETS',
  },
};

// Merge customized config values if present (injected by Playground)
const {playgroundConfig} = globalThis as {
  playgroundConfig?: Record<string, unknown>;
};
if (playgroundConfig) {
  for (const [key, value] of Object.entries(playgroundConfig)) {
    if (key in CONFIG) {
      Object.assign(CONFIG[key as keyof typeof CONFIG], {value});
    }
  }
}

/**
 * Type helper for reading values in game code
 */
export type ConfigKey = keyof typeof CONFIG;

/**
 * Gets a configuration value by key.
 * @param key The configuration key.
 * @return The configuration value.
 */
export function getConfig<K extends ConfigKey>(
  key: K,
): (typeof CONFIG)[K]['value'] {
  return CONFIG[key].value;
}
