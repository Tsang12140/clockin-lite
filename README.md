<<<<<<< HEAD
# clockin-lite
小微工厂的轻量 AI 考勤与工资统计工具。Simple AI attendance and payroll for small factories.
=======
﻿# Clockin Lite 小厂记工

Clockin Lite 是一个给小微工厂和作坊使用的轻量 AI 考勤、记工与工资统计工具。它使用 Postgres 存储数据，首次启动后通过 `/setup` 配置工厂简称和管理员账号，不依赖任何外部私有项目或预置业务数据。

## 功能

- 员工、工价历史、每日考勤录入
- 月度工资汇总、工资条、Excel 导出
- 单休、双休、大小周排班
- 中国法定节假日提示与调休日识别（内置 2025/2026 数据）
- 加班倍率：工作日、休息日、法定节假日
- 演示数据模式与 `seed-demo.sql`
- 天气提醒（可选 QWeather）
- AI 助手（可选 API Key）
- 本地 SQL 备份、手动下载、S3 兼容备份

## 快速开始

### 1. 准备环境

需要 Node.js 20+、npm、Docker。复制环境变量示例：

```bash
cp .env.example .env.local
```

修改 `.env.local` 中的 `SESSION_SECRET`，生产环境必须使用随机长字符串。

### 2. 启动 Postgres

```bash
docker compose up -d db
```

默认数据库连接：

```text
postgresql://clockin:clockin@localhost:5432/clockin
```

### 3. 启动开发服务

```bash
npm install
npm run dev
```

打开 `http://localhost:3000/setup`，按向导创建管理员账号。之后使用管理员手机号和 6 位数字密码登录。

## Docker 运行

完整容器运行：

```bash
cp .env.example .env
docker compose up --build
```

访问 `http://localhost:3000/setup`。`docker-compose.yml` 会启动 `db` 和 `app` 两个服务，并把数据库数据保存在 `clockin-postgres-data` volume。

## Vercel 分支部署

如果要把某个分支作为对外演示版，可以在 Vercel 导入 Git 仓库后，把该分支设为 Production Branch，或者保留主分支为生产环境、使用该分支自动生成的 Preview Deployment。

Vercel 部署必须连接外部 Postgres，例如 Neon、Supabase 或 Vercel Marketplace 里的 Postgres 服务。至少需要配置：

```text
DATABASE_URL=
SESSION_SECRET=
AI_CONFIG_SECRET=
```

注意：Vercel 的函数文件系统不适合作持久存储。本地备份文件和 `.runtime/ai-config.json` 不应依赖在 Vercel 上长期保存；AI 建议通过环境变量配置，备份建议用 S3 兼容存储。

## 演示数据

项目提供 `seed-demo.sql`，包含假名员工与示例考勤。导入后可在设置页打开“演示数据”开关查看，不会覆盖真实数据。

```bash
psql "$DATABASE_URL" -f seed-demo.sql
```

如果这是公开演示库，并希望默认显示这批假数据，请先完成 `/setup`，再执行：

```bash
psql "$DATABASE_URL" -c "UPDATE clockin.tenant_config SET demo_mode = TRUE WHERE id = 1;"
```

## 可选配置

天气：可在设置页填写 QWeather Key 和地区码，也可以使用环境变量：

```text
QWEATHER_KEY=
QWEATHER_LOCATION=
QWEATHER_CITY=
```

AI：未配置时右下角入口会打开配置向导；配置完成后可直接聊天，手动关闭后入口会隐藏。可在设置页或开发者设置页配置。

备份：本地备份命令：

```bash
npm run backup:local
```

S3 兼容备份可在设置页配置，也可通过 `BACKUP_S3_*` 环境变量提供。

## 重要脚本

```bash
npm run dev
npm run build
npm run start
npm run backup:local
npm run reset-admin-password
node scripts/sync-qweather-locations.js
node scripts/generate-demo-seed.js
```

## 数据库说明

应用使用 `clockin` schema。新安装时表会在运行时按需创建/补齐，不需要手动运行 migration。生产备份建议定期运行 `npm run backup:local` 或配置 S3 兼容备份。

## 开发约定

- 不提交 `.env.local`、`private/`、`backups/`、`.next/`
- 开发者入口在设置页底部 logo 连点 3 次
- 默认不启用 AI、天气、S3；缺少 Key 时相关模块隐藏或保持可配置状态
- 节假日数据当前内置 2025/2026，后续年份需要升级数据源

>>>>>>> 8a62e28 (Initial open-source release)
