# 拾日云端部署（IP 访问）

更新：2026-11-08。当前没有域名，先用 `http://82.157.149.117:8080` 访问；公网端口已在腾讯云 Lighthouse 放行。

## 访问地址

| 用途 | 地址 |
| --- | --- |
| 网页 | `http://82.157.149.117:8080/` |
| API | `http://82.157.149.117:8080/api/v1` |
| 健康检查 | `http://82.157.149.117:8080/health` |

网页直接打开即可注册或登录：服务地址留空表示使用当前站点（`http://82.157.149.117:8080`）。鸿蒙 APP 已内置该地址，登录页无需填写。没有预置演示账号。

## 架构

```
浏览器
  │ HTTP 8080
  ▼
web 容器（Nginx + React 静态文件）
  ├─ /              → /usr/share/nginx/html
  └─ /api/ /health  → api:3000
                          │
                     api 容器（Node 22 + Fastify）
                          │
                     db 容器（PostgreSQL 18 + shiri-db 卷）
```

- 只发布 `8080`；API 和数据库只在 Docker 内网可达。
- 容器重启策略为 `unless-stopped`，Docker 已设为开机启动。
- 数据库数据在 Docker 卷 `shiri_shiri-db`，不要执行 `docker compose down -v`。

## 服务器目录

| 路径 | 内容 |
| --- | --- |
| `/opt/shiri/app` | 源码、Compose、Dockerfile、Nginx 配置 |
| `/opt/shiri/app/deploy/.env` | 数据库密码等部署环境变量，权限 600 |
| `/opt/shiri/backups` | 每日数据库备份，权限 700 |
| `/etc/cron.d/shiri-backup` | 每天 03:30 自动备份 |

## 常用命令

```bash
cd /opt/shiri/app

# 状态
sudo docker compose -f deploy/compose.yaml --env-file deploy/.env ps

# 日志
sudo docker compose -f deploy/compose.yaml --env-file deploy/.env logs -f api
sudo docker compose -f deploy/compose.yaml --env-file deploy/.env logs -f web

# 重启 API / 全部
sudo docker compose -f deploy/compose.yaml --env-file deploy/.env restart api
sudo docker compose -f deploy/compose.yaml --env-file deploy/.env up -d

# 健康检查
curl -fsS http://127.0.0.1:8080/health

# 数据库 shell
sudo docker compose -f deploy/compose.yaml --env-file deploy/.env exec db psql -U shiri -d shiri
```

本机 `ubuntu` 用户没有加入 `docker` 组，因此命令都带 `sudo`。

## 备份与恢复

每天 03:30 由 root 执行 `/opt/shiri/app/deploy/backup.sh`，用 `pg_dump -Fc` 写入 `/opt/shiri/backups/shiri-YYYY-MM-DD.dump`，保留 14 天。

```bash
# 手动备份
sudo /opt/shiri/app/deploy/backup.sh

# 查看备份
sudo ls -lh /opt/shiri/backups
```

恢复演练（会重建 `shiri_restore`，不影响正式库）：

```bash
cd /opt/shiri/app
sudo docker compose -f deploy/compose.yaml --env-file deploy/.env exec -T db \
  psql -U shiri -d postgres -c 'DROP DATABASE IF EXISTS shiri_restore;'
sudo docker compose -f deploy/compose.yaml --env-file deploy/.env exec -T db \
  psql -U shiri -d postgres -c 'CREATE DATABASE shiri_restore;'
sudo cat /opt/shiri/backups/shiri-YYYY-MM-DD.dump | \
  sudo docker compose -f deploy/compose.yaml --env-file deploy/.env exec -T db \
  pg_restore -U shiri -d shiri_restore --no-owner
```

## 发布更新

1. 在本地重新打包源码（排除 `node_modules`、`dist`、`.git`、`.env`）。
2. 上传并解压到 `/opt/shiri/app`。
3. 先备份，再构建、迁移、启动：

```bash
cd /opt/shiri/app
sudo /opt/shiri/app/deploy/backup.sh
sudo docker compose -f deploy/compose.yaml --env-file deploy/.env build
sudo docker compose -f deploy/compose.yaml --env-file deploy/.env run --rm api node dist/migrate-cli.js
sudo docker compose -f deploy/compose.yaml --env-file deploy/.env up -d
```

数据库迁移是单独执行的，不会在 API 启动时自动改表。迁移前务必先备份。

## 公网端口

腾讯云 Lighthouse 控制台 → 实例 → 防火墙 → 添加规则：

- 协议：TCP
- 端口：8080
- 来源：`0.0.0.0/0`（或只填自己的公网 IP）

主机上的 `ufw` 当前未启用；Docker 发布端口会绕过 `ufw`，真正的公网入口以 Lighthouse 防火墙为准。

## 安全边界

- 当前是 **HTTP 明文**，没有域名和证书。登录密码和会话令牌会在公网明文传输。
- 目前没有预置账号、没有密码找回、没有邮箱验证；注册入口是公开的。
- 按你的要求，SSH 密码登录和原密码都没有改动。
- 在拿到已备案域名并加上 HTTPS 之前，不建议放入真实敏感数据。

以后有域名时，只需要在 `web` 前面加 TLS 终止（Nginx/Caddy + 证书），应用和 API 不需要改。

## 故障排查

| 现象 | 检查 |
| --- | --- |
| 浏览器打不开 | Lighthouse 防火墙是否放行 8080；`ss -lntp` 是否有 8080 |
| 502 / 页面能开但接口失败 | `docker compose ps` 中 api 是否 healthy；`logs api` |
| 数据库连不上 | `docker compose ps` 中 db 是否 healthy；`logs db` |
| 登录后提示网络错误 | Lighthouse 是否放行 8080；网页是否误填了服务地址（留空即可）；手机网络能否访问公网 |
| 磁盘占用 | `docker system df`；构建缓存可用 `docker builder prune` 清理 |
