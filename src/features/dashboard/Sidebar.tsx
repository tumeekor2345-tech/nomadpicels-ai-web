'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Image as ImageIcon,
  LayoutDashboard,
  Mic,
  Palette,
  Repeat,
  Shield,
  Sparkles,
  Wallet,
  Wand2,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Link, usePathname } from '@/libs/I18nNavigation';
import { Logo } from '@/templates/Logo';
import { cn } from '@/utils/Helpers';

const ICONS: Record<string, LucideIcon> = {
  image: ImageIcon,
  video: Wand2,
  restore: Sparkles,
  imageeffect: Palette,
  faceswap: Repeat,
  voice: Mic,
  billing: Wallet,
  org: LayoutDashboard,
  admin: Shield,
};

type SidebarItem = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
};

type SidebarSection = {
  label: string;
  items: SidebarItem[];
};

const NavItem = (props: { item: SidebarItem }) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [itemPath, itemQuery] = props.item.href.split('?');
  const isPathActive = pathname === itemPath;
  const isTabActive = itemQuery
    ? new URLSearchParams(itemQuery).get('tab') === searchParams.get('tab')
    : !searchParams.get('tab');
  const isActive = isPathActive && (itemQuery ? isTabActive : true);
  const Icon = ICONS[props.item.icon];

  return (
    <Link
      href={props.item.href}
      className={cn(
        `
          flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium
          transition-colors
        `,
        isActive
          ? 'bg-primary text-primary-foreground'
          : `
            text-muted-foreground
            hover:bg-secondary hover:text-foreground
          `,
      )}
    >
      {Icon && <Icon className="size-4 shrink-0" />}
      <span className="truncate">{props.item.label}</span>
    </Link>
  );
};

export const Sidebar = (props: {
  homeHref: string;
  homeLabel: string;
  sections: SidebarSection[];
  footer?: React.ReactNode;
}) => {
  const pathname = usePathname();

  return (
    <aside
      className="
        sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r
        border-border bg-card
        lg:flex
      "
    >
      <div className="flex items-center p-5">
        <Link href="/dashboard">
          <Logo />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pb-4">
        <div>
          <Link
            href={props.homeHref}
            className={cn(
              `
                flex items-center gap-2.5 rounded-md px-3 py-2 text-sm
                font-medium transition-colors
              `,
              pathname === props.homeHref
                ? 'bg-primary text-primary-foreground'
                : `
                  text-muted-foreground
                  hover:bg-secondary hover:text-foreground
                `,
            )}
          >
            <LayoutDashboard className="size-4 shrink-0" />
            <span className="truncate">{props.homeLabel}</span>
          </Link>
        </div>

        {props.sections.map(section => (
          <div key={section.label} className="flex flex-col gap-1">
            <div className="
              px-3 pb-1 text-xs font-semibold tracking-wider
              text-muted-foreground uppercase
            "
            >
              {section.label}
            </div>
            {section.items.map(item => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        ))}
      </nav>

      {props.footer && (
        <div className="border-t border-border p-3">
          {props.footer}
        </div>
      )}
    </aside>
  );
};
