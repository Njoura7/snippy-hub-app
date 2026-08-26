# ffmpeg + yt-dlp live only here — the pipeline package shells out to both as
# plain binaries (see packages/pipeline/src/clients). libass is pinned
# explicitly since ASS caption burn-in (Step 4) depends on it — and libass
# needs fontconfig + actual font files or it burns in nothing, silently
# (no error — just an empty subtitle track). ttf-liberation is a system
# fallback; the 4 real caption fonts (Anton/Bebas Neue/Poppins/Ubuntu) are
# bundled separately below, from packages/pipeline/assets/fonts/.
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

# Caption fonts (see packages/pipeline/assets/fonts/LICENSES.md) — copied out
# to fontconfig's scanned dir since /app isn't one, then re-cached. Real
# family names (Anton, Bebas Neue, "Poppins ExtraBold", Ubuntu), not
# Liberation substitutes — ass.ts's FONT_MAP references these directly.
RUN mkdir -p /usr/share/fonts/truetype/custom \
  && cp packages/pipeline/assets/fonts/*.ttf /usr/share/fonts/truetype/custom/ \
  && fc-cache -f

WORKDIR /app/apps/worker
CMD ["npx", "tsx", "src/index.ts"]
