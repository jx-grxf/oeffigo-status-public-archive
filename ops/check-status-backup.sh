#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: ops/check-status-backup.sh <encrypted-backup> <age-identity>" >&2
  exit 2
fi

archive=$1
identity=$2
[[ -f "$archive" && -f "$identity" ]] || {
  echo "Backup or age identity is missing" >&2
  exit 2
}

result=$({
  age --decrypt --identity "$identity" "$archive" | gzip -dc
  printf '%s\n' \
    'PRAGMA integrity_check;' \
    "SELECT 'workspaces=' || COUNT(*) FROM workspace;" \
    "SELECT 'pages=' || COUNT(*) FROM page;" \
    "SELECT 'components=' || COUNT(*) FROM page_component;"
} | sqlite3 -batch -bail ':memory:')

first_line=${result%%$'\n'*}
[[ "$first_line" == ok ]] || {
  echo "Restored database failed integrity_check" >&2
  exit 1
}
for table in workspaces pages components; do
  count=$(printf '%s\n' "$result" | sed -n "s/^${table}=//p")
  [[ "$count" =~ ^[0-9]+$ && "$count" -gt 0 ]] || {
    echo "Restored database has no ${table}" >&2
    exit 1
  }
done

echo "Encrypted backup decrypted and restored into an isolated in-memory database"
