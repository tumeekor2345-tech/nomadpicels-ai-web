import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { OrganizationMenu } from '@/features/dashboard/OrganizationMenu';
import { Sidebar } from '@/features/dashboard/Sidebar';
import { Topbar } from '@/features/dashboard/Topbar';
import { isAdminUser } from '@/libs/Admin';

type DashboardLayoutProps = {
  params: Promise<{ locale: string }>;
  children: React.ReactNode;
};

export async function generateMetadata(props: DashboardLayoutProps): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({
    locale,
    namespace: 'DashboardLayout',
  });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function DashboardLayout(props: DashboardLayoutProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({
    locale,
    namespace: 'DashboardLayout',
  });

  const { userId } = await auth();
  const showAdminLink = await isAdminUser(userId);

  const sections = [
    {
      label: t('section_create'),
      items: [
        { href: '/dashboard/create/image', label: t('create_image'), icon: 'image' as const },
        { href: '/dashboard/create/video', label: t('create_video'), icon: 'video' as const },
      ],
    },
    {
      label: t('section_tools'),
      items: [
        { href: '/dashboard/tools/photo-restore', label: t('tools_restore'), icon: 'restore' as const },
        { href: '/dashboard/tools/face-swap', label: t('tools_face_swap'), icon: 'faceswap' as const },
        { href: '/dashboard/tools/voice-changer', label: t('tools_voice'), icon: 'voice' as const },
      ],
    },
    {
      label: t('section_account'),
      items: [
        { href: '/dashboard/billing', label: t('billing'), icon: 'billing' as const },
        { href: '/dashboard/organization-profile', label: t('settings'), icon: 'org' as const },
        ...(showAdminLink
          ? [{ href: '/dashboard/admin', label: t('admin'), icon: 'admin' as const }]
          : []),
      ],
    },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        homeHref="/dashboard"
        homeLabel={t('home')}
        sections={sections}
        footer={<OrganizationMenu />}
      />

      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar
          homeHref="/dashboard"
          homeLabel={t('home')}
          sections={sections}
          buyCreditsLabel={t('buy_credits')}
        />

        <main className="
          flex-1 px-4 pt-6 pb-16
          md:px-8
        "
        >
          <div className="mx-auto max-w-6xl">
            {props.children}
          </div>
        </main>
      </div>
    </div>
  );
}

export const dynamic = 'force-dynamic';
