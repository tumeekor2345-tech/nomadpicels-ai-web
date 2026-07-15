import type { ColorPaletteId, StyleId } from './ImagePresets';

/**
 * CSS filter() strings applied client-side (via canvas) to the Image Effect
 * tool's AI output, keyed by ColorPaletteId.
 *
 * Why this exists: the color palette presets originally worked purely by
 * appending a text hint (e.g. "black and white, monochrome") to the Flux
 * img2img prompt (see buildImageEffectPrompt in ImagePresets.ts). At
 * low/medium denoise the diffusion model often doesn't fully honor a plain
 * text color instruction — the source photo's colors bleed through, so
 * picking "Хар цагаан" (Black & White) could still come back in color. The
 * user flagged this directly on 2026-07-10.
 *
 * Fix: for palette presets with an objectively verifiable target (grayscale,
 * sepia, high contrast, saturation level), apply a deterministic CSS filter
 * to the generated image in the browser after it comes back from RunPod —
 * see applyColorFilter() in ImageEffectWorkspace.tsx. This guarantees the
 * displayed/downloaded result actually matches the chosen palette,
 * regardless of how strongly the model weighted the prompt hint. The prompt
 * fragment stays in place too (helps guide the AI's overall mood/lighting),
 * this filter is just a deterministic safety net on top.
 *
 * Values left as '' (autumnHarvest, pearlIvory, jungleVivid, sunsetGradient,
 * none) don't have a single unambiguous CSS filter equivalent — they stay
 * prompt-only for now.
 */
export const COLOR_PALETTE_FILTERS: Record<ColorPaletteId, string> = {
  none: '',
  warm: 'sepia(0.3) saturate(1.25) brightness(1.02)',
  cool: 'saturate(1.1) hue-rotate(15deg) brightness(1.02)',
  vibrant: 'saturate(1.8) contrast(1.05)',
  pastel: 'saturate(0.55) brightness(1.12) contrast(0.9)',
  blackAndWhite: 'grayscale(1)',
  sepia: 'sepia(0.85) saturate(1.1)',
  highContrast: 'contrast(1.45) grayscale(0.1)',
  autumnHarvest: '',
  pearlIvory: '',
  jungleVivid: '',
  sunsetGradient: '',
};

/**
 * Same idea as COLOR_PALETTE_FILTERS above, but for STYLE presets whose name
 * promises an unambiguous color treatment. Confirmed live on 2026-07-10:
 * picking "Нуар" (Noir) — a *style*, not a color-palette pick — still came
 * back in full color, because "noir cinematic style, high-contrast black and
 * white" was only a prompt hint. Combined with COLOR_PALETTE_FILTERS in
 * ImageEffectWorkspace.tsx (both can apply at once).
 */
export const STYLE_FILTERS: Record<StyleId, string> = {
  'none': '',
  'photorealistic': '',
  'cinematic': '',
  'anime': '',
  'illustration': '',
  '3d': '',
  'watercolor': '',
  'cyberpunk': '',
  'fantasy': '',
  'noir': 'grayscale(1) contrast(1.35) brightness(0.95)',
  'retroPop': 'saturate(1.6) contrast(1.15)',
  'darkAcademia': 'sepia(0.2) saturate(0.75) brightness(0.92) contrast(1.05)',
  'vintagePolaroid': 'sepia(0.25) saturate(0.85) brightness(1.05) contrast(0.92)',
  'comicBook': '',
};
