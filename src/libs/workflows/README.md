# ComfyUI workflow JSON files

## Flux (done)

`flux-schnell-txt2img.json` is now in place. It's the official
`workflow_flux1_schnell.json` example from the
[runpod-workers/worker-comfyui](https://github.com/runpod-workers/worker-comfyui/blob/main/test_resources/workflows/workflow_flux1_schnell.json)
repo, which matches exactly the models baked into our deployed
`runpod/worker-comfyui:5.8.5-flux1-schnell` image (flux1-schnell.safetensors,
t5xxl_fp8_e4m3fn, clip_l, ae.safetensors) — so no ComfyUI session was needed
to obtain it. The node ids it uses (confirmed, not guessed):

- `6` — CLIPTextEncode: prompt text
- `5` — EmptyLatentImage: width / height
- `25` — RandomNoise: `noise_seed`

`RunPod.ts`'s `buildFluxInput()` already patches these three nodes.

If you ever swap to a custom Flux graph (extra LoRAs, ControlNet, etc.),
follow the export steps below to get your own and update the node ids in
`buildFluxInput()` to match.

### Exporting a custom graph (only if you change the workflow)

1. On your RunPod endpoint's Overview page, use the **ComfyUI** template
   (or a temporary Pod running the same `flux1-schnell` image) to open the
   ComfyUI web UI and build/load your graph.
2. Queue one generation to confirm it works.
3. In the top menu: **Workflow → Export (API)**. This downloads a
   `workflow.json` in the flat "API format" (node ids as keys) — this is
   the exact shape `worker-comfyui` expects in `input.workflow`.
4. Save that file here as `flux-schnell-txt2img.json`, replacing the current one.
5. Update the node ids in `buildFluxInput()` in `src/libs/RunPod.ts` to match.

Do **not** hand-write this JSON — Flux's ComfyUI graphs have several
interconnected nodes (UNETLoader, DualCLIPLoader, VAELoader, sampler nodes)
and a wrong graph will fail silently or produce garbage output. Exporting
from a working ComfyUI session (or reusing the confirmed-matching official
example, as done here) is the only reliable source.

## Wan 2.2 (done)

Uses RunPod Hub's public **"Alibaba / Wan 2.2 I2V 720p"** endpoint
(id `wan-2-2-i2v-720`) — confirmed via the **API** tab at
console.runpod.io/hub/playground/video/wan-2-2-i2v-720. This does **not**
use the workflow-JSON pattern above; it has its own simple schema
(`prompt`, `image`, `size`, `duration`, `seed`, etc.), already implemented
in `buildWanInput()` in `src/libs/RunPod.ts`. No deploy step was needed
since it's a shared public endpoint — it's billed to your account per call.

If you later build a fully custom Wan 2.2 ComfyUI workflow (for more
control), follow the same export steps as Flux above and save it as
`wan22-i2v.json`.
