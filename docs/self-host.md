# 自托管说明（Ubuntu 1 核 2G，无 Docker）

面向单公会 / 小团体。开发在 Windows 本机；生产建议 Ubuntu VPS。

## 内存粗算

| 组件 | 约占用 |
|------|--------|
| 系统 + Nginx | 200–400 MB |
| PostgreSQL（限配） | 150–350 MB |
| Go API | 30–80 MB |
| 余量 | ~0.8–1.2 GB |

不要安装 Docker。

## 1. 系统与 PostgreSQL

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib nginx

sudo -u postgres createuser -P wga
sudo -u postgres createdb -O wga wga
```

限配示例（`/etc/postgresql/*/main/postgresql.conf`，按版本改路径）：

```
shared_buffers = 128MB
work_mem = 4MB
maintenance_work_mem = 64MB
effective_cache_size = 512MB
```

然后：

```bash
sudo systemctl restart postgresql
psql -U wga -d wga -h 127.0.0.1 -f /path/to/wga/server/migrations/000001_init.up.sql
```

## 2. Go API

在构建机交叉编译：

```bash
cd server
GOOS=linux GOARCH=amd64 go build -o wga-server ./cmd/wga
```

服务器上：

```bash
sudo mkdir -p /opt/wga
sudo cp wga-server /opt/wga/
sudo cp .env /opt/wga/.env   # 从 .env.example 复制并修改
```

systemd 单元示例 `/etc/systemd/system/wga.service`：

```ini
[Unit]
Description=WGA API
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/wga
EnvironmentFile=/opt/wga/.env
ExecStart=/opt/wga/wga-server
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now wga
```

## 3. 前端静态资源 + Nginx

```bash
cd web && pnpm build
sudo mkdir -p /var/www/wga
sudo cp -r dist/* /var/www/wga/
```

Nginx 示例：

```nginx
server {
    listen 80;
    server_name your.domain.example;
    root /var/www/wga;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8080/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri /index.html;
    }
}
```

建议随后用 Certbot 上 HTTPS。

## 4. 玩家端

1. 将 `addon/WGA` 拷到 WoW `Interface/AddOns/`。
2. 安装桌面端，填写 `api_base_url`（如 `https://your.domain.example/api/v1`），登录并选择公会。
3. 确认同步开关；需要时手动上传。

## 5. 免责

页脚与客户端须展示 [disclaimer.md](disclaimer.md) 中的统一文案。
