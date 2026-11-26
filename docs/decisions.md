# WGA 产品与合规决策（开工前已拍板）

出品：宜阳县树皮软件开发工作室  
适用：《魔兽世界：无限（Forever）》官方服  
协议：MIT  
部署：开源自托管；**不用 Docker**；生产目标 Ubuntu 约 1 核 2G

## 1. 鉴权与公会隔离

| 项 | 决定 |
|----|------|
| 账号体系 | 本地账号（用户名 + 密码）；不做 Discord / Battle.net OAuth（MVP） |
| 进公会 | 按 `(flavor, region_key, realm_name, guild_name)` 查库：无则创建（待认证）、有则申请加入（会长/官员审）；游戏会长可认领（平台管理员审） |
| 服务器层级 | 一级 flavor（forever/retail/classic）；二级 region_key（无限服=官方规则集码 `NORMAL`/`PVP`/`RP`/`RP_PVP`/`HARDCORE`，读不出为 `UNKNOWN` 并由用户自选；正式/怀旧为大区）；三级 realm_name |
| 认证 | 创建后 `pending`；平台管理员认证后显示「已认证」；认领通过默认同时认证 |
| 角色 | `owner`（会长）/ `officer`（官员）/ `member`（成员）；另有平台 `is_admin`（`ADMIN_USERNAMES`） |
| 一人多公会 | **允许**；请求需带当前 `guild_id` 上下文 |
| Token | Bearer JWT；桌面端与 Web 共用同一套登录 |
| 邀请码 | 主流程停用；库字段可保留但不对外暴露 |

## 2. 数据边界（MVP 快照白名单）

第一期入库字段：

- 角色基础信息（名、服务器、种族、职业、专精、等级、装等）
- 公会信息（名、是否会长、flavor / region_key / realm_name）
- 装备列表
- 天赋串
- 副本 / 团本 CD
- 专业与配方摘要
- 采集时间、插件版本、客户端版本（若可得）

不做：挂钩游戏进程、代练/雇佣/交易、公共 SaaS 托管用户数据。

同步开关：桌面端可关闭自动上传；关闭后仅手动上传。

## 3. 合规文案

全位置（插件 TOC/加载提示、桌面端关于页、Web 页脚）使用统一免责声明，见 [disclaimer.md](disclaimer.md)。

展示原则：自有 UI 布局；**仓库不内置**暴雪美术资源。装备图标混合解析：
1. 插件导出 `icon`（文件名）与 `icon_file_id`（客户端 fileDataID）及 `item_id`
2. 桌面端优先 CDN（`render.worldofwarcraft.com`）与本地物品对照表；否则按 `icon_file_id` 从社区 CASC 镜像拉 BLP→PNG，缓存到 `%AppData%/WGA/icons/`
3. Web 侧用文件名 CDN + 物品对照表；不解 CASC（避免压垮 1C2G）

## 4. 目标游戏环境

| 项 | 约定 |
|----|------|
| 本机无限服根目录 | `D:\World of Warcraft\_forever_`（可用 `WOW_FOREVER_ROOT` 覆盖） |
| 插件目录 | `<WoWRoot>\Interface\AddOns\WGA\` |
| SavedVariables | `<WoWRoot>\WTF\Account\<Account>\SavedVariables\WGA.lua` |
| 导入脚本 | `scripts\detect-wow.ps1`、`scripts\install-addon.ps1` |
| 导出快照 | 插件将 JSON 写入约定目录，或由桌面端解析 SavedVariables；见 [snapshot-schema.md](snapshot-schema.md) |
| 联调 | 本机已具备无限服客户端，装插件后 `/reload` 验证写盘 |

> 同盘还有 `_retail_`；WGA 默认只装到 `_forever_`。桌面端允许用户手动指定 WoW 根目录。

## 5. 变现边界

仅可选：付费部署调试、二次定制。  
不做：托管平台、会员订阅、交易撮合。

## 6. 运行形态

| 环境 | 方式 |
|------|------|
| 开发（Windows） | 本机 PostgreSQL + `go run` + `pnpm dev` + `tauri dev` |
| 生产（Ubuntu 1C2G） | `apt` 装 PostgreSQL + Go 二进制（systemd）+ Nginx 静态前端 |
| 玩家端 | Lua 插件 + Tauri 桌面端（不上服务器） |
