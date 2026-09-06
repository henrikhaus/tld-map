'use client';
import { useEffect, useState } from 'react';
import { chatApi } from '@/lib/chat-client';
import type { ChatModerationData } from '@/lib/chat';
export function ModeratePerson({
  personId,
  name,
  onDone,
}: {
  personId: string;
  name: string;
  onDone: () => void;
}) {
  const [action, setAction] = useState('timeout'),
    [minutes, setMinutes] = useState(30),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <form
      className="chat-mod-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await chatApi('moderation', {
            method: 'POST',
            body: JSON.stringify({ personId, action, minutes, reason }),
          });
          onDone();
        } catch (e) {
          setError(
            e instanceof Error ? e.message : 'Could not update restriction',
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <strong>Moderate {name}</strong>
      <label>
        Action
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="timeout">Time out</option>
          <option value="ban">Permanently ban from chat</option>
          <option value="lift">Lift restriction</option>
        </select>
      </label>
      {action === 'timeout' && (
        <label>
          Minutes
          <input
            type="number"
            min={1}
            max={10080}
            required
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </label>
      )}
      <label>
        Reason
        <input
          required
          minLength={3}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {action === 'ban' && (
        <small>
          This blocks posting and reactions until you lift the ban. The account
          and its private runs remain accessible.
        </small>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <div className="chat-form-actions">
        <button type="button" onClick={onDone}>
          Cancel
        </button>
        <button disabled={busy} className="secondary-button">
          {busy ? 'Saving…' : action === 'ban' ? 'Confirm chat ban' : 'Apply'}
        </button>
      </div>
    </form>
  );
}
export default function ChatModeration() {
  const [data, setData] = useState<ChatModerationData | null>(null),
    [target, setTarget] = useState<{ id: string; name: string } | null>(null),
    [error, setError] = useState(''),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await chatApi('session', { method: 'POST', body: '{}' });
        const data = await chatApi<ChatModerationData>('moderation');
        if (!cancelled) {
          setData(data);
          setError('');
        }
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : 'Could not load moderation',
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);
  const refresh = () => {
    setTarget(null);
    setVersion((v) => v + 1);
  };
  async function flagAction(id: number, remove: boolean) {
    try {
      await chatApi(remove ? `messages/${id}` : `moderation/flags/${id}`, {
        method: 'DELETE',
      });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update report');
    }
  }
  return (
    <section className="chat-moderation">
      <div className="chat-mod-heading">
        <h2>Chat moderation</h2>
        <button onClick={() => setVersion((v) => v + 1)}>Refresh</button>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!data && !error && <output>Loading moderation…</output>}
      {target && (
        <ModeratePerson
          personId={target.id}
          name={target.name}
          onDone={refresh}
        />
      )}
      {data && (
        <>
          <p className="admin-method">
            {data.stats.messages} messages · {data.stats.today} in the last 24
            hours · {data.stats.restrictions} active restrictions ·{' '}
            {data.stats.flags} flagged messages
          </p>
          <h3>Flagged messages</h3>
          {!data.flags.length && <p className="chat-empty">No open flags.</p>}
          {data.flags.map((f) => (
            <article className="chat-flag" key={f.messageId}>
              <strong>{f.name}</strong>
              <p>{f.text}</p>
              <small>
                {f.count} reports · {f.reason}
              </small>
              <div className="chat-form-actions">
                <button
                  onClick={() => setTarget({ id: f.personId, name: f.name })}
                >
                  Moderate person
                </button>
                <button onClick={() => void flagAction(f.messageId, true)}>
                  Remove message
                </button>
                <button onClick={() => void flagAction(f.messageId, false)}>
                  Dismiss flags
                </button>
              </div>
            </article>
          ))}
          <h3>Active timeouts & bans</h3>
          {!data.restrictions.length && (
            <p className="chat-empty">No active restrictions.</p>
          )}
          {data.restrictions.map((r) => (
            <article className="chat-restriction" key={r.personId}>
              <strong>{r.name}</strong>
              <span>
                {r.kind === 'ban'
                  ? 'Permanent chat ban'
                  : `Until ${new Date(r.until!).toLocaleString()}`}
              </span>
              <p>{r.reason}</p>
              <button
                onClick={() => setTarget({ id: r.personId, name: r.name })}
              >
                Change / lift restriction
              </button>
            </article>
          ))}
          <h3>Recent moderation</h3>
          {!data.log.length && (
            <p className="chat-empty">No moderation actions yet.</p>
          )}
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Action</th>
                  <th>Reason</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {data.log.map((l) => (
                  <tr key={l.id}>
                    <td>{l.name}</td>
                    <td>{l.action}</td>
                    <td>{l.reason}</td>
                    <td>{new Date(l.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="admin-method">
            Restrictions apply to the account or anonymous browser identity,
            including linked sign-in/out identities. Clearing browser data or
            switching devices can evade anonymous bans. Only chat posting and
            reactions are restricted.
          </p>
        </>
      )}
    </section>
  );
}
