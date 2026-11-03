# 拾日 SHIRI

待办协作与名字日历应用，面向熟人小组。产品范围与后续验收要求见 [实施方案](PLAN.md)。

- [网页交互原型](原型/README.md)：React / TypeScript / Vite，可直接打开 `原型/prototype.html`。
- [鸿蒙原生客户端](harmony/README.md)：ArkTS / ArkUI Stage 工程，包含账号入口、联网协作、本机体验和系统提醒适配。已通过 HarmonyOS 5.0.1 / API 13 原生编译并生成未签名 HAP；鸿蒙 7 适配与设备运行待验。
- [协作后端](server/README.md)：Fastify / PostgreSQL，提供账号、清单、待办、词库与名字分享 API；含迁移、测试账号初始化、Compose 数据库配置和真实 PostgreSQL 集成测试。

鸿蒙联网模式连接自行启动的协作后端；本机体验与网页原型的数据各自独立，不自动上传。设备联调和后续部署范围见方案与各目录说明。
