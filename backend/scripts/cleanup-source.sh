#!/usr/bin/env bash
set -euo pipefail

# Deletes a project's SOURCE video (the big file — the podcast download
# itself) to free disk space, once you're done exporting the clips you want
# from it. The project row, transcript, and clips all stay intact — only
# exporting a NEW clip from this project stops working afterward (existing
# renders are separate files, unaffected). Works the same for STORAGE_DRIVER
# local or r2.
#
# Usage: ./cleanup-source.sh <projectId>

API_URL="${API_URL:-http://localhost:3000}"
PROJECT_ID="${1:?Usage: $0 <projectId>}"

if ! curl -sf "$API_URL/health" >/dev/null; then
  echo "Can't reach $API_URL/health — is the API running?" >&2
  exit 1
fi

echo "Deleting source video for project $PROJECT_ID ..."
curl -sf -X DELETE "$API_URL/projects/$PROJECT_ID/source" -o /dev/null -w "HTTP %{http_code}\n"
echo "Done — project, transcript, and clips are untouched."
