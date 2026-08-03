# Nexura AI — full deploy (GitHub → VPS), copy-paste

VPS `169.58.105.190` · domain `nexuraai.dev` · self-hosted Supabase `supabase.nexuraai.dev`

---

## A) Local: push code to GitHub

```bash
# first time only
cd /path/to/your/checkout
git init                                  # skip if already a repo
git remote add origin https://github.com/samexpoit-ux/ai-companion-launchpad-1e8e071e.git
# if the remote already exists:
git remote set-url origin https://github.com/samexpoit-ux/ai-companion-launchpad-1e8e071e.git

git add -A
git commit -m "deploy: nexura ai"
git branch -M main
git push -u origin main
```

Every later update:

```bash
git add - A && git commit -m "update" && git push
```

---

## B) VPS: one-time server setup

```bash
ssh root@169.58.105.190

apt-get update -y && apt-get install -y git curl rsync
mkdir -p /var/www
git clone https://github.com/samexpoit-ux/ai-companion-launchpad-1e8e071e.git /var/www/nexuraai
git config --global --add safe.directory /var/www/nexuraai

# node 22 + bun + nginx + ufw + systemd + SSL for nexuraai.dev
bash /var/www/nexuraai/deploy/vps-setup.sh
```

---

## C) VPS: self-hosted Supabase (once)

```bash
bash /var/www/nexuraai/deploy/supabase-selfhost.sh   # docker stack + TLS + keys
bash /var/www/nexuraai/deploy/supabase-schema.sh     # profiles, roles, signup trigger
```

`supabase-selfhost.sh` prints the exact `.env` block. Paste it into
`/var/www/nexuraai/.env` and add your OpenRouter key:

```bash
nano /var/www/nexuraai/.env
```

```
VITE_SUPABASE_URL=https://supabase.nexuraai.dev
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
VITE_SUPABASE_PROJECT_ID=nexura
SUPABASE_URL=https://supabase.nexuraai.dev
SUPABASE_SERVICE_ROLE_KEY=<service role key>
OPENROUTER_API_KEY=<openrouter key>
```

`VITE_*` values are inlined at build time — always rebuild after editing them.

---

## D) Deploy / redeploy — pick one

**1. From your machine (recommended, no git needed on the server):**

```bash
ssh-copy-id root@169.58.105.190     # once
bun run ship                        # typecheck + tests + rsync + build + migrate + restart
```

Flags: `--skip-tests`, `--skip-migrations`, `--no-build`, `--host`, `--dir`, `--service`.

**2. Git-based, on the server:**

```bash
ssh root@169.58.105.190 'bash /var/www/nexuraai/deploy/deploy.sh'
```

That does `git pull --ff-only` → `bun install` → build → migrations → restart.

**Database only:**

```bash
ssh root@169.58.105.190 'bash /var/www/nexuraai/deploy/migrate.sh'
```

---

## E) Verify

```bash
systemctl status nexuraai
journalctl -u nexuraai -f
curl -I https://nexuraai.dev
nginx -t && systemctl reload nginx
certbot renew --dry-run
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `dubious ownership` | `git config --global --add safe.directory /var/www/nexuraai` |
| 502 Bad Gateway | `journalctl -u nexuraai -n 50` — app not listening on 127.0.0.1:3000 |
| Blank page / env error | `.env` missing `VITE_*` at **build** time → fill, then redeploy |
| certbot fails | DNS not propagated; rerun `certbot --nginx -d nexuraai.dev -d www.nexuraai.dev` |
| push rejected | `git pull --rebase origin main` then push again |
| Auth redirect error | Studio → Auth → URL config: site `https://nexuraai.dev`, redirects `https://nexuraai.dev/**`, `https://www.nexuraai.dev/**` |
