/**
 * Client-facing presets for the AI Image (Flux) generator panel.
 *
 * IMPORTANT — honesty note: "lens" presets are NOT a physical camera/optics
 * simulation. The Flux schnell ComfyUI workflow (see
 * src/libs/workflows/flux-schnell-txt2img.json) has no depth-of-field/optics
 * node — the only thing that can be controlled is the text prompt fed into
 * node "6" (CLIPTextEncode), plus width/height and seed. So every "lens" and
 * "style" preset below just appends a short text fragment to the user's
 * prompt (e.g. "shot on 85mm portrait lens, shallow depth of field") — this
 * is the same mechanism every diffusion image tool (Midjourney, ImagineArt,
 * etc.) uses for these presets. Labels here are deliberately not phrased as
 * "physical settings" for that reason.
 */

export type StyleId
  = | 'none'
    | 'photorealistic'
    | 'cinematic'
    | 'anime'
    | 'illustration'
    | '3d'
    | 'watercolor'
    | 'cyberpunk'
    | 'fantasy'
    | 'noir'
    | 'retroPop'
    | 'darkAcademia'
    | 'vintagePolaroid'
    | 'comicBook';

export const STYLE_PRESETS: Array<{ id: StyleId; promptFragment: string }> = [
  { id: 'none', promptFragment: '' },
  { id: 'photorealistic', promptFragment: 'photorealistic, ultra detailed, realistic lighting' },
  { id: 'cinematic', promptFragment: 'cinematic lighting, dramatic composition, film grain' },
  { id: 'anime', promptFragment: 'anime style, vibrant colors, clean line art' },
  { id: 'illustration', promptFragment: 'digital illustration, painterly style, vibrant colors' },
  { id: '3d', promptFragment: '3D render, octane render, high detail' },
  { id: 'watercolor', promptFragment: 'watercolor painting style, soft brush strokes' },
  { id: 'cyberpunk', promptFragment: 'cyberpunk aesthetic, neon lighting, futuristic' },
  { id: 'fantasy', promptFragment: 'fantasy art style, epic, magical atmosphere' },
  // Added 2026-07-10: extra style presets inspired by imagine.art's
  // "Add references > Styles" picker, at the user's request.
  { id: 'noir', promptFragment: 'noir cinematic style, high-contrast black and white, dramatic hard shadows' },
  { id: 'retroPop', promptFragment: 'retro pop art style, bold flat colors, halftone dots, comic-style outlines' },
  { id: 'darkAcademia', promptFragment: 'dark academia aesthetic, moody library tones, vintage scholarly atmosphere' },
  { id: 'vintagePolaroid', promptFragment: 'vintage polaroid photo style, faded colors, soft focus, white photo border look' },
  { id: 'comicBook', promptFragment: 'comic book illustration style, bold ink outlines, halftone shading, action panel look' },
];

export type LensId
  = | 'none'
    | 'portrait'
    | 'wide'
    | 'macro'
    | 'telephoto'
    | 'fisheye'
    | 'anamorphic';

export const LENS_PRESETS: Array<{ id: LensId; promptFragment: string }> = [
  { id: 'none', promptFragment: '' },
  { id: 'portrait', promptFragment: 'shot on 85mm portrait lens, shallow depth of field, creamy bokeh' },
  { id: 'wide', promptFragment: 'shot on 24mm wide-angle lens, expansive perspective' },
  { id: 'macro', promptFragment: 'macro lens, extreme close-up detail' },
  { id: 'telephoto', promptFragment: 'shot on 200mm telephoto lens, compressed background, subject isolated' },
  { id: 'fisheye', promptFragment: 'fisheye lens, distorted wide-angle view' },
  { id: 'anamorphic', promptFragment: 'anamorphic cinema lens, horizontal lens flare, widescreen cinematic look' },
];

export type AspectRatioId = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

