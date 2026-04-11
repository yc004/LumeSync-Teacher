# LumeSync Teacher

教师端仓库，当前采用 **C++ 原生壳 + WebView2 + 本地 Node 服务** 架构。

## 目录结构

```text
native/                   C++ 原生宿主与安装器
native/shell/             教师端 WebView2 壳
server/                   本地课堂服务（HTTP + Socket）
packages/                 engine / runtime-control / render-engine
shared/public/            课程与静态资源
shared/assets/            图标资源
shared/build/             构建辅助脚本
scripts/start-native.js   原生壳启动脚本
```

## 常用命令

```bash
pnpm install
pnpm run start
pnpm run start:server
pnpm run build:teacher-native
pnpm run build:teacher-native-installer
```

说明：
- `start` 启动教师端原生壳（要求先完成 C++ 构建）。
- `start:server` 仅启动服务，适合 API 联调。

## 打包输出

- 运行目录：`dist/teacher-native`
- 安装包：`dist/installer/LumeSync Teacher Native Setup 1.0.0.exe`

## 相关文档

- [server/src/README.md](./server/src/README.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
