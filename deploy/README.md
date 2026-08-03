# Nexura AI — VPS deploy (nexuraai.dev · 169.58.105.190)

Everything runs on your own VPS: the app plus self-hosted Supabase
(Postgres, Auth, Storage, Studio). No external backend.

## 0) DNS
| Type | Name | Value |
|---|---|---|
| A | @ | 169.58.105.190 |
| A | www | 169.58.105.190 |
| A | supabase | 169.58.105.190 |

`supabase.nexuraai.dev` serves the self-hosted Supabase API + Studio.

Check: `dig +short nexuraai.dev` → `169.58.105.190`

## 0b) Self-hosted Supabase (run this first)
```bash
ssh root@169.58.105.190
bash /var/www/nexuraai/deploy/supabase-selfhost.sh   # docker stack + TLS + keys
bash /var/www/nexuraai/deploy/supabase-schema.sh     # profiles, roles, signup trigger
```
The first script prints the exact `.env` block (URL, anon key, service role key)
to paste into `/var/www/nexuraai/.env`. `VITE_*` values are inlined at build
time, so rerun `deploy/deploy.sh` after changing them.


## 1) One-time server setup
```bash
ssh root@169.58.105.190
curl -fsSL https://raw.githubusercontent.com/samexpoit-ux/ai-companion-launchpad-1e8e071e/main/deploy/vps-setup.sh -o vps-setup.sh
bash vps-setup.sh
```
Or if the repo isn't pushed yet: `scp -r deploy root@169.58.105.190:/root/` then `bash /root/deploy/vps-setup.sh`.

The script installs Node 22, Bun, nginx, ufw, builds the app with
`NITRO_PRESET=node-server`, registers the `nexuraai` systemd service on
127.0.0.1:3000, wires nginx, and issues a Let's Encrypt cert for both
`nexuraai.dev` and `www.nexuraai.dev`.

## 2) Environment variables
The first run creates `/var/www/nexuraai/.env`. Fill it with the block printed by
`supabase-selfhost.sh` plus your OpenRouter key:
```
VITE_SUPABASE_URL=https://supabase.nexuraai.dev
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
VITE_SUPABASE_PROJECT_ID=nexura
SUPABASE_URL=https://supabase.nexuraai.dev
SUPABASE_SERVICE_ROLE_KEY=<service role key>
OPENROUTER_API_KEY=<openrouter key>
```
then ship from your machine (see below).

## 2b) One-command deploy
From your local checkout — this is the only command you need for every update:
```bash
bun run ship          # = bash deploy/ship.sh
```
It runs, stopping at the first failure:
1. **local checks** — typecheck + unit tests
2. **sync** — `rsync` of the source tree to `/var/www/nexuraai` (`.env`,
   `node_modules`, `.output` and `.git` are never overwritten)
3. **build** — `bun install` + `NITRO_PRESET=node-server bun run build` **on the
   server**, so the `VITE_*` values baked into the bundle are the server's
4. **migrations** — `deploy/migrate.sh` applies every new
   `supabase/migrations/*.sql` to self-hosted Supabase, once each, in a
   transaction, tracked in `public.schema_migrations`
5. **restart** — `systemctl restart nexuraai`, `nginx -t && systemctl reload
   nginx`, then a local and public health check

Flags: `--skip-tests`, `--skip-migrations`, `--no-build`,
`--host root@IP`, `--dir /var/www/nexuraai`, `--service nexuraai`.

Requirements: `rsync` locally and key-based SSH (`ssh-copy-id root@169.58.105.190`).

Database only:
```bash
ssh root@169.58.105.190 'bash /var/www/nexuraai/deploy/migrate.sh'
```
`deploy/deploy.sh` still exists as the git-pull-based fallback you can run
directly on the server:
```bash
bash /var/www/nexuraai/deploy/deploy.sh
```


## 3) Auth settings (self-hosted Studio → Authentication → URL configuration)
Site URL: `https://nexuraai.dev`
Redirect URLs:
- `https://nexuraai.dev/**`
- `https://www.nexuraai.dev/**`

Google OAuth console → authorized redirect URI
`https://supabase.nexuraai.dev/auth/v1/callback`, authorized origin
`https://nexuraai.dev`. Then set `GOTRUE_EXTERNAL_GOOGLE_*` in
`/opt/supabase/.env` and `docker compose up -d` again.

## 3b) Models & credits
- All OpenRouter model ids live in `src/lib/model-tiers.ts` — the only file to
  edit. Chat/plan use the cheap tier, coding/auto-fix use Claude 3.7 → 3.5
  Sonnet, with free-model fallbacks so the app keeps working without credit.
- The credit allowance shown in the UI lives in `src/lib/credits.ts`.


## 4) Everyday commands
```bash
systemctl status nexuraai          # state
journalctl -u nexuraai -f          # live logs
bash /var/www/nexuraai/deploy/deploy.sh   # pull + rebuild + restart
nginx -t && systemctl reload nginx
certbot renew --dry-run          # SSL auto-renew check
```

## Troubleshooting
- **502 Bad Gateway** → app not running: `journalctl -u nexuraai -n 50`.
- **certbot fails** → DNS not propagated yet; wait and rerun
  `certbot --nginx -d nexuraai.dev -d www.nexuraai.dev`.
- **Blank page / env errors** → `.env` missing `VITE_*` values at *build* time;
  fill them and rerun `deploy.sh` (VITE vars are inlined during build).
