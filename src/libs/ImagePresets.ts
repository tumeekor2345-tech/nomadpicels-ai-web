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
    | 'fantasy';

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