// Multiples of 64 (SDXL/Flux-friendly buckets), each close to ~1024x1024's
// total pixel count so generation cost/speed stays roughly constant across
// ratios.
export const ASPECT_RATIOS: Array<{ id: AspectRatioId; width: number; height: number }> = [
  { id: '1:1', width: 1024, height: 1024 },
  { id: '16:9', width: 1344, height: 768 },
  { id: '9:16', width: 768, height: 1344 },
  { id: '4:3', width: 1152, height: 896 },
  { id: '3:4', width: 896, height: 1152 },
];

export type ReferenceInfluence = 'low' | 'medium' | 'high';

// Denoise for img2img: lower denoise = output stays closer to the reference
// image; higher denoise = more freedom to deviate and follow the prompt.
// "High influence" (user wants the reference to matter a lot) therefore maps
// to a *lower* denoise value.
export const REFERENCE_INFLUENCE_DENOISE: Record<ReferenceInfluence, number> = {
  high: 0.3,
  medium: 0.55,
  low: 0.75,
};

export function buildFinalPrompt(basePrompt: string, styleId: StyleId, lensId: LensId): string {
  const fragments = [basePrompt.trim()];
  const style = STYLE_PRESETS.find(s => s.id === styleId);
  const lens = LENS_PRESETS.find(l => l.id === lensId);
  if (style?.promptFragment) {
    fragments.push(style.promptFragment);
  }
  if (lens?.promptFragment) {
    fragments.push(lens.promptFragment);
  }
  return fragments.filter(Boolean).join(', ');
}

/**
 * Presets for the "Image Effect" tool (Tools > Image Effect) — a one-click
 * img2img restyle of a user-uploaded photo, modeled on the
 * style/color-palette/effect/camera-angle picker pattern used by tools like
 * imagine.art. Reuses STYLE_PRESETS above for the "style" dropdown; these
 * three cover the remaining categories.
 */

export type ColorPaletteId
  = | 'none'
    | 'warm'
    | 'cool'
    | 'vibrant'
    | 'pastel'
    | 'blackAndWhite'
    | 'sepia'
    | 'highContrast'
    | 'autumnHarvest'
    | 'pearlIvory'
    | 'jungleVivid'
    | 'sunsetGradient';

export const COLOR_PALETTE_PRESETS: Array<{ id: ColorPaletteId; promptFragment: string }> = [
  { id: 'none', promptFragment: '' },
  { id: 'warm', promptFragment: 'warm color palette, golden tones' },
  { id: 'cool', promptFragment: 'cool color palette, blue and teal tones' },
  { id: 'vibrant', promptFragment: 'vibrant, highly saturated colors' },
  { id: 'pastel', promptFragment: 'soft pastel color palette, muted tones' },
  { id: 'blackAndWhite', promptFragment: 'black and white, monochrome' },
  { id: 'sepia', promptFragment: 'sepia tone, vintage brown tint' },
  { id: 'highContrast', promptFragment: 'high contrast, deep shadows and bright highlights' },
  // Added 2026-07-10: named palette presets inspired by imagine.art's
  // "Add references > Color Palette" picker, at the user's request.
  { id: 'autumnHarvest', promptFragment: 'autumn harvest color palette, burnt orange, deep maroon, golden mustard tones' },
  { id: 'pearlIvory', promptFragment: 'pearl ivory color palette, soft creams and whites, delicate neutral tones' },
  { id: 'jungleVivid', promptFragment: 'jungle vivid color palette, saturated greens with orange and yellow accents' },
  { id: 'sunsetGradient', promptFragment: 'sunset gradient color palette, coral pink fading into golden orange and lavender' },
];

export type EffectId
  = | 'none'
    | 'filmGrain'
    | 'glow'
    | 'hdr'
    | 'bokeh'
    | 'moody'
    | 'sharp'
    | 'motionBlur'
    | 'doubleExposure'
    | 'glitch'
    | 'lomo';

