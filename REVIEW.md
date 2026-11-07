# 拾日项目复核（2026-11-07）

> **处理状态（2026-11-07）**：P0-1、P0-2、P1-3～P1-7 已按本报告修复；当前状态、验证命令和修复明细见 [STATUS.md](STATUS.md)。下文保留复核当时的原始描述，用于追溯问题；具体修复见文末“本次修复记录”。

## 0. 结论

项目已经从“单页浏览器原型”长成三端工程：网页客户端、Fastify/PostgreSQL 后端、ArkTS 鸿蒙客户端。按 `PLAN.md` 的第一阶段功能逐项对照，**没有发现大块缺失功能**；账号、清单/邀请/成员、任务、词库、名字记录、按月日历、分享隔离、版本冲突、前台/定时同步、鸿蒙提醒都有实现路径和测试。

**需要改，但不需要推倒重来。** 核心设计（服务端权威、版本号乐观锁、成员操作锁清单行、快照按成员裁剪、Asset Store 保存令牌、提醒对账）是合理的。问题集中在五类：

1. **安全/仓库卫生**：本机签名配置口令材料入库；邀请码出现在服务端请求日志。
2. **文档严重滞后**：`AGENTS.md`、根 README、`原型/README.md`、`server/README.md`、`harmony/ACCEPTANCE.md`、`PLAN.md` 仍把项目描述成“纯本机原型、无后端”，与当前代码相反。
3. **测试盲区**：网页在线端 `OnlineApp` 没有任何自动化测试；现有网页测试点的是内嵌的本地演示 `DemoApp`。服务端测试覆盖了鸿蒙业务层，但没有覆盖网页在线端。
4. **契约不一致**：词库宣称支持每组 1 万个、每个 300 字符，但 Fastify `bodyLimit` 只有 4 MB，最大合法词库必然 413。
5. **具体实现缺陷**：网页冲突提示会被自动刷新清掉；鸿蒙本机模式无法编辑“已完成但负责人已退出”的任务；若干日历/成员/剪贴板小问题。

下文的 P0/P1 建议在宣称“第一阶段完成”前处理；P2 是设计债和规模化问题，可以排期。

---

## 1. 项目现状

