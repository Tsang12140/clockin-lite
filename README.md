# Clockin Lite 小厂记工

Clockin Lite 是给小微工厂和作坊使用的轻量 AI 考勤、记工与工资统计工具。默认使用虚拟内存数据，不需要外部数据库即可在 Vercel 或本地打开；如果要长期保存真实数据，可以切换到 Postgres。

## 功能

- 员工、工价历史、每日考勤录入
- 月度工资汇总、工资条、Excel 导出
- 单休、双休、大小周排班
- 中国法定节假日提示与调休日识别
- 工作日、休息日、法定节假日加班工资规则
- 4 人演示数据，默认随虚拟存储内置
- 天气提醒、AI 助手、S3 备份为可选配置

## 快速开始

```bash
cp .env.example .env.local
npm install
npm run dev
```

打开 `http://localhost:3000/setup`，按向导创建工厂简称和管理员账号。默认模式是：

```text
CLOCKIN_DATA_MODE=virtual
```

虚拟模式不需要 `DATABASE_URL`。数据保存在当前 Node/Vercel 函数实例的内存里，适合公开体验和功能预览；重启、冷启动或重新部署后可能回到初始状态。

## Vercel 部署

导入 GitHub 仓库后，至少设置：

```text
SESSION_SECRET=
CLOCKIN_DATA_MODE=virtual
AI_ENABLED=false
BACKUP_S3_ENABLED=false
```

`SESSION_SECRET` 用随机长字符串，例如：

```bash
openssl rand -base64 32
```

虚拟模式下不要配置 `DATABASE_URL`，即使 Vercel 里保留了旧数据库地址，应用也不会主动连接它。

## 切换到 Postgres

如果要保存真实数据，把环境变量改成：

```text
CLOCKIN_DATA_MODE=postgres
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

然后启动或部署。应用会在运行时按需创建 `clockin` schema 和相关表。可使用 Docker 提供本地数据库：

```bash
docker compose up -d db
```

## 演示数据

虚拟模式已经内置 4 名员工和 2026 年以来的示例考勤，不需要执行 SQL。

Postgres 模式下可以手动导入：

```bash
psql "$DATABASE_URL" -f seed-demo.sql
psql "$DATABASE_URL" -c "UPDATE clockin.tenant_config SET demo_mode = TRUE WHERE id = 1;"
```

## 可选配置

天气：可在设置页填写 QWeather Key 和地区码，也可使用环境变量：

```text
QWEATHER_KEY=
QWEATHER_LOCATION=
QWEATHER_CITY=
```

AI：未配置时右下角入口会打开配置向导；配置完成后可直接聊天，手动关闭后入口会隐藏。

备份：虚拟模式的“下载备份”会导出当前内存数据快照；Postgres 模式可用本地 SQL 备份或 S3 兼容备份。

## 常用命令

```bash
npm run dev
npm run build
npm run start
npm run backup:local
npm run reset-admin-password
node scripts/generate-demo-seed.js
```

## 开发约定

- 不提交 `.env.local`、`private/`、`backups/`、`.next/`
- 默认不启用 AI、天气、S3；缺少 Key 时相关模块保持可配置或隐藏
- 节假日数据当前内置 2025/2026，后续年份需要更新数据源
