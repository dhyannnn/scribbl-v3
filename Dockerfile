# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json .npmrc ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build && npx prisma generate

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

# Install Chromium + its system dependencies (required for Playwright PDF export)
RUN apt-get update && apt-get install -y \
  chromium \
  libglib2.0-0 \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

# Point our app's Playwright launch to the system Chromium
ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

COPY package*.json .npmrc ./
COPY prisma ./prisma
RUN npm ci --omit=dev --ignore-scripts

# Copy built output and generated Prisma client from builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

EXPOSE 3000
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

CMD ["npm", "start"]
