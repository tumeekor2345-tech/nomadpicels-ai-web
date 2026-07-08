/**
 * Face Swap "templates" — each is a fixed, server-side prompt fed to the
 * comfyui-faceswap-sdxl RunPod worker alongside the user's face reference
 * image. The worker only supports "generate a new portrait from a prompt,
 * then apply this face via IPAdapter+InstantID" — it does NOT support
 * pasting a face onto an existing target photo while preserving that
 * photo's exact background/pose (that would need a different worker, e.g.
 * a ReActor-style classic face-swap endpoint — not implemented yet).
 *
 * IMPORTANT: prompts are defined here, server-side only, and selected by a
 * short `id` from the client — never accept a raw prompt string from the
 * client for this tool, since it's meant to be prompt-free/one-click and
 * this keeps the content-safety guarantees (see FACE_SWAP_NEGATIVE_PROMPT
 * in src/app/api/generate/route.ts) consistent across every template.
 */

export type FaceSwapStyleId
  = | 'business'
    | 'deel'
    | 'wedding'
    | 'glamour'
    | 'fantasy'
    | 'graduation'
    | 'vintage'
    | 'cyberpunk';

export const DEFAULT_FACE_SWAP_STYLE: FaceSwapStyleId = 'business';

export const FACE_SWAP_STYLE_PROMPTS: Record<FaceSwapStyleId, string> = {
  business: 'a natural professional headshot portrait photo, upper body, wearing a business casual shirt or jacket, shoulders and chest fully covered by clothing, studio lighting, high detail, realistic',
  deel: 'a portrait photo of a person wearing a traditional embroidered Mongolian deel, standing in front of a scenic Mongolian steppe with blue sky, natural lighting, high detail, realistic, fully and modestly clothed in traditional attire',
  wedding: 'a romantic wedding portrait photo, person wearing an elegant formal wedding outfit, soft studio lighting, high detail, realistic, fully and modestly clothed',
  glamour: 'a glamorous fashion magazine portrait photo, elegant evening dress or tailored suit, dramatic studio lighting, high detail, realistic, tasteful and fully clothed',
  fantasy: 'an epic fantasy character portrait, wearing ornate fantasy armor or embroidered robes, magical glowing atmosphere, cinematic lighting, high detail, digital painting style, fully clothed',
  graduation: 'a graduation portrait photo, person wearing an academic graduation gown and cap, proud smile, studio lighting, high detail, realistic',
  vintage: 'a vintage 1950s style black and white studio portrait photo, classic retro clothing, soft film lighting, high detail, fully clothed',
  cyberpunk: 'a futuristic cyberpunk character portrait, neon lighting, a high-tech jacket, sci-fi cityscape background, high detail, digital art style, fully clothed',
};

export const FACE_SWAP_STYLE_IDS = Object.keys(FACE_SWAP_STYLE_PROMPTS) as FaceSwapStyleId[];

export function isFaceSwapStyleId(value: unknown): value is FaceSwapStyleId {
  return typeof value === 'string' && Object.hasOwn(FACE_SWAP_STYLE_PROMPTS, value);
}
