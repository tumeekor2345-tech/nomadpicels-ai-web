import type { LocalizationResource } from '@clerk/shared/types';
import type { LocalePrefixMode } from 'next-intl/routing';
import type { AppLocale } from '@/types/I18n';
import { enUS, mnMN } from '@clerk/localizations';

/** Locale prefix strategy for next-intl routing. */
const localePrefix: LocalePrefixMode = 'as-needed';
const locales = [
  {
    id: 'mn',
    name: 'Монгол',
  },
  {
    id: 'en',
    name: 'English',
  },
] satisfies AppLocale[];

/** Centralized application configuration — NomadPixels AI */
export const AppConfig = {
  name: 'NomadPixels AI',
  i18n: {
    locales,
    defaultLocale: 'mn',
    localePrefix,
  },
  email: {
    support: 'support@nomadpixels-ai.com',
  },
} as const;

// @clerk/localizations ships an official `mnMN` resource — this localizes
// Clerk's own UI (sign-in/sign-up widgets), separate from our app strings
// in src/locales/mn.json.
const supportedLocales: Record<string, LocalizationResource> = {
  mn: mnMN,
  en: enUS,
};

export const ClerkLocalizations = {
  defaultLocale: supportedLocales.mn,
  supportedLocales,
};

export const AllLocales = AppConfig.i18n.locales.map(locale => locale.id);
