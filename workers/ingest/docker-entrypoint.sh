#!/bin/sh
# Volume-friendly start-up.
#
# Railway and Fly both hand the container a volume owned by root, while the
# worker itself must not run as root for 24/7. So: fix ownership while we still
# have the privileges, then hand over to the unprivileged `ingest` user.
set -e

if [ "$(id -u)" = "0" ]; then
  data_dirs="${EST_INDEX_PATH%/*}"
  mkdir -p "$data_dirs" "${EST_OUT_DIR:-/app/data/out}"
  # `|| true`: a read-only or pre-owned mount is not a reason to refuse to boot.
  chown -R ingest:ingest "$data_dirs" "${EST_OUT_DIR:-/app/data/out}" 2>/dev/null || true
  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid=ingest --regid=ingest --clear-groups "$@"
  fi
fi

exec "$@"
