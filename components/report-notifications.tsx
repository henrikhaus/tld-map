'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/storage';
import type { ReportNotification } from '@/lib/site';

const labels = {
  new: 'New',
  planned: 'Planned',
  'in-progress': 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export default function ReportNotifications() {
  const [queue, setQueue] = useState<ReportNotification[]>([]);
  const [visible, setVisible] = useState(false);
  const shown = useRef(new Set<string>());
  const current = queue[0];
  useEffect(() => {
    let cancelled = false;
    let fetching = false;
    async function check() {
      const active = document.visibilityState === 'visible';
      setVisible(active);
      if (!active || fetching) return;
      fetching = true;
      try {
        const data = await api<{ notifications: ReportNotification[] }>(
          '/api/site/report-notifications',
        );
        if (!cancelled)
          setQueue((existing) => {
            const ids = new Set(existing.map((item) => item.id));
            return [
              ...existing,
              ...data.notifications.filter(
                (item) => !ids.has(item.id) && !shown.current.has(item.id),
              ),
            ];
          });
      } catch {
        // Keep unread updates on the server; retry when the visitor returns online.
      } finally {
        fetching = false;
      }
    }
    void check();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
    };
  }, []);
  useEffect(() => {
    if (!current || !visible) return;
    shown.current.add(current.id);
    // Delivery is acknowledged only after the toast is rendered in a visible tab.
    void api('/api/site/report-notifications', {
      method: 'POST',
      body: JSON.stringify({ id: current.id }),
    }).catch(() => {});
    const timeout = setTimeout(
      () => setQueue((items) => items.filter((item) => item.id !== current.id)),
      9000,
    );
    return () => clearTimeout(timeout);
  }, [current, visible]);
  if (!current || !visible) return null;
  return (
    <output
      className="report-update-toast"
      aria-live="polite"
      aria-atomic="true"
    >
      <span>
        Your {current.kind === 'feature' ? 'feature request' : 'issue'} “
        {current.title}” is now <strong>{labels[current.status]}</strong>.
      </span>
      <button
        type="button"
        aria-label="Dismiss request update"
        onClick={() =>
          setQueue((items) => items.filter((item) => item.id !== current.id))
        }
      >
        <X size={15} />
      </button>
    </output>
  );
}
