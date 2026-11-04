#!/bin/sh
set -eu
umask 077

case "${BACKUP_RETENTION_DAYS:-14}" in ''|*[!0-9]*) echo 'BACKUP_RETENTION_DAYS must be a positive integer' >&2; exit 1;; esac
case "${BACKUP_INTERVAL_SECONDS:-86400}" in ''|*[!0-9]*) echo 'BACKUP_INTERVAL_SECONDS must be a positive integer' >&2; exit 1;; esac
[ "${BACKUP_RETENTION_DAYS:-14}" -ge 1 ]
[ "${BACKUP_INTERVAL_SECONDS:-86400}" -ge 60 ]

backup_once() (
  mkdir -p /backups
  # mktemp prevents collisions with a manual backup in the same second.
  directory=$(mktemp -d "/backups/.shiri-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
  temporary="$directory/archive.dump"
  trap 'rm -f "$temporary" "$temporary.sha256"; rmdir "$directory"' EXIT
  trap 'exit 1' HUP INT TERM
  pg_dump --format=custom --file="$temporary"
  pg_restore --list "$temporary" >/dev/null
  archive="/backups/$(basename "$directory" | cut -c 2-).dump"
  # Write the checksum against the final basename for portable verification.
  digest=$(sha256sum "$temporary")
  digest=${digest%% *}
  printf '%s  %s\n' "$digest" "$(basename "$archive")" > "$temporary.sha256"
  mv "$temporary" "$archive"
  mv "$temporary.sha256" "$archive.sha256"
  echo "Backup complete: $(basename "$archive")"
  # Only remove this tool's archives after a new dump was written successfully.
  find /backups -maxdepth 1 -type f -name 'shiri-*.dump' -mtime "+${BACKUP_RETENTION_DAYS:-14}" -exec sh -c 'for archive do rm -f "$archive" "$archive.sha256"; done' sh {} +
)

case "${1:-once}" in
  once) backup_once ;;
  loop)
    trap 'exit 0' INT TERM
    while :; do
      # Run a fresh shell: an `if` around a shell function disables its `set -e`.
      if ! /bin/sh "$0" once; then echo 'Backup failed; previous archives retained' >&2; fi
      sleep "${BACKUP_INTERVAL_SECONDS:-86400}" &
      wait "$!" || exit 0
    done
    ;;
  *) echo 'Usage: backup.sh [once|loop]' >&2; exit 1 ;;
esac
