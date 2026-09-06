# Hosting at tld.henhau.online with Dokploy

This repository includes a Docker Compose deployment for one Hetzner server.
Dokploy terminates HTTPS and routes to the `app` service on port **3000**.
The container runs the production Vinext frontend and Bun API behind one gateway.
SQLite and the generated authentication secret live in the persistent `atlas-data`
volume, mounted at `/data`. There is no separate database service.

## First deployment

1. In Dokploy, connect GitHub and grant its GitHub App access to the private
   **henrikhaus/tld-map** repository.
2. Create a project, then a **Docker Compose** service named `tld-map`.
   Choose the GitHub provider, repository `henrikhaus/tld-map`, branch `main`,
   and Compose path `./compose.yaml`. Use Docker Compose, not Docker Stack.
   Keep isolated deployments enabled.
3. In the service's Environment settings, add:

   ```dotenv
   SITE_URL=https://tld.henhau.online
   ```

   The Compose file passes this at build time for search metadata and at runtime
   for authentication. It already defaults to this domain. Do not add a trailing
   slash or change the origin between build and runtime.

4. In **Domains → Add Domain**, set:

   | Setting        | Value               |
   | -------------- | ------------------- |
   | Host           | `tld.henhau.online` |
   | Service        | `app`               |
   | Container port | `3000`              |
   | Path           | `/`                 |
   | HTTPS          | Enabled             |
   | Certificate    | Let's Encrypt       |

   Save the domain **before deploying**. Dokploy adds the Traefik routing and
   network configuration automatically. Do not add public port mappings for
   3000, 3001, or 3002. The latter two are loopback-only inside the container.

5. Confirm the existing DNS A record for `tld.henhau.online` points to your
   Hetzner server. If an AAAA record exists, it must reach the same server over
   IPv6. Ports 80 and 443 must reach Dokploy/Traefik for HTTPS setup and access.
6. Click **Deploy** and wait until the app is healthy. The first build downloads
   dependencies and bundles the frontend. Migrations run automatically on startup.
7. Open the site and create your own `henhau` account. Save its recovery code.
   In the `app` container's terminal in Dokploy, run:

   ```sh
   bun scripts/grant-admin.ts henhau
   ```

   Refresh the site to see **Site admin** in the sidebar footer. Only run this
   after creating the account yourself; the grant binds to its fixed account ID.
   A fresh deployment does not contain local development accounts or runs.

## Verify the deployed site

- `https://tld.henhau.online/healthz` returns `{"ok":true}` only when both services respond.
- Open a region directly, such as `/maps/mystery-lake`, and reload it.
- Sign in, create a run, add a note, reload, and check that it is saved.
- Check chat and the issue form, and confirm a guest cannot access admin data.
- Check `/sitemap.xml` contains `https://tld.henhau.online` URLs, then submit it
  in Google Search Console. DNS setup alone does not submit a site to Google.

## Updates and data

Push changes to `main`, then deploy again in Dokploy. You can enable Dokploy's
Auto Deploy after the first successful deployment. Ordinary image rebuilds keep
the named volume and therefore keep accounts, runs, chat, reports, admin access,
and recovery-code hashes. Keep a single `app` instance on the same server; this
SQLite deployment is not designed for multiple independent replicas.

Never remove the `atlas-data` volume, run `docker compose down -v`, or use a clean
deployment option that deletes volumes unless you intend to erase the site's data.
Renaming/recreating the Compose project can select a different volume.

Set up daily off-server backups and test restoration. For a consistent SQLite
backup while the API is running, use the included script in the app container:

```sh
bun scripts/backup-data.ts /tmp/tld-backup
```

It creates a new directory containing a SQLite snapshot and its matching
`auth-secret`; it refuses to overwrite an existing directory. Download/copy that
directory to private backup storage, then remove the temporary copy. A Git push
does not back up accounts. Preserve the same secret when restoring; changing it
invalidates recovery codes and other signed or keyed identities.

To migrate the current local accounts, run the same backup command locally and
transfer the result privately to the server. Stop the app before restoring the
two files into `/data`, remove obsolete `atlas.sqlite-wal` / `atlas.sqlite-shm`
files from the destination, and ensure the files belong to UID/GID `1000:1000`.
Start the app again. Only replace a new/empty production database, or make a
production backup first and explicitly choose which database to keep—this does
not merge databases. A restored local admin account keeps its existing ID/grant.
Browser-only guest runs are not part of a database backup; sign into your local
account and copy those runs into it before taking the snapshot if you want them.

## Proxy and operational details

`TRUST_PROXY=true` is set for Dokploy. The gateway accepts only the last address
in Traefik's `X-Forwarded-For` chain, strips incoming identity headers, and passes
a normalized address to the loopback-only API. This keeps rate limits separate
for different visitors. Keep Traefik's default trusted-forwarding protection;
do not enable `forwardedHeaders.insecure`, and do not expose the gateway directly
to the internet. If adding another CDN/proxy later, configure its trusted IPs
deliberately. For a direct local production test, set `TRUST_PROXY=false`.

The authentication secret is generated on first startup in `/data/auth-secret`;
no secret needs to be committed or pasted into the Compose file. A child process
failure stops the container, and Docker restarts it. Health checks detect frontend
or API failures; monitor unhealthy status in Dokploy (health status alone does not
restart a running but hung container).

Review the privacy page against your actual server logs, backup retention and
contact arrangements before announcing the site publicly. Account data and
secrets are excluded from Git and the Docker build context.

## Troubleshooting

- **502/503:** inspect deployment and container logs, confirm service `app`, port
  `3000`, and `/healthz`. Do not route directly to the internal frontend/API ports.
- **Origin not allowed / sign-in cookies fail:** use HTTPS at exactly
  `https://tld.henhau.online`, check `SITE_URL`, and rebuild after changing it.
- **New/empty accounts after an update:** check the original volume is still
  mounted at `/data`; stop before registering over an unexpected empty database.
- **Build killed for memory:** inspect Hetzner memory usage; build on a server
  with sufficient free memory or use Dokploy's separate build server facility.

Official Dokploy references: [Compose setup](https://docs.dokploy.com/docs/core/docker-compose/example),
[Compose domains](https://docs.dokploy.com/docs/core/docker-compose/domains),
[domain settings](https://docs.dokploy.com/docs/core/domains).
