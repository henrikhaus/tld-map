# The Long Dark — Field Atlas

**[Open The Long Dark interactive maps](https://tld.henhau.online/)** ·
[Mystery Lake map](https://tld.henhau.online/maps/mystery-lake) ·
[Interloper loot tables](https://tld.henhau.online/loot-tables)

A local, map-first companion for The Long Dark, redesigned around private survival runs. The interface uses a black-and-white charcoal surface, locally hosted brush lettering and typewriter text, grain textures, chalk marks, and a narrow region journal. The Map page has no top headers: account controls, page navigation, runs, theme, and sources live in the sidebar to keep the cartography as large as possible. Maps use their original colors by default; the moon/sun toggle applies an optional CSS filter and remembers the preference on this device.

## Run locally

For **offline use on your own computer**, follow the [offline self-hosting
guide](docs/OFFLINE.md). Initial setup needs internet; daily use does not.

For **Dokploy + Hetzner hosting at `tld.henhau.online`**, use the included
`compose.yaml` and follow [the deployment guide](docs/DEPLOYMENT.md).

```sh
bun install
bun run dev
```

Open **http://localhost:3000**. The command starts the frontend on port 3000 and the Bun API on port 3001. Use `localhost`, because the account origin and cookies are configured for it. Stop both services with Ctrl+C.

The first launch creates `.data/atlas.sqlite` and a random `.data/auth-secret`. Both are ignored by Git. Keep the secret with the database when backing up accounts. Never replace it during routine restarts.

## Included

- All maps and both difficulty variants from Elektronixx’s source viewer, stored locally. The original world overview has 23 transparent click areas over its printed names, using the original viewer’s rectangle coordinates and scaling with map pan/zoom.
- Multiple runs defaulting to “My run”, with inline renaming, a switch-run dropdown, and an independent difficulty dropdown. Each run keeps its own regions, annotations, notes, and loot state.
- Portable run files under **Switch run → Import / export**. Export one run's notes, annotations, loot progress, and map views; import it as a separate copy on another installation or account. See [offline transfer instructions](docs/OFFLINE.md#take-a-run-on-a-trip).
- Freehand drawing with a 1–60 px brush, a gently exponential size slider, editable numeric controls, opacity in 10% steps, and five preset colors. New translucent strokes replace earlier translucent paint only where they overlap; opaque paint stays intact. Inline map text supports dragging, select-and-type editing, Enter to save, Escape to cancel, and deletion when cleared. Shadow defaults off. Filled icons have a cursor preview and optional black circle, also off by default. Map comments show a filled icon immediately on placement and autofocus their editor: Enter saves, Shift+Enter adds a line, and an empty save deletes the icon. Hover shows the note without a scrollbar. One autosaved note per region and run appears at the top of the journal. Existing legacy point-note text remains available in its region note. The world map never opens the region panel. A separate General notes page provides an autosaved, run-specific notebook.
- Pan/zoom, variable brush widths, per-map undo/redo, hover-to-preview, single-click annotation erasing, annotation visibility, and a scrollable regional journal.
- Guest persistence in browser storage; optional username/password accounts through Better Auth. Guest runs can be copied into an account without deleting the originals.
- Account snapshots in SQLite through Drizzle. Zod validates writes, session ownership scopes every query, and revision checks reject stale saves.
- An Interloper/Misery region loot companion and a compact loot grid with collapsible region rows and item types across the top. The full Interloper loot page remains available at every difficulty. Set buttons support any combination of sets for comparison. Click location text to toggle a saved strikethrough. Right-side checkboxes record finds and cross out alternatives in the same workbook-bordered spawn group, leaving independent spawns available.
- Tiny comment buttons expose only the note text and its type, including comments attached to blank cells; source references remain in the imported data. Blank-cell comments remain community reports, not invented spawn entries. Independent spawn groups retain the workbook dividers.

## Map controls

| Action                    | Control                                                                   |
| ------------------------- | ------------------------------------------------------------------------- |
| Pan                       | Drag with hand, text, comment, icon or eraser; Space-drag with the pencil |
| Zoom                      | Scroll, or use the +/− controls                                           |
| Reset view                | Fit-map button                                                            |
| Tools                     | V: hand, D: draw, T: text, N: comment, M: marker, E: erase                |
| Undo / redo               | Cmd/Ctrl+Z; Cmd/Ctrl+Shift+Z                                              |
| Edit map text or a marker | Click it on the map                                                       |

## License

The application's source code and original documentation are available under the
[MIT License](LICENSE). Maps, imported loot data, fonts, and other third-party
material retain their existing rights; see [third-party notices](THIRD_PARTY_NOTICES.md).

## Data and provenance

`data/loot.json` was extracted without modifying **Interloper Loot Tables by Bashrobe.xlsx**. It includes 138, 142, 152, and 145 entries in sets 1–4 respectively: 577 source cells consolidated into 219 item/location combinations. Source sheet/cell references, horizontal-border spawn groups, and comments remain attached to each entry. Comments on blank cells retain their region, item, and set without being counted as spawn locations. Plain location notes and threaded community comments are labeled separately.

The workbook does not specify a game version. These are listed spawn locations and may represent alternatives. Set identification uses positive discoveries only; not finding an item does not eliminate a set. Visible sets are selected explicitly and stay with the run. Crossing out a location does not eliminate a set. Within each displayed spawn group, finding one location crosses out its alternatives; unchecking restores them.

The map snapshot and its original URLs are in `data/map-sources.json` and `data/maps.json`. To refresh from the **same saved source URLs**:

```sh
python3 scripts/download-maps.py
```

The import scripts require Python with `openpyxl` (workbook) and Pillow (image metadata). They are not needed to run the app. Re-import a workbook with:

```sh
python3 scripts/import-loot.py '/path/to/Interloper Loot Tables by Bashrobe.xlsx'
```

Refreshes that change image geometry or source ordering need an annotation/data migration; do not replace source files in an established deployment without reviewing that migration.

Credits:

- [Original interactive atlas by the GOAT Elektronixx](https://elektronixx.github.io/TLD-Interactive-Map/)
- [Region maps by the GOAT HokuOwl](https://steamcommunity.com/sharedfiles/filedetails/?id=3255435617)
- [Cave, mine & region connections maps by the GOAT Krueger](https://steamcommunity.com/sharedfiles/filedetails/?id=2899955301) — Far Territory transition cave, Langston Mine and region connections.
- [Interloper Loot Tables by the GOAT Bashrobe](https://docs.google.com/spreadsheets/d/1sFqnIM9BPeI3ZitcDRekWeWEWfJL7BLyqyirBT3Y53E/edit?gid=585712023#gid=585712023) · [YouTube](https://www.youtube.com/@Bashrobe)
- Made by henhau. Last updated 6 September 2026.
- Hinterland Studio — The Long Dark

Original map image files and their credits are preserved. This is an unofficial companion.

Typography uses Permanent Marker and Special Elite from Google Fonts, hosted locally with their Apache 2.0 licenses in `public/fonts`. Procedural SVG grain and chalk rules in `public/textures` supply the nonrepresentational surface textures.

## Stack and scope

Bun, React 19, TypeScript, Tailwind 4, Shadcn/Base UI, Oxc, Better Auth, SQLite, Drizzle, and Zod. The generated frontend uses **Vinext/Vite**, rather than TanStack Start. The Bun API is independent of the frontend framework. No AI SDK is needed for deterministic loot-set inference.

The project supports local development and a **Dokploy Docker Compose deployment**
at `tld.henhau.online`. `bun run build:host` builds the Node frontend;
`bun run start:host` runs the production gateway, frontend and Bun API. The default
`build` / `start` scripts retain the original Cloudflare preview build path.
Accounts use username/password sign-in and private, single-use recovery codes
without requiring email. GitHub publishing does not deploy the site automatically.

Sign-in sessions last 400 days and renew on qualifying activity once a day.
Signing out or resetting a password invalidates sessions; clearing browser cookies
also requires signing in again. Existing valid shorter sessions receive the longer
expiry when refreshed after deployment.

Guest saves are browser-specific. Account changes also have a browser cache; failed saves stay local and can be retried. Conflicts can be resolved by loading the account version, which keeps a local recovery copy under the account’s `:recovery` browser-storage key. Guest runs remain separately available after sign-out. Browser storage limits are surfaced as save errors.

The included production gateway routes `/api` to the loopback-only Bun service.
Compose persists `/data` and sets the public origin. `API_PORT`, `WEB_PORT`, `PORT`,
`TLD_DATA_DIR`, and `BETTER_AUTH_SECRET` remain configurable. Do not deploy the
SQLite API to the generated Cloudflare runtime. See the deployment guide for
backups, restoring local accounts and granting admin access on a fresh install.

## Checks

Search indexing and the post-deployment checklist are covered in
[the SEO guide](docs/SEO.md).

```sh
bun run typecheck
bun run lint
bun test
bun run build
```

Tests cover source-cell reconciliation, map asset availability, loot-set inference, run independence, guest merging, Zod validation, account ownership, cookie sessions, sign-out, stale revisions, and cross-origin writes. API tests create and remove their own temporary SQLite database.

Oxc checks application code. Generated, unmodified Shadcn primitives are excluded from lint (they ship with rule violations); they remain included in TypeScript checks. React Compiler diagnostics are disabled because this project does not enable React Compiler. Rules of Hooks and dependency checks remain enabled.

Map views now save their zoom and center per run and map variant. Resizing the
journal preserves the map center; panning is bounded so part of the map remains
visible. Map text supports Shift+Enter for a new line, Enter to finish, and one
outside click to finish editing without placing another label.

The sidebar’s issue / feature request form accepts guest and account reports.
Reports are stored privately in SQLite with their page and map context, optional
reply email, status, and private admin notes. Report submission is rate limited;
retries reuse the same report ID. No email is sent automatically.

Admin access is checked on every admin API request against a fixed account ID in
`site_admin`. The local `henhau` account has been granted access. For a new local
installation, start the API, create the owner account, then explicitly grant it:

```sh
bun scripts/grant-admin.ts henhau
```

This command replaces the single administrator. Public registration and profile
changes cannot grant admin rights. Preserve `.data/atlas.sqlite` when moving the
app to retain accounts, runs, reports, and the admin assignment.

The admin panel includes a 7/30/90-day traffic overview, daily page views, browser
visits, popular regions/pages, referrer domains, device categories, registered and
active accounts, saved run/annotation counts, paginated user search, and a report
inbox with filtering and status updates. These are real collected counts, not
historical estimates. A visit uses an HttpOnly session cookie with a 30-minute
inactivity expiry. Traffic events are deduplicated by ID and retained for 90 days;
cleanup runs on the first traffic event each day. Browser dimensions are reduced
to desktop/tablet/phone. Analytics does not store IP addresses, full referrer URLs,
or journal text. Admin page navigation is excluded. Known bot user agents are
ignored; counts are approximate and are not a count of unique people. The API
uses the direct socket address locally and a normalized client address through
the production gateway for rate limiting; see the deployment guide's proxy boundary.

The additive admin schema migration lives in `server/migrations/001-site-admin.sql`
and is applied transactionally once at API startup.

Chat lives below General notes in the sidebar. It is a single public room backed
by SQLite, with two-second revision-based polling while visible, automatic
reconnection, persisted messages, and up to 200 recent messages loaded at once.
The chat pauses polling when the browser tab is hidden. Older pages load in
batches of 50. Message bodies render as plain text, without HTML, embeds, link
previews or uploads. Enter sends and Shift+Enter adds a line.

Account chat identities derive from the authenticated account ID. Guests receive
a random `Anonymous…` name and an HttpOnly, SameSite browser token whose hash is
stored in SQLite. A public participant ID cannot authenticate another person.
Account and anonymous identities used together in a browser are linked to prevent
signing out from clearing an account restriction. Account bans persist across
devices; anonymous bans can be evaded by clearing browser data or changing device.

Participants choose from five softly colored username presets, enforced by the
server. Saved legacy colors map to the nearest preset. Only the fixed admin
account receives the saturated gold name and crown. These privileges are never
accepted from a message or profile payload. Each person can add/remove one of
each supported reaction per message; reaction updates are idempotent.

Messages expire after 48 hours. The server deletes expired messages, reactions,
and message reports on startup, before chat requests, and every minute while idle.
Open chat views also remove expired messages while offline. Chat identities and
moderation restrictions remain in place.

Chat safeguards are enforced on the server:

- At least 1 second between accepted messages, shared across account tabs and the
  browser’s linked guest identity; 20 messages/minute and 120/hour per identity.
- Duplicate normalized messages are rejected for 60 seconds. Retrying the same
  message ID does not create another message.
- Messages are limited to 800 characters, eight lines and two links; repeated
  characters, invisible-only messages, control/bidirectional spoofing characters,
  and a narrow list of severe slurs are rejected. Ordinary profanity is allowed.
  The editable filter lives in `server/chat-policy.ts`; it cannot catch every
  linguistic variation, so user reporting and human moderation remain available.
- Message-attempt, reaction, profile-change, report, identity-creation and network
  flood limits. Rate counters live in SQLite and survive API restarts. Network
  keys are HMACs of the direct socket address, not raw stored IP addresses. The
  production proxy caveat above applies to these network limits as well.
- Same-origin mutation checks, schema validation, bounded payloads, and server
  authorization for every moderation action. Restrictions are rechecked just
  before writes.

`henhau` can moderate from each message or from Site admin → Chat moderation:
apply a timed restriction (1 minute to 7 days), permanently ban from chat, lift
restrictions, remove messages, review user flags and inspect the action log. Bans
and timeouts stop posting, reactions and profile changes, while keeping maps,
private runs and read-only chat available. Removed message text and reactions are
not returned in public chat feeds. Moderation is recorded in an audit log. The
chat tables are added by `server/migrations/002-chat.sql`.

### Typography

Body text and controls use Courier New; headings use Permanent Marker. Sidebar
region names, page links, account and footer labels use Special Elite, with
Permanent Marker for the run name. Notes and loot spawn locations use Arial.
Map annotations, loot labels and chat text use Special Elite; loot set numbers
and chat timestamps use Courier New. The permanent font rules are in
`app/typography.css`; the two bundled fonts retain their licenses in `public/fonts`.

## URLs, search and privacy

Public maps have stable `/maps/<region>` URLs; `/` is the world map. `/loot-tables`,
`/notes`, `/chat`, `/admin`, and `/privacy` have their own URLs. Sidebar navigation
uses real links, and the root layout retains the mounted journal during navigation
so pending saves are not interrupted. The initial server response contains a public,
empty journal view; accounts and local guest state load only in the browser.
Invalid routes return 404. Notes, chat and admin responses use `noindex` metadata.
The sitemap lists only public maps, loot tables and privacy.

Set `SITE_URL` to the canonical public origin when deploying, for example
`https://tld.henhau.online`. Set `APP_ORIGIN` to the same public origin for the Bun
API. Local previews default to `http://localhost:3000`. `/sitemap.xml` and
`/robots.txt` are generated from this origin; submit the sitemap in Search Console
after deployment. No Search Console submission, DNS change or deployment is done
by adding these files.

The privacy page describes the implemented storage, analytics and retention, and
links to the existing issue form for data requests. Review its operational details
when choosing hosting, logs, backups and a public contact address. It is not a claim
that deployment-specific privacy obligations have already been completed.

## Account recovery and deletion

New registration returns a recovery code once. Existing accounts create or replace
a code in their account menu by confirming the current password. Each code contains
192 random bits; only a keyed SHA-256 digest is stored in `account_recovery`.
Recovery requires username, code and a new password. Passwords use Better Auth’s
scrypt helpers. A successful reset atomically rotates the code and deletes all
sessions; concurrent reuse of the same code cannot succeed twice. Rate limits
persist in SQLite and all mutations enforce same-origin requests. If a response
is lost after a reset, sign in with the new password and generate a replacement
code. These tables use migration `004-account-recovery.sql`.

Deleting an account requires its current password and exact username confirmation.
It deletes the user, credentials, sessions, private journal, recovery digest,
account-linked reports, and that account’s chat messages, reactions and reports.
The current browser clears its account cache and notifies other same-origin tabs.
Other devices may retain offline cached copies until their browser storage is
cleared. Guest runs remain separate. Pseudonymous chat records and restrictions
remain to prevent deletion from clearing a ban. Admin grants disappear with a
deleted admin account; use the documented grant script if establishing a new owner.
