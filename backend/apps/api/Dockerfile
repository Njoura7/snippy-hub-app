# Lean on purpose — the API never touches ffmpeg/yt-dlp, only @cutroom/worker does.
FROM node:22-alpine

WORKDIR /app

# Manifests only, first — keeps `npm install` cached across rebuilds that only
# touch source. All workspace package.json files must be present for npm to
# resolve `workspace:*`-style deps against the lockfile.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/pipeline/package.json packages/pipeline/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/storage/package.json packages/storage/package.json

RUN npm install

COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api

WORKDIR /app/apps/api
EXPOSE 3000
CMD ["npx", "tsx", "src/index.ts"]
