/**
 * Visual (icon + CSS gradient) representation for each preset id used by the
 * Style Changer tool's picker grid (see PresetPicker.tsx).
 *
 * Context: the user asked for an imagine.art-style picker — a grid of
 * thumbnail images next to each option instead of a plain <select> dropdown.
 * The natural approach would be real AI-generated sample photos (one per
 * preset), and that was attempted on 2026-07-10: ~44 Flux thumbnails were
 * successfully generated twice (88 total generations) via the live
 * /api/generate endpoint. Both times, getting the resulting images out of
 * the browser and into this repo as static assets failed — Chrome's
 * automatic-download protection silently blocked every download after the
 * first one, in the sandboxed automation environment, even after the user
 * approved the "allow multiple downloads" prompt. No other transport was
 * available (the tool sandbox has no general internet access, so it can't
 * fetch the images another way either). Rather than keep spending GPU time
 * on regeneration attempts that can't be retrieved, this uses a
 * CSS-gradient + Lucide-icon representation instead — no image assets
 * required, so nothing to download. If real photo thumbnails are wanted
 * later, generate them through the UI normally and add them as static
 * files under public/presets/ by hand, then swap the `kind: 'gradient'`
 * cards below for `kind: 'image'` ones.
 */

export type PresetVisual = {
  kind: 'gradient';
  gradient: string;
  icon: string; // key into the ICON_MAP in PresetPicker.tsx
};

const NONE_VISUAL: PresetVisual = {
  kind: 'gradient',
  gradient: 'linear-gradient(135deg, #2a2a35, #1a1a22)',
  icon: 'ban',
};

export const STYLE_VISUALS: Record<string, PresetVisual> = {
  none: NONE_VISUAL,
  photorealistic: { kind: 'gradient', gradient: 'linear-gradient(135deg, #8ec5fc, #e0c3a1)', icon: 'camera' },
  cinematic: { kind: 'gradient', gradient: 'linear-gradient(135deg, #1a1a2e, #c9922f)', icon: 'clapperboard' },
  anime: { kind: 'gradient', gradient: 'linear-gradient(135deg, #ff9ecb, #7ee8fa, #a78bfa)', icon: 'sparkles' },
  illustration: { kind: 'gradient', gradient: 'linear-gradient(135deg, #ff8a5c, #ffd76e, #ff6bb0)', icon: 'brush' },
  '3d': { kind: 'gradient', gradient: 'linear-gradient(135deg, #6a5cff, #2fd4d4)', icon: 'box' },
  watercolor: { kind: 'gradient', gradient: 'linear-gradient(135deg, #a8d8ea, #f7cac9, #d4f0c0)', icon: 'droplet' },
  cyberpunk: { kind: 'gradient', gradient: 'linear-gradient(135deg, #ff2d75, #00e5ff, #7b2ff7)', icon: 'zap' },
  fantasy: { kind: 'gradient', gradient: 'linear-gradient(135deg, #3a1c71, #d76d77, #ffaf7b)', icon: 'wand-sparkles' },
  noir: { kind: 'gradient', gradient: 'linear-gradient(135deg, #0a0a0a, #4a4a4a, #f2f2f2)', icon: 'contrast' },
  retroPop: { kind: 'gradient', gradient: 'linear-gradient(135deg, #ff3b3b, #ffd23b, #2f6fed)', icon: 'disc' },
  darkAcademia: { kind: 'gradient', gradient: 'linear-gradient(135deg, #3e2723, #6d4c41, #2e4a3c)', icon: 'book-open' },
  vintagePolaroid: { kind: 'gradient', gradient: 'linear-gradient(135deg, #f2e6d0, #d8b98e, #f2e6d0)', icon: 'image' },
  comicBook: { kind: 'gradient', gradient: 'linear-gradient(135deg, #e8322a, #ffd93b, #2f6fed)', icon: 'message-square' },
};

