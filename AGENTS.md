## 语言

**始终用中文回复用户。** 代码、文件路径、命令保持英文，其余一律中文。

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 项目定位

Clockin Lite 小厂记工是面向小微工厂和作坊的开源轻量考勤、记工与工资统计工具。

## 工作规则

- 不提交 `.env.local`、`.runtime/`、`.next/`、`node_modules/`、`backups/` 或任何私有资料。
- 不把个人部署路径、生产快照、一次性脚本、私有 handoff 文档写进公开文档。
- 涉及 setup、登录、品牌字、工厂信息、排班、节假日、备份、Docker、演示数据时，先阅读相关模块代码，再按现有模式改。
- Server Action 返回 `{ ok: true | false; error?: string }`，客户端负责跳转和提示。
- SQL 结果类型转换使用 `as unknown as { rows?: SpecificType[] }`。
- 新表/新列走运行时懒建/补齐模式，不依赖手动 migration。
- 提交前至少运行 `npm.cmd run build`。
