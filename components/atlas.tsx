'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from './atlas-link';
import { useRouter } from 'next/navigation';
import {
  mapPath,
  viewPath,
  routeTitle,
  type AtlasRoute,
  type AtlasView,
} from '@/lib/routes';
import Privacy from './privacy';
import {
  AccountSecurity,
  RecoveryCode,
  RecoverAccount,
} from './account-security';
import {
  NotebookPen,
  MessagesSquare,
  MessageSquarePlus,
  Shield,
  Menu,
  Mountain,
  Compass,
  BookOpen,
  ChevronDown,
  UserRound,
  CloudCheck,
  HardDrive,
  ArrowUpRight,
  TriangleAlert,
  LogOut,
  LoaderCircle,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Sidebar, SidebarProvider } from '@/components/ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import MapEditor, { type EditorHandle } from './map-editor';
import { LootLibrary, RegionLoot } from './loot';
import RunControls from './run-controls';
import SiteReport from './site-report';
import SiteAdmin from './site-admin';
import ChatRoom from './chat-room';
import { Checkbox } from '@/components/ui/checkbox';
import { useSiteActivity } from '@/hooks/use-site-activity';
import {
  annotateKey,
  atlasSchema,
  createRun,
  initialAtlas,
  mapName,
  maps,
  mergeGuestRuns,
  modeFor,
  regionGroups,
  regionNote,
  regionToMap,
  type Annotation,
  type LootEntry,
  type Run,
  type AtlasState,
} from '@/lib/model';
import world from '@/data/world.json';
import type { MapView } from '@/lib/map-view';
import {
  api,
  GUEST_KEY,
  readLocal,
  useAtlasStorage,
  type User,
} from '@/lib/storage';

