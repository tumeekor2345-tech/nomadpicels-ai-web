import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Footer } from '@/templates/Footer';
import { Navbar } from '@/templates/Navbar';

type PrivacyProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: PrivacyProps): Promise<Metadata> {
  const { locale } = await props.params;
  return {
    title: locale === 'mn' ? 'Нууцлалын бодлого' : 'Privacy Policy',
  };
}

const content: Record<string, { title: string; updated: string; draftNotice: string; sections: { heading: string; body: string[] }[] }> = {
  en: {
    title: 'Privacy Policy',
    updated: 'Last updated: July 2026',
    draftNotice: 'Draft — this is a starting template, not final legal advice. Have a qualified lawyer review it before launch, especially regarding Mongolia\'s personal data protection law and cross-border data transfer to our processors.',
    sections: [
      {
        heading: '1. What we collect',
        body: [
          'Account information: your name and email, handled by our authentication provider, Clerk.',
          'Content you create: the prompts you write, any source images you upload for video generation, and the images/videos generated for you.',
          'Usage data: which features you use, generation counts and timestamps (used for the daily usage limit and to keep the Service reliable).',
          'Payment metadata: when payments are enabled, we\'ll receive confirmation that a payment succeeded and an invoice/transaction id from QPay, SocialPay, or the card processor — we don\'t receive or store your card or bank account numbers ourselves.',
        ],
      },
      {
        heading: '2. How we use it',
        body: [
          'To provide the Service (generate your images/videos and show them back to you), to enforce the Acceptable Use policy in our Terms, to prevent abuse (rate limiting), and to fix bugs.',
        ],
      },
      {
        heading: '3. Who we share it with',
        body: [
          'Clerk — authentication and account management.',
          'RunPod — receives your prompts and, for video, your source image, to run the Flux and Wan 2.2 models on their GPU infrastructure. This is necessary for the Service to work.',
          'Sentry — receives technical error data (not your prompts) to help us fix crashes.',
          'QPay / SocialPay / bank card processors — receive payment details necessary to process a purchase, once payments are enabled.',
          'We don\'t sell your personal data.',
        ],
      },
      {
        heading: '4. Data retention',
        body: [
          'We keep your generation history (prompts and results) so you can see it again on the Create page, until you delete your account or request deletion.',
        ],
      },
      {
        heading: '5. Your rights',
        body: [
          'You can ask us to access, correct, or delete your personal data by contacting us through the details on our Contact page. You can delete your account at any time from your account settings.',
        ],
      },
      {
        heading: '6. Children\'s privacy',
        body: [
          'The Service is not directed at children and is not intended for anyone under 18. We don\'t knowingly collect data from children.',
        ],
      },
      {
        heading: '7. Security',
        body: [
          'We rely on our providers\' (Clerk, RunPod) security practices in addition to our own, but no system is 100% secure — please use a strong, unique password.',
        ],
      },
      {
        heading: '8. International transfer',
        body: [
          'Our processors (including RunPod\'s GPU servers) may be located outside Mongolia. By using the Service, you consent to this transfer.',
        ],
      },
      {
        heading: '9. Changes',
        body: [
          'We may update this Privacy Policy from time to time. We\'ll post the updated version here with a new "last updated" date.',
        ],
      },
      {
        heading: '10. Contact',
        body: [
          'Questions about this Privacy Policy? Contact us through the details on our Contact page.',
        ],
      },
    ],
  },
  mn: {
    title: 'Нууцлалын бодлого',
    updated: 'Сүүлд шинэчилсэн: 2026 оны 7 сар',
    draftNotice: 'Ноорог — энэ бол эхлэлийн загвар бөгөөд эцсийн хууль зүйн зөвлөгөө биш юм. Ялангуяа Монголын хувийн мэдээлэл хамгаалах хууль болон боловсруулагч түншүүд рүү хилийн чанадад дамжуулах асуудлыг мэргэшсэн хуульчаар хянуулна уу.',
    sections: [
      {
        heading: '1. Бид юу цуглуулдаг вэ',
        body: [
          'Акаунтын мэдээлэл: таны нэр, имэйл хаяг, манай нэвтрэлтийн үйлчилгээ Clerk-ээр удирдагддаг.',
          'Таны үүсгэсэн агуулга: та бичсэн prompt, видео үүсгэхэд оруулсан эх зураг, таны төлөө үүсгэсэн зураг/видео.',
          'Хэрэглээний мэдээлэл: аль функцийг ашигласан, үүсгэлтийн тоо, цаг (өдрийн хязгаарлалт болон Үйлчилгээний тогтвортой байдлыг хангахад ашиглагдана).',
          'Төлбөрийн metadata: төлбөр идэвхжсэн үед бид QPay, SocialPay, эсвэл картын боловсруулагчаас төлбөр амжилттай болсон баталгаа, invoice/гүйлгээний ID хүлээн авна — таны карт эсвэл дансны дугаарыг бид өөрсдөө хүлээн авч, хадгалдаггүй.',
        ],
      },
      {
        heading: '2. Бид үүнийг яаж ашигладаг',
        body: [
          'Үйлчилгээг үзүүлэх (зураг/видеог үүсгэж, танд харуулах), Үйлчилгээний нөхцөл дэх зөвшөөрөгдөх ашиглалтын бодлогыг мөрдүүлэх, хэтрүүлэлтээс сэргийлэх (хязгаарлалт), алдаа засварлахад ашигладаг.',
        ],
      },
      {
        heading: '3. Хэнтэй хуваалцдаг вэ',
        body: [
          'Clerk — нэвтрэлт болон акаунтын удирдлага.',
          'RunPod — Flux болон Wan 2.2 загваруудыг GPU дэд бүтэц дээрээ ажиллуулахын тулд таны prompt, видеоны хувьд эх зургийг хүлээн авдаг. Энэ нь Үйлчилгээ ажиллахад зайлшгүй шаардлагатай.',
          'Sentry — эвдрэл засахад туслах техникийн алдааны мэдээлэл (таны prompt биш) хүлээн авдаг.',
          'QPay / SocialPay / банкны картын боловсруулагчид — төлбөр идэвхжсэний дараа худалдан авалтыг боловсруулахад шаардлагатай мэдээллийг хүлээн авна.',
          'Бид таны хувийн мэдээллийг зарахгүй.',
        ],
      },
      {
        heading: '4. Хадгалах хугацаа',
        body: [
          'Та Create хуудсан дээрээ дахин харах боломжтой байлгахын тулд бид таны үүсгэлтийн түүхийг (prompt, үр дүн) акаунтаа устгах эсвэл устгахыг хүсэх хүртэл хадгалдаг.',
        ],
      },
      {
        heading: '5. Таны эрх',
        body: [
          'Та манай Холбоо барих хуудсан дахь мэдээллээр холбогдож хувийн мэдээлэлдээ хандах, засварлах, устгахыг хүсэж болно. Та акаунтаа хүссэн үедээ акаунтын тохиргооноосоо устгаж болно.',
        ],
      },
      {
        heading: '6. Хүүхдийн нууцлал',
        body: [
          'Үйлчилгээ нь хүүхдэд чиглээгүй бөгөөд 18-аас доош насны хэнд ч зориулагдаагүй. Бид хүүхдээс санаатайгаар мэдээлэл цуглуулдаггүй.',
        ],
      },
      {
        heading: '7. Аюулгүй байдал',
        body: [
          'Бид өөрийн болон Clerk, RunPod зэрэг түншүүдийнхээ аюулгүй байдлын дадал зуршил дээр найддаг ч 100% аюулгүй систем гэж байдаггүй — хүчтэй, өвөрмөц нууц үг ашиглана уу.',
        ],
      },
      {
        heading: '8. Улс хоорондын дамжуулалт',
        body: [
          'Манай боловсруулагч түншүүд (RunPod-ийн GPU сервер зэрэг) Монголын гадна байрлаж болно. Үйлчилгээг ашигласнаар та энэ дамжуулалтад зөвшөөрч байна.',
        ],
      },
      {
        heading: '9. Өөрчлөлт',
        body: [
          'Бид энэ Нууцлалын бодлогыг цаг үргэлж шинэчилж болно. Шинэчилсэн хувилбарыг "сүүлд шинэчилсэн" огноотойгоор энд байрлуулна.',
        ],
      },
      {
        heading: '10. Холбоо барих',
        body: [
          'Энэ Нууцлалын бодлоготой холбоотой асуулт байвал манай Холбоо барих хуудсан дахь мэдээллээр холбогдоно уу.',
        ],
      },
    ],
  },
};

export default async function PrivacyPage(props: PrivacyProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const c = content[locale] ?? content.en!;

  return (
    <>
      <Navbar />
      <div className="mx-auto max-w-3xl px-3 py-16">
        <h1 className="text-3xl font-bold">{c!.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{c!.updated}</p>

        <div className="
          mt-4 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-4
          text-sm
        "
        >
          {c!.draftNotice}
        </div>

        <div className="mt-8 flex flex-col gap-8">
          {c!.sections.map(section => (
            <section key={section.heading}>
              <h2 className="text-xl font-semibold">{section.heading}</h2>
              {section.body.map(paragraph => (
                <p
                  key={paragraph.slice(0, 40)}
                  className="mt-2 text-muted-foreground"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
      <Footer />
    </>
  );
}
