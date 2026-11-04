# 拾日正式部署交付

此目录提供 HTTPS、数据库持久化、独立迁移、定期备份及恢复演练配置。**本轮仅完成源码与配置，未运行 Docker、构建、测试或实际部署；以下命令需要在具备环境后执行并验收。** 鸿蒙 7 SDK、开发签名和真机验收仍按 `harmony/README.md` 进行，容器交付不替代设备验收。

## 准备与首次启动

目标为 Ubuntu 24.04 LTS 等 Linux 主机，建议至少 2 核、4 GB 内存、40 GB SSD；安装 Docker Engine 与 Compose v2。构建过程在容器内使用 Node.js 24 与 pnpm 11.25.0，后端运行 Fastify，数据库使用 PostgreSQL 18。源代码中的锁文件参与冻结安装，不需要主机安装 Node.js。

域名 A/AAAA 记录指向服务器，放行 TCP 80/443 与可选 UDP 443；80 用于证书签发及 HTTP 跳转 HTTPS。数据库与 API 没有宿主机端口映射。中国大陆公网部署须按接入要求准备域名备案等手续。Caddy 向公开 ACME 服务申请证书，需要正确域名和公网可达性。

在项目根目录执行：

```bash
cd deployment
cp .env.example .env
# 编辑 .env：SHIRI_DOMAIN 填域名（不带协议和路径），填写证书邮箱。
# POSTGRES_PASSWORD 换成至少 32 位随机字母数字，避免 URL 特殊字符。
chmod 600 .env
mkdir -p backups
chmod 700 backups
docker compose build
docker compose up -d
docker compose ps -a
docker compose logs migrate api web backup
```

`migrate` 是一次性容器，成功退出代码为 0；只有迁移成功，API 才能启动，API 健康后才启动网页。API 正常运行后访问 `https://你的域名/health`，应返回 `{"status":"ok"}`。打开网站注册账号；正式部署不会自动创建测试账号。网页连接设置留空即可同源访问 `/api/v1`，鸿蒙填写 `https://你的域名`。

Caddy 负责静态网页、`/api/*` 与 `/health` 代理，自动跳转 HTTPS 和续期证书。数据库数据保存在 Compose `shiri_database` 卷，证书保存在 `shiri_certificates` 卷。不要用 `docker compose down -v` 管理正式服务，它会删除这些持久卷。项目名固定为 `shiri`，同一主机部署多个实例时必须为每个实例设置独立的 Compose 项目名、域名、端口和备份目录。

API 使用 `TRUST_PROXY=1` 只信任一跳反代，以便按真实客户端地址限流；API 不发布宿主机端口，流量经 Caddy 进入。不要在保留这项信任配置时把 API 端口直接公开。如在 Caddy 前再加 CDN 或其他反代，需重新配置完整可信代理关系，不能直接相信任意客户端传入的转发头。

本地联调继续使用根目录 `compose.yaml` 及前后端开发命令；该配置只启动回环地址上的数据库。局域网开发服务的 HTTP 地址与本目录的公网 HTTPS 部署是两套使用方式。不要为公网调试直接开放数据库端口。

## 升级

升级时安排维护窗口，记录当前源代码提交或版本，并保留对应镜像用于回滚。先构建新镜像，构建失败时旧服务仍可继续运行；然后停写、备份、迁移并启动。所有命令从 `deployment/` 运行。

```bash
docker compose build
docker compose stop web api backup
docker compose run --rm --no-deps --entrypoint /bin/sh backup /scripts/backup.sh once
# 备份成功后才继续。强制重建迁移容器，不能复用上次已成功退出的容器。
docker compose up --force-recreate --no-deps --abort-on-container-exit --exit-code-from migrate migrate
# 只有上一步退出为 0 才执行：
docker compose up -d api web backup
docker compose ps -a
docker compose logs --tail=100 api web backup
```

不要直接重启 API 代替数据库迁移。迁移失败时保持停写，查看迁移日志并处理，不能忽略退出状态。回滚涉及数据库时，使用升级前备份和**与备份一致的应用版本**；不能只回退镜像并假定新表结构兼容旧代码。修改 `.env` 中密码不会修改已有数据库用户的密码；更换密码需要维护窗口内修改 PostgreSQL 用户密码，并同步更新配置后重建相关服务。

## 自动及手动备份

