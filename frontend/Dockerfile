# Local-dev parity only, using Vite's dev server for hot reload — where the
# frontend ultimately deploys to (Lovable hosting / Vercel / static export)
# is a separate decision this doesn't presume.
FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

COPY . .

# Port 8080 (not Vite's usual 5173) — @lovable.dev/vite-tanstack-config
# hard-forces the dev server onto 8080, so match it here.
EXPOSE 8080
CMD ["bun", "run", "dev", "--", "--host", "0.0.0.0"]
