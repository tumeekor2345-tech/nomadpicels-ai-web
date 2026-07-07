'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

type ToolLabels = {
  restoreTitle: string;
  restoreDescription: string;
  faceSwapTitle: string;
  faceSwapDescription: string;
  voiceTitle: string;
  voiceDescription: string;
  imageUrlPlaceholder: string;
  run: string;
  running: string;
  queued: string;
  inProgress: string;
  failed: string;
  downloadLabel: string;
  voiceUploadLabel: string;
  voiceVeryDeep: string;
  voiceDeep: string;
  voiceFemale: string;
  voiceHigh: string;
  voiceChild: string;
  voiceRobot: string;
  voiceProcessing: string;
  voicePlayOriginal: string;
};

/** Shared image-generation tool card (Photo Restore / Face Swap) — both take
 * just an image URL and a single button, no prompt required. */
function ImageToolCard(props: {
  kind: 'photo_restore' | 'face_swap';
  title: string;
  description: string;
  labels: ToolLabels;
}) {
  const { labels } = props;
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [resultSrc, setResultSrc] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pollStatus = async (jobId: string, startedAt: number) => {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      setErrorText(labels.failed);
      setSubmitting(false);
      return;
    }

    const res = await fetch(`/api/generate/status?jobId=${jobId}`);
    const data = await res.json();

    if (!res.ok) {
      setErrorText(data.error ?? labels.failed);
      setSubmitting(false);
      return;
    }

    if (data.status === 'COMPLETED') {
      setSubmitting(false);
      setStatusText(null);
      if (props.kind === 'photo_restore' && data.output?.images?.[0]) {
        const image = data.output.images[0];
        setResultSrc(image.type === 'base64' ? `data:image/png;base64,${image.data}` : image.data);
      } else if (props.kind === 'face_swap' && data.output?.image_base64) {
        setResultSrc(`data:image/png;base64,${data.output.image_base64}`);
      } else {
        setErrorText(labels.failed);
      }
      return;
    }

    if (data.status === 'FAILED' || data.status === 'CANCELLED' || data.status === 'TIMED_OUT') {
      setSubmitting(false);
      setErrorText(data.output?.errors?.join(', ') ?? data.error ?? labels.failed);
      return;
    }

    setStatusText(data.status === 'IN_QUEUE' ? labels.queued : labels.inProgress);
    pollTimer.current = setTimeout(pollStatus, POLL_INTERVAL_MS, jobId, startedAt);
  };

  const handleRun = async () => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
    }
    setErrorText(null);
    setResultSrc(null);
    setSubmitting(true);
    setStatusText(labels.queued);

    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: props.kind, imageUrl }),
    });
    const data = await res.json();

    if (!res.ok) {
      setSubmitting(false);
      setStatusText(null);
      setErrorText(data.message ?? data.error ?? labels.failed);
      return;
    }

    pollStatus(data.jobId, Date.now());
  };

  return (
    <div className="flex flex-col gap-4 rounded-md bg-card p-5">
      <div>
        <div className="text-lg font-semibold">{props.title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{props.description}</div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${props.kind}-url`}>URL</Label>
        <Input
          id={`${props.kind}-url`}
          type="url"
          required
          value={imageUrl}
          onChange={e => setImageUrl(e.target.value)}
          placeholder={labels.imageUrlPlaceholder}
        />
      </div>

      <div>
        <Button type="button" disabled={submitting || !imageUrl} onClick={handleRun}>
          {submitting ? labels.running : labels.run}
        </Button>
      </div>

      {statusText && <div className="text-sm text-muted-foreground">{statusText}</div>}
      {errorText && <div className="text-sm font-medium text-destructive">{errorText}</div>}

      {resultSrc && (
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resultSrc} alt={props.title} className="max-w-full rounded-md" />
          <a href={resultSrc} download={`${props.kind}.png`} className="text-sm text-primary underline">
            {labels.downloadLabel}
          </a>
        </div>
      )}
    </div>
  );
}

// --- Voice Changer: pure client-side pitch shift, no server/credits ------
//
// Technique: read the recording into an AudioBuffer, then re-render it
// through an OfflineAudioContext with the AudioBufferSourceNode's
// `playbackRate` changed. Reading a buffer faster/slower than it was
// recorded raises/lowers its pitch (the classic "chipmunk" / "deep voice"
// effect) — this only touches pitch+speed together, no AI involved.
// "Robot" additionally runs a sample-and-hold step on the pitched buffer for
// a distinctly robotic texture, not just a pitch change.
const VOICE_PRESETS = [
  { id: 'verydeep', rate: 0.65, robot: false },
  { id: 'deep', rate: 0.8, robot: false },
  { id: 'female', rate: 1.2, robot: false },
  { id: 'high', rate: 1.4, robot: false },
  { id: 'child', rate: 1.7, robot: false },
  { id: 'robot', rate: 0.9, robot: true },
] as const;

function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const blockAlign = numChannels * 2;
  const dataSize = numFrames * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const raw = channelData[ch]?.[i] ?? 0;
      const clamped = Math.max(-1, Math.min(1, raw));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/** Sample-and-hold: repeats every Nth sample, giving a robotic/lo-fi texture
 * distinct from a plain pitch shift. Mutates and returns the same buffer. */
function applyRobotEffect(buffer: AudioBuffer): AudioBuffer {
  const HOLD_SAMPLES = 7;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    let held = 0;
    for (let i = 0; i < data.length; i++) {
      if (i % HOLD_SAMPLES === 0) {
        held = data[i] ?? 0;
      }
      data[i] = held;
    }
  }
  return buffer;
}

async function pitchShiftFile(file: File, rate: number, robot: boolean): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextClass();

  // iOS Safari can start a freshly created AudioContext in "suspended"
  // state even inside a user-gesture click handler — make sure it's
  // actually running before we decode/render through it.
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    Math.max(1, Math.ceil(audioBuffer.length / rate)),
    audioBuffer.sampleRate,
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.playbackRate.value = rate;
  source.connect(offlineCtx.destination);
  source.start();
  let rendered = await offlineCtx.startRendering();
  await audioCtx.close();

  if (robot) {
    rendered = applyRobotEffect(rendered);
  }

  return encodeWav(rendered);
}

function VoiceChangerCard(props: { labels: ToolLabels }) {
  const { labels } = props;
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  const presetLabel = (id: string) => {
    if (id === 'verydeep') {
      return labels.voiceVeryDeep;
    }
    if (id === 'deep') {
      return labels.voiceDeep;
    }
    if (id === 'female') {
      return labels.voiceFemale;
    }
    if (id === 'high') {
      return labels.voiceHigh;
    }
    if (id === 'robot') {
      return labels.voiceRobot;
    }
    return labels.voiceChild;
  };

  const handlePreset = async (id: string, rate: number, robot: boolean) => {
    if (!file) {
      return;
    }
    setErrorText(null);
    setProcessing(id);
    try {
      const blob = await pitchShiftFile(file, rate, robot);
      // Revoke the previous result's blob: URL before replacing it, and force
      // the <audio> element to fully remount (via key) so the browser can't
      // keep playing a cached/stale source when only the src attribute changes.
      if (resultUrlRef.current) {
        URL.revokeObjectURL(resultUrlRef.current);
      }
      const nextUrl = URL.createObjectURL(blob);
      resultUrlRef.current = nextUrl;
      setResultUrl(nextUrl);
    } catch {
      setErrorText(labels.failed);
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-md bg-card p-5">
      <div>
        <div className="text-lg font-semibold">{props.labels.voiceTitle}</div>
        <div className="mt-1 text-sm text-muted-foreground">{props.labels.voiceDescription}</div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="voice-file">{labels.voiceUploadLabel}</Label>
        <Input
          id="voice-file"
          type="file"
          accept="audio/*"
          onChange={(e) => {
            const nextFile = e.target.files?.[0] ?? null;
            setFile(nextFile);
            setResultUrl(null);
            setErrorText(null);
            setOriginalUrl(nextFile ? URL.createObjectURL(nextFile) : null);
          }}
        />
      </div>

      {originalUrl && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-muted-foreground">{labels.voicePlayOriginal}</div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio key={originalUrl} src={originalUrl} controls className="w-full" />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {VOICE_PRESETS.map(preset => (
          <Button
            key={preset.id}
            type="button"
            variant="outline"
            disabled={!file || processing !== null}
            onClick={() => handlePreset(preset.id, preset.rate, preset.robot)}
          >
            {processing === preset.id ? labels.voiceProcessing : presetLabel(preset.id)}
          </Button>
        ))}
      </div>

      {errorText && <div className="text-sm font-medium text-destructive">{errorText}</div>}

      {resultUrl && (
        <div className="flex flex-col gap-2">
          {/* key={resultUrl} forces a fresh <audio> element per result so the
           * browser always loads the new blob instead of reusing a cached one. */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio key={resultUrl} src={resultUrl} controls autoPlay className="w-full" />
          <a href={resultUrl} download="voice-changed.wav" className="text-sm text-primary underline">
            {labels.downloadLabel}
          </a>
        </div>
      )}
    </div>
  );
}

export const ToolsClient = (props: { labels: ToolLabels }) => {
  return (
    <div className="
      grid grid-cols-1 gap-4
      lg:grid-cols-3
    "
    >
      <ImageToolCard
        kind="photo_restore"
        title={props.labels.restoreTitle}
        description={props.labels.restoreDescription}
        labels={props.labels}
      />
      <ImageToolCard
        kind="face_swap"
        title={props.labels.faceSwapTitle}
        description={props.labels.faceSwapDescription}
        labels={props.labels}
      />
      <VoiceChangerCard labels={props.labels} />
    </div>
  );
};