export const EFFECT_PRESETS: Array<{ id: EffectId; promptFragment: string }> = [
  { id: 'none', promptFragment: '' },
  { id: 'filmGrain', promptFragment: 'subtle film grain texture' },
  { id: 'glow', promptFragment: 'soft dreamy glow, gentle bloom' },
  { id: 'hdr', promptFragment: 'HDR look, enhanced dynamic range and detail' },
  { id: 'bokeh', promptFragment: 'blurred bokeh background' },
  { id: 'moody', promptFragment: 'moody atmospheric lighting' },
  { id: 'sharp', promptFragment: 'crisp sharp focus, ultra detailed' },
  // Added 2026-07-10: extra effect presets inspired by imagine.art's
  // "Add references > Effects" picker, at the user's request.
  { id: 'motionBlur', promptFragment: 'motion blur effect, sense of speed and movement' },
  { id: 'doubleExposure', promptFragment: 'double exposure effect, blended overlapping imagery' },
  { id: 'glitch', promptFragment: 'digital glitch effect, RGB channel split, scan lines' },
  { id: 'lomo', promptFragment: 'lomography film effect, dark vignette corners, saturated cross-processed colors' },
];

export type CameraAngleId
  = | 'none'
    | 'eyeLevel'
    | 'lowAngle'
    | 'highAngle'
    | 'birdsEye'
    | 'closeUp'
    | 'wideShot'
    | 'portraitFraming'
    | 'aerialView'
    | 'groundView'
    | 'tiltShot';

export const CAMERA_ANGLE_PRESETS: Array<{ id: CameraAngleId; promptFragment: string }> = [
  { id: 'none', promptFragment: '' },
  { id: 'eyeLevel', promptFragment: 'eye-level shot' },
  { id: 'lowAngle', promptFragment: 'low-angle shot, looking up, heroic perspective' },
  { id: 'highAngle', promptFragment: 'high-angle shot, looking down' },
  { id: 'birdsEye', promptFragment: 'bird\'s-eye view, top-down perspective' },
  { id: 'closeUp', promptFragment: 'close-up shot' },
  { id: 'wideShot', promptFragment: 'wide shot, full scene visible' },
  // Added 2026-07-10: extra camera angle presets inspired by imagine.art's
  // "Add references > Camera Angles" picker, at the user's request.
  { id: 'portraitFraming', promptFragment: 'tight portrait framing, subject centered, shallow depth of field' },
  { id: 'aerialView', promptFragment: 'aerial drone view, looking straight down from above' },
  { id: 'groundView', promptFragment: 'ground-level view, camera placed low near the ground looking up' },
  { id: 'tiltShot', promptFragment: 'tilted dutch angle shot, dynamic diagonal framing' },
];

/**
 * Fixed base instruction plus whichever style/color-palette/effect/camera
 * fragments the user picked. Like Photo Restore and Face Swap, this is a
 * "prompt-free" tool — the client only ever sends preset ids, never raw
 * prompt text, so there's nothing here for isPromptBlocked() to need to
 * check.
 */
export function buildImageEffectPrompt(params: {
  styleId: StyleId;
  colorPaletteId: ColorPaletteId;
  effectId: EffectId;
  cameraAngleId: CameraAngleId;
}): string {
  const fragments = ['enhance this photo, keep the subject and composition recognizable'];
  const style = STYLE_PRESETS.find(s => s.id === params.styleId);
  const palette = COLOR_PALETTE_PRESETS.find(p => p.id === params.colorPaletteId);
  const effect = EFFECT_PRESETS.find(e => e.id === params.effectId);
  const angle = CAMERA_ANGLE_PRESETS.find(a => a.id === params.cameraAngleId);

  if (style?.promptFragment) {
    fragments.push(style.promptFragment);
  }
  if (palette?.promptFragment) {
    fragments.push(palette.promptFragment);
  }
  if (effect?.promptFragment) {
    fragments.push(effect.promptFragment);
  }
  if (angle?.promptFragment) {
    fragments.push(angle.promptFragment);
  }

  return fragments.filter(Boolean).join(', ');
}