`backup` 服务启动后立即备份，以后按 `BACKUP_INTERVAL_SECONDS`（默认 86400 秒）间隔运行，采用 UTC 文件名。`pg_dump` 生成一致性自定义格式归档，`pg_restore --list` 检查目录可读，再原子发布 `.dump` 与 SHA-256 校验文件。只有新备份成功后才按 `BACKUP_RETENTION_DAYS` 清理旧归档，默认 14 天；`find -mtime` 按完整的 24 小时计算，实际保留可能多一天。失败写入容器错误日志并保留旧备份。单次备份失败后，循环会在下个间隔重试，需定期检查日志和最新归档时间。

```bash
docker compose run --rm --no-deps --entrypoint /bin/sh backup /scripts/backup.sh once
docker compose logs --tail=100 backup
ls -lh backups
```

每份备份是一对 `shiri-日期-随机后缀.dump` 和同名 `.dump.sha256` 文件；两者均需保留。`pg_restore --list` 和摘要校验不能证明业务数据可恢复，必须执行下述隔离恢复演练。运行中的一致性备份可正常读取；升级及正式恢复前还应停写后另外备份。

备份含账号哈希、会话和用户数据，目录必须限制访问并复制到另一台主机或对象存储，以免单机磁盘损坏同时丢失数据库和备份。当前交付自动创建本机归档；异地保存的凭据和目的地由部署方配置。磁盘空间、备份失败告警和异地副本仍需部署方监控。

## 隔离恢复演练

`restore-check` 使用独立的临时内存文件系统，不挂载正式数据卷，不开放端口；容器被删除后演练数据消失。演练所需内存取决于数据库大小，较大数据库应在独立主机按同样流程使用单独临时磁盘，不要修改为正式数据卷。以下将 `shiri-实际文件名.dump` 替换成已有备份的文件名，保持对应校验文件存在。

```bash
docker compose --profile restore-check up -d --wait restore-check
docker compose exec -e PGUSER=shiri -e PGDATABASE=restore_check -e SHIRI_CONFIRM_RESTORE=restore_check restore-check /bin/sh /scripts/restore.sh shiri-实际文件名.dump
docker compose exec restore-check psql -U shiri -d restore_check -v ON_ERROR_STOP=1 -c 'SELECT name, applied_at FROM schema_migrations ORDER BY name;'
docker compose exec restore-check psql -U shiri -d restore_check -v ON_ERROR_STOP=1 -c 'SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM lists) AS lists, (SELECT count(*) FROM tasks) AS tasks, (SELECT count(*) FROM name_records) AS records;'
# 对照备份时间及业务预期检查数量、抽查数据；保存演练记录后清理。
docker compose --profile restore-check rm -sf restore-check
```

恢复脚本先核对 SHA-256，再读取归档目录，只有明确设置与目标库同名的 `SHIRI_CONFIRM_RESTORE` 才修改数据库。恢复使用 `--single-transaction --exit-on-error`，任一 SQL 失败即回滚，不会继续执行后续对象。演练返回成功后仍须检查预期数据，不应将“有备份文件”当作恢复验收。

## 正式恢复

恢复会替换归档包含的数据库对象。先确认目标、应用版本及维护窗口；不要在有活跃写入的情况下执行。只恢复本项目、受信任的数据库备份，并确保没有新版本遗留的额外结构；跨版本恢复应使用独立空数据库而不是覆盖一个结构不同的库。

```bash
docker compose stop web api backup
# 先另存故障现场。此备份失败时应调查原因，不要直接覆盖唯一数据库。
docker compose run --rm --no-deps --entrypoint /bin/sh backup /scripts/backup.sh once
# 恢复前先按上一节在隔离库演练待恢复文件。
docker compose run --rm --no-deps --entrypoint /bin/sh -e SHIRI_CONFIRM_RESTORE=shiri backup /scripts/restore.sh shiri-实际文件名.dump
```

若恢复命令失败，保持服务停止并查看错误。恢复成功后，用数据库检查命令核对迁移和预期数据；确认应用版本对应后再启动。如果恢复的是旧版备份、计划运行新版应用，先执行对应版本的迁移，然后启动：

```bash
docker compose exec db psql -U shiri -d shiri -v ON_ERROR_STOP=1 -c 'SELECT name FROM schema_migrations ORDER BY name;'
# 使用目标应用版本的镜像执行迁移；只有返回 0 才启动服务。
docker compose up --force-recreate --no-deps --abort-on-container-exit --exit-code-from migrate migrate
docker compose up -d api web backup
```

恢复后使用两个浏览器账号核对数据隔离、共享清单和名字历史，以及健康检查与备份重新执行情况。将使用的归档、摘要、应用版本、执行时间及核对结果记录下来；恢复会恢复备份时仍有效的会话，若涉及凭据泄漏，应在维护窗口另行撤销会话并重置相关凭据。
