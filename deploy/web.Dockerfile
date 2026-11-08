# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY 原型/package.json 原型/pnpm-lock.yaml 原型/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY 原型/ ./
RUN pnpm build

FROM nginx:stable-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