export default function Atlas({
  route,
  preview,
}: {
  route: AtlasRoute;
  preview: AtlasState;
}) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [warning, setWarning] = useState('');
  useEffect(() => {
    let cancelled = false;
    api('/api/auth/get-session')
      .then((data) => {
        if (!cancelled) setUser(data?.user ?? null);
      })
      .catch(() => {
        if (!cancelled)
          setWarning(
            'Account service is unavailable. Guest mode still saves on this device.',
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  function clearAccountCache(id: string) {
    try {
      const prefix = `tld-atlas:v1:user:${id}`;
      for (const key of Object.keys(localStorage))
        if (key === prefix || key.startsWith(`${prefix}:`))
          localStorage.removeItem(key);
    } catch {
      /* Server deletion is complete even if storage is unavailable. */
    }
  }
  useEffect(() => {
    const deleted = (event: StorageEvent) => {
      if (event.key !== 'tld:deleted-account' || !event.newValue) return;
      try {
        const id = JSON.parse(event.newValue).id;
        if (id === user?.id) {
          clearAccountCache(id);
          setUser(null);
        }
      } catch {
        /* Ignore unrelated invalid storage events. */
      }
    };
    window.addEventListener('storage', deleted);
    return () => window.removeEventListener('storage', deleted);
  }, [user]);
  function accountDeleted() {
    if (user) {
      clearAccountCache(user.id);
      try {
        localStorage.setItem(
          'tld:deleted-account',
          JSON.stringify({ id: user.id, at: Date.now() }),
        );
      } catch {
        /* Other tabs will lose server access when their sessions are checked. */
      }
    }
    setUser(null);
    setWarning('');
    void api('/api/auth/sign-out', { method: 'POST', body: '{}' }).catch(
      () => {},
    );
  }
  async function signedIn(includeGuest: boolean) {
    const session = await api('/api/auth/get-session');
    if (!session?.user)
      throw new Error('Sign-in did not complete. Please try again.');
    try {
      if (includeGuest) {
        const guest = readLocal(GUEST_KEY);
        if (guest) {
          const remote = await api('/api/atlas');
          const account = remote.state
            ? atlasSchema.parse(remote.state)
            : {
                ...initialAtlas(),
                runs: guest.runs,
                activeRunId: guest.activeRunId,
              };
          const state = remote.state ? mergeGuestRuns(account, guest) : account;
          await api('/api/atlas', {
            method: 'PUT',
            body: JSON.stringify({ state, revision: remote.revision }),
          });
        }
      }
      setWarning('');
    } catch {
      setWarning(
        'You are signed in, but guest runs could not be copied. They are still saved in guest mode. You can import them from your account menu.',
      );
    }
    setUser(session.user);
  }
  async function signOut() {
    await api('/api/auth/sign-out', { method: 'POST', body: '{}' });
    setUser(null);
    setWarning('');
  }
  return (
    <AtlasWorkspace
      key={user?.id ?? 'guest'}
      route={route}
      preview={preview}
      authReady={!loading}
      user={user}
      warning={warning}
      clearWarning={() => setWarning('')}
      onSignedIn={signedIn}
      onSignOut={signOut}
      onDeleted={accountDeleted}
    />
  );
}
function AtlasWorkspace({
  route,
  preview,
  authReady,
  user,
  warning,
  clearWarning,
  onSignedIn,
  onSignOut,
  onDeleted,
}: {
  route: AtlasRoute;
  preview: AtlasState;
  authReady: boolean;
  user: User | null;
  warning: string;
  clearWarning: () => void;
  onSignedIn: (includeGuest: boolean) => Promise<void>;
  onSignOut: () => Promise<void>;
  onDeleted: () => void;
}) {
  const { state, update, status, error, retry, reloadAccount } =
    useAtlasStorage(user, preview, authReady);
  const router = useRouter();
  const view = route.view;
  const setView = (next: AtlasView) => router.push(viewPath(next));
  const [panel, setPanel] = useState(true),
    [showRegionLoot, setShowRegionLoot] = useState(false),
    [sidebarOpen, setSidebarOpen] = useState(false),
    [modal, setModal] = useState<
      'account' | 'sources' | 'sync' | 'report' | null
    >(null),
    [pendingLoot, setPendingLoot] = useState<LootEntry | null>(null),
    [deleteRun, setDeleteRun] = useState<Run | null>(null),
    [message, setMessage] = useState(''),
    [charcoal, setCharcoal] = useState(false),
    [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setIsAdmin(false);
    if (user)
      void api<{ admin: boolean }>('/api/site/me')
        .then((data) => {
          if (!cancelled) setIsAdmin(data.admin);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);
  const editorRef = useRef<EditorHandle | null>(null);
  useEffect(() => {
    document.title = routeTitle(route);
  }, [route]);
  useEffect(() => {
    if (window.innerWidth < 1000) setPanel(false);
    try {
      setCharcoal(localStorage.getItem('tld:charcoal-maps') === 'true');
    } catch {
      /* Preference storage is optional. */
    }
  }, []);
  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(''), 4000);
    return () => clearTimeout(timeout);
  }, [message]);
  const activeId = state?.activeRunId;
  const updateRun = useCallback(
    (patch: Partial<Run>) =>
      update((s) => ({
        ...s,
        runs: s.runs.map((r) => (r.id === activeId ? { ...r, ...patch } : r)),
      })),
    [activeId, update],
  );
  const storedRun = state?.runs.find((r) => r.id === activeId);
  const run =
    storedRun && view === 'map'
      ? { ...storedRun, selectedMap: route.mapId! }
      : storedRun;
  useEffect(() => {
    if (
      authReady &&
      storedRun &&
      route.view === 'map' &&
      storedRun.selectedMap !== route.mapId
    )
      updateRun({ selectedMap: route.mapId });
  }, [authReady, storedRun, route, updateRun]);
  const annotationKey = run ? annotateKey(run) : '';
  useSiteActivity(
    view,
    view === 'map' && run ? run.selectedMap : null,
    authReady && !!run,
  );
  const onAnnotations = useCallback(
    (annotations: Annotation[]) =>
      update((s) => ({
        ...s,
        runs: s.runs.map((r) =>
          r.id === activeId
            ? {
                ...r,
                annotations: { ...r.annotations, [annotationKey]: annotations },
              }
            : r,
        ),
      })),
    [activeId, annotationKey, update],
  );
  const onMapViewChange = useCallback(
    (mapView: MapView) =>
      update((s) => ({
        ...s,
        runs: s.runs.map((r) =>
          r.id === activeId
            ? { ...r, mapViews: { ...r.mapViews, [annotationKey]: mapView } }
            : r,
        ),
      })),
    [activeId, annotationKey, update],
  );
  const onPlaced = useCallback(() => setPendingLoot(null), []);
  if (!state || !run)
    return (
      <div className="loading-screen">
        <Mountain size={40} />
        <strong>THE LONG DARK</strong>
        <span>{status}</span>
        {error && (
          <>
            <p className="error-message max-w-md">{error}</p>
            <button
              className="secondary-button"
              onClick={() => location.reload()}
            >
              Try again
            </button>
          </>
        )}
      </div>
    );
  const selectedMap = maps[run.selectedMap] ? run.selectedMap : 'mystery-lake',
    asset = maps[selectedMap][modeFor(run)],
    annotations = run.annotations[annotationKey] ?? [];
  const showPanel = panel && selectedMap !== 'game-world';
  const group = regionGroups.find((g) => g.ids.includes(selectedMap));
  function selectMap(id: string) {
    setSidebarOpen(false);
    setPendingLoot(null);
    router.push(mapPath(id));
  }
  function selectRun(id: string) {
    if (view === 'map')
      router.push(
        mapPath(state!.runs.find((run) => run.id === id)!.selectedMap),
      );
    update((s) => ({ ...s, activeRunId: id }));
    setPendingLoot(null);
  }
  function newRun() {
    const next = createRun();
    if (view === 'map') router.push(mapPath(next.selectedMap));
    update((s) => ({ ...s, activeRunId: next.id, runs: [...s.runs, next] }));
    setPendingLoot(null);
  }
  const runControls = (
    <RunControls
      run={run}
      runs={state.runs}
      onUpdate={updateRun}
      onSelect={selectRun}
      onCreate={newRun}
      onDelete={setDeleteRun}
    />
  );
  return (
    <div className="atlas-shell">
      <button
        className="mobile-sidebar-toggle"
        aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={sidebarOpen}
        aria-controls="map-sidebar"
        onClick={() => setSidebarOpen((open) => !open)}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <SidebarProvider
        className={`workspace ${view === 'map' && showPanel ? 'journal-open' : ''} ${sidebarOpen ? 'sidebar-open' : ''}`}
      >
        <Sidebar id="map-sidebar" collapsible="none" className="regions-panel">
          <nav aria-label="Runs and regions">
            <div className="sidebar-account-row">
              <button
                className="sidebar-account"
                aria-label={user ? 'Your account' : 'Sign in or create account'}
                onClick={() => setModal('account')}
              >
                <UserRound size={17} />
                <span>{user?.username ?? user?.name ?? 'Guest explorer'}</span>
                <ChevronDown size={12} />
              </button>
              <button
                className="sidebar-save"
                aria-label={error ? `Save issue: ${error}` : status}
                title={error || status}
                onClick={() => setModal('sync')}
              >
                {error ? (
                  <TriangleAlert size={14} />
                ) : user ? (
                  <CloudCheck size={14} />
                ) : (
                  <HardDrive size={14} />
                )}
                <span className="sr-only" aria-live="polite">
                  {status}
                </span>
              </button>
            </div>
            {runControls}
            <div className="sidebar-region-list">
              <Link
                href="/"
                className={`world-link ${view === 'map' && selectedMap === 'game-world' ? 'selected' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Compass />
                World map
              </Link>
              <Link
                href={viewPath('loot')}
                className={`sidebar-page-link ${view === 'loot' ? 'selected' : ''}`}
                aria-current={view === 'loot' ? 'page' : undefined}
                onClick={() => {
                  setSidebarOpen(false);
                }}
              >
                <BookOpen size={17} />
                Loot tables
              </Link>
              <Link
                href={viewPath('notes')}
                className={`sidebar-page-link ${view === 'notes' ? 'selected' : ''}`}
                aria-current={view === 'notes' ? 'page' : undefined}
                onClick={() => {
                  setSidebarOpen(false);
                }}
              >
                <NotebookPen size={17} />
                General notes
              </Link>
              <Link
                href={viewPath('chat')}
                className={`sidebar-page-link ${view === 'chat' ? 'selected' : ''}`}
                aria-current={view === 'chat' ? 'page' : undefined}
                onClick={() => {
                  setSidebarOpen(false);
                }}
              >
                <MessagesSquare size={17} /> Chat
              </Link>
              {regionGroups.map((g) => {
                const ids = g.ids;
                return (
                  <div key={g.name}>
                    <small className="section-label">
                      {g.name.toUpperCase()}
                    </small>
                    {ids.map((id) => (
                      <Link
                        href={mapPath(id)}
                        key={id}
                        className={`region-row ${view === 'map' && selectedMap === id ? 'selected' : ''}`}
                        aria-current={
                          view === 'map' && selectedMap === id
                            ? 'page'
                            : undefined
                        }
                        onClick={() => setSidebarOpen(false)}
                      >
                        <span>{mapName(id)}</span>
                      </Link>
                    ))}
                  </div>
                );
              })}
              <div className="sidebar-footer">
                {isAdmin && (
                  <button
                    className={`text-button ${view === 'admin' ? 'selected' : ''}`}
                    onClick={() => {
                      setView('admin');
                      setSidebarOpen(false);
                    }}
                  >
                    <Shield size={15} /> Site admin
                  </button>
                )}
                <Link
                  className="text-button"
                  href="/privacy"
                  onClick={() => setSidebarOpen(false)}
                >
                  Privacy
                </Link>
                <button
                  className="text-button"
                  onClick={() => setModal('report')}
                >
                  <MessageSquarePlus size={15} /> Issue / feature request
                </button>
                <button
                  className="text-button"
                  onClick={() => setModal('sources')}
                >
                  Map credits & sources
                  <ArrowUpRight size={13} />
                </button>
              </div>
            </div>
          </nav>
        </Sidebar>
        {view === 'map' ? (
          <>
            <main
              className="map-main"
              aria-label={`Map: ${mapName(selectedMap)}`}
            >
              {!panel && selectedMap !== 'game-world' && (
                <button
                  className="notes-open-toggle"
                  aria-label="Open region notes"
                  title="Open region notes"
                  onClick={() => setPanel(true)}
                >
                  <NotebookPen size={17} />
                  <span>Region notes</span>
                </button>
              )}
              <MapEditor
                key={`${run.id}:${annotationKey}`}
                asset={asset}
                annotations={annotations}
                onChange={onAnnotations}
                pendingLoot={pendingLoot}
                onPlaced={onPlaced}
                editorRef={editorRef}
                charcoal={charcoal}
                onToggleCharcoal={() => {
                  const next = !charcoal;
                  setCharcoal(next);
                  try {
                    localStorage.setItem('tld:charcoal-maps', String(next));
                  } catch {
                    /* Keep the in-session preference. */
                  }
                }}
                initialView={run.mapViews[annotationKey]}
                onViewChange={onMapViewChange}
                worldLinks={
                  selectedMap === 'game-world'
                    ? world.links.map((link) => ({
                        ...link,
                        onClick: () => selectMap(link.id),
                      }))
                    : undefined
                }
              />
            </main>
            {showPanel && (
              <aside className="companion">
                <div className="companion-title">
                  <h2 id="region-note-heading">Region note</h2>
                  <button
                    aria-label="Close companion"
                    onClick={() => setPanel(false)}
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="companion-scroll">
                  {group && group.name !== 'Reference maps' && (
                    <section className="region-note">
                      <textarea
                        id="region-note"
                        aria-label={`Region note for ${mapName(selectedMap)}`}
                        rows={12}
                        maxLength={100000}
                        value={regionNote(run, selectedMap)}
                        onChange={(event) =>
                          updateRun({
                            regionNotes: {
                              ...run.regionNotes,
                              [selectedMap]: event.target.value,
                            },
                          })
                        }
                      />
                    </section>
                  )}
                  {['Interloper', 'Misery'].includes(run.difficulty) && (
                    <>
                      <label
                        className="region-loot-toggle"
                        htmlFor="show-region-loot"
                      >
                        <Checkbox
                          id="show-region-loot"
                          className="spawn-checkbox"
                          checked={showRegionLoot}
                          onCheckedChange={setShowRegionLoot}
                          aria-controls="region-loot-table"
                        />
                        Show loot table
                      </label>
                      <div id="region-loot-table" hidden={!showRegionLoot}>
                        {showRegionLoot && (
                          <RegionLoot
                            run={run}
                            onUpdate={updateRun}
                            onLibrary={() => setView('loot')}
                          />
                        )}
                      </div>
                    </>
                  )}
                </div>
              </aside>
            )}
          </>
        ) : view === 'privacy' ? (
          <Privacy onContact={() => setModal('report')} />
        ) : view === 'chat' ? (
          <ChatRoom />
        ) : view === 'admin' ? (
          isAdmin ? (
            <SiteAdmin />
          ) : (
            <main className="general-notes-page">
              <h1>Site admin</h1>
              <button
                className="text-button"
                onClick={() => setModal('account')}
              >
                Sign in
              </button>
            </main>
          )
        ) : view === 'notes' ? (
          <main className="general-notes-page">
            <h1>General notes</h1>
            <textarea
              aria-label={`General notes for ${run.name}`}
              value={run.generalNotes ?? ''}
              maxLength={1000000}
              onChange={(event) =>
                updateRun({ generalNotes: event.target.value })
              }
              spellCheck
            />
          </main>
        ) : (
          <LootLibrary
            run={run}
            onUpdate={updateRun}
            onRegion={(region) => selectMap(regionToMap(region))}
          />
        )}
      </SidebarProvider>
      {(warning || message || error) && (
        <output className="global-message">
          <span>
            {error ? 'Your latest changes need attention.' : message || warning}
          </span>
          {error ? (
            <button onClick={() => setModal('sync')}>Review</button>
          ) : (
            <button
              aria-label="Dismiss message"
              onClick={() => {
                setMessage('');
                clearWarning();
              }}
            >
              <X size={15} />
            </button>
          )}
        </output>
      )}
      <Dialog
        open={modal === 'report'}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <DialogContent className="dialog-panel">
          {modal === 'report' && (
            <SiteReport
              page={view}
              mapId={view === 'map' ? selectedMap : null}
              onClose={() => setModal(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleteRun}
        onOpenChange={(open) => {
          if (!open) setDeleteRun(null);
        }}
      >
        <DialogContent className="dialog-panel">
          <DialogTitle>Close this journal?</DialogTitle>
          <DialogDescription>
            Delete “{deleteRun?.name}” and all its annotations and discoveries.
            This cannot be undone.
          </DialogDescription>
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => setDeleteRun(null)}
            >
              Keep run
            </button>
            <button
              className="primary-button"
              onClick={() => {
                if (!deleteRun) return;
                update((s) => {
                  const runs = s.runs.filter((r) => r.id !== deleteRun.id);
                  if (!runs.length) runs.push(createRun());
                  return {
                    ...s,
                    runs,
                    activeRunId:
                      s.activeRunId === deleteRun.id
                        ? runs[0].id
                        : s.activeRunId,
                  };
                });
                setDeleteRun(null);
                setPendingLoot(null);
              }}
            >
              Delete run
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === 'account'}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <DialogContent className="dialog-panel">
          <Account
            user={user}
            onSignedIn={onSignedIn}
            onSignOut={onSignOut}
            onDeleted={onDeleted}
            onImport={() => {
              try {
                const guest = readLocal(GUEST_KEY);
                if (!guest) {
                  setMessage('There are no guest runs on this device.');
                  return;
                }
                update((s) => mergeGuestRuns(s, guest));
                setMessage('Guest runs added to your account.');
                setModal(null);
              } catch {
                setMessage(
                  'Guest runs could not be read. Your account is unchanged.',
                );
              }
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === 'sources'}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <DialogContent className="dialog-panel">
          <DialogTitle>Drawn by the community.</DialogTitle>
          <DialogDescription>
            Field Atlas builds on the work of The Long Dark’s mapmakers and
            explorers.
          </DialogDescription>
          <div className="source-links">
            <a
              href="https://elektronixx.github.io/TLD-Interactive-Map/"
              target="_blank"
              rel="noreferrer"
            >
              Original interactive atlas by the GOAT Elektronixx
              <ArrowUpRight size={13} />
            </a>
            <a
              href="https://steamcommunity.com/sharedfiles/filedetails/?id=3255435617"
              target="_blank"
              rel="noreferrer"
            >
              Region maps by the GOAT HokuOwl
            </a>
            <div className="source-credit-row">
              <a
                href="https://docs.google.com/spreadsheets/d/1sFqnIM9BPeI3ZitcDRekWeWEWfJL7BLyqyirBT3Y53E/edit?gid=585712023#gid=585712023"
                target="_blank"
                rel="noreferrer"
              >
                Interloper Loot Tables by the GOAT Bashrobe
              </a>
              <a
                href="https://www.youtube.com/@Bashrobe"
                target="_blank"
                rel="noreferrer"
                aria-label="Bashrobe on YouTube"
                className="source-channel-link"
              >
                YouTube <ArrowUpRight size={13} />
              </a>
            </div>
          </div>
          <div className="rule" />
          <p>
            All four loot sets, with location notes and community comments to
            help plan your run.
          </p>
          <p className="mt-3">
            The loot tables do not specify a game version. Community comments
            are shown separately from location notes. Listed locations can be
            alternatives, and random loot can occur outside the set system.
          </p>
          <p className="mt-3">
            The Long Dark belongs to Hinterland Studio. This is an unofficial
            companion. Original credits remain on the maps.
          </p>
          <p className="mt-3">
            Made by henhau.
            <br />
            Last updated <time dateTime="2026-09-06">6 September 2026</time>.
          </p>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === 'sync'}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <DialogContent className="dialog-panel">
          <DialogTitle>
            {error ? 'Your journal needs attention' : 'Your journal is saved'}
          </DialogTitle>
          <DialogDescription>
            {user
              ? 'Your private runs save on this device and to your account.'
              : 'Guest runs save automatically in this browser. Clearing browser storage removes them. Sign in to also keep them in the app’s database.'}
          </DialogDescription>
          {error && <p className="error-message">{error}</p>}
          <p className="mt-2">{status}</p>
          <div className="dialog-actions">
            {error && (
              <button className="primary-button" onClick={retry}>
                Retry saving
              </button>
            )}
            {error && user && (
              <button
                className="secondary-button"
                onClick={() => void reloadAccount()}
              >
                Load account version
              </button>
            )}
            {!user && (
              <button
                className="primary-button"
                onClick={() => setModal('account')}
              >
                Sign in
              </button>
            )}
          </div>
          {error && user && (
            <p className="inline-help">
              Loading the account version keeps your current local journal as a
              recovery copy on this device.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function Account({
  onDeleted,
  user,
  onSignedIn,
  onSignOut,
  onImport,
}: {
  user: User | null;
  onSignedIn: (includeGuest: boolean) => Promise<void>;
  onSignOut: () => Promise<void>;
  onImport: () => void;
  onDeleted: () => void;
}) {
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recover, setRecover] = useState(false);
  const [register, setRegister] = useState(false),
    [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [includeGuest, setIncludeGuest] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [showPassword, setShowPassword] = useState(false);
  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api<{ recoveryCode?: string }>(
        register ? '/api/register' : '/api/auth/sign-in/username',
        {
          method: 'POST',
          body: JSON.stringify({ username: username.trim(), password }),
        },
      );
      if (register && result.recoveryCode) setRecoveryCode(result.recoveryCode);
      else await onSignedIn(includeGuest);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }
  if (recoveryCode)
    return (
      <>
        <DialogTitle>Save your recovery code</DialogTitle>
        <DialogDescription>
          Your account is ready. Save this code before continuing.
        </DialogDescription>
        <RecoveryCode
          code={recoveryCode}
          onDone={() => {
            if (busy) return;
            setBusy(true);
            void onSignedIn(includeGuest)
              .catch((error) =>
                setError(
                  error instanceof Error
                    ? error.message
                    : 'Could not open your account.',
                ),
              )
              .finally(() => setBusy(false));
          }}
        />
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </>
    );
  if (recover)
    return (
      <RecoverAccount
        onBack={() => setRecover(false)}
        onRecovered={async (username, password) => {
          await api('/api/auth/sign-in/username', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
          });
          await onSignedIn(includeGuest);
        }}
      />
    );
  if (user)
    return (
      <>
        <DialogTitle>Your field journal</DialogTitle>
        <DialogDescription>
          Signed in as {user.username ?? user.name}. Your journeys are private
          to your account.
        </DialogDescription>
        <div className="account-summary">
          <CloudCheck className="mb-2" />
          <p>Runs and annotations save to your account.</p>
        </div>
        {error && <p className="error-message">{error}</p>}
        <AccountSecurity user={user} onDeleted={onDeleted} />
        <button className="secondary-button full-width" onClick={onImport}>
          Add guest runs from this browser
        </button>
        <button
          className="text-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSignOut();
            } catch {
              setError('Could not sign out. Please try again.');
              setBusy(false);
            }
          }}
        >
          <LogOut size={14} />
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </>
    );
  return (
    <>
      <DialogTitle>
        {register ? 'Keep your journal close.' : 'Welcome back, survivor.'}
      </DialogTitle>
      <DialogDescription>
        {register
          ? 'Create an account with just a username and password.'
          : 'Sign in to continue your saved journeys. Guest mode is always available.'}
      </DialogDescription>
      <form onSubmit={submit} className={busy ? 'busy' : ''}>
        <label>
          Username
          <input
            autoComplete="username"
            value={username}
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9_.]+"
            placeholder="Your survivor name"
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete={register ? 'new-password' : 'current-password'}
              minLength={8}
              maxLength={128}
              placeholder={register ? 'At least 8 characters' : 'Your password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-12"
              required
            />
            <button
              type="button"
              className="absolute right-3 top-3"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((p) => !p)}
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </button>
          </div>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={includeGuest}
            onChange={(e) => setIncludeGuest(e.target.checked)}
          />
          <span>Bring my guest runs into this account.</span>
        </label>
        {error && (
          <p className="error-message mb-4" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary-button full-width"
          disabled={busy}
          type="submit"
        >
          {busy ? (
            <>
              <LoaderCircle className="animate-spin" />
              Opening journal…
            </>
          ) : register ? (
            'Create account'
          ) : (
            'Sign in'
          )}
        </button>
      </form>
      <button
        className="text-button"
        onClick={() => {
          setRegister((r) => !r);
          setError('');
        }}
      >
        {register
          ? 'Already have an account? Sign in'
          : 'New here? Create an account'}
      </button>
      {!register && (
        <button className="text-button" onClick={() => setRecover(true)}>
          Forgot password? Use recovery code
        </button>
      )}
      {register && (
        <p className="inline-help">
          No email required. You’ll receive a private recovery code after
          creating your account.
        </p>
      )}
    </>
  );
}
