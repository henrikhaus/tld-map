'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { atlasSchema, initialAtlas, type AtlasState } from './model';
import { responseJson } from './api-response';
export type User = { id: string; name: string; username?: string };
export const GUEST_KEY = 'tld-atlas:v1:guest';
export function readLocal(key: string) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  return atlasSchema.parse(JSON.parse(raw)) as AtlasState;
}
type ApiResult = {
  user?: User | null;
  state?: AtlasState | null;
  revision: number;
  message?: string;
  error?: string | { message?: string };
};
export async function api<T = ApiResult>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers,
  });
  const body = await responseJson<ApiResult>(
    response,
    'The server is temporarily unavailable. Please try again.',
  );
  if (!response.ok)
    throw new Error(
      (typeof body.error === 'object' ? body.error?.message : body.error) ??
        body.message ??
        'Request failed',
    );
  return body as T;
}
export function useAtlasStorage(
  user: User | null,
  preview?: AtlasState,
  enabled = true,
) {
  const key = user ? `tld-atlas:v1:user:${user.id}` : GUEST_KEY;
  const [state, setState] = useState<AtlasState | null>(preview ?? null);
  const [status, setStatus] = useState('Opening your journal…');
  const [error, setError] = useState('');
  const revision = useRef(0),
    pending = useRef<AtlasState | null>(null),
    sending = useRef(false),
    alive = useRef(true),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    fatal = useRef(false),
    latest = useRef<AtlasState | null>(null);
  useEffect(() => {
    if (!enabled) return;
    alive.current = true;
    let cancelled = false;
    void (async () => {
      try {
        let local: AtlasState | null = null;
        try {
          local = readLocal(key);
        } catch {
          fatal.current = true;
          throw new Error(
            'The saved journal could not be read. It has been left untouched.',
          );
        }
        if (user) {
          const remote = await api('/api/atlas');
          revision.current = remote.revision;
          const remoteState = remote.state
            ? atlasSchema.parse(remote.state)
            : null;
          const dirty = localStorage.getItem(`${key}:pending`) === 'true';
          if (dirty && local) {
            revision.current = Number(
              localStorage.getItem(`${key}:revision`) ?? 0,
            );
            if (!cancelled) {
              setState(local);
              latest.current = local;
              setError(
                'These changes are saved on this device but have not synced. Retry saving, or load the account version.',
              );
              setStatus('Saved locally · sync pending');
            }
            return;
          }
          const value = remoteState ?? local ?? initialAtlas();
          if (!remoteState) {
            const created = await api('/api/atlas', {
              method: 'PUT',
              body: JSON.stringify({ state: value, revision: remote.revision }),
            });
            revision.current = created.revision;
          }
          if (cancelled) return;
          localStorage.setItem(`${key}:revision`, String(revision.current));
          latest.current = value;
          setState(value);
          localStorage.setItem(key, JSON.stringify(value));
          setStatus('Saved to your account');
        } else {
          const value = local ?? initialAtlas();
          if (cancelled) return;
          latest.current = value;
          setState(value);
          localStorage.setItem(key, JSON.stringify(value));
          setStatus('Saved on this device');
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not open the journal');
        setStatus('Could not load saved runs');
      }
    })();
    return () => {
      cancelled = true;
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, user, enabled]);
  const flush = useCallback(async () => {
    if (!user || sending.current || !pending.current || !alive.current) return;
    sending.current = true;
    while (pending.current && alive.current) {
      const snapshot = pending.current;
      pending.current = null;
      try {
        setStatus('Saving to your account…');
        const result = await api('/api/atlas', {
          method: 'PUT',
          body: JSON.stringify({ state: snapshot, revision: revision.current }),
        });
        revision.current = result.revision;
        localStorage.setItem(`${key}:revision`, String(result.revision));
        if (alive.current && !pending.current) {
          localStorage.removeItem(`${key}:pending`);
          setStatus('Saved to your account');
          setError('');
        }
      } catch (e) {
        if (alive.current) {
          pending.current = pending.current ?? snapshot;
          setError(e instanceof Error ? e.message : 'Could not sync');
          setStatus('Saved locally · sync pending');
        }
        break;
      }
    }
    sending.current = false;
  }, [key, user]);
  const update = useCallback(
    (fn: (previous: AtlasState) => AtlasState) => {
      if (!latest.current || fatal.current) return;
      const next = fn(latest.current);
      const parsed = atlasSchema.safeParse(next);
      if (!parsed.success) {
        setError(
          'This journal has reached its storage limits. Please start another run.',
        );
        return;
      }
      latest.current = next;
      setState(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
        if (user) {
          localStorage.setItem(`${key}:pending`, 'true');
          pending.current = next;
          setStatus('Saving…');
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void flush(), 500);
        } else {
          setStatus('Saved on this device');
          setError('');
        }
      } catch {
        setError(
          'Your browser could not save this change. Free up device storage and retry before closing this page.',
        );
        setStatus('Changes not saved');
      }
    },
    [key, user, flush],
  );
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (pending.current || error) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [error]);
  const retry = () => {
    if (latest.current) {
      try {
        localStorage.setItem(key, JSON.stringify(latest.current));
        if (user) {
          pending.current = latest.current;
          void flush();
        } else {
          setError('');
          setStatus('Saved on this device');
        }
      } catch {
        setError('The browser still cannot save the journal.');
      }
    }
  };
  const reloadAccount = async () => {
    try {
      if (sending.current) {
        setError('A save is still finishing. Please try again in a moment.');
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      const remote = await api('/api/atlas');
      if (!remote.state)
        throw new Error(
          'No account version exists yet. Retry saving your local journal.',
        );
      const restored = atlasSchema.parse(remote.state);
      localStorage.setItem(`${key}:recovery`, JSON.stringify(latest.current));
      localStorage.setItem(key, JSON.stringify(restored));
      localStorage.removeItem(`${key}:pending`);
      pending.current = null;
      revision.current = remote.revision;
      localStorage.setItem(`${key}:revision`, String(remote.revision));
      latest.current = restored;
      setState(restored);
      setError('');
      setStatus('Saved to your account');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your account');
    }
  };
  return { state, update, status, error, retry, reloadAccount };
}
