# ---------- Build stage ----------
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies (including dev) using the lockfile for reproducible builds
COPY package*.json ./
RUN npm ci

# Copy source and generate the Prisma client, then build
COPY . .
RUN npx prisma generate
RUN npm run build

# ---------- Production stage ----------
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the generated Prisma client and build artifacts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

# Apply migrations, then start the compiled app
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
