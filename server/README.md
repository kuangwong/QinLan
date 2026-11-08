# 拾日协作服务

Node.js 22.9+、TypeScript、Fastify 和 PostgreSQL 18。网页客户端（`原型/`，默认联网，也可切换本地演示）和鸿蒙客户端都通过 `/api/v1` 使用真实账号、清单和名字记录。

## 本地启动

需要 Node.js、pnpm 11.25.0 和 Docker Compose。项目根目录执行：

```bash
cp .env.example .env
# 修改 .env 中的 POSTGRES_PASSWORD
docker compose up -d db
cd server
cp .env.example .env
# 修改 DATABASE_URL 的密码，与根目录 .env 保持一致
pnpm install --frozen-lockfile
pnpm migrate
pnpm seed
pnpm dev
```

`pnpm seed` 使用 `server/.env` 中自行设置的 `DEMO_PASSWORD` 创建 `xiaoman`、`yizhou` 两个测试账号。已有账号不会被重置；生成的初始化登录会话立即撤销。也可以不运行 seed，直接在客户端注册。默认服务地址为 `http://127.0.0.1:3000`，`GET /health` 同时检查数据库连接。

生产构建及运行：`pnpm build`，然后 `pnpm start`。迁移需要单独执行，不会在服务启动时修改表结构。数据库文件位于 Compose 的 `shiri-db` 持久卷，`docker compose down` 会保留数据。

升级已有数据库时，停止旧服务，运行 `pnpm migrate` 后再启动新版。`002_combined_name_length.sql` 是历史迁移，把名字记录字段上限从 300 扩展为 900，保留旧数据兼容；当前词库每组上限已收紧为 2000 个候选、每个候选 100 字符，新生成的组合名称最多 300 字符。若有遗漏迁移，服务启动会报出迁移文件并退出。

## 手机与云端

鸿蒙 APP 已内置腾讯云服务地址 `http://82.157.149.117:8080`，登录页不再要求填写服务地址。需要让手机连接本地开发服务时，把 `harmony/entry/src/main/ets/domain/OnlineClient.ets` 的 `DEFAULT_SERVER` 改为电脑局域网地址（如 `http://192.168.1.10:3000`），同时将 `server/.env` 的 `HOST` 设置为 `0.0.0.0` 并重启服务，手机和电脑需在同一网络。手机上的 `127.0.0.1` 指向手机自身。PostgreSQL 仍只绑定电脑回环地址；客户端只连接 HTTP 服务。

本地明文 HTTP 用于开发联调。正式服务应通过 HTTPS 入口访问；服务日志隐藏 Authorization，并去掉查询串、掩码邀请码路径，数据库只保存密码的 Argon2id 哈希、登录令牌及邀请码的 SHA-256 摘要。原始邀请码只在创建时返回，通过请求体提交，不进入 URL 和访问日志；服务重启后无法重新显示原码，可以撤销或重新生成。

浏览器的默认开发地址由 Vite 代理到本服务；其他前端来源配置 `CORS_ORIGINS`，多个地址用逗号分隔。网页在线端已连接本服务；直接双击 `prototype.html` 只适合本地演示，联网请使用 `pnpm dev` 或同源反向代理。

## 验证

```bash
pnpm build
pnpm test
```

测试自动启动临时、真实的 PostgreSQL 18，运行迁移、双账号权限、并发场景和请求日志脱敏，最后停止数据库并删除临时目录。当前 26 项通过。无需 Docker，也不读取 `DATABASE_URL`；不能用 root 运行 PostgreSQL 测试。首次安装会下载当前平台的 PostgreSQL 二进制，pnpm 配置仅允许 Argon2、esbuild 和已列出的 PostgreSQL 平台包运行安装脚本。

