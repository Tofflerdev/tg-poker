# ============================================
# Stage 1: Build server (TypeScript → JavaScript)
# ============================================
FROM node:20-alpine AS server-builder

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json tsconfig.json ./
COPY prisma.config.ts ./

# Install server dependencies
RUN npm ci

# Copy server source and types
COPY server/ ./server/
COPY types/ ./types/
COPY prisma/ ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# ============================================
# Stage 2: Build client (Vite → static files)
# ============================================
FROM node:20-alpine AS client-builder

WORKDIR /app

# Copy types (needed by client build)
COPY types/ ./types/

# Copy client package files
COPY client/package.json client/package-lock.json ./client/
WORKDIR /app/client
RUN npm ci

# Copy client source
COPY client/ ./

# Build client (output to dist/)
RUN npm run build

# ============================================
# Stage 3: Production runtime
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

# Copy root package files for production deps
COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY prisma/ ./prisma/

# Install production dependencies only
RUN npm ci --omit=dev

# Generate Prisma client in production
RUN npx prisma generate

# Copy built server from stage 1
COPY --from=server-builder /app/dist/ ./dist/

# Copy built client from stage 2 to a build directory
# (will be copied to shared volume at runtime via entrypoint)
COPY --from=client-builder /app/client/dist/ ./client-build/

# Copy generated prisma artifacts
COPY --from=server-builder /app/node_modules/.prisma/ ./node_modules/.prisma/

# Copy entrypoint script and fix Windows line endings
COPY docker-entrypoint.sh ./
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

# Create client-dist directory (will be mounted as volume)
RUN mkdir -p /app/client-dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
