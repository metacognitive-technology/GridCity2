
# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies including python and build tools for native modules
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Production Stage
FROM node:20-alpine

WORKDIR /app

# Install production dependencies including python and build tools for native modules
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install --production

# Copy built assets and server
COPY --from=builder /app/dist ./dist
COPY server.ts ./

# In a real environment, we'd bundle server.ts with esbuild for speed
# and to avoid tsx in production, but for this plan we'll use node + cjs bundle
COPY --from=builder /app/dist/server.cjs ./dist/server.cjs

# Create data directory for SQLite
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data

USER node

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Use the bundled server
CMD ["node", "dist/server.cjs"]
