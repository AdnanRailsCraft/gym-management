"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconDashboard,
  IconUsers,
  IconCreditCard,
  IconBell,
  IconZap,
  IconSettings,
  IconHistory,
  IconReceipt,
  IconDownload,
} from "@/components/icons";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

function getNavIcon(href: string) {
  switch (href) {
    case "/":
      return <IconDashboard size={17} />;
    case "/members":
      return <IconUsers size={17} />;
    case "/plans":
      return <IconCreditCard size={17} />;
    case "/reminders":
      return <IconBell size={17} />;
    case "/attendance":
      return <IconZap size={17} />;
    case "/invoices":
      return <IconReceipt size={17} />;
    case "/settings/gym":
      return <IconSettings size={17} />;
    case "/settings/backup":
      return <IconDownload size={17} />;
    case "/audit":
      return <IconHistory size={17} />;
    default:
      return null;
  }
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const icon = getNavIcon(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? "nav-active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            {icon}
            <span>{item.label}</span>
            {typeof item.badge === "number" && item.badge > 0 ? (
              <span className="nav-badge" title={`${item.badge} pending`}>
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </>
  );
}
