# API 契约草稿（MVP）

Base URL：`http://localhost:8080/api/v1`（生产由 Nginx 反代 `/api/`）

通用：

- `Authorization: Bearer <jwt>`
- 公会上下文：多数业务接口要求 path 中的 `guild_id`
- 错误：`{ "error": { "code": "string", "message": "string" } }`
- 时间均为 ISO-8601

## 鉴权

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/auth/captcha` | `{ captcha_id, image }` 图形验证码 |
| POST | `/auth/register` | `{ username, password, captcha_id, captcha_code, display_name? }` |
| POST | `/auth/login` | `{ username, password }` → `{ token, user }`（含 `is_admin`） |
| GET | `/auth/me` | 当前用户（含 `is_admin`）+ 所属公会列表（含 `verification_status`、服务器层级） |

## 公会定位键

唯一键：`(flavor, region_key, realm_name, guild_name)`。

| 字段 | 说明 |
|------|------|
| `flavor` | `forever` / `retail` / `classic` |
| `region_key` | 正式/怀旧：大区；无限服：`PVP`/`PVE`/…；未知：`UNKNOWN` |
| `realm_name` | 服务器名 |
| `name` / `guild_name` | 公会名 |

## 公会

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/guilds/lookup` | 登录 | query：`flavor,region_key,realm_name,guild_name` → `not_found` 或 `found`（含成员关系） |
| POST | `/guilds` | 登录 | `{ name, flavor, region_key, realm_name }` 创建；创建者为 owner；`verification_status=pending` |
| POST | `/guilds/join` | — | **已停用**（410）；改走入会申请 |
| GET | `/guilds/{id}` | 成员 | 公会信息 + 认证状态 + 服务器层级 |
| GET | `/guilds/{id}/members` | 成员 | 成员与角色 |
| PATCH | `/guilds/{id}/members/{userId}` | owner | `{ role }`；不可移除最后一位 owner |
| POST | `/guilds/{id}/join-applications` | 登录非成员 | 申请加入 |
| GET | `/guilds/{id}/join-applications` | officer+ | 列表（默认 pending） |
| POST | `/guilds/{id}/join-applications/{appId}/decide` | officer+ | `{ decision: approve\|reject }` |
| POST | `/guilds/{id}/claim-applications` | 登录 | `{ is_leader: true, character_name?, realm_name?, message? }` 认领 |

## 平台管理

需 `users.is_admin`（可用环境变量 `ADMIN_USERNAMES=alice,bob` 种子）。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/guilds?status=pending` | 待认证公会 |
| POST | `/admin/guilds/{id}/verify` | `{ decision: verify\|reject, region_key? }` |
| GET | `/admin/claim-applications?status=pending` | 待审认领 |
| POST | `/admin/claim-applications/{appId}/decide` | `{ decision: approve\|reject }`；通过则转移 owner 并标为已认证 |

## 角色与快照

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/guilds/{id}/characters` | 成员 | 筛选：`class`,`spec`,`min_ilvl`,`has_lockout`,`profession` |
| GET | `/guilds/{id}/characters/{charId}` | 成员 | 档案 + 最新快照 |
| GET | `/snapshots/{id}` | 成员 | 完整 `payload` |
| POST | `/guilds/{id}/snapshots` | 成员 | 桌面端上传；按 `(realm,name)` upsert；**每角色只保留最新一份** |

## 活动 / 报名 / 签到 / 排表

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/guilds/{id}/activities` | 成员 | 列表 |
| POST | `/guilds/{id}/activities` | officer+ | 创建 |
| GET | `/activities/{id}` | 成员 | 详情含报名与排表 |
| PATCH | `/activities/{id}` | officer+ | 改标题/时间/状态 |
| POST | `/activities/{id}/signups` | 成员 | `{ character_id?, status?, note? }` |
| POST | `/activities/{id}/check-in` | 本人或 officer+ | `{ user_id? }` |
| PUT | `/activities/{id}/roster` | officer+ | 整表覆盖排表 |

## 公告

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/guilds/{id}/announcements` | 成员 | 列表（新→旧） |
| POST | `/guilds/{id}/announcements` | officer+ | `{ title, body }` |

## 错误码

| code | HTTP | 含义 |
|------|------|------|
| `unauthorized` | 401 | 未登录或 token 无效 |
| `forbidden` | 403 | 非本公会或权限不足 |
| `not_found` | 404 | 资源不存在 |
| `validation_error` | 400 | 参数错误 |
| `conflict` | 409 | 冲突（已存在、重复申请等） |
| `gone` | 410 | 接口已停用（如邀请码加入） |
