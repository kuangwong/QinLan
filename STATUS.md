# 拾日项目状态

更新日期：2026-11-08。需求以 [PLAN.md](PLAN.md) 为准；本文件只记录“当前代码做到了什么、验证到哪一步”。

## 总览

| 部分 | 状态 | 入口 | 自动化验证 |
| --- | --- | --- | --- |
| 网页客户端 | 联网模式 + 本地演示可用 | [原型/src/main.tsx](原型/src/main.tsx) | 9 项 Happy DOM，含 4 项在线 UI |
| 协作后端 | 账号/清单/邀请/任务/词库/名字/分享 API 可用 | [server/src/main.ts](server/src/main.ts) | 26 项真实 PostgreSQL |
| 鸿蒙客户端 | 联网 + 本机体验 + 系统提醒代码完成 | [harmony/entry/src/main/ets/pages/Index.ets](harmony/entry/src/main/ets/pages/Index.ets) | 58 项业务/提醒测试 |
| 鸿蒙 7 / 真机 | 未验收 | — | 需要 SDK、签名、设备 |
| 云端部署 | 已部署到 82.157.149.117（HTTP 8080，Lighthouse 公网端口待放行） | [DEPLOY.md](DEPLOY.md) | 健康检查、容器/数据库重启、备份恢复已验证 |

## 最近验证

```text
原型/    pnpm build → 生产构建通过
server/  pnpm build && pnpm test → 26 项通过
云端     api / web / db 均为 healthy；/health 通过；reboot 后自启；pg_dump 恢复演练通过
```

未重跑 `pnpm build:native`：当前是 Windows 环境，仓库脚本只支持 Linux/macOS 命令行工具，也没有连接设备。`ACCEPTANCE.md` 中的 HAP 编译记录属于历史结果。

## 已完成的最近修复

- 本仓库不包含 HarmonyOS 签名配置和口令字段；`.gitignore` 增加 `.ohos/`、`*.jks`、`*.keystore`。上个提交 `9e69af9` 已从本地分支撤回，并清理了 reflog 和旧对象，本地 `origin/master` 为 `54dfa69`；工作树的 `signingConfigs` 已恢复为空数组。本次无法联网复核 GitHub；如果这个提交曾从其他机器推送、复制或备份，仍需轮换密钥。证书和 p12 仍在 `~/.ohos/config`，不需要重新生成，只需在 DevEco 重新绑定。
- 邀请码从 URL 移到请求体（`POST /invitations/lookup`、`POST /invitations/join`）；Fastify 请求日志移除查询串并掩码邀请码路径，Authorization 继续脱敏。
- 词库上限统一为每组 2000 个候选、每个候选 100 字符；记录字段保留 900 字符以兼容历史。旧版超限词库仍可读取，编辑保存前需要缩减。
- 网页冲突状态在自动刷新后保持，“载入最新内容”不会消失；新增在线 UI 测试覆盖任务创建、409 恢复、保存名字、日历分享、邀请生成与加入。
- 鸿蒙本机规则允许“已完成但负责人已退出”的任务继续编辑，并增加回归测试。
- 文档更新：AGENTS、根 README、网页/服务端/鸿蒙 README、PLAN 环境说明和 ACCEPTANCE。

## 已知边界

- 网页在线端测试使用确定性假 API 覆盖 UI 流程；真实服务端契约由 `server/tests` 的真实 PostgreSQL 测试保证。
- 鸿蒙 NetworkKit、Asset Store、ArkUI、通知和系统提醒仍需要设备验收；两台设备共享同步未执行。
- 云端目前只有 HTTP 8080，没有域名和 HTTPS；Lighthouse 防火墙放行后公网可访问，暂不适合放入真实敏感数据。
- 网页直开 `prototype.html` 仅保证本地演示；联网请使用 Vite/同源反向代理。
- 没有离线编辑、远程推送、周期任务、附件、聊天或 AI 起名。

## 待办（非第一阶段阻塞）

- 合并或冻结网页演示/在线两套 UI，避免规则漂移。
- 为快照同步增加 `updated_at`/ETag/增量接口；`GET /tasks`、`GET /records` 在 SQL 层过滤。
- 服务端测试类型检查、CI、lint/format。
- 分享记录是否在成员退出时撤回，需要产品确认。
- 云端 HTTPS 与域名备案、Lighthouse 8080 公网端口验证。
