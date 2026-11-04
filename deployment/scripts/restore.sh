#!/bin/sh
set -eu

# Run inside the db or isolated restore-check container, with /backups mounted.
archive=${1:-}
case "$archive" in ''|*[!a-zA-Z0-9._-]*|.*) echo 'Pass the archive basename, without a path' >&2; exit 1;; esac
case "$archive" in shiri-*.dump) ;; *) echo 'Expected a shiri-*.dump archive' >&2; exit 1;; esac
: "${PGDATABASE:?Set PGDATABASE to the explicitly selected target database}"
: "${PGUSER:?Set PGUSER}"
[ -f "/backups/$archive" ]
[ -f "/backups/$archive.sha256" ]
cd /backups
# Validate exactly the selected archive, rather than arbitrary names in a sidecar.
checksum=$(cat "$archive.sha256")
expected=${checksum%%  *}
case "$expected" in ''|*[!a-fA-F0-9]*) echo 'Invalid SHA-256 digest' >&2; exit 1;; esac
[ "${#expected}" -eq 64 ]
[ "$checksum" = "$expected  $archive" ]
actual=$(sha256sum "$archive")
actual=${actual%% *}
[ "$actual" = "$expected" ] || { echo 'Archive checksum mismatch' >&2; exit 1; }
pg_restore --list "$archive" >/dev/null
if [ "${SHIRI_CONFIRM_RESTORE:-}" != "$PGDATABASE" ]; then
  echo "Set SHIRI_CONFIRM_RESTORE=$PGDATABASE after stopping application writes and taking a current backup" >&2
  exit 1
fi
# Single transaction: an error rolls back changes. --clean replaces dump objects;
# this is not a schema downgrade mechanism. Restore matching application versions.
pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error --dbname="$PGDATABASE" "$archive"
echo "Restore completed for $PGDATABASE; verify records before restarting writes"
