#!/usr/bin/env bash
# Load a local account detail workbook into the local D1 database.
# The workbook stays outside git. Example:
#   ./scripts/seed-local.sh /path/to/FY2027-account-detail.xlsx /path/to/chart-of-accounts.pdf
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $# -lt 1 ]]; then
  echo "Usage: scripts/seed-local.sh /path/to/account-detail.xlsx [/path/to/chart.pdf]" >&2
  exit 1
fi
if [[ ! -f "$1" ]]; then
  echo "Report not found: $1" >&2
  exit 1
fi
npx wrangler d1 migrations apply budget-explorer --local
npx tsx scripts/seed-local.ts "$@"
