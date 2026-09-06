'use client';
import { usePathname } from 'next/navigation';
import Atlas from './atlas';
import { routeForPath } from '@/lib/routes';
import type { AtlasState } from '@/lib/model';

/** Keep the journal and in-flight saves mounted while navigating between URLs. */
export default function AtlasHost({
  children,
  preview,
}: {
  children: React.ReactNode;
  preview: AtlasState;
}) {
  const pathname = usePathname();
  const route = routeForPath(pathname ?? '/');
  return (
    <>
      {children}
      {route && <Atlas route={route} preview={preview} />}
    </>
  );
}