export const COLOR_PALETTE_VISUALS: Record<string, PresetVisual> = {
  none: NONE_VISUAL,
  warm: { kind: 'gradient', gradient: 'linear-gradient(135deg, #ff9a3c, #ffcf6b)', icon: 'sun' },
  cool: { kind: 'gradient', gradient: 'linear-gradient(135deg, #2196c9, #6be3e0)', icon: 'snowflake' },
  vibrant: { kind: 'gradient', gradient: 'linear-gradient(135deg, #ff3b8d, #ffd23b, #3bc9ff)', icon: 'palette' },
  pastel: { kind: 'gradient', gradient: 'linear-gradient(135deg, #ffd6e8, #d6e8ff, #e0d6ff)', icon: 'palette' },
  blackAndWhite: { kind: 'gradient', gradient: 'linear-gradient(135deg, #0a0a0a, #ffffff)', icon: 'contrast' },
  sepia: { kind: 'gradient', gradient: 'linear-gradient(135deg, #704214, #c9a36a)', icon: 'image' },
  highContrast: { kind: 'gradient', gradient: 'linear-gradient(90deg, #000000 50%, #ffffff 50%)', icon: 'contrast' },
  autumnHarvest: { kind: 'gradient', gradient: 'linear-gradient(135deg, #7a2e12, #c9622f, #d9a441)', icon: 'leaf' },
  pearlIvory: { kind: 'gradient', gradient: 'linear-gradient(135deg, #f5f0e6, #e8ddc7, #fffdf7)', icon: 'gem' },
  jungleVivid: { kind: 'gradient', gradient: 'linear-gradient(135deg, #1e5631, #6fbf3c, #d9c22f)', icon: 'leaf' },
  sunsetGradient: { kind: 'gradient', gradient: 'linear-gradient(135deg, #ff6f61, #ff9c4c, #c56cf0)', icon: 'sunset' },
};

export const EFFECT_VISUALS: Record<string, PresetVisual> = {
  none: NONE_VISUAL,
  filmGrain: { kind: 'gradient', gradient: 'linear-gradient(135deg, #3a3a3a, #6b6b6b)', icon: 'film' },
  glow: { kind: 'gradient', gradient: 'linear-gradient(135deg, #fff6c9, #ffe08a)', icon: 'sun' },
  hdr: { kind: 'gradient', gradient: 'linear-gradient(135deg, #001f3f, #ff7300, #ffe600)', icon: 'sparkles' },
  bokeh: { kind: 'gradient', gradient: 'radial-gradient(circle at 30% 30%, #ffd6e8 0 15%, transparent 16%), radial-gradient(circle at 70% 60%, #d6e8ff 0 18%, transparent 19%), linear-gradient(135deg, #2c2c3a, #1a1a24)', icon: 'circle' },
  moody: { kind: 'gradient', gradient: 'linear-gradient(135deg, #1b1f3b, #3a2e52)', icon: 'cloud-moon' },
  sharp: { kind: 'gradient', gradient: 'linear-gradient(90deg, #ffffff 50%, #0a0a0a 50%)', icon: 'focus' },
  motionBlur: { kind: 'gradient', gradient: 'repeating-linear-gradient(90deg, #3bc9ff, #3bc9ff 4px, #1a1a24 4px, #1a1a24 8px)', icon: 'wind' },
  doubleExposure: { kind: 'gradient', gradient: 'linear-gradient(135deg, rgba(59,201,255,0.7), rgba(255,59,141,0.7))', icon: 'layers' },
  glitch: { kind: 'gradient', gradient: 'repeating-linear-gradient(0deg, #ff2d75, #ff2d75 3px, #00e5ff 3px, #00e5ff 6px, #7b2ff7 6px, #7b2ff7 9px)', icon: 'zap' },
  lomo: { kind: 'gradient', gradient: 'radial-gradient(circle, #ffcf6b 0%, #7a2e12 70%, #1a0a05 100%)', icon: 'aperture' },
};

export const CAMERA_ANGLE_VISUALS: Record<string, PresetVisual> = {
  none: NONE_VISUAL,
  eyeLevel: { kind: 'gradient', gradient: 'linear-gradient(135deg, #3b4a6b, #6b7fa8)', icon: 'minus' },
  lowAngle: { kind: 'gradient', gradient: 'linear-gradient(135deg, #2f3d5f, #5c7cad)', icon: 'chevron-up' },
  highAngle: { kind: 'gradient', gradient: 'linear-gradient(135deg, #5c7cad, #2f3d5f)', icon: 'chevron-down' },
  birdsEye: { kind: 'gradient', gradient: 'linear-gradient(135deg, #274060, #6f9ad1)', icon: 'circle-dot' },
  closeUp: { kind: 'gradient', gradient: 'linear-gradient(135deg, #4a3b6b, #8a6fad)', icon: 'zoom-in' },
  wideShot: { kind: 'gradient', gradient: 'linear-gradient(135deg, #3b6b5a, #6fad8a)', icon: 'maximize' },
  portraitFraming: { kind: 'gradient', gradient: 'linear-gradient(135deg, #6b3b5a, #ad6f95)', icon: 'user' },
  aerialView: { kind: 'gradient', gradient: 'linear-gradient(135deg, #1f4a6b, #4f9ad4)', icon: 'navigation' },
  groundView: { kind: 'gradient', gradient: 'linear-gradient(135deg, #4a3b2a, #8a6f4f)', icon: 'arrow-up-from-line' },
  tiltShot: { kind: 'gradient', gradient: 'linear-gradient(135deg, #6b3b6b, #ad6fad)', icon: 'rotate-cw' },
};
