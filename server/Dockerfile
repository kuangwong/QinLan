FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# The embedded PostgreSQL package is only used by tests; do not run its installer.
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune
COPY --from=build /app/dist ./dist
# db.js resolves ../migrations relative to dist/, for both migrate and startup.
COPY migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
