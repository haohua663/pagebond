# Postgres archives + IndexedDB

## Choice

- **IndexedDB** (`lib/storage/idb.ts`) stays the **offline source of truth** for revise / conceive / desk.
- **Postgres** (optional) mirrors `PaperRecord` JSON into `papers` for server list/search when `DATABASE_URL` is set.
- Guest rows: `userId` null. Demo login can later map email → `users`.
- If Postgres is missing or down, **存档** search still filters the local IndexedDB list. No revise/conceive breakage.

## Start DB (Docker defaults)

```bash
cd ~/genesis   # or the Windows tree that runs Next on :4721
docker compose up -d
```

Defaults: user/password/db = `pagebond`, port `5432`.

`.env.local`:

```
DATABASE_URL=postgresql://pagebond:pagebond@127.0.0.1:5432/pagebond
```

Push schema:

```bash
npx drizzle-kit push
```

## APIs

- `GET /api/archives?q=` — list/search (returns `source: unavailable` without DB)
- `POST /api/archives` — upsert full `PaperRecord`
- `GET|DELETE /api/archives/[id]`

## UI

存档 mode: Gooey Input searches local archives; dual-write runs after `idbPut` / delete.
