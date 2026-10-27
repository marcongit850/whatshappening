#!/usr/bin/env bash
# Load a local year to date report into the local D1 database.
# The report stays outside git. Example:
#   ./scripts/seed-local.sh /path/to/report.txt
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $# -lt 1 ]]; then
  echo "Usage: scripts/seed-local.sh /path/to/report.txt" >&2
  exit 1
fi
if [[ ! -f "$1" ]]; then
  echo "Report not found: $1" >&2
  exit 1
fi
npx wrangler d1 migrations apply budget-explorer --local
npx tsx scripts/seed-local.ts "$1"
