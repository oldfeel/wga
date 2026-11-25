# WoW Guild Assistant (WGA)

开源自托管的《魔兽世界：无限》公会助手：Lua 插件采集 → 本地 JSON 快照 → Tauri 桌面端上传 → Go + PostgreSQL → React 后台（角色查询、活动报名 / 签到 / 排表）。

## 架构

```
addon (Lua) → 本地快照 → desktop (Tauri) → server (Go) → PostgreSQL
                                              ↑
                                         web (React)
```

生产目标：**Ubuntu 1 核 2G**，原生安装，**不使用 Docker**。说明见 [docs/self-host.md](docs/self-host.md)。

## 仓库结构

见 [docs/repo-layout.md](docs/repo-layout.md)。

| 目录 | 说明 |
|------|------|
| `addon/WGA/` | Lua 插件（本地快照，已可 `/wga snapshot`） |
| `desktop/` | Tauri 同步端（监听 SV 并上传） |
| `server/` | Go API（鉴权 / 公会 / 快照上传 / 活动 MVP） |
| `web/` | React 后台（登录 / 公会 / 角色 / 活动） |
| `docs/` | 决策、schema、API、权限、自托管 |

## 开工前文档（已就绪）

- [docs/decisions.md](docs/decisions.md) — 产品 / 合规拍板
- [docs/snapshot-schema.md](docs/snapshot-schema.md) — 快照 JSON v1
- [docs/api-contract.md](docs/api-contract.md) — API 契约
- [docs/permissions.md](docs/permissions.md) — 权限矩阵
- [server/migrations/000001_init.up.sql](server/migrations/000001_init.up.sql) — PG 建表
- [.env.example](.env.example) — 环境变量模板

## 开发环境（Windows）

- Go 1.22+
- Node 20+（pnpm 或 npm）
- Rust + MSVC Build Tools（Tauri）
- PostgreSQL 16+（本机安装，勿用 Docker Desktop）
- 可选：可安装「无限」客户端用于插件联调

```bash
# 建库后执行迁移
psql -U wga -d wga -h 127.0.0.1 -f server/migrations/000001_init.up.sql
```

### 无限服插件路径（本机）

- 根目录：`D:\World of Warcraft\_forever_`
- AddOns：`D:\World of Warcraft\_forever_\Interface\AddOns`

```powershell
.\scripts\detect-wow.ps1
.\scripts\install-addon.ps1
```

游戏内：`/wga snapshot` 采集；`/wga last` / `/wga export` 查看。

### 启动 API（需本机 PostgreSQL）

本机已接现有 **PostgreSQL 16**（`C:\Program Files\PostgreSQL\16`，端口 5432）：库名 `wga`，迁移已执行。`.env` 默认用本地 `saleor` 角色连库（与其它项目同实例、独立库）。API 默认 **8088**（避开 Steam 占 8080）。

```powershell
# 若需重建表：
# & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U saleor -h 127.0.0.1 -d wga -f server/migrations/000001_init.up.sql

cd server
# 加载仓库根目录 .env 后启动，或：
$env:DATABASE_URL="postgres://saleor:saleor@127.0.0.1:5432/wga?sslmode=disable"
$env:HTTP_ADDR="0.0.0.0:8088"
go run ./cmd/wga
```

健康检查：`http://127.0.0.1:8088/health`

### 桌面同步端（Tauri）

需 Visual Studio 2022 Build Tools（MSVC）+ Rust + Node：

```powershell
cd desktop
npm install
npm run tauri:dev
```

流程：登录 / 选公会 → 游戏内 `/wga snapshot` → 自动或手动上传。

### Web 后台

```powershell
cd web
npm install
npm run dev
```

打开 http://localhost:5173 （代理到 API `:8088`）。
