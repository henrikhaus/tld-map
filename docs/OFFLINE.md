# Self-hosting for offline use

You can run the atlas on your own computer without internet after the initial
setup. Maps, fonts, loot tables, account services, and the SQLite database are
served locally. Opening the public website once is not an offline installation.

## Install once while online

Install Git and Docker (Docker Desktop on macOS or Windows), then run:

```sh
git clone https://github.com/henrikhaus/tld-map.git
cd tld-map
docker build --build-arg SITE_URL=http://localhost:3000 -t tld-map:local .
docker run -d --name tld-map --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e APP_ORIGIN=http://localhost:3000 \
  -e SITE_URL=http://localhost:3000 \
  -v tld-map-data:/data \
  tld-map:local
```

Open **http://localhost:3000**. Use that exact address, because sign-in and chat
check the request origin. If another app uses port 3000, stop it first.

## Use without internet

Keep Docker running and open **http://localhost:3000** in your browser. You do not
need to rebuild, pull an image, or connect to the public site. To stop and restart:

```sh
docker stop tld-map
docker start tld-map
```

- Drawing, notes, loot tracking, and local accounts work offline.
- Guest runs stay in that browser's storage. Account saves live in the local
  `tld-map-data` Docker volume. Keep that volume; deleting it deletes those saves.
- Create a new local account if desired. Accounts and runs on `tld.henhau.online`
  are separate and do not automatically sync to this installation.
- Chat is local to this installation; it does not connect to the public chat.
- Source links and downloading future updates require internet.
- The command binds to your own computer only. For hosting a public instance,
  follow [the deployment guide](DEPLOYMENT.md).

To make your existing local account the administrator, run:

```sh
docker exec tld-map bun scripts/grant-admin.ts YOUR_USERNAME
```

Refresh the page after granting access. See the deployment guide for database
backup instructions. The app's source code is MIT-licensed; the included maps and
other third-party material retain their existing rights, as described in
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
