# 快照 JSON Schema v1

插件只写本地文件，**无网络请求**。桌面端监控变更后上传。

## 路径约定

本机已探测到的无限服根目录（可被环境变量覆盖）：

`D:\World of Warcraft\_forever_`

| 用途 | 默认路径（Windows） |
|------|---------------------|
| 无限服根目录 | `D:\World of Warcraft\_forever_`（或 `$env:WOW_FOREVER_ROOT`） |
| 插件代码 | `<WoWRoot>\Interface\AddOns\WGA\` |
| SavedVariables | `<WoWRoot>\WTF\Account\<AccountName>\SavedVariables\WGA.lua` |
| 导出 JSON 目录 | `%APPDATA%\WGA\snapshots\` |
| 单角色文件名 | `{realm}_{character}_{yyyyMMdd_HHmmss}.json` |
| 最新指针（可选） | `%APPDATA%\WGA\snapshots\latest\{realm}_{character}.json` |

安装插件到游戏目录：

```powershell
.\scripts\detect-wow.ps1
.\scripts\install-addon.ps1
# 或
.\scripts\install-addon.ps1 -WowRoot "D:\World of Warcraft\_forever_"
```

桌面端配置项：`wow_root`（可选）、`snapshot_dir`（默认如上）、`api_base_url`、`auto_upload`（bool）。

写入流程：

1. 游戏内插件采集 → 写入 SavedVariables，并（若 API 允许）同步写出 JSON 到 `snapshot_dir`；若 Lua 无法写到 AppData，则由桌面端解析 `WGA.lua` 再生成 JSON。
2. 桌面端 `fs.watch` / 轮询 `snapshot_dir`；`auto_upload=true` 时变更即上传，否则仅手动。

## JSON 示例

```json
{
  "schema_version": 1,
  "addon_version": "0.1.0",
  "client_version": null,
  "captured_at": "2026-11-24T12:00:00+08:00",
  "character": {
    "name": "示例角色",
    "realm": "示例服务器",
    "race": "人类",
    "class": "战士",
    "spec": "防护",
    "level": 80,
    "item_level": 636.5
  },
  "equipment": [
    {
      "slot": "HEAD",
      "item_id": 12345,
      "name": "示例头盔",
      "item_level": 639,
      "enchant_id": null,
      "gems": []
    }
  ],
  "talents": {
    "loadout_string": "",
    "spec_id": null
  },
  "lockouts": [
    {
      "instance_id": null,
      "instance_name": "示例团本",
      "difficulty": "英雄",
      "reset_at": "2026-11-25T07:00:00+08:00",
      "bosses_killed": 2,
      "bosses_total": 8
    }
  ],
  "professions": [
    {
      "name": "锻造",
      "skill_current": 100,
      "skill_max": 100,
      "recipes": [{ "spell_id": 1, "name": "示例配方" }]
    }
  ],
  "availability_note": null
}
```

## 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `schema_version` | 是 | 固定 `1` |
| `addon_version` | 是 | 插件版本 |
| `captured_at` | 是 | ISO-8601 |
| `character.*` | 是 | 角色主键逻辑为 `(realm, name)` |
| `equipment` | 是 | 可空数组 |
| `talents` | 是 | 可无串 |
| `lockouts` | 是 | 副本 CD |
| `professions` | 是 | 专业与配方；配方可截断过大列表 |
| `client_version` | 否 | 客户端版本字符串 |
| `availability_note` | 否 | 玩家自填可上线说明（可后期由 Web 维护） |

上传时桌面端附加：登录 JWT、目标 `guild_id`；服务端校验成员身份后入库。
