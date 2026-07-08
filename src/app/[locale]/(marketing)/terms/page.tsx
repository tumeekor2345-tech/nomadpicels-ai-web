import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Footer } from '@/templates/Footer';
import { Navbar } from '@/templates/Navbar';

type TermsProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: TermsProps): Promise<Metadata> {
  const { locale } = await props.params;
  return {
    title: locale === 'mn' ? 'Үйлчилгээний нөхцөл' : 'Terms of Service',
  };
}

const content: Record<string, { title: string; updated: string; draftNotice: string; sections: { heading: string; body: string[] }[] }> = {
  en: {
    title: 'Terms of Service',
    updated: 'Last updated: July 2026',
    draftNotice: 'Draft — this is a starting template, not final legal advice. Have a qualified lawyer review it before launch, especially the sections on payments, liability, and Mongolian consumer-protection law.',
    sections: [
      {
        heading: '1. Acceptance of these Terms',
        body: [
          'By creating an account or using NomadPixels AI ("the Service"), you agree to these Terms of Service. If you don\'t agree, please don\'t use the Service.',
        ],
      },
      {
        heading: '2. What the Service does',
        body: [
          'NomadPixels AI lets you generate images from text prompts (using the Flux model) and generate short videos from an image and prompt (using the Wan 2.2 model). Generations run on rented GPU infrastructure and are billed on a credit basis.',
        ],
      },
      {
        heading: '3. Accounts and organizations',
        body: [
          'You need an account (via Clerk) to use the Service. You\'re responsible for keeping your login secure and for all activity under your account or organization.',
        ],
      },
      {
        heading: '4. Acceptable use',
        body: [
          'You may not use the Service to generate or attempt to generate: content depicting or sexualizing minors in any way; non-consensual sexual content or intimate imagery of real people; content intended to harass, defame, or impersonate a real person without consent; content that infringes someone else\'s intellectual property or rights of publicity; or content that is illegal under Mongolian law or the law of your jurisdiction.',
          'We use automated filters to catch some of these categories, but filters are not perfect. We may suspend accounts that violate this policy, with or without notice.',
        ],
      },
      {
        heading: '5. Your generated content',
        body: [
          'Subject to your compliance with Section 4 and the underlying model licenses (Flux.1-schnell and Wan 2.2 are both released under Apache 2.0), you own the images and videos you generate and may use them commercially.',
          'We don\'t guarantee that a generation is unique, free of third-party rights, or fit for any particular purpose. You generate and use content at your own risk.',
        ],
      },
      {
        heading: '6. Credits and payments',
        body: [
          'Credits are purchased in Mongolian tögrög (MNT) via QPay, SocialPay, or supported bank cards, and are consumed per generation. Except where required by Mongolian consumer-protection law, credits and payments are non-refundable once a generation has started.',
          'Prices and included credits per plan are shown on our Pricing page and may change with notice.',
        ],
      },
      {
        heading: '7. Third-party AI processing',
        body: [
          'Your prompts and, for video, your source images are sent to our GPU processing provider (RunPod) to run the Flux and Wan 2.2 models. See our Privacy Policy for details on what\'s shared and why.',
        ],
      },
      {
        heading: '8. Availability',
        body: [
          'The Service is provided on a best-effort basis. GPU capacity, generation speed, and availability can vary, and we may apply rate limits to prevent abuse.',
        ],
      },
      {
        heading: '9. Termination',
        body: [
          'You may stop using the Service and delete your account at any time. We may suspend or terminate accounts that violate these Terms.',
        ],
      },
      {
        heading: '10. Disclaimers and liability',
        body: [
          'The Service is provided "as is" without warranties of any kind. To the maximum extent permitted by law, NomadPixels AI is not liable for indirect, incidental, or consequential damages arising from your use of the Service or of content you generate.',
        ],
      },
      {
        heading: '11. Governing law',
        body: [
          'These Terms are governed by the laws of Mongolia, without regard to conflict-of-law principles, unless mandatory local consumer-protection law in your country provides otherwise.',
        ],
      },
      {
        heading: '12. Changes',
        body: [
          'We may update these Terms from time to time. We\'ll post the updated version here with a new "last updated" date.',
        ],
      },
      {
        heading: '13. Contact',
        body: [
          'Questions about these Terms? Contact us through the details on our Contact page.',
        ],
      },
    ],
  },
  mn: {
    title: 'Үйлчилгээний нөхцөл',
    updated: 'Сүүлд шинэчилсэн: 2026 оны 7 сар',
    draftNotice: 'Ноорог — энэ бол эхлэлийн загвар бөгөөд эцсийн хууль зүйн зөвлөгөө биш юм. Ялангуяа төлбөр, хариуцлага, Монголын хэрэглэгч хамгааллын хуультай холбоотой хэсгүүдийг мэргэшсэн хуульчаар нэвтрүүлэхээс өмнө хянуулна уу.',
    sections: [
      {
        heading: '1. Нөхцөлийг хүлээн зөвшөөрөх',
        body: [
          'Акаунт үүсгэх эсвэл NomadPixels AI ("Үйлчилгээ")-г ашигласнаар та энэхүү Үйлчилгээний нөхцөлийг хүлээн зөвшөөрч байна. Хэрэв та зөвшөөрөхгүй бол Үйлчилгээг бүү ашиглана уу.',
        ],
      },
      {
        heading: '2. Үйлчилгээ юу хийдэг вэ',
        body: [
          'NomadPixels AI нь текст prompt-оос зураг (Flux загвар ашиглан), мөн зураг болон prompt-оос богино видео (Wan 2.2 загвар ашиглан) үүсгэх боломж олгодог. Үүсгэлт нь түрээсийн GPU дэд бүтэц дээр ажилладаг бөгөөд кредитийн тогтолцоогоор төлбөр авдаг.',
        ],
      },
      {
        heading: '3. Акаунт, байгууллага',
        body: [
          'Үйлчилгээг ашиглахын тулд акаунт (Clerk-ээр) хэрэгтэй. Та нэвтрэх мэдээллээ аюулгүй хадгалах, акаунт/байгууллагынхаа доор хийгдэх бүх үйл ажиллагаанд хариуцлага хүлээнэ.',
        ],
      },
      {
        heading: '4. Зөвшөөрөгдөх ашиглалт',
        body: [
          'Та дараах агуулгыг үүсгэх, үүсгэхийг оролдох ёсгүй: насанд хүрээгүй хүмүүсийг дүрсэлсэн эсвэл секс шинжтэй болгосон ямар ч агуулга; жинхэнэ хүмүүсийн зөвшөөрөлгүй секс шинж чанартай эсвэл дотно зураг; жинхэнэ хүнийг зөвшөөрөлгүйгээр дуурайлгах, доромжлох, гүтгэх зорилготой агуулга; бусдын оюуны өмч, нэр хүндийн эрхийг зөрчсөн агуулга; эсвэл Монгол улсын хууль болон таны харьяалагдах улсын хуулийн дагуу хууль бус агуулга.',
          'Бид зарим ангиллыг автомат шүүлтүүрээр илрүүлдэг ч шүүлтүүр төгс биш. Энэ бодлогыг зөрчсөн акаунтыг урьдчилан мэдэгдэлтэй эсвэл мэдэгдэлгүйгээр түр зогсоож болно.',
        ],
      },
      {
        heading: '5. Таны үүсгэсэн агуулга',
        body: [
          '4-р зүйлийг мөрдөж, суурь загваруудын лиценз (Flux.1-schnell болон Wan 2.2 хоёулаа Apache 2.0 лицензтэй)-ийг дагаж мөрдсөн тохиолдолд та үүсгэсэн зураг, видеогоо эзэмшиж, коммерцын зорилгоор ашиглаж болно.',
          'Бид үүсгэлт үнэхээр өвөрмөц, гуравдагч этгээдийн эрхээс ангид, эсвэл тодорхой зорилгод тохирсон гэдгийг баталгаажуулдаггүй. Та агуулгыг өөрийн эрсдэлээр үүсгэж, ашиглана.',
        ],
      },
      {
        heading: '6. Кредит ба төлбөр',
        body: [
          'Кредитийг QPay, SocialPay, эсвэл дэмжигдсэн банкны картаар төгрөгөөр худалдан авч, үүсгэлт тус бүрт зарцуулна. Монголын хэрэглэгч хамгааллын хуулиар шаардагдаагүй тохиолдолд, үүсгэлт эхэлсэн кредит, төлбөрийг буцаан олгохгүй.',
          'Багц тус бүрийн үнэ, багтсан кредитийг манай Үнийн хуудсанд харуулсан бөгөөд урьдчилан мэдэгдэж өөрчлөгдөж болно.',
        ],
      },
      {
        heading: '7. Гуравдагч талын AI боловсруулалт',
        body: [
          'Таны prompt, видеоны хувьд эх зураг тань Flux болон Wan 2.2 загваруудыг ажиллуулах GPU боловсруулалтын түншид (RunPod) илгээгддэг. Юу хуваалцдаг, яагаад гэдгийг манай Нууцлалын бодлогоос үзнэ үү.',
        ],
      },
      {
        heading: '8. Бэлэн байдал',
        body: [
          'Үйлчилгээг чадах чинээгээрээ үзүүлдэг. GPU багтаамж, үүсгэх хурд, бэлэн байдал өөр өөр байж болох бөгөөд бид хэтрүүлэлтээс сэргийлж хязгаарлалт хийж болно.',
        ],
      },
      {
        heading: '9. Цуцлалт',
        body: [
          'Та хүссэн үедээ Үйлчилгээг ашиглахаа больж, акаунтаа устгаж болно. Энэ нөхцөлийг зөрчсөн акаунтыг бид түр зогсоох, цуцлах эрхтэй.',
        ],
      },
      {
        heading: '10. Хариуцлагын хязгаарлалт',
        body: [
          'Үйлчилгээг "байгаа хэвээр нь" ямар ч баталгаагүйгээр үзүүлнэ. Хуулиар зөвшөөрөгдсөн дээд хэмжээгээр, NomadPixels AI нь таны Үйлчилгээ болон үүсгэсэн агуулгаа ашигласнаас үүдэлтэй шууд бус хохирлыг хариуцахгүй.',
        ],
      },
      {
        heading: '11. Мөрдөгдөх хууль',
        body: [
          'Таны улсын хэрэглэгч хамгааллын албадан хууль өөрөөр заагаагүй бол энэхүү нөхцөлийг Монгол улсын хуулиар зохицуулна.',
        ],
      },
      {
        heading: '12. Өөрчлөлт',
        body: [
          'Бид энэ нөхцөлийг цаг үргэлж шинэчилж болно. Шинэчилсэн хувилбарыг "сүүлд шинэчилсэн" огноотойгоор энд байрлуулна.',
        ],
      },
      {
        heading: '13. Холбоо барих',
        body: [
          'Энэ нөхцөлтэй холбоотой асуулт байвал манай Холбоо барих хуудсан дахь мэдээллээр холбогдоно уу.',
        ],
      },
    ],
  },
};

export default async function TermsPage(props: TermsProps) {
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
