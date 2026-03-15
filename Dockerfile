FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && \
    npx tsc packages/vt-wasm/index.ts packages/vt-wasm/types.ts \
      --module NodeNext --moduleResolution NodeNext \
      --target ES2022 --declaration --skipLibCheck

# Production dependencies only
RUN rm -rf node_modules && npm pkg delete scripts.prepare && npm ci --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Copy what's needed for runtime
COPY --from=build /app/package.json ./
COPY --from=build /app/dist/ ./dist/
COPY --from=build /app/packages/vt-wasm/ ./packages/vt-wasm/
COPY --from=build /app/node_modules/ ./node_modules/

# SQLite data directory — writable by non-root user
RUN mkdir -p /app/data && chown node:node /app/data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3000/api/health || exit 1

CMD ["node", "dist/server/start.js"]
