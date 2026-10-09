# PRM - Please Remind Me
# Phase 2: multi-stage build producing one container that serves the API and
# the built PWA together (mirrors Kage's packaging). The backend runs
# straight from TypeScript via tsx — no native module to compile — and
# imports the frontend's own due-date logic (src/lib) at runtime, so the
# frontend source has to ship in the image alongside dist/, not just the
# built bundle.

# ---- Stage 1: build the frontend PWA ----
FROM node:24-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Stage 2: runtime ----
FROM node:24-alpine AS runtime
WORKDIR /app

# Backend dependencies (includes tsx — see backend/package.json).
COPY backend/package.json backend/package-lock.json* ./backend/
RUN npm --prefix backend install --omit=dev

# Backend source.
COPY backend/src ./backend/src

# Frontend source: backend/src/scheduler.ts and importRoute.ts import
# nextAlert()/settleAutoCharges()/types straight from here at runtime, so
# the backend can never drift from the app's own due-date math.
COPY src ./src

# Built frontend PWA, served statically by the backend.
COPY --from=frontend-build /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 4478

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4478/api/health || exit 1

WORKDIR /app/backend
CMD ["node_modules/.bin/tsx", "src/index.ts"]
