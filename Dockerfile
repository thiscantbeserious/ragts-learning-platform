FROM node:24-alpine AS build
WORKDIR /app

# Native deps for better-sqlite3
RUN apk add --no-cache build-base python3

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && \
    npx tsc packages/vt-wasm/index.ts packages/vt-wasm/types.ts \
      --module NodeNext --moduleResolution NodeNext \
      --target ES2022 --declaration --skipLibCheck

# Production dependencies only
# --ignore-scripts skips husky prepare hook, then rebuild native addons
RUN rm -rf node_modules && npm ci --omit=dev --ignore-scripts && \
    npm rebuild better-sqlite3

FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Copy what's needed for runtime
COPY --from=build /app/package.json ./
COPY --from=build /app/dist/ ./dist/
COPY --from=build /app/packages/vt-wasm/ ./packages/vt-wasm/
COPY --from=build /app/node_modules/ ./node_modules/

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3000/api/health || exit 1

CMD ["node", "dist/server/src/server/start.js"]
