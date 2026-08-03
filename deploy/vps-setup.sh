#!/usr/bin/env bash
# ============================================================
# Nexura AI — brand new VPS setup (Ubuntu 22.04 / 24.04)
# VPS IP : 169.58.105.190
# Domain : nexuraai.dev  (+ www)
#
# Run as root on the VPS:
#   bash vps-setup.sh
# ============================================================
set -euo pipefail

DOMAIN="nexuraai.dev"
APP_DIR="/var/www/nexuraai"
APP_USER="nexuraai"
REPO="https://github.com/samexpoit-ux/ai-companion-launchpad-1e8e071e.git"
PORT="3000"

echo "==> 1/8 System update + base packages"
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git ufw nginx unzip ca-certificates

echo "==> 2/8 Firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "==> 3/8 App user"
id -u "$APP_USER" >/dev/null 2>&1 || adduser --system --group --home "$APP_DIR" "$APP_USER"
mkdir -p "$APP_DIR"

echo "==> 4/8 Node.js 22 + Bun"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  ln -sf /root/.bun/bin/bun /usr/local/bin/bun
fi

echo "==> 5/8 Clone / update code"
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

echo "==> 6/8 Env file"
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<'ENVEOF'
# Fill these with the values from your Lovable project .env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_PROJECT_ID=
SUPABASE_SERVICE_ROLE_KEY=
OPENROUTER_API_KEY=
ENVEOF
  echo "!! .env created at $APP_DIR/.env — fill it in, then re-run deploy.sh"
fi

echo "==> 7/8 Build (Node server bundle)"
set -a; . "$APP_DIR/.env"; set +a
export NITRO_PRESET=node-server
bun install
bun run build
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> 8/8 systemd + nginx + SSL"
cp "$APP_DIR/deploy/nexuraai.service" /etc/systemd/system/nexuraai.service
systemctl daemon-reload
systemctl enable --now nexuraai
systemctl restart nexuraai

cp "$APP_DIR/deploy/nginx-nexuraai.conf" /etc/nginx/sites-available/nexuraai
ln -sf /etc/nginx/sites-available/nexuraai /etc/nginx/sites-enabled/nexuraai
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos \
  -m "admin@$DOMAIN" --redirect || echo "certbot failed — check DNS propagation, then rerun certbot"

echo
echo "DONE. App on http://127.0.0.1:$PORT  →  https://$DOMAIN"
systemctl --no-pager status nexuraai | head -n 20
