import { ImageIcon, Mic, Repeat, Wand2 } from 'lucide-react';
import { Link } from '@/libs/I18nNavigation';

type GalleryLabels = {
  restoreTitle: string;
  restoreDescription: string;
  faceSwapTitle: string;
  faceSwapDescription: string;
  imageEffectTitle: string;
  imageEffectDescription: string;
  voiceTitle: string;
  voiceDescription: string;
  open: string;
};

const cardBase = 'flex flex-col gap-3 rounded-md bg-card p-5 transition-colors hover:bg-accent';

export const ToolsGallery = (props: { labels: GalleryLabels }) => {
  const { labels } = props;

  return (
    <div className="
      grid grid-cols-1 gap-4
      sm:grid-cols-2
      lg:grid-cols-4
    "
    >
      <Link href="/dashboard/tools/photo-restore" className={cardBase}>
        <ImageIcon className="size-6 text-primary" />
        <div>
          <div className="text-lg font-semibold">{labels.restoreTitle}</div>
          <div className="mt-1 text-sm text-muted-foreground">{labels.restoreDescription}</div>
        </div>
        <div className="mt-auto text-sm font-medium text-primary">{labels.open}</div>
      </Link>

      <Link href="/dashboard/tools/face-swap" className={cardBase}>
        <Repeat className="size-6 text-primary" />
        <div>
          <div className="text-lg font-semibold">{labels.faceSwapTitle}</div>
          <div className="mt-1 text-sm text-muted-foreground">{labels.faceSwapDescription}</div>
        </div>
        <div className="mt-auto text-sm font-medium text-primary">{labels.open}</div>
      </Link>

      <Link href="/dashboard/tools/image-effect" className={cardBase}>
        <Wand2 className="size-6 text-primary" />
        <div>
          <div className="text-lg font-semibold">{labels.imageEffectTitle}</div>
          <div className="mt-1 text-sm text-muted-foreground">{labels.imageEffectDescription}</div>
        </div>
        <div className="mt-auto text-sm font-medium text-primary">{labels.open}</div>
      </Link>

      <Link href="/dashboard/tools/voice-changer" className={cardBase}>
        <Mic className="size-6 text-primary" />
        <div>
          <div className="text-lg font-semibold">{labels.voiceTitle}</div>
          <div className="mt-1 text-sm text-muted-foreground">{labels.voiceDescription}</div>
        </div>
        <div className="mt-auto text-sm font-medium text-primary">{labels.open}</div>
      </Link>
    </div>
  );
};
