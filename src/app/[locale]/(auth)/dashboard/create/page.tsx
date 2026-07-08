import { redirect } from 'next/navigation';
import { getI18nPath } from '@/utils/Helpers';

/**
 * The Create page used to be a single screen with an in-panel Зураг/Видео
 * toggle (?tab=image / ?tab=video). It's now split into two dedicated pages
 * (create/image, create/video) so each menu item opens straight into its own
 * mode with no toggle. This route only exists to redirect any old bookmarks
 * or links still pointing at /dashboard/create(?tab=...).
 */
export default async function CreatePage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await props.params;
  const { tab } = await props.searchParams;

  const target = tab === 'video' ? '/dashboard/create/video' : '/dashboard/create/image';
  redirect(getI18nPath(target, locale));
}