还会把**实际鸿蒙业务层源码**中的 `OnlineClient.ets` 转为临时 JavaScript，通过真实 HTTP 完成注册、邀请、共享编辑、词库、名字分享和恢复登录测试。此测试使用 Node 的 HTTP 与内存凭据适配器，不证明鸿蒙 NetworkKit、Asset Store、ArkUI 或真机通知已通过。网页在线端的 UI 流程由 `原型/tests/online.test.mjs` 使用确定性假 API 覆盖，服务端契约由本目录的真实 PostgreSQL 测试保证。

## 接口

除注册、登录和健康检查外，需要 `Authorization: Bearer <token>`。成功登录有效期为 30 天；退出撤销当前设备会话。所有数据响应都使用 `Cache-Control: no-store`。

| 方法与路径 | 用途 |
| --- | --- |
| `POST /api/v1/auth/register`、`/auth/login`、`/auth/logout` | 注册、登录、退出 |
| `GET /api/v1/me`、`/state` | 当前身份、完整的可访问数据快照 |
| `GET/POST /api/v1/lists` | 查询/新建清单 |
| `PATCH/DELETE /api/v1/lists/:id` | 所有者重命名/删除清单 |
| `POST/DELETE /api/v1/lists/:id/invitation` | 所有者生成/撤销七天邀请码 |
| `POST /api/v1/invitations/lookup`、`/invitations/join` | 用请求体中的邀请码预览并确认加入 |
| `DELETE /api/v1/lists/:id/members/:userId` | 退出或由所有者移除成员 |
| `POST /api/v1/lists/:id/transfer` | 转让所有权，撤销旧邀请 |
| `GET /api/v1/tasks`、`POST /api/v1/lists/:id/tasks` | 查询/创建待办 |
| `PATCH/DELETE /api/v1/tasks/:id` | 修改/删除待办 |
| `GET/POST /api/v1/libraries`、`PUT/DELETE .../:id` | 个人词库管理 |
| `GET/POST /api/v1/records`、`DELETE .../:id` | 名字记录查询、保存、删除 |
| `PATCH /api/v1/records/:id/shares` | 替换分享目标，也可撤回全部分享 |

创建清单、待办、词库和记录可提供可选 UUID `id`；鸿蒙端为一次创建意图复用同一 ID，网络结果不确定时重试不会新增重复记录，已存在会返回 409，需刷新确认。新的一次名字生成使用新的 ID，因此同名、同日多条仍可保存。

更新/删除需要最新 `version`，过期返回 `409 CONFLICT`；词库更新体为 `{ "version": 1, "data": { "name": "词库", "mode": "full", "slots": [["月亮邮差"]] } }`。任务更新包含 `title`、`note`、`assignee`、`due`、`done`、`version`；未分配或无截止时间传空字符串，截止时间传 ISO 8601 时间戳。

词库每组支持 1–2000 个非空候选，每个候选最多 100 字符；完整名称只有一组，组合模式有两至三组。记录名称字段最多 900 字符，兼容历史数据；当前合法三组拼接结果最多 300 字符。旧数据库中超过新上限的词库仍可读取，但编辑保存前需要先缩减候选。

`GET /tasks` 支持 `listId`、`status=pending|done|all`、`assignee`、`q`；`GET /records` 支持 `scope=mine|清单UUID` 和 `month=YYYY-MM`。保存名字传 `name`、`mode`、`source` 和保存时的本地 `date=YYYY-MM-DD`，服务端保存 UTC 时间。分享返回名称、归档日期和保存时间，其他成员不会得到来源库名称、候选词或真实生成模式。

业务错误格式：`{"error":{"code":"CONFLICT","message":"内容已被其他成员修改，请刷新后重新编辑"}}`。客户端应保留表单输入，刷新后由用户确认，不能静默覆盖。

## 仍待完成

鸿蒙 7 SDK 编译与签名、NetworkKit/Asset Store 设备联调、两台鸿蒙设备的共享同步和后台提醒验证仍需开发环境。本轮自动化验证未使用 Docker，Compose 启动命令尚未实测；自动化验证使用与其相同主版本的真实 PostgreSQL。云端部署和数据库备份/恢复按根目录 `PLAN.md` 后续推进。
