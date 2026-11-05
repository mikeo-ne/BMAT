#!/usr/bin/env bash
# East Sound ingest worker — one-paste setup for a fresh Ubuntu server
# (made for Oracle Cloud "Always Free" Ampere A1, works on any Ubuntu 22.04/24.04).
#
# On the server, run:
#   bash <(curl -fsSL https://raw.githubusercontent.com/mikeo-ne/BMAT/main/workers/ingest/deploy/oracle-setup.sh)
#
# It installs Docker, builds the worker from the public repo, asks once for the
# Supabase secret key (typed into the server, never shown or sent anywhere but
# Supabase), starts the worker so it restarts on reboot or crash, and checks
# GitHub every 30 minutes so new code is picked up automatically.
# Safe to run again: it updates in place and keeps the saved key and data.
set -euo pipefail

REPO="https://github.com/mikeo-ne/BMAT.git"
BRANCH="main"
SUPABASE_URL_DEFAULT="https://vewkhidaajdrfkedeavs.supabase.co"
SRC="/opt/eastsound"
ENV_DIR="/etc/eastsound"
ENV_FILE="$ENV_DIR/worker.env"
IMAGE="eastsound-ingest"
NAME="eastsound-worker"
VOLUME="eastsound-data"

say()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mxx %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] && SUDO="" || SUDO="sudo"
command -v apt-get >/dev/null || die "This script is for Ubuntu (apt-get not found)."

say "1/6  Installing Docker and git (a few minutes the first time)"
$SUDO apt-get update -qq
$SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io git curl ca-certificates >/dev/null
$SUDO systemctl enable --now docker >/dev/null

say "2/6  Getting the latest East Sound code"
if [ -d "$SRC/.git" ]; then
  $SUDO git -C "$SRC" fetch -q origin "$BRANCH"
  $SUDO git -C "$SRC" reset -q --hard "origin/$BRANCH"
else
  $SUDO git clone -q --depth 1 --branch "$BRANCH" "$REPO" "$SRC"
fi
echo "    version $($SUDO git -C "$SRC" rev-parse --short HEAD)"

say "3/6  Supabase connection"
$SUDO mkdir -p "$ENV_DIR"
$SUDO chmod 700 "$ENV_DIR"
if $SUDO test -s "$ENV_FILE"; then
  echo "    Using the key saved earlier ($ENV_FILE). To change it: sudo rm $ENV_FILE and run this again."
else
  echo "    Paste your Supabase SECRET key (Project Settings → API Keys)."
  echo "    It starts with sb_secret_ . Nothing will show while you paste — that's normal. Then press Enter."
  read -rs KEY < /dev/tty
  echo
  KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"
  [ -n "$KEY" ] || die "No key entered."
  case "$KEY" in
    sb_publishable_*) die "That's the publishable key. Use the SECRET key (sb_secret_…).";;
  esac
  code=$(curl -s -o /dev/null -w '%{http_code}' "$SUPABASE_URL_DEFAULT/rest/v1/stations?select=id&limit=1" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" || true)
  [ "$code" = "200" ] || die "Supabase refused that key (HTTP $code). Copy the secret key again and re-run."
  printf 'SUPABASE_URL=%s\nSUPABASE_SERVICE_ROLE_KEY=%s\n' "$SUPABASE_URL_DEFAULT" "$KEY" | $SUDO tee "$ENV_FILE" >/dev/null
  $SUDO chmod 600 "$ENV_FILE"
  unset KEY
  echo "    Key works and is saved (readable by root only)."
fi

say "4/6  Building the worker (about 5 minutes the first time)"
$SUDO docker build -q -t "$IMAGE" "$SRC/workers/ingest" >/dev/null

say "5/6  Starting the worker"
$SUDO docker volume create "$VOLUME" >/dev/null
$SUDO docker rm -f "$NAME" >/dev/null 2>&1 || true
$SUDO docker run -d --name "$NAME" --restart unless-stopped \
  --env-file "$ENV_FILE" -v "$VOLUME:/app/data" \
  --log-opt max-size=20m --log-opt max-file=3 \
  "$IMAGE" >/dev/null

say "6/6  Automatic updates every 30 minutes"
$SUDO tee /usr/local/bin/eastsound-update >/dev/null <<UPDATE
#!/usr/bin/env bash
# Pull new East Sound code; rebuild and restart the worker only when it changed.
set -euo pipefail
cd "$SRC"
before=\$(git rev-parse HEAD)
git fetch -q origin "$BRANCH" && git reset -q --hard "origin/$BRANCH"
[ "\$before" = "\$(git rev-parse HEAD)" ] && exit 0
# Website-only changes don't touch the worker: skip the rebuild.
git diff --quiet "\$before" HEAD -- workers/ingest && exit 0
docker build -q -t "$IMAGE" "$SRC/workers/ingest" >/dev/null
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --restart unless-stopped --env-file "$ENV_FILE" -v "$VOLUME:/app/data" \
  --log-opt max-size=20m --log-opt max-file=3 "$IMAGE" >/dev/null
echo "updated to \$(git rev-parse --short HEAD)"
UPDATE
$SUDO chmod 755 /usr/local/bin/eastsound-update
$SUDO tee /etc/systemd/system/eastsound-update.service >/dev/null <<'UNIT'
[Unit]
Description=Update the East Sound ingest worker
After=network-online.target docker.service
[Service]
Type=oneshot
ExecStart=/usr/local/bin/eastsound-update
UNIT
$SUDO tee /etc/systemd/system/eastsound-update.timer >/dev/null <<'UNIT'
[Unit]
Description=Check for East Sound updates every 30 minutes
[Timer]
OnBootSec=5min
OnUnitActiveSec=30min
[Install]
WantedBy=timers.target
UNIT
$SUDO systemctl daemon-reload
$SUDO systemctl enable --now eastsound-update.timer >/dev/null

say "Checking it's running"
sleep 20
if [ "$($SUDO docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" != "true" ]; then
  $SUDO docker logs --tail 30 "$NAME" || true
  die "The worker stopped. Send the lines above (they contain no keys) to get help."
fi
$SUDO docker logs --tail 8 "$NAME" 2>&1 | sed 's/^/    /'

cat <<DONE

$(printf '\033[1;32m')Done — the East Sound worker is running.$(printf '\033[0m')

  See what it's doing:   sudo docker logs -f $NAME        (Ctrl+C to stop watching)
  Restart it:            sudo docker restart $NAME
  Update right now:      sudo eastsound-update
  Health check:          sudo docker exec $NAME python -m eastsound_ingest --stations stations.csv doctor

It starts by itself after a reboot and picks up new code from GitHub every 30 minutes.
DONE
