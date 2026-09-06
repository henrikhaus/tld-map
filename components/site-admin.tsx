'use client';
import { useEffect, useState } from 'react';
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
} from 'lucide-react';
import { api } from '@/lib/storage';
import ChatModeration from './chat-moderation';
import { mapName } from '@/lib/model';
import type { AdminOverview, AdminUser, SiteReport } from '@/lib/site';
const statuses = [
  'new',
  'planned',
  'in-progress',
  'resolved',
  'closed',
] as const;
const readable = (value: string) => value.replaceAll('-', ' ');
const date = (value: number | string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Not recorded';
function ReportDetail({
  report,
  onSaved,
}: {
  report: SiteReport;
  onSaved: (report: SiteReport) => void;
}) {
  const [status, setStatus] = useState(report.status),
    [notes, setNotes] = useState(report.adminNotes),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  return (
    <section className="admin-report-detail">
      <small>
        {report.kind === 'issue' ? 'Issue' : 'Feature request'} ·{' '}
        {date(report.createdAt)}
      </small>
      <h2>{report.title}</h2>
      <p className="report-body">{report.body}</p>
      <dl>
        <dt>From</dt>
        <dd>{report.username ?? 'Guest'}</dd>
        <dt>Contact</dt>
        <dd>
          {report.contact ? (
            <a href={`mailto:${report.contact}`}>{report.contact}</a>
          ) : (
            'None provided'
          )}
        </dd>
        <dt>Location</dt>
        <dd>{report.mapId ? mapName(report.mapId) : readable(report.page)}</dd>
        <dt>Reference</dt>
        <dd>{report.id.slice(0, 8)}</dd>
      </dl>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setSaved(false);
          try {
            await api(`/api/admin/reports/${report.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status, adminNotes: notes }),
            });
            setSaved(true);
            onSaved({ ...report, status, adminNotes: notes });
          } catch (error) {
            setError(error instanceof Error ? error.message : 'Could not save');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as SiteReport['status']);
              setSaved(false);
            }}
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {readable(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Private admin notes
          <textarea
            rows={5}
            maxLength={5000}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <small>
          These notes stay in your admin panel. Saving does not send a reply.
        </small>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <button className="secondary-button" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        {saved && <output> Saved</output>}
      </form>
    </section>
  );
}
function Overview({ data }: { data: AdminOverview }) {
  const days = Array.from({ length: data.days }, (_, i) => {
    const value = new Date();
    value.setUTCHours(0, 0, 0, 0);
    value.setUTCDate(value.getUTCDate() - data.days + 1 + i);
    const day = value.toISOString().slice(0, 10);
    return (
      data.daily.find((d) => d.day === day) ?? { day, pageViews: 0, visits: 0 }
    );
  });
  const max = Math.max(1, ...days.map((d) => d.pageViews));
  return (
    <>
      <div className="admin-metrics">
        {[
          ['Page views', data.totals.pageViews],
          ['Visits', data.totals.visits],
          ['Active accounts', data.totals.activeUsers],
          ['Open reports', data.totals.openReports],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{Number(value).toLocaleString()}</strong>
          </div>
        ))}
      </div>
      <p className="admin-account-totals">
        {data.totals.users} registered accounts · {data.totals.runs} saved runs
        · {data.totals.annotations} annotations
      </p>
      <section className="admin-traffic">
        <h2>Daily page views</h2>
        <figure>
          <div className="admin-bars">
            {days.map((d) => (
              <div
                key={d.day}
                title={`${d.day}: ${d.pageViews} page views, ${d.visits} visits`}
              >
                <span style={{ height: `${(d.pageViews / max) * 100}%` }} />
                <span className="sr-only">
                  {d.day}: {d.pageViews} views, {d.visits} visits.
                </span>
              </div>
            ))}
          </div>
          <figcaption>
            <span>{days[0].day}</span>
            <span>{days.at(-1)!.day} · UTC</span>
          </figcaption>
        </figure>
        {!data.totals.pageViews && (
          <p>No traffic recorded in this period yet.</p>
        )}
      </section>
      <div className="admin-breakdowns">
        <section>
          <h2>Popular maps & pages</h2>
          <table>
            <thead>
              <tr>
                <th>Page</th>
                <th>Views</th>
              </tr>
            </thead>
            <tbody>
              {data.pages.map((p) => (
                <tr key={`${p.page}:${p.mapId}`}>
                  <td>
                    {p.mapId
                      ? mapName(p.mapId)
                      : p.page === 'loot'
                        ? 'Loot tables'
                        : p.page === 'chat'
                          ? 'Chat'
                          : 'General notes'}
                  </td>
                  <td>{p.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.pages.length && <p>No views yet.</p>}
        </section>
        <section>
          <h2>Traffic sources</h2>
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Visits</th>
              </tr>
            </thead>
            <tbody>
              {data.referrers.map((r) => (
                <tr key={r.referrer}>
                  <td>{r.referrer || 'Direct / internal'}</td>
                  <td>{r.visits}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 className="admin-device-heading">Devices</h2>
          {data.devices.map((d) => (
            <p className="admin-device" key={d.device}>
              <span>{d.device}</span>
              <span>{d.visits}</span>
            </p>
          ))}
        </section>
      </div>
      <p className="admin-method">
        Traffic collection started {date(data.trackingSince)}. Visits are
        browser sessions that expire after 30 minutes without a page event, not
        unique people. Traffic and active accounts use the selected period;
        account, run, annotation and open-report totals are current. The last 90
        days are retained. Admin page views are excluded. Referrer domains and
        broad device categories are recorded; IP addresses, private journal
        content and full referrer URLs are not stored in analytics.
      </p>
    </>
  );
}
export default function SiteAdmin() {
  const [tab, setTab] = useState<'overview' | 'reports' | 'users' | 'chat'>(
      'overview',
    ),
    [days, setDays] = useState(30),
    [version, setVersion] = useState(0),
    [overview, setOverview] = useState<AdminOverview | null>(null),
    [users, setUsers] = useState<AdminUser[]>([]),
    [reports, setReports] = useState<SiteReport[]>([]),
    [selected, setSelected] = useState<SiteReport | null>(null),
    [status, setStatus] = useState('all'),
    [kind, setKind] = useState('all'),
    [search, setSearch] = useState(''),
    [offset, setOffset] = useState(0),
    [total, setTotal] = useState(0),
    [busy, setBusy] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError('');
    const query = new URLSearchParams({
      search,
      offset: String(offset),
      status,
      kind,
    });
    const timer = setTimeout(
      () => {
        void (async () => {
          try {
            if (tab === 'overview')
              setOverview(
                await api<AdminOverview>(`/api/admin/overview?days=${days}`, {
                  signal: controller.signal,
                }),
              );
            if (tab === 'users') {
              const data = await api<{ users: AdminUser[]; total: number }>(
                `/api/admin/users?${query}`,
                { signal: controller.signal },
              );
              setUsers(data.users);
              setTotal(data.total);
            }
            if (tab === 'reports') {
              const data = await api<{ reports: SiteReport[]; total: number }>(
                `/api/admin/reports?${query}`,
                { signal: controller.signal },
              );
              setReports(data.reports);
              setTotal(data.total);
            }
          } catch (error) {
            if (!controller.signal.aborted)
              setError(
                error instanceof Error
                  ? error.message
                  : 'Could not load admin data',
              );
          } finally {
            if (!controller.signal.aborted) setBusy(false);
          }
        })();
      },
      search ? 200 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [tab, days, version, status, kind, search, offset]);
  return (
    <main className="site-admin">
      <div className="admin-heading">
        <h1>Site admin</h1>
        <button
          onClick={() => setVersion((v) => v + 1)}
          disabled={busy}
          aria-label="Refresh admin data"
        >
          <RefreshCw size={17} />
        </button>
      </div>
      <nav className="admin-tabs" aria-label="Admin sections">
        {(['overview', 'reports', 'users', 'chat'] as const).map((t) => (
          <button
            key={t}
            aria-current={tab === t ? 'page' : undefined}
            onClick={() => {
              setTab(t);
              setOffset(0);
              setSearch('');
              setSelected(null);
            }}
          >
            {t === 'reports'
              ? 'Issues & requests'
              : t === 'users'
                ? 'Users'
                : t === 'chat'
                  ? 'Chat moderation'
                  : 'Overview'}
          </button>
        ))}
      </nav>
      {tab !== 'chat' && (
        <div className="admin-filters">
          {tab === 'overview' ? (
            <label>
              Period
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                {[7, 30, 90].map((d) => (
                  <option key={d} value={d}>
                    Last {d} days
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <input
                aria-label={
                  tab === 'users' ? 'Search usernames' : 'Search report titles'
                }
                placeholder={tab === 'users' ? 'Username…' : 'Report title…'}
                value={search}
                maxLength={120}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOffset(0);
                }}
              />
              {tab === 'reports' && (
                <>
                  <select
                    aria-label="Report status"
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setOffset(0);
                    }}
                  >
                    <option value="all">All statuses</option>
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {readable(s)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Report kind"
                    value={kind}
                    onChange={(e) => {
                      setKind(e.target.value);
                      setOffset(0);
                    }}
                  >
                    <option value="all">Issues & requests</option>
                    <option value="issue">Issues</option>
                    <option value="feature">Feature requests</option>
                  </select>
                </>
              )}
            </>
          )}
        </div>
      )}
      {error ? (
        <p role="alert" className="error-message">
          {error}{' '}
          <button onClick={() => setVersion((v) => v + 1)}>Retry</button>
        </p>
      ) : busy ? (
        <output className="admin-loading">
          <LoaderCircle size={17} className="animate-spin" /> Loading…
        </output>
      ) : (
        <>
          {tab === 'overview' && overview && <Overview data={overview} />}
          {tab === 'chat' && <ChatModeration />}
          {tab === 'users' && (
            <>
              <p className="admin-method">
                Registered accounts only; guest journals stay on their devices.
                Last seen is based on recorded page activity.
              </p>
              <div className="admin-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Joined</th>
                      <th>Last seen</th>
                      <th>Runs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.username}</td>
                        <td>{date(u.createdAt)}</td>
                        <td>{date(u.lastSeen)}</td>
                        <td>{u.runs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!users.length && <p>No accounts match.</p>}
            </>
          )}
          {tab === 'reports' && (
            <div className="admin-inbox">
              <div className="admin-report-list">
                {reports.map((r) => (
                  <button
                    key={r.id}
                    className={selected?.id === r.id ? 'selected' : ''}
                    onClick={() => setSelected(r)}
                  >
                    <small>
                      {r.kind === 'issue' ? 'Issue' : 'Feature'} ·{' '}
                      {readable(r.status)}
                    </small>
                    <strong>{r.title}</strong>
                    <span>
                      {r.username ?? 'Guest'} · {date(r.createdAt)}
                    </span>
                  </button>
                ))}
                {!reports.length && <p>No reports match.</p>}
              </div>
              {selected ? (
                <ReportDetail
                  key={selected.id}
                  report={selected}
                  onSaved={(next) => {
                    setSelected(next);
                    setVersion((v) => v + 1);
                  }}
                />
              ) : (
                <p className="admin-empty-detail">
                  Select a report to read it and update its status.
                </p>
              )}
            </div>
          )}
          {tab !== 'overview' && tab !== 'chat' && (
            <div className="admin-pagination">
              <span>
                {total ? offset + 1 : 0}–{Math.min(offset + 30, total)} of{' '}
                {total}
              </span>
              <button
                aria-label="Previous page"
                disabled={!offset}
                onClick={() => setOffset((v) => Math.max(0, v - 30))}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                aria-label="Next page"
                disabled={offset + 30 >= total}
                onClick={() => setOffset((v) => v + 30)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
