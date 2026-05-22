"use client";

import { useRouter } from "next/navigation";
import { forwardRef } from "react";
const NavLink = forwardRef<
  HTMLAnchorElement,
  React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
>(({ href, onClick, children, ...props }, ref) => {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    onClick?.(e);
    if (!e.defaultPrevented || !onClick) {
      router.push(href);
    }
  };

  return (
    <a ref={ref} href={href} onClick={handleClick} {...props}>
      {children}
    </a>
  );
});

NavLink.displayName = "NavLink";

export default NavLink;
