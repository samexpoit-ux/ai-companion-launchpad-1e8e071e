#!/usr/bin/env bash
# ============================================================================
# Install the headless-browser runtime the Nexura browser agent needs.
#
# Run once on the VPS as root:
#   bash /var/www/nexuraai/deploy/install-browser-agent.sh
#
# It installs Playwright + Chromium and its OS libraries, then makes sure a
# credential-vault key exists in /etc/nexuraai.env (created if absent).
# Chromium lives in a shared browser path so every systemd worker can find it.
# ============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexuraai}"
BROWSERS_DIR="${BROWSERS_DIR:-/var/lib/nexuraai-browsers}"
ENV_FILE="${ENV_FILE:-/etc/nexuraai.env}"

cd "$APP_DIR"

echo "==> installing playwright into the app"
export PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_DIR"
mkdir -p "$BROWSERS_DIR"
bun add playwright

echo "==> downloading chromium + OS dependencies"
bunx playwright install --with-deps chromium

echo "==> wiring the environment"
touch "$ENV_FILE"
if ! grep -q '^PLAYWRIGHT_BROWSERS_PATH=' "$ENV_FILE"; then
  echo "PLAYWRIGHT_BROWSERS_PATH=$BROWSERS_DIR" >> "$ENV_FILE"
  echo "   added PLAYWRIGHT_BROWSERS_PATH"
fi
if ! grep -q '^CREDENTIAL_VAULT_KEY=' "$ENV_FILE"; then
  # 48 random bytes; losing this key only means saved passwords must be re-entered.
  echo "CREDENTIAL_VAULT_KEY=$(openssl rand -base64 48 | tr -d '\n=')" >> "$ENV_FILE"
  echo "   generated CREDENTIAL_VAULT_KEY (keep a backup of $ENV_FILE)"
fi
chmod 600 "$ENV_FILE"
chown -R nexuraai:nexuraai "$BROWSERS_DIR" || true

echo "==> restarting the app"
UNITS="$(systemctl list-units --plain --no-legend 'nexuraai@*.service' | awk '{print $1}')"
if [ -n "$UNITS" ]; then
  for unit in $UNITS; do systemctl restart "$unit"; sleep 1; done
else
  systemctl restart nexuraai
fi

echo
echo "Done. Open https://nexuraai.dev/agent — the runtime banner should read"
echo "\"Headless browser and credential vault are ready\"."
