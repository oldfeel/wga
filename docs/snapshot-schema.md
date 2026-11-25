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

插件自动保存（v0.1.4+，防卡顿）：

- **有变化才写**：装备 / 任务 / 幻化 / 专业 / CD 等事件标记 dirty，内容指纹未变则跳过
- **合并抖动**：变化后延迟约 **2 分钟**再写入（`/wga auto N` 可调），避免任务进度连跳狂写
- **战斗中跳过**自动写；脱战后补写
- 本地与服务端均**只保留最新一份**，不做历史归档
- `/wga auto` 查看；`on|off`；`/wga auto 2` 设延迟分钟数

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
  "guild": {
    "name": "示例公会",
    "rank": "会长",
    "rank_index": 0,
    "is_leader": true,
    "flavor": "forever",
    "region_key": "PVP",
    "realm_name": "示例服务器"
  },
  "equipment": [
    {
      "slot": "HEAD",
      "item_id": 12345,
      "name": "示例头盔",
      "item_level": 639,
      "enchant_id": null,
      "gems": [],
      "quality": 4,
      "icon": "inv_helmet_01",
      "icon_file_id": null,
      "desc": "板甲 · 头部 · 拾取后绑定",
      "transmog": {
        "source_id": 1001,
        "appearance_id": 2002,
        "name": "示例外观",
        "is_transmogrified": true,
        "is_hidden": false,
        "illusion_id": null,
        "illusion_name": null
      }
    }
  ],
  "equipment_sets": [
    {
      "id": 1,
      "name": "防御",
      "is_equipped": true,
      "items": [{ "slot": "HEAD", "item_id": 12345, "name": "示例头盔" }]
    }
  ],
  "talents": {
    "loadout_string": "",
    "spec_id": null,
    "groups": [
      {
        "index": 1,
        "name": "主天赋",
        "active": true,
        "tabs": [
          {
            "group_id": 11650,
            "name": "Arms",
            "points_spent": 51,
            "nodes": [
              {
                "node_id": 1,
                "pos_x": 1000,
                "pos_y": 2000,
                "rank": 5,
                "max_rank": 5,
                "name": "示例天赋",
                "spell_id": 20154,
                "icon_file_id": 132223,
                "tooltip_lines": [
                  { "left": "示例天赋", "color": { "r": 255, "g": 210, "b": 0 } },
                  { "left": "使某某效果提高。" }
                ]
              }
            ]
          }
        ],
        "trees": [{ "tree_id": 1117, "points_spent": 51 }],
        "nodes": []
      },
      { "index": 2, "name": "副天赋", "active": false, "tabs": [], "nodes": [] }
    ]
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
  "quests": [
    {
      "quest_id": 12345,
      "title": "示例任务",
      "level": 80,
      "is_complete": false,
      "frequency": null,
      "objectives": [
        { "text": "击败 0/5", "finished": false, "num_fulfilled": 0, "num_required": 5 }
      ]
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
| `guild` | 否 | 未入会为 `null`；含 `name`/`is_leader`/`flavor`/`region_key`/`realm_name` |
| `equipment` | 是 | 全槽位数组（空槽 `name` 为空）；含 `quality`/`icon`/`icon_file_id`/`desc`/`transmog` |
| `equipment_sets` | 否 | 装备配置方案（`C_EquipmentSet`，数量不限）；桌面端每个方案一个 tab |
| `talents` | 是 | 可空串；`groups` 为双天赋（最多 2） |
| `talents.groups` | 否 | 每组一个 tab；当前组含已点节点 |
| `lockouts` | 是 | 副本 CD |
| `professions` | 是 | 专业与配方；配方可截断过大列表 |
| `quests` | 否 | 当前任务日志（非全图世界任务）；快照时采集 |
| `client_version` | 否 | 客户端版本字符串 |
| `availability_note` | 否 | 玩家自填可上线说明（可后期由 Web 维护） |

上传时桌面端附加：登录 JWT、目标 `guild_id`；服务端校验成员身份后入库。
