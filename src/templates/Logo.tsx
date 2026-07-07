import { AppConfig } from '@/utils/AppConfig';

/**
 * NomadPixels AI brand mark — a "toono" (ger roof-wheel) mandala of 8 dots
 * dissolving from solid nomadic motif into pixels. Colors are hardcoded
 * (not theme tokens) on purpose: this is the physical brand mark and must
 * render identically in light and dark mode, same as any real logo would.
 */
export const Logo = (props: {
  isTextHidden?: boolean;
}) => (
  <div className="flex items-center text-xl font-semibold">
    <svg
      className="mr-1.5 size-8"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="5" r="2.3" fill="#E0A438" />
      <circle cx="16.95" cy="7.05" r="2.3" fill="#E8735A" />
      <circle cx="19" cy="12" r="2.3" fill="#B84FC4" />
      <circle cx="16.95" cy="16.95" r="2.3" fill="#2FB8C6" />
      <circle cx="12" cy="19" r="2.3" fill="#3E7BE0" />
      <circle cx="7.05" cy="16.95" r="2.3" fill="#4F46E5" />
      <circle cx="5" cy="12" r="2.3" fill="#E0A438" />
      <circle cx="7.05" cy="7.05" r="2.3" fill="#E8735A" />
      <circle cx="12" cy="12" r="2.6" fill="#4F46E5" />
    </svg>
    {!props.isTextHidden && AppConfig.name}
  </div>
);
