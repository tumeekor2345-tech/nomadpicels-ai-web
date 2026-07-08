import { currentUser } from '@clerk/nextjs/server';
import { ImageIcon, Mic, Repeat, Sparkles, Video } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RecentCreations } from '@/features/dashboard/RecentCreations';
import { Link } from '@/libs/I18nNavigation';

export default async function DashboardIndexPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'DashboardIndexPage',
  });

  const user = await currentUser();
  const firstName = user?.firstName ?? user?.username ?? '';

  return (
    <>
      <h1 className="text-2xl font-bold">
        {firstName ? t('welcome_named', { name: firstName }) : t('welcome')}
        {' '}
        👋
      </h1>
      <p className="mt-1 text-muted-foreground">{t('title_bar_description')}</p>

      <div className="
        mt-6 grid grid-cols-1 gap-4
        md:grid-cols-2
      "
      >
        <Link
          href="/dashboard/create/image"
          className="
            group relative overflow-hidden rounded-lg border border-border p-6
            transition-colors
          "
          style={{
            backgroundImage: 'linear-gradient(135deg, color-mix(in oklab, var(--primary) 35%, var(--background)), var(--background))',
          }}
        >
          <ImageIcon className="mb-4 size-8 text-primary" />
          <div className="text-xl font-semibold">{t('image_card_title')}</div>
          <div className="mt-1 text-sm text-muted-foreground">{t('image_card_description')}</div>
          <div className="
            mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary
          "
          >
            {t('create_cta')}
            <span className="
              transition-transform
              group-hover:translate-x-0.5
            "
            >
              →
            </span>
          </div>
        </Link>

        <Link
          href="/dashboard/create/video"
          className="
            group relative overflow-hidden rounded-lg border border-border p-6
            transition-colors
          "
          style={{
            backgroundImage: 'linear-gradient(135deg, color-mix(in oklab, var(--accent) 30%, var(--background)), var(--background))',
          }}
        >
          <Video className="mb-4 size-8 text-accent" />
          <div className="text-xl font-semibold">{t('video_card_title')}</div>
          <div className="mt-1 text-sm text-muted-foreground">{t('video_card_description')}</div>
          <div className="
            mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary
          "
          >
            {t('create_cta')}
            <span className="
              transition-transform
              group-hover:translate-x-0.5
            "
            >
              →
            </span>
          </div>
        </Link>
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">{t('tools_title')}</h2>
        <div className="
          grid grid-cols-1 gap-3
          sm:grid-cols-3
        "
        >
          <Link
            href="/dashboard/tools/photo-restore"
            className="
              flex items-center gap-3 rounded-md bg-card p-4 transition-colors
              hover:bg-secondary
            "
          >
            <Sparkles className="size-5 text-primary" />
            <span className="text-sm font-medium">{t('tools_restore')}</span>
          </Link>
          <Link
            href="/dashboard/tools/face-swap"
            className="
              flex items-center gap-3 rounded-md bg-card p-4 transition-colors
              hover:bg-secondary
            "
          >
            <Repeat className="size-5 text-primary" />
            <span className="text-sm font-medium">{t('tools_face_swap')}</span>
          </Link>
          <Link
            href="/dashboard/tools/voice-changer"
            className="
              flex items-center gap-3 rounded-md bg-card p-4 transition-colors
              hover:bg-secondary
            "
          >
            <Mic className="size-5 text-primary" />
            <span className="text-sm font-medium">{t('tools_voice')}</span>
          </Link>
        </div>
      </div>

      <RecentCreations
        title={t('recent_title')}
        emptyLabel={t('recent_empty')}
      />
    </>
  );
};
