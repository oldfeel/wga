# WGA Web

React 管理后台：登录、公会、角色列表、活动报名/签到。

```powershell
cd web
npm install
npm run dev
```

默认 `http://localhost:5173`，通过 Vite 代理访问 `http://127.0.0.1:8088/api`。

生产：`npm run build` 后把 `dist/` 交给 Nginx。
