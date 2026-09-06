'use client';
import { useRef, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { DialogTitle, DialogDescription } from './ui/dialog';
import { api } from '@/lib/storage';
import { mapName } from '@/lib/model';
import { reportSchema, type SitePage } from '@/lib/site';
export default function SiteReport({
  page,
  mapId,
  onClose,
}: {
  page: SitePage | 'admin' | 'privacy';
  mapId: string | null;
  onClose: () => void;
}) {
  const id = useRef(crypto.randomUUID());
  const [kind, setKind] = useState<'issue' | 'feature'>('issue'),
    [title, setTitle] = useState(''),
    [body, setBody] = useState(''),
    [contact, setContact] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [sent, setSent] = useState(false);
  if (sent)
    return (
      <>
        <DialogTitle>
          <Check size={20} /> Report received
        </DialogTitle>
        <DialogDescription>
          Thanks for helping improve the atlas. Your report is in henhau’s
          inbox.
        </DialogDescription>
        <p className="report-receipt">Reference {id.current.slice(0, 8)}</p>
        <button className="secondary-button" onClick={onClose}>
          Done
        </button>
      </>
    );
  return (
    <>
      <DialogTitle>Issue or feature request</DialogTitle>
      <DialogDescription>
        Something broken, a map correction, or an idea for the atlas?
      </DialogDescription>
      <form
        className="report-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const parsed = reportSchema.safeParse({
            id: id.current,
            kind,
            title,
            body,
            contact: contact.trim(),
            page,
            mapId,
          });
          if (!parsed.success) {
            setError(parsed.error.issues[0].message);
            return;
          }
          setBusy(true);
          setError('');
          try {
            await api('/api/site/reports', {
              method: 'POST',
              body: JSON.stringify(parsed.data),
            });
            setSent(true);
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : 'Could not send your report. Please try again.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="report-kind" aria-label="Report type">
          <button
            type="button"
            aria-pressed={kind === 'issue'}
            onClick={() => setKind('issue')}
          >
            Report an issue
          </button>
          <button
            type="button"
            aria-pressed={kind === 'feature'}
            onClick={() => setKind('feature')}
          >
            Request a feature
          </button>
        </fieldset>
        <label>
          Title
          <input
            required
            minLength={3}
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          {kind === 'issue'
            ? 'What happened? What did you expect?'
            : 'What would you like to do?'}
          <textarea
            required
            minLength={10}
            maxLength={5000}
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <label>
          Email <span>(optional, if you’d like a reply)</span>
          <input
            type="email"
            maxLength={254}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
        </label>
        <small>
          Context:{' '}
          {mapId
            ? mapName(mapId)
            : page === 'loot'
              ? 'Loot tables'
              : page === 'chat'
                ? 'Chat'
                : page === 'admin'
                  ? 'Admin panel'
                  : page === 'privacy'
                    ? 'Privacy'
                    : 'General notes'}
          . Your private notes and annotations are not included.
        </small>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={busy}>
          {busy ? (
            <>
              <LoaderCircle size={15} className="animate-spin" /> Sending…
            </>
          ) : (
            'Send to henhau'
          )}
        </button>
      </form>
    </>
  );
}
