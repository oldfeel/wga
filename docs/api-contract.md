# API 契约草稿（MVP）

Base URL：`http://localhost:8080/api/v1`（生产由 Nginx 反代 `/api/`）

通用：

- `Authorization: Bearer <jwt>`
- 公会上下文：多数业务接口要求 query 或 header `X-Guild-Id: <uuid>`（下文写 `guild_id`）
- 错误：`{ "error": { "code": "string", "message": "string" } }`
- 时间均为 ISO-8601

## 鉴权

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/auth/captcha` | `{ captcha_id, image }` 图形验证码（`image` 为 data URL PNG，5 分钟有效，不区分大小写） |
| POST | `/auth/register` | `{ username, password, captcha_id, captcha_code, display_name?, invite_code? }`；邀请码可选，填写则自动加入公会 |
| POST | `/auth/login` | `{ username, password }` → `{ token, user }` |
| GET | `/auth/me` | 当前用户 + 所属公会列表 |

## 公会

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/guilds` | 登录 | 创建公会，创建者为 `owner`，返回 `invite_code` |
| POST | `/guilds/join` | 登录 | `{ invite_code }` |
| GET | `/guilds/{id}` | 成员 | 公会信息 |
| POST | `/guilds/{id}/invite/rotate` | owner | 重置邀请码 |
| GET | `/guilds/{id}/members` | 成员 | 成员与角色 |
| PATCH | `/guilds/{id}/members/{userId}` | owner | `{ role }`；不可移除最后一位 owner |

## 角色与快照

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/guilds/{id}/characters` | 成员 | 筛选：`class`,`spec`,`min_ilvl`,`has_lockout`,`profession` |
| GET | `/guilds/{id}/characters/{charId}` | 成员 | 档案 + 最新快照 |
| GET | `/snapshots/{id}` | 成员 | 完整 `payload` |
| POST | `/guilds/{id}/snapshots` | 成员 | 桌面端上传；按 `(realm,name)` upsert 角色；**每角色只保留最新一份** |

## 活动 / 报名 / 签到 / 排表

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/guilds/{id}/activities` | 成员 | 列表 |
| POST | `/guilds/{id}/activities` | officer+ | 创建 |
| GET | `/activities/{id}` | 成员 | 详情含报名与排表 |
| PATCH | `/activities/{id}` | officer+ | 改标题/时间/状态 |
| POST | `/activities/{id}/signups` | 成员 | `{ character_id?, status?, note? }` |
| PATCH | `/activities/{id}/signups/{signupId}` | 本人或 officer+ | 改状态/签到 |
| POST | `/activities/{id}/check-in` | 本人或 officer+ | `{ user_id? }` 快捷签到 |
| PUT | `/activities/{id}/roster` | officer+ | 整表覆盖排表 `[{ character_id, user_id?, group_name?, slot_role?, sort_order, note? }]` |

## 公告

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/guilds/{id}/announcements` | 成员 | 列表（新→旧） |
| POST | `/guilds/{id}/announcements` | officer+ | `{ title, body }` |

## 错误码（初稿）

| code | HTTP | 含义 |
|------|------|------|
| `unauthorized` | 401 | 未登录或 token 无效 |
| `forbidden` | 403 | 非本公会或权限不足 |
| `not_found` | 404 | 资源不存在 |
| `validation_error` | 400 | 参数/schema 错误 |
| `conflict` | 409 | 用户名占用、重复报名等 |
