# WGA Sync (Tauri)

监听无限服 SavedVariables\WGA.lua，上传插件 last_json 到自托管 API。

## 依赖
- Node 20+
- Rust stable
- Visual Studio 2022 Build Tools (VCTools)
- WebView2

## 开发
```powershell
cd desktop
npm install
npm run tauri:dev
```

## 发布

```powershell
# 需已装 VS Build Tools；在「x64 Native Tools」或 VsDevCmd 环境下：
npm run tauri:build
```

成功后可执行文件：

`src-tauri/target/release/wga-desktop.exe`

若 NSIS 安装包因网络下载失败，可直接分发上述 exe（本机需有 WebView2）。

