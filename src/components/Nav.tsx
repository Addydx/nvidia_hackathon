"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const path = usePathname();
  const item = (href: string, label: string) => (
    <Link href={href} aria-current={path === href ? "page" : undefined}>{label}</Link>
  );
  return <nav className="tabs" aria-label="Principal">{item("/", "Caja")}{item("/cierre", "Cierre")}</nav>;
}
