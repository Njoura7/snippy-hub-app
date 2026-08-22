# ffmpeg + yt-dlp live only here — the pipeline package shells out to both as
# plain binaries (see packages/pipeline/src/clients). libass is pinned
# explicitly since ASS caption burn-in (Step 4) depends on it — and libass
# needs fontconfig + actual font files or it burns in nothing, silently
# (no error — just an empty subtitle track). Liberation fonts are
# metric-compatible with Arial/Times/Courier, matching ass.ts's FONT_MAP.
# No emoji font needed: the header caption's emoji is composited as a real
# PNG (ffmpeg overlay, see clients/ffmpegRender.ts + emojiLibrary.ts), not
# rendered as an ASS text glyph — this Alpine ffmpeg/libass build can't
# render emoji glyphs at real quality either way (color fonts don't render
# at all, monochrome bitmap fonts are visibly pixelated — both tested).
FROM node:22-alpine

RUN apk add --no-cache ffmpeg yt-dlp libass fontconfig ttf-liberation && fc-cache -f

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/pipeline/package.json packages/pipeline/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/storage/package.json packages/storage/package.json

RUN npm install

COPY tsconfig.base.json ./
COPY packages packages
COPY apps/worker apps/worker

WORKDIR /app/apps/worker
CMD ["npx", "tsx", "src/index.ts"]
