# 仓库目录约定

```
wga/
├── addon/                 # WoW Lua 插件（无网络）
├── desktop/               # Tauri 桌面端（React + MUI + Vite，Windows 优先）
├── web/                   # React + MUI 管理后台（Vite SPA，Nginx 静态）
├── packages/
│   └── wga-ui/            # 共享主题 / armory / RichTooltip
├── server/                # Go API
│   └── migrations/        # SQL 迁移
├── docs/                  # 设计与自托管文档
├── package.json           # npm workspaces 根
├── .env.example           # 环境变量模板
├── LICENSE                # MIT
├── README.md
├── history.md             # 变更备忘
└── 魔兽公会助手.md         # 原始需求摘要
```

前端统一：**React 19 + MUI 9.6 + Emotion 11**，不做 SSR。共享 UI 在 `@wga/ui`。

常用命令（仓库根）：

- `npm run dev:web` / `npm run build:web`
- `npm run dev:desktop`（需 VS 工具链时仍按 desktop 文档起 `tauri:dev`）
