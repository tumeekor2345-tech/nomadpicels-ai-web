'use client';

import type { LucideIcon } from 'lucide-react';
import type { PresetVisual } from '@/libs/PresetVisuals';
import {
  Aperture,
  ArrowUpFromLine,
  Ban,
  BookOpen,
  Box,
  Brush,
  Camera,
  ChevronDown,
  ChevronUp,
  CircleDot,
  CircleIcon,
  Clapperboard,
  CloudMoon,
  Contrast,
  Disc,
  Droplet,
  Film,
  Focus,
  Gem,
  Image as ImageIcon,
  Layers,
  Leaf,
  Maximize,
  MessageSquare,
  Minus,
  Navigation,
  Palette,
  RotateCw,
  Snowflake,
  Sparkles,
  Sun,
  Sunset,
  User,
  WandSparkles,
  Wind,
  Zap,
  ZoomIn,
} from 'lucide-react';

// Keys match the `icon` field values used in src/libs/PresetVisuals.ts.
const ICON_MAP: Record<string, LucideIcon> = {
  ban: Ban,
  camera: Camera,
  clapperboard: Clapperboard,
  sparkles: Sparkles,
  brush: Brush,
  box: Box,
  droplet: Droplet,
  zap: Zap,
  'wand-sparkles': WandSparkles,
  contrast: Contrast,
  disc: Disc,
  'book-open': BookOpen,
  image: ImageIcon,
  'message-square': MessageSquare,
  sun: Sun,
  snowflake: Snowflake,
  palette: Palette,
  leaf: Leaf,
  gem: Gem,
  sunset: Sunset,
  film: Film,
  'cloud-moon': CloudMoon,
  focus: Focus,
  wind: Wind,
  layers: Layers,
  aperture: Aperture,
  minus: Minus,
  'chevron-up': ChevronUp,
  'chevron-down': ChevronDown,
  'circle-dot': CircleDot,
  'zoom-in': ZoomIn,
  maximize: Maximize,
  user: User,
  navigation: Navigation,
  'arrow-up-from-line': ArrowUpFromLine,
  'rotate-cw': RotateCw,
  circle: CircleIcon,
};

type PresetPickerProps<TId extends string> = {
  label: string;
  presets: Array<{ id: TId; promptFragment: string }>;
  visuals: Record<string, PresetVisual>;
  labels: Record<TId, string>;
  value: TId;
  onChange: (id: TId) => void;
};

export function PresetPicker<TId extends string>(props: PresetPickerProps<TId>) {
  const { label, presets, visuals, labels, value, onChange } = props;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="
        grid grid-cols-3 gap-2
        sm:grid-cols-4
      "
      >
        {presets.map((preset) => {
          const visual = visuals[preset.id] ?? visuals.none;
          const Icon = ICON_MAP[visual?.icon ?? 'ban'] ?? Ban;
          const selected = value === preset.id;

          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(preset.id)}
              aria-pressed={selected}
              className={`
                group flex flex-col items-center gap-1 rounded-md p-1
                outline-none
                focus-visible:ring-2 focus-visible:ring-ring
              `}
            >
              <div
                className={`
                  flex aspect-square w-full items-center justify-center
                  rounded-md border-2 transition
                  ${selected ? 'border-primary ring-2 ring-primary/40' : 'border-transparent'}
                  group-hover:border-primary/60
                `}
                style={{ background: visual?.gradient }}
              >
                <Icon
                  className={`
                    size-5 drop-shadow
                    ${selected ? 'text-white' : 'text-white/90'}
                  `}
                  strokeWidth={2}
                />
              </div>
              <span
                className={`
                  line-clamp-2 text-center text-[11px] leading-tight
                  ${selected ? 'font-semibold text-foreground' : 'text-muted-foreground'}
                `}
              >
                {labels[preset.id]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
