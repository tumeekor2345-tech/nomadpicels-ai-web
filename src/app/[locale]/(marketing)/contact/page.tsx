import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Footer } from '@/templates/Footer';
import { Navbar } from '@/templates/Navbar';

type ContactProps = {
  params: Promise<{ locale: string }>;
};

const SUPPORT_EMAIL = 'tumee.kor2345@gmail.com';

export async function generateMetadata(props: ContactProps): Promise<Metadata> {
  const { locale } = await props.params;
  return {
    title: locale === 'mn' ? 'Холбоо барих' : 'Contact',
  };
}

const content: Record<string, {
  title: string;
  intro: string;
  emailLabel: string;
  responseNote: string;
  legalHeading: string;
  legalBody: string;
}> = {
  en: {
    title: 'Contact',
    intro: 'Questions, feedback, or a problem with a generation or payment? Reach out and we\'ll get back to you.',
    emailLabel: 'Email',
    responseNote: 'We typically reply within 1–2 business days.',
    legalHeading: 'For Terms of Service and Privacy Policy requests',
    legalBody: 'Use the same email above for account data requests (access, correction, deletion) or questions about our Terms of Service or Privacy Policy.',
  },
  mn: {
    title: 'Холбоо барих',
    intro: 'Асуулт, санал хүсэлт, эсвэл үүсгэлт/төлбөртэй холбоотой асуудал байвал бидэнтэй холбогдоорой — бид тантай холбогдох болно.',
    emailLabel: 'Имэйл',
    responseNote: 'Ихэвчлэн 1-2 ажлын өдрийн дотор хариулдаг.',
    legalHeading: 'Үйлчилгээний нөхцөл, Нууцлалын бодлоготой холбоотой хүсэлт',
    legalBody: 'Акаунтын мэдээлэлд хандах, засварлах, устгах хүсэлт, эсвэл Үйлчилгээний нөхцөл, Нууцлалын бодлоготой холбоотой асуулт байвал дээрх ижил имэйлээр холбогдоно уу.',
  },
};

export default async function ContactPage(props: ContactProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const c = content[locale] ?? content.en!;

  return (
    <>
      <Navbar />
      <div className="mx-auto max-w-3xl px-3 py-16">
        <h1 className="text-3xl font-bold">{c.title}</h1>
        <p className="mt-4 text-muted-foreground">{c.intro}</p>

        <div className="mt-8 rounded-md border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">{c.emailLabel}</p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="
              text-lg font-medium text-primary
              hover:underline
            "
          >
            {SUPPORT_EMAIL}
          </a>
          <p className="mt-2 text-sm text-muted-foreground">{c.responseNote}</p>
        </div>

        <div className="mt-8">
          <h2 className="text-xl font-semibold">{c.legalHeading}</h2>
          <p className="mt-2 text-muted-foreground">{c.legalBody}</p>
        </div>
      </div>
      <Footer />
    </>
  );
}
