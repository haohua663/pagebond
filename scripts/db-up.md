# Start local Postgres

Requires Docker Desktop (Windows) or Docker Engine (WSL).

```bash
cd ~/genesis
docker compose up -d
# wait until healthy
docker compose ps
```

`.env.local`:
```
DATABASE_URL=postgresql://pagebond:pagebond@127.0.0.1:5432/pagebond
```

```bash
npm run db:push
npm run dev
```

Without Docker/DATABASE_URL, 存档 search still works on IndexedDB.
