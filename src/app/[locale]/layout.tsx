import type { Metadata, Viewport } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Noto_Sans } from 'next/font/google';
import { notFound } from 'next/navigation';
import { routing } from '@/libs/I18nRouting';
import '@/styles/global.css';

// Noto Sans is used (rather than a more "designer" Google Font) because it's
// one of the few families that guarantees full Mongolian Cyrillic coverage,
// including the extra letters Өө / Үү that plain "cyrillic"-subset fonts
// often drop, which would otherwise cause silent mid-word font fallback.
const notoSans = Noto_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-noto-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  icons: [
    {
      rel: 'apple-touch-icon',
      url: '/apple-touch-icon.png',
    },
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '32x32',
      url: '/favicon-32x32.png',
    },
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '16x16',
      url: '/favicon-16x16.png',
    },
    {
      rel: 'icon',
      url: '/favicon.ico',
    },
  ],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export function generateStaticParams() {
  return routing.locales.map(locale => ({ locale }));
}

export default async function RootLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html lang={locale} className={notoSans.variable} suppressHydrationWarning>
      <body className="font-sans">
        <NextIntlClientProvider>
          {props.children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
