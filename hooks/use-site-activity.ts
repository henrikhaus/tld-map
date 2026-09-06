'use client';
import { useEffect, useRef } from 'react';
import { api } from '@/lib/storage';
import type { SitePage } from '@/lib/site';
export function useSiteActivity(
  page: SitePage | 'admin' | 'privacy',
  mapId: string | null,
  ready: boolean,
) {
  const last = useRef('');
  useEffect(() => {
    if (!ready || page === 'admin' || page === 'privacy') {
      last.current = '';
      return;
    }
    const key = `${page}:${mapId}`;
    if (last.current === key) return;
    last.current = key;
    let referrer = '';
    try {
      referrer = new URL(document.referrer).hostname;
    } catch {
      /* Direct visit. */
    }
    void api('/api/site/traffic', {
      method: 'POST',
      keepalive: true,
      body: JSON.stringify({
        id: crypto.randomUUID(),
        page,
        mapId,
        referrer,
        device:
          window.innerWidth < 640
            ? 'phone'
            : window.innerWidth < 1000
              ? 'tablet'
              : 'desktop',
      }),
    }).catch(() => {
      /* Analytics never blocks the map or a save. */
    });
  }, [page, mapId, ready]);
}
