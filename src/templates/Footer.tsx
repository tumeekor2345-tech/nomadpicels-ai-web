import { useTranslations } from 'next-intl';
import { CenteredFooter } from '@/features/landing/CenteredFooter';
import { Section } from '@/features/landing/Section';
import { Link } from '@/libs/I18nNavigation';
import { AppConfig } from '@/utils/AppConfig';
import { Logo } from './Logo';

export const Footer = () => {
  const t = useTranslations('Footer');

  return (
    <Section className="pt-0 pb-16">
      <CenteredFooter
        logo={<Logo />}
        name={AppConfig.name}
        iconList={null}
        legalLinks={(
          <>
            <li>
              <Link href="/terms">{t('terms_of_service')}</Link>
            </li>
            <li>
              <Link href="/privacy">{t('privacy_policy')}</Link>
            </li>
            <li>
              <Link href="/contact">{t('contact')}</Link>
            </li>
          </>
        )}
      >
        <li>
          <Link href="/sign-up">{t('product')}</Link>
        </li>
      </CenteredFooter>
    </Section>
  );
};
