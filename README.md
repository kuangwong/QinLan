# 拾日 SHIRI

待办协作与名字日历应用，面向熟人小组。产品范围见 [实施方案](PLAN.md)，当前实现状态与验证结果见 [STATUS.md](STATUS.md)。

- [网页客户端](原型/README.md)：React / TypeScript / Vite，默认连接协作后端；也可在 `prototype.html` 中切换本地演示。
- [鸿蒙原生客户端](harmony/README.md)：ArkTS / ArkUI Stage 工程，包含联网账号、共享协作、本机体验和系统提醒适配。已通过 HarmonyOS 5.0.1 / API 13 原生编译并生成未签名 HAP；鸿蒙 7 适配与设备运行待验。
- [协作后端](server/README.md)：Fastify / PostgreSQL，提供账号、清单、待办、词库与名字分享 API；含迁移、测试账号初始化、Compose 数据库配置和真实 PostgreSQL 集成测试。

网页在线端使用当前站点的同源 `/api/v1`，鸿蒙 APP 内置腾讯云服务地址 `http://82.157.149.117:8080`；网页本地演示和鸿蒙本机体验的数据各自独立，不自动上传。云端部署见 [DEPLOY.md](DEPLOY.md)，设备联调与鸿蒙 7 范围见 [PLAN.md](PLAN.md) 与各目录说明。
