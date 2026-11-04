FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv/shiri
EXPOSE 80 443 443/udp