| 目录 | 角色 | 入口 | 数据 | 自动化验证 |
| --- | --- | --- | --- | --- |
| `原型/` | 网页客户端（联网模式 + 本地演示模式） | [main.tsx:3](原型/src/main.tsx#L3) 默认渲染 `OnlineApp`；演示模式内嵌 `DemoApp` | 联网：服务端；演示：localStorage | 9 项 Happy DOM 测试（5 项演示 + 4 项在线 UI） |
| `server/` | `/api/v1` 协作服务 | [main.ts](server/src/main.ts) → Fastify | PostgreSQL 18 | 26 项真实 PostgreSQL + 真实 HTTP 测试 |
| `harmony/` | ArkTS / ArkUI 原生客户端 | [Index.ets](harmony/entry/src/main/ets/pages/Index.ets) | 联网 / 本机私有文件 | 58 项业务与提醒测试，平台用例未在设备执行 |

补充事实：

- 网页在线端已实现注册/登录、服务端权限、共享清单、版本冲突、浏览器通知和 30 秒共享视图刷新，**不再是“未接后端的本机原型”**。
- 鸿蒙端同时支持联网和本机体验；联网使用 Asset Store 存令牌，本机使用 `filesDir` 中的快照文件。
- 鸿蒙当前目标是 HarmonyOS 5.0.1 / API 13；`PLAN.md` 要求鸿蒙 7，这一项目标差距仍然存在，验收记录已如实说明。
- 云端部署、HTTPS、备份恢复尚未实现，属于 `PLAN.md` 后续阶段。

### 本次实际执行的验证

```text
原型/  pnpm test           → 构建通过，9 项通过
server/ pnpm build && pnpm test          → 类型检查通过，26 项通过
harmony/ pnpm test && pnpm check:project → 58 项通过，工程引用检查通过
```

没有重跑 `pnpm build:native`：本次是 Windows 环境，仓库脚本明确只支持 Linux/macOS 官方命令行工具，也没有连接设备；`ACCEPTANCE.md` 里记录的编译结果属于历史结果，不能当作本次验证。验证产生的 `prototype.html` 差异已还原，工作区只新增本复核文件。

---

## 2. 需求覆盖对照

| 需求 | 现状 | 说明 |
| --- | --- | --- |
| 用户名密码注册登录、Argon2id | 已实现 | 服务端 Argon2id；登录/注册限流；令牌只存 SHA-256 摘要 |
| 个人/共享清单、邀请转共享 | 已实现 | 邀请码 7 天、预览后确认、撤销/轮换；服务端权限校验 |
| 任务字段、负责人、筛选排序 | 已实现 | 空负责人、成员校验、版本号、完成/恢复/删除 |
| 我的待办汇总 | 已实现 | 分配给自己的任务 + 单人清单中未分配的任务 |
| 成员管理、转让、退出、删除清单 | 已实现 | 所有者约束、未完成任务取消分配、已完成保留历史 |
| 两种起名模式、示例库、导入去重 | 已实现 | 完整名称单槽、组合 2–3 槽；BOM/空行/重复项处理 |
| 手动保存、同日多条、历史快照 | 已实现 | 服务端保存 `savedAt` 与 `archiveDate`；删词库不影响历史 |
| 个人可见、分享名称/日期、日历切换 | 已实现 | 分享时隐藏来源库与真实模式；共享清单视角 |
| 待办与起名独立 | 已实现 | 有测试覆盖 |
| 页面进入/前台/操作后/手动同步、共享视图 30 秒刷新 | 已实现 | 网页和鸿蒙均有；网页轮询只在共享任务/共享日历视角运行 |
| 失败保留输入、冲突提示、重新登录 | 已实现 | 但网页冲突提示会被自动刷新清掉，见 P1-6 |
| UTC 截止时间、设备本地归档日期 | 已实现 | 跨时区测试通过 |
| 鸿蒙系统提醒、取消/更新、权限拒绝提示 | 已实现 | 最近 30 项、对账串行、退出清理；设备行为未验 |
| 鸿蒙 7 / 真机 / 两台设备 | 未完成 | 目标 SDK、签名、NetworkKit/Asset Store/通知真机均待验 |
| 云端部署/HTTPS/备份 | 未开始 | 方案后续阶段 |

**覆盖判断**：第一阶段功能面基本齐全；真正缺的是“网页在线端的端到端验收”和“鸿蒙 7/设备验收”，不是功能设计。

---

## 3. 高优先级问题（P0 / P1）

### P0-1 本机签名配置和口令材料被提交进仓库

文件：[harmony/build-profile.json5:3-16](harmony/build-profile.json5#L3-L16)，原提交 `9e69af9 签名绑定` 引入（该提交已按本次处理撤回）。

问题：

- `signingConfigs[0].material` 包含证书、profile、p12 的**本机绝对路径**，以及 `keyPassword` / `storePassword` 字段（即使这些是 DevEco 本机加密后的字符串，也不应入库）。
- 换一台机器后这些路径和本机密钥都不存在，README 里记录的 Linux `pnpm build:native` 命令**很可能直接失败，或无法复现签名产物**。
- [harmony/ACCEPTANCE.md:59](harmony/ACCEPTANCE.md#L59) 仍写着“签名配置为空”，与现状矛盾；`.gitignore` 也没有覆盖 `.ohos/`、`*.jks` 之类文件。

建议：

1. 从受版本控制的 `build-profile.json5` 删除 `signingConfigs`，在 DevEco Studio 或 CI secrets 中按机器配置；如果需要保留模板，单独放一个不生效的示例文件。
2. 如果这段配置曾经推送/共享，**轮换密钥和口令**，仅删除文件不够。
3. 在 `.gitignore` 补齐 `*.jks`、`.ohos/` 等；更新 ACCEPTANCE 的签名描述。
4. 增加“无签名构建应可复现”的检查，避免把本机签名状态当成工程默认状态。

### P0-2 邀请码和任务搜索词进入 Fastify 请求日志

相关代码：[server/src/app.ts:29](server/src/app.ts#L29)（只 redact 了 `req.headers.authorization`）、[server/src/app.ts:139](server/src/app.ts#L139) 的 `GET /invitations/:code`、[server/src/app.ts:148](server/src/app.ts#L148) 的 `POST /invitations/:code/join`。

实测（用一个不落库的假 pool 启动 Fastify，`logger: true`）：

```text
"req":{"method":"GET","url":"/api/v1/invitations/SHIRI-…","host":"localhost:80"}
```

邀请码是“持有即可加入”的凭证，服务端只保存哈希，但**原始码会完整进入请求日志**；`GET /tasks?q=…` 也会把用户的搜索词写进日志。数据库和日志的敏感信息策略不一致。

建议：

- 最稳妥：把邀请码从 URL 移到请求体/请求头（例如 `POST /invitations/lookup` 与 `POST /invitations/join`），路由不再含秘密。
- 或配置 Fastify/Pino 的 `serializers.req` / `redact`，把 `/invitations/<code>` 和查询串掩码；同时评估是否要记录任务搜索词。
- 加一个测试：捕获 logger 输出，断言邀请码不出现在日志里。

### P1-3 文档/验收记录与代码不一致

这是“重新梳理项目”最需要先修的部分，否则后续验收会按错误前提进行：

| 文档 | 过时表述 | 建议 |
| --- | --- | --- |
| [AGENTS.md:5](AGENTS.md#L5)、[:7](AGENTS.md#L7)、[:12](AGENTS.md#L12)、[:16](AGENTS.md#L16)、[:43](AGENTS.md#L43) | 只描述 React 原型；说后端/Harmony 仍计划中；根 `src/` 为空；数据只在 localStorage；未实现真实认证 | 改为三端结构；补 server/harmony 命令；说明在线/演示两种模式；测试说明改为 Node test + 真实 PG + 鸿蒙 domain 测试 |
| [README.md:5-9](README.md#L5-L9) | 仍称网页为“交互原型”，说网页原型数据独立 | 改为“网页客户端（默认联网，可切本地演示）”，补服务端启动步骤 |
| [原型/README.md:39](原型/README.md#L39) | 说未实现真实注册、Fastify、PostgreSQL、跨设备协作、权限 | 事实已相反；补在线模式启动、测试账号、双浏览器会话说明；明确 `prototype.html` 直开只适合演示 |
| [server/README.md:3](server/README.md#L3)、[:34](server/README.md#L34) | 说网页仍是独立本机原型、尚未改为联网客户端 | 改为网页在线端已存在；补 CORS/静态部署说明 |
| [harmony/ACCEPTANCE.md:7](harmony/ACCEPTANCE.md#L7)、[:59](harmony/ACCEPTANCE.md#L59) | 说网页未完成联网协作；签名配置为空 | 更新为“网页在线端已实现但缺 E2E”；签名状态改为实际状态 |
| [PLAN.md:60](PLAN.md#L60) | 说当前工作区无应用代码、无鸿蒙构建工具 | 这是历史环境记录；要么删除，要么移到“当时环境”并补当前状态 |
| [harmony/README.md:20](harmony/README.md#L20)、[:93](harmony/README.md#L93) | API 13、鸿蒙 7 待适配 | 内容基本准确；补“网页在线端”交叉链接 |

建议新增一个简短的 `STATUS.md`（或 `docs/status.md`）作为唯一事实来源：三端状态、已验证命令、未验证项、下一步，避免同一状态散落在六个文件里。

### P1-4 网页在线端没有自动化测试

- [main.tsx:3](原型/src/main.tsx#L3) 默认渲染 `OnlineApp`。
- [prototype.test.mjs:17](原型/tests/prototype.test.mjs#L17) 点击的是“先体验本地演示”，后续 5 个用例全部走 `DemoApp`。
- [OnlineApp.tsx:3](原型/src/OnlineApp.tsx#L3) 把 `DemoApp` 作为演示模式嵌入；在线逻辑没有被这些测试触达。
- 服务端 [native-client.ts:8](server/tests/native-client.ts#L8) 只转译 `harmony/entry/.../domain/*.ets`，验证的是鸿蒙 `OnlineClient`，不是网页 `OnlineApp`。

也就是说：**服务端 + 鸿蒙业务层有真实 HTTP 联调，网页在线端只有人工验证**。而网页在线端恰恰是第一阶段的主交付。

建议：

1. 在 `原型/tests/` 增加一个真实端到端用例：启动 Fastify（可用内存/临时 PG），用 Happy DOM 或 Playwright 打开构建后的网页，填服务地址，完成注册、邀请、任务冲突、保存名字、分享、日历回看、会话过期。
2. 测试脚本加 `pretest` 或 CI 步骤，先 `pnpm build` 再测，避免测到旧的 `prototype.html`。
3. 至少覆盖“冲突后载入最新内容”和“请求失败保留输入”两条关键路径；这两条最容易回归。

### P1-5 词库容量契约与 4 MB 请求体限制冲突

- [server/src/app.ts:29](server/src/app.ts#L29)：`bodyLimit: 4 * 1024 * 1024`。
- [server/src/validation.ts:28](server/src/validation.ts#L28)：`slots` 最多 3 组、每组最多 10000 项、每项最多 300 字符。
- [server/README.md:71](server/README.md#L71) 对外宣称同样的上限。

按最大合法值计算：3 × 10000 × 300 = 9,000,000 个字符；ASCII 已约 9 MB，中文 UTF-8 约 27 MB，远超 4 MB。即使用户只导入一组 10000 条、每条 300 个中文字，也已约 9 MB，服务端会先返回 413，而不是文档里的校验提示。网页的 1 MB 限制只作用于文件导入，粘贴文本没有总字节校验；鸿蒙在保存时会对每个槽位做 1 MB UTF-8 校验，但三槽合计仍可能超过服务端 4 MB。现有测试只构造了 3 条最长候选，没有覆盖“最大合法词库”的传输路径。

建议二选一，并把三端和文档一起改：

- **收紧契约**（推荐）：例如每组最多 2000 条、每条最多 100 字符，总字节上限 2 MB；在 zod 和客户端同时校验总字节数，补一个“最大合法词库可保存”和“超出返回明确错误”的测试。
- **放宽传输**：把 `bodyLimit` 提高到 32 MB，并增加总字节校验、限流和内存保护；但这对 2 核 4 GB 的部署不友好。

无论哪种，都要让“宣称的容量”和“实际可提交的容量”一致。

### P1-6 网页冲突提示会被自动刷新清掉

相关路径：[OnlineApp.tsx:59-74](原型/src/OnlineApp.tsx#L59-L74) 的 `refresh()` 成功时无条件 `setError(''); setConflict(false)`；[OnlineApp.tsx:77-86](原型/src/OnlineApp.tsx#L77-L86) 在回到前台、30 秒轮询、切换标签/清单时都会触发；[OnlineApp.tsx:246](原型/src/OnlineApp.tsx#L246) 只有 `conflict` 为真时才显示“载入最新内容”。

后果：在共享清单中编辑任务时发生 409，弹窗显示“载入最新内容”；30 秒后轮询或切回页面，`refresh()` 成功，冲突状态被清空，按钮消失，但编辑器里仍是旧版本。用户再保存会再次 409，且找不到“载入最新内容”的入口，只能关闭重开。

建议：

- 把冲突/错误状态挂到当前 editor 上（例如 `editorConflict`），`refresh()` 不因为后台刷新就清掉它；或者编辑器打开且未保存时暂停轮询。
- `refresh()` 成功后如果发现 `editor.value.version !== latest.version`，保留冲突提示，并更新“载入最新内容”的数据来源。
- 增加一条测试：并发修改 → 409 → 等一次自动刷新 → 按钮仍在。

### P1-7 鸿蒙本机模式不能编辑“已完成但负责人已退出”的任务

服务端对这种情况有明确例外：[server/src/app.ts:208-213](server/src/app.ts#L208-L213) 在任务已完成且提交的负责人等于原负责人时跳过成员校验，以保留历史。

鸿蒙本机规则没有这个例外：[Rules.ets:43](harmony/entry/src/main/ets/domain/Rules.ets#L43) 一律要求 `list.members.includes(assignee)`。我用一个临时用例复现：

1. 在 `weekend` 创建任务并分配给 `chen`，完成；
2. 移除 `chen`（已完成任务保留 `chen`）；
3. 修改该已完成任务的标题，仍保留 `chen`；
4. `Rules.saveTask` 抛出“负责人必须是当前清单成员”。

服务端允许、鸿蒙本机拒绝，属于同一业务规则的两套实现漂移。临时用例已删除，建议转为永久回归测试。

建议：

- 在 `Rules.saveTask` 中复刻服务端条件：仅当 `existing.done && assignee === existing.assignee && 仍然是完成状态` 时允许已退出负责人；恢复为未完成时清空。
- 把“已完成任务保留历史负责人”写成共享的规则说明/测试，三端都对齐。

---

## 4. 中优先级：设计与实现债

### 4.1 网页同时维护两套完整应用

[App.tsx](原型/src/App.tsx) 是一套完整的本地演示应用（195 行、最大行 3054 字符），[OnlineApp.tsx](原型/src/OnlineApp.tsx) 是另一套完整在线应用（349 行、最大行 1514 字符）。两套都有自己的状态、表单、成员/邀请/分享逻辑，且已经出现差异：

- 在线端把所有头像颜色映射成 `sage`（[OnlineApp.tsx:188](原型/src/OnlineApp.tsx#L188)），演示端保留三色。
- 在线端有清单重命名，鸿蒙没有；在线端成员操作会关闭弹窗（[OnlineApp.tsx:337-341](原型/src/OnlineApp.tsx#L337-L341)）。
- 已完成负责人规则、冲突恢复、日期处理都是两套。
- 测试只覆盖演示端，进一步放大了漂移。

建议：保留一套 UI，把“在线 API”和“本地演示 API”抽象成同一个适配器（`load/create/update/delete`），`DemoApp` 删除或标记为冻结并从生产构建排除。这样能同时解决 50 KB 重复代码、测试盲区和长期漂移。若短期不合并，至少把演示端标记为“仅演示、不参与验收”，并给在线端补测试。

### 4.2 全量快照同步 + 全量文件重写，和词库容量上限不匹配

- [server/src/state.ts](server/src/state.ts) 的 `GET /state` 每次返回该用户所有清单、任务、词库（含全部候选词）、记录；`GET /tasks`、`GET /records` 也是先取整份快照再在内存筛选（[server/src/app.ts:186-195](server/src/app.ts#L186-L195)、[:283-289](server/src/app.ts#L283-L289)）。
- 网页在共享任务/共享日历视角每 30 秒轮询一次全量快照（[OnlineApp.tsx:82](原型/src/OnlineApp.tsx#L82)），每次切换月份/标签也会刷新（[OnlineApp.tsx:87](原型/src/OnlineApp.tsx#L87)）。
- 鸿蒙 `LocalStore.update` 对每次任务勾选都执行“复制整份状态 → 校验 → 写整份 JSON”（[LocalStore.ets:30-42](harmony/entry/src/main/ets/domain/LocalStore.ets#L30-L42)）。

在“每组 1 万条、三组词库”的宣称容量下，单次轮询/单次勾选都会搬运并校验数 MB 数据，手机上会出现卡顿和写放大。这是当前最适合提前处理的规模化设计问题。

建议：

- 服务端为任务/记录提供真正的增量接口（`updated_at` + `since`）或 ETag/If-None-Match；至少让 `GET /tasks`、`GET /records` 在 SQL 层过滤，而不是全量快照。
- 轮询只在共享视图和页面可见时跑，编辑器打开时暂停；切换月份不需要重新拉全量。
- 本机持久化改为按实体追加/分文件，或至少只在数据变化时写，避免每次勾选复制全库。

### 4.3 服务端测试没有被 TypeScript 类型检查

[server/tsconfig.json](server/tsconfig.json) 只 `include: ["src/**/*.ts"]`；`pnpm test` 通过 `tsx` 转译，不做类型检查。测试和 `scripts/*.ts` 里的类型错误不会被 `pnpm build` 发现。

建议：新增 `tsconfig.test.json`（include `tests`、`scripts`），在 `pnpm test` 前跑 `tsc --noEmit -p tsconfig.test.json`。这类问题在测试辅助代码/真实 HTTP 适配器里最容易积累。

### 4.4 连接池错误、代理与限流

- [server/src/main.ts:6](server/src/main.ts#L6) 创建 `pg.Pool` 后没有 `pool.on('error')`；空闲连接被数据库断开时，Node 可能因未处理的 `'error'` 事件退出。
- [server/src/app.ts:31](server/src/app.ts#L31) 的限流按 `request.ip`。部署在 Nginx/HTTPS 入口后，如果未设置 Fastify `trustProxy`，所有用户会共享代理 IP 的 120 次/分钟额度；日志里也只会看到代理 IP。
- 云端阶段需要 HTTPS、限流存储（多实例时内存存储不共享）和健康检查；当前是本地阶段，可接受，但应在 README 的部署章节提前写明。

建议：加 `pool.on('error', …)`、连接/语句超时；在 `main.ts` 通过环境变量显式开启 `trustProxy`；部署章节补 Nginx/HTTPS/多实例限流说明。

### 4.5 网页若干交互/状态问题

| 位置 | 问题 | 建议 |
| --- | --- | --- |
| [OnlineApp.tsx:337-341](原型/src/OnlineApp.tsx#L337-L341) | 移除成员/转让后 `run` 的默认 `done` 是 `setEditor(null)`，弹窗被关闭，想连续管理多个成员要反复打开 | 传入 `() => undefined`，或明确设计为“操作后关闭” |
| [OnlineApp.tsx:339](原型/src/OnlineApp.tsx#L339) | `navigator.clipboard` 在非安全上下文可能为 `undefined`，同步抛错，`.catch` 接不到 | 先判断 `navigator.clipboard?.writeText`，否则提示手动复制 |
| [components.tsx:4](原型/src/components.tsx#L4)、[:33](原型/src/components.tsx#L33) | `today` 是模块加载时的常量；页面跨午夜后“今天”高亮仍是昨天 | 传入当前日期或在渲染时 `dateKey(new Date())` |
| [components.tsx:31](原型/src/components.tsx#L31) | 切换月份只改 `month`，`selected` 仍是上个月的日期，右侧面板显示上个月某天 | 切月时把 `selected` 设为新月份 1 日，或明确保留并显示 |
| [OnlineApp.tsx:188](原型/src/OnlineApp.tsx#L188) | 在线端所有头像颜色都是 `sage`，和设计稿/演示端不一致 | 由服务端返回颜色或按 id 稳定映射 |
| [OnlineApp.tsx:246](原型/src/OnlineApp.tsx#L246) | 冲突提示被全局刷新清空（P1-6） | 见 P1-6 |

### 4.6 鸿蒙若干一致性问题

| 位置 | 问题 | 建议 |
| --- | --- | --- |
| [Index.ets:176-181](harmony/entry/src/main/ets/pages/Index.ets#L176-L181) | `normaliseScopes` 只检查 `calendarScope` 是否仍是成员清单，不检查 `members.length > 1`；共享清单变为单人后，日历选择项消失但 `calendarScope` 仍指向它，显示空日历 | 与网页一致，`members.length <= 1` 时重置为 `mine` |
| [Index.ets:524-525](harmony/entry/src/main/ets/pages/Index.ets#L524-L525) | 任务页顶部的“待办/已完成”统计固定用 `scope='mine'`，查看共享清单时统计与下方列表范围不一致 | 用当前 `scope` 统计 |
| [Index.ets:542-545](harmony/entry/src/main/ets/pages/Index.ets#L542-L545) | 负责人筛选列出所有 `people`，不只当前清单成员；在清单视角下会出现必然无结果的选项 | 与网页一致，按当前清单成员过滤 |
| [Index.ets:633-637](harmony/entry/src/main/ets/pages/Index.ets#L633-L637) | 任务表单负责人下拉已按清单成员过滤；这与上面的筛选范围不一致 | 统一两处的人员范围 |
| [Rules.ets:43](harmony/entry/src/main/ets/domain/Rules.ets#L43) | 已完成任务的历史负责人例外缺失（P1-7） | 见 P1-7 |
| [OnlineClient.ets:94-98](harmony/entry/src/main/ets/domain/OnlineClient.ets#L94-L98) / [Codec.ets:4](harmony/entry/src/main/ets/domain/Codec.ets#L4) | 服务端快照不合法时，报“本地数据格式不兼容”，文案误导 | 区分“本地快照损坏”和“服务端数据不兼容” |
| [Index.ets:287-313](harmony/entry/src/main/ets/pages/Index.ets#L287-L313) | 创建请求网络失败时没有网页那样的 `uncertain` 处理：可能实际已写入，但界面提示保存失败；依赖用户刷新/重试 | 增加“结果未知，先刷新确认”的恢复路径，或统一到 Web 的 uncertain 模型 |

### 4.7 隐私边界需要明确：分享记录的 `savedAt`

服务端对共享记录返回 `savedAt`（[state.ts:42-46](server/src/state.ts#L42-L46)），而 [server/README.md:73](server/README.md#L73) 说“分享只暴露名称和日期”。`savedAt` 是可精确到秒的保存时间，虽然 UI 没展示，但 API 已经暴露。

建议：非所有者记录返回 `savedAt: ''` 或直接省略，并同步三端类型；如果产品上认为保存时间也需要共享，则改 README 的表述。

### 4.8 `prototype.html` 直开无法使用在线模式

网页在线模式在 `file://` 下会向相对地址发请求；如果填局域网服务地址，浏览器会带 `Origin: null`，而服务端默认 CORS 只允许 `http://localhost:5173` / `http://127.0.0.1:5173`。因此**直接双击 `prototype.html` 只能稳定使用本地演示**，在线模式需要通过 Vite/静态服务器代理。

建议：在 [原型/README.md](原型/README.md) 明确“直开 = 演示；联网 = `pnpm dev`/同源反向代理”，不要在 UI/文档上暗示直开可联网。若确实要支持 `file://`，不建议简单放行 `null` 源，而是提供同源静态服务。

### 4.9 其他工程债

- 没有 CI；三端测试和构建全靠手工，容易漏跑。建议加一条最小流水线：`原型 build+test`、`server build+test`、`harmony test+check:project`。
- 没有 lint/format 脚本；`App.tsx` 单行最长 3054 字符，`OnlineApp.tsx` 1514 字符，review 成本高。建议加 Prettier/ESLint（网页/服务端）和 ArkTS lint，或至少拆分巨行 JSX。
- `harmony/Index.ets` 900 行，单组件承担认证、同步、CRUD、表单、导航、提醒和 UI；后续可拆成页面/视图模型。
- `migrate` 只记录迁移文件名，不校验 checksum；有人修改已应用迁移时不会报错。建议记录 checksum。
- [build-standalone.mjs](原型/scripts/build-standalone.mjs) 只取第一个 JS/CSS 资源；一旦 Vite 产生多 chunk 或额外 CSS，单文件构建会漏资源。
- `prototype.html` 是入库的生成物，测试读它；建议 CI 校验“重新构建后无差异”，避免测旧产物。

---

## 5. 小问题清单（P3）

| 问题 | 位置 | 建议 |
| --- | --- | --- |
| 服务端错误码 `ALREADY_EXISTS` 对用户名冲突也返回“名称或记录已存在” | [app.ts:47](server/src/app.ts#L47) | 按约束名/表区分用户名、邀请码、客户端 ID 冲突 |
| `CORS_ORIGINS` 不 trim，空字符串会被当成空数组 | [main.ts:7](server/src/main.ts#L7) | 解析时 `map(trim).filter(Boolean)`，空则用默认 |
| 登录时清理过期会话是全局 DELETE | [app.ts:57](server/src/app.ts#L57) | 数据量大时改为后台任务/索引清理 |
| 记录归档日期完全信任客户端，可任意回填/未来日期 | [validation.ts:34](server/src/validation.ts#L34) | 如需限制，校验与服务器当前日期偏差；否则在文档写明 |
| 分享记录列表最多 100 个清单 | [validation.ts:36](server/src/validation.ts#L36) | 熟人小组够用；文档说明 |
| 成员退出/被移除后，其分享到该清单的名字记录仍保留 | 服务端 `removeMember` / 本地 `Rules.removeMember` | 产品上明确“保留快照”还是“退出即撤回”；当前行为是保留 |
| 邀请码预览在已加入时返回 `alreadyJoined`，本地规则直接抛错 | [Rules.ets:103-107](harmony/entry/src/main/ets/domain/Rules.ets#L103-L107) | 本机模式可复用预览语义 |
| 提醒 ID 是 31 位哈希，冲突会让整轮对账失败 | [Reminders.ets:30-35](harmony/entry/src/main/ets/domain/Reminders.ets#L30-L35) | 概率极低；可在冲突时改用稳定映射/报错降级 |
| 网页全局 `setClock` 每秒重渲染整个应用 | [OnlineApp.tsx:88](原型/src/OnlineApp.tsx#L88) | 改为 30 秒/分钟或只在到期列表使用 |
| 网页切换清单/月份都会触发一次全量刷新 | [OnlineApp.tsx:87](原型/src/OnlineApp.tsx#L87) | 月份切换不需要网络；清单切换可缓存 |
| `savedAt` 不展示 | 三端 | 需求只要求保存，不要求展示；如要展示再补 |
| 鸿蒙无清单重命名，网页有 | 两端 members 页 | 需求未要求；若保留差异，文档写明 |

---

## 6. 建议的修改顺序

1. **止血（半天）**
   - 移除/轮换签名配置，更新 `.gitignore` 和 ACCEPTANCE。
   - 处理邀请码日志（移出 URL 或 redact），加日志断言测试。
   - 修正文档：AGENTS、README、原型 README、server README、ACCEPTANCE、PLAN 环境段。
2. **第一阶段验收前（1–2 天）**
   - 修网页冲突提示被刷新清掉（P1-6）。
   - 统一词库容量契约和 `bodyLimit`（P1-5）。
   - 补网页在线端 E2E（P1-4），至少覆盖登录、邀请、冲突、保存名字/分享。
   - 修鸿蒙已完成负责人编辑（P1-7），加永久测试。
3. **结构治理（排期）**
   - 合并演示/在线两套网页 UI，或明确冻结演示端。
   - 设计增量同步/服务端过滤，避免全量快照 + 全量文件重写。
   - 补 CI、lint/format、测试类型检查。
4. **鸿蒙/云端阶段**
   - 鸿蒙 7 SDK、签名、真机、两台设备、NetworkKit/Asset Store/通知验收。
   - HTTPS、Nginx/trustProxy、限流存储、备份恢复。

---

## 7. 需要确认的产品/工程决策

1. **签名配置**：已确认清理。上个提交 `9e69af9` 已从本地分支撤回，并清理了 reflog/旧对象；本地 `origin/master` 为 `54dfa69`。本次网络无法访问 GitHub，未能在线复核远端；如果这个提交曾从其他机器推送、复制或备份，仍需轮换。证书仍在 `~/.ohos/config`，不需要重新生成，只需在 DevEco 重新绑定。
2. **词库容量**：已确认收紧到每组 2000 个候选、每个候选 100 字符；记录字段保留 900 以兼容历史。
3. **分享撤回**：成员退出/被移除时，之前分享到该清单的名字记录是保留还是撤回？当前服务端和本机规则都是保留。
4. **演示端**：是否接受删除 `DemoApp`、把本地体验改成“同一 UI + 本地适配器”？这是消除漂移和测试盲区最彻底的方式，但需要一轮改造。

---

## 8. 本次修复记录（2026-11-07）

| 项目 | 处理 |
| --- | --- |
| P0-1 签名配置 | 撤回上一个本地提交 `9e69af9` 并清理 reflog/旧对象；当前 `build-profile.json5` 的 `signingConfigs` 为空数组，工作树不包含口令；`.gitignore` 增加 `.ohos/`、`*.jks`、`*.keystore`；网页/鸿蒙/验收文档改为“本机配置、不可提交”。若未推送/共享则无需轮换，证书仍在 `~/.ohos/config`。 |
| P0-2 日志与邀请码 | 邀请码改为 `POST /api/v1/invitations/lookup` 与 `POST /api/v1/invitations/join` 的请求体；[serializeRequest](server/src/app.ts) 去掉查询串并掩码邀请码路径；新增日志脱敏测试，并用实际 Fastify 日志验证。 |
| P1-3 文档 | 重写 [AGENTS.md](AGENTS.md)、[README.md](README.md)、[原型/README.md](原型/README.md)；更新 [server/README.md](server/README.md)、[harmony/README.md](harmony/README.md)、[ACCEPTANCE.md](harmony/ACCEPTANCE.md)、[PLAN.md](PLAN.md)；新增 [STATUS.md](STATUS.md)。 |
| P1-4 网页在线测试 | 新增 [原型/tests/online.test.mjs](原型/tests/online.test.mjs)，覆盖登录、任务创建、409 冲突恢复、保存名字、日历分享、邀请生成与加入；`pnpm test` 现在会先构建。 |
| P1-5 词库容量 | 三端统一为每组 2000 个候选、每个候选 100 字符；记录字段保留 900 以兼容历史。服务端/鸿蒙/在线客户端测试均已更新。 |
| P1-6 冲突提示 | [OnlineApp.tsx](原型/src/OnlineApp.tsx) 增加 `editorConflict` 与打开编辑器时的版本对比；自动刷新保留“载入最新内容”，在线测试覆盖。 |
| P1-7 已完成负责人 | [Rules.ets](harmony/entry/src/main/ets/domain/Rules.ets) 复刻服务端例外；新增永久回归测试，鸿蒙 58 项通过。 |

当前验证：网页 9 项、服务端 26 项、鸿蒙 58 项全部通过。P2 设计债（双 UI、快照同步、CI/lint 等）尚未处理。

---

## 附：本次复核的边界

- 本次实际运行了三端的构建/测试（网页、服务端、鸿蒙 domain/工程检查），**没有**重跑 HarmonyOS 原生编译、设备 Hypium、真机通知、两台设备同步。
- 复核时的临时复现测试已删除；随后按 P0/P1 的修复和验证结果见 [STATUS.md](STATUS.md) 和文末“本次修复记录”。
- 复核依据为 `PLAN.md` 与当前代码，不包含对“鸿蒙 7 是否已具备工具链”的外部环境判断；该部分以 `ACCEPTANCE.md` 的历史记录为准。
