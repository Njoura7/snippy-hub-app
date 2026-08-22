#!/usr/bin/env bash
set -euo pipefail

# Smoke-tests the full pipeline (ingest -> transcribe -> analyze) against a
# running API. $0 end-to-end with the defaults (STORAGE_DRIVER=local,
# ANALYZE_PROVIDER=groq) — just GROQ_API_KEY in backend/.env. Requires:
# docker compose up -d postgres api worker (or the native `npm run dev:api` /
# `npm run dev:worker` equivalents).
#
# Usage:
#   ./smoke-test-ingest.sh                            # ~19s public test video via yt-dlp
#   ./smoke-test-ingest.sh <youtube-or-twitch-url>     # your own URL
#   ./smoke-test-ingest.sh --file /path/to/video.mp4   # upload flow instead

API_URL="${API_URL:-http://localhost:3000}"
DEFAULT_URL="https://www.youtube.com/watch?v=jNQXAC9IVRw" # "Me at the zoo", 19s

if ! curl -sf "$API_URL/health" >/dev/null; then
  echo "Can't reach $API_URL/health — is the API running? (docker compose up -d api worker)" >&2
  exit 1
fi

if [ "${1:-}" = "--file" ]; then
  FILE_PATH="${2:?Usage: $0 --file /path/to/video.mp4}"
  echo "Uploading $FILE_PATH to $API_URL ..."
  RESPONSE=$(curl -sf -X POST "$API_URL/projects/upload" \
    -F "targetPlatforms=[\"tiktok\"]" \
    -F "file=@${FILE_PATH}")
else
  SOURCE_URL="${1:-$DEFAULT_URL}"
  SOURCE_TYPE="youtube"
  case "$SOURCE_URL" in
  *twitch.tv*) SOURCE_TYPE="twitch" ;;
  esac
  echo "Creating project from $SOURCE_URL (sourceType=$SOURCE_TYPE) ..."
  RESPONSE=$(curl -sf -X POST "$API_URL/projects" \
    -H "Content-Type: application/json" \
    -d "{\"sourceUrl\": \"$SOURCE_URL\", \"sourceType\": \"$SOURCE_TYPE\", \"targetPlatforms\": [\"tiktok\"]}")
fi

PROJECT_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$PROJECT_ID" ]; then
  echo "Failed to create project. Response:" >&2
  echo "$RESPONSE" >&2
  exit 1
fi

echo "Project created: $PROJECT_ID"
echo "Polling status every 5s (up to 10 min — a long podcast's transcribe+analyze takes real time) ..."

LAST_STATUS=""
for i in $(seq 1 120); do
  STATUS_JSON=$(curl -sf "$API_URL/projects/$PROJECT_ID")
  STATUS=$(echo "$STATUS_JSON" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ "$STATUS" != "$LAST_STATUS" ]; then
    echo "  [$((i * 5))s] status=$STATUS"
    LAST_STATUS="$STATUS"
  fi

  if [ "$STATUS" = "ready" ]; then
    echo
    echo "Pipeline complete — clip candidates ready:"
    curl -sf "$API_URL/projects/$PROJECT_ID/clips"
    echo
    exit 0
  fi

  if [ "$STATUS" = "failed" ]; then
    echo
    echo "Pipeline failed:" >&2
    echo "$STATUS_JSON" >&2
    exit 1
  fi

  sleep 5
done

echo "Timed out after 10 minutes." >&2
exit 1
