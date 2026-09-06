'use client';

import type { ComponentProps } from 'react';
import { useRouter } from 'next/navigation';

// Vinext's production next/link chunk loses the named exports used by its
// dynamic navigation import. Use the working router directly while retaining
// real links for keyboard navigation, new tabs, and server-rendered pages.
export default function AtlasLink({
  href,
  onClick,
  children,
  ...props
}: ComponentProps<'a'> & { href: string }) {
  const router = useRouter();

  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          (props.target && props.target !== '_self') ||
          props.download != null
        )
          return;

        const destination = new URL(href, window.location.href);
        if (destination.origin !== window.location.origin) return;
        event.preventDefault();
        router.push(destination.pathname + destination.search + destination.hash);
      }}
    >
      {children}
    </a>
  );
}
