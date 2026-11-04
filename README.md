# 拾日 SHIRI

待办协作与名字日历应用，面向熟人小组。产品范围与后续验收要求见 [实施方案](PLAN.md)。

- [网页客户端](原型/README.md)：React / TypeScript / Vite，提供真实账号与联网协作，也可打开 `原型/prototype.html` 选择独立本地演示。
- [鸿蒙原生客户端](harmony/README.md)：ArkTS / ArkUI Stage 工程，包含账号入口、联网协作、本机体验和系统提醒适配。已通过 HarmonyOS 5.0.1 / API 13 原生编译并生成未签名 HAP；鸿蒙 7 适配与设备运行待验。
- [协作后端](server/README.md)：Fastify / PostgreSQL，提供账号、清单、待办、词库与名字分享 API；含迁移、测试账号初始化、Compose 数据库配置和真实 PostgreSQL 集成测试。
- [正式部署](deployment/README.md)：Docker Compose、Caddy HTTPS、数据库持久化、自动备份及隔离恢复演练工具；配置已交付，尚未在服务器执行。

网页与鸿蒙联网模式连接同一协作后端；本机体验的数据各自独立，不自动上传。设备联调和部署范围见方案与各目录说明。

本轮按要求不运行测试；开发变更与未验证项目见 [开发进度](progress.md)。鸿蒙工程当前目标仍为 HarmonyOS 5.0.1 / API 13，鸿蒙 7 SDK 迁移、签名和设备验收尚未完成。
