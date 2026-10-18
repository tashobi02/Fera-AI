# Dedicated local demo runtime

Requires Node 22+, Docker, psql, installed npm dependencies and the pinned model cache. This is a synthetic local prototype; no deployment or paid-provider access is needed.

```sh
npm run model:fetch
npm run build
npm run demo:local -- start
node scripts/demo/app.mjs
```

Open http://127.0.0.1:3216. The app launcher generates local signing keys in ignored `.demo/keys.json` (0600), preserves them on restart and waits for real database and embedding readiness. Ctrl-C stops its own app child. The CLI owns a separate PostgreSQL container at 127.0.0.1:3215; it does not reset the regular developer database on 54322. Only one dedicated demo stack can use port 3215 at a time.

```sh
npm run demo:local -- status
npm run demo:local -- verify
npm run demo:local -- stop
npm run demo:local -- start --reuse
# After stopping the app, deliberately delete ONLY this dedicated stack:
npm run demo:local -- reset --yes
```

Start is idempotent. Existing data is reused, and an inconsistent database or corrupt state fails closed instead of silently resetting. Stop preserves data and state. Reset requires --yes and exact owner labels before deletion. Foreign containers, volumes and state symlinks are refused.

The synthetic seed account usernames are listed by `npm run seed:users`; dedicated defaults are the explicitly synthetic local passwords documented in scripts/demo/start.mjs. Set SEED_USER_PASSWORD and SEED_ADMIN_PASSWORD before first start if needed; do not commit real credentials. Keep `.demo/` private and ignored.

The optional docker-compose.demo.yml is a database-only fallback. It requires explicit FERA_DEMO_OWNER, FERA_DEMO_CONTAINER_NAME and FERA_DEMO_VOLUME_NAME; obtain the values from the CLI's status output. CLI lifecycle uses docker directly.
