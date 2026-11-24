# 仓库目录约定

```
wga/
├── addon/                 # WoW Lua 插件（无网络）
├── desktop/               # Tauri 桌面端（Windows 优先）
├── server/                # Go API
│   └── migrations/        # SQL 迁移
├── web/                   # React 管理后台
├── docs/                  # 设计与自托管文档
├── .env.example           # 环境变量模板
├── LICENSE                # MIT
├── README.md
└── 魔兽公会助手.md         # 原始需求摘要
```

MVP 实现顺序：`server/migrations` + 空 API → `addon` 写快照 → `desktop` 上传 → `web` 查询与活动。
