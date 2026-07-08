import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link } from '@/libs/I18nNavigation';

type SidebarItem = { href: string; label: string };
type SidebarSection = { label: string; items: SidebarItem[] };

export const MobileSidebarMenu = (props: {
  homeHref: string;
  homeLabel: string;
  sections: SidebarSection[];
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        variant="ghost"
        className="
          p-2
          focus-visible:ring-offset-0
        "
      >
        <Menu className="size-5" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56">
      <DropdownMenuItem asChild>
        <Link href={props.homeHref}>{props.homeLabel}</Link>
      </DropdownMenuItem>
      {props.sections.map(section => (
        <div key={section.label}>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="
            text-xs tracking-wider text-muted-foreground uppercase
          "
          >
            {section.label}
          </DropdownMenuLabel>
          {section.items.map(item => (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href}>{item.label}</Link>
            </DropdownMenuItem>
          ))}
        </div>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);
