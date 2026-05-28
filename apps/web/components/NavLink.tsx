"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

type NavLinkProps = Omit<ComponentProps<typeof Link>, "className"> & {
  activeClassName: string;
  inactiveClassName: string;
  /** Match exact path only; default matches href as a prefix */
  exact?: boolean;
};

export function NavLink({ href, activeClassName, inactiveClassName, exact = false, ...props }: NavLinkProps) {
  const pathname = usePathname();
  const hrefStr = href.toString();
  const isActive = exact ? pathname === hrefStr : pathname === hrefStr || pathname.startsWith(hrefStr + "/");

  return <Link href={href} className={isActive ? activeClassName : inactiveClassName} {...props} />;
}
