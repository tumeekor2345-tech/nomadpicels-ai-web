'use client';

import { UserButton } from '@clerk/nextjs';
import { Coins } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useEffect, useState } from 'react';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Link } from '@/libs/I18nNavigation';
import { getI18nPath } from '@/utils/Helpers';
import { MobileSidebarMenu } from './MobileSidebarMenu';

type SidebarItem = { href: string; label: string };
type SidebarSection = { label: string; items: SidebarItem[] };

export const Topbar = (props: {
  homeHref: string;
  homeLabel: string;
  sections: SidebarSection[];
  buyCreditsLabel: string;
}) => {
  const locale = useLocale();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/billing/balance')
      .then(res => res.json())
      .then((data) => {
        if (!cancelled && typeof data.balance === 'number') {
          setBalance(data.balance);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="
      sticky top-0 z-10 flex items-center justify-between border-b border-border
      bg-background/95 px-4 py-3 backdrop-blur-sm
      md:px-8
    "
    >
      <div className="lg:hidden">
        <MobileSidebarMenu
          homeHref={props.homeHref}
          homeLabel={props.homeLabel}
          sections={props.sections}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/dashboard/billing"
          className="
            flex items-center gap-1.5 rounded-full border border-border bg-card
            px-3 py-1.5 text-sm font-medium transition-colors
            hover:bg-secondary
          "
        >
          <Coins className="size-4 text-accent" />
          {balance === null ? '—' : balance.toLocaleString()}
        </Link>

        <Button
          asChild
          size="sm"
          className="
            hidden
            sm:inline-flex
          "
        >
          <Link href="/dashboard/billing">{props.buyCreditsLabel}</Link>
        </Button>

        <LocaleSwitcher />

        <Separator orientation="vertical" className="h-4" />

        <UserButton
          userProfileMode="navigation"
          userProfileUrl={getI18nPath('/dashboard/user-profile', locale)}
          afterSwitchSessionUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: 'px-1',
            },
          }}
        />
      </div>
    </header>
  );
};
