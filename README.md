# LumeSync Teacher

教师端桌面应用，负责课程文件管理、课堂控制和本地课堂服务。

## 功能概览

- 启动桌面端控制台（Electron）。
- 自动拉起本地教学服务（Express + Socket.io，默认端口 `3000`）。
- 管理课程文件（导入/导出、文件夹组织、删除、刷新）。
- 课堂控制与实时同步（选课、翻页、互动、标注、投票、收集学生提交）。
- 支持日志目录打开、提交目录设置、系统托盘常驻。

## 目录结构

```text
electron/          # 教师端桌面主进程与 preload
server/            # 本地课堂服务（API + Socket）
packages/          # engine/runtime-control/render-engine
common/            # 公共 Electron 配置与日志能力
shared/public/     # 课程静态资源目录（默认）
submissions/       # 学生提交默认落盘目录
scripts/           # 启动脚本
```

## 快速开始

```bash
npm install
npm run start
```

启动链路：

1. `scripts/start-electron.js` 启动 Electron。
2. `electron/main.js` 检查 `3000` 端口可用性。
3. 若端口空闲，拉起 `server/index.js`；若已有健康服务则复用。
4. 打开 `http://127.0.0.1:3000` 作为教师端主界面。

## 常用命令

- `npm run start`：启动教师端桌面应用（推荐）
- `npm run start:server`：仅启动本地课堂服务（便于 API 联调）
- `npm run build`：打包桌面安装包（electron-builder）

## 服务接口

API 同时挂载在 `/api` 与 `/api/teacher`，常用端点：

- `GET /api/health`
- `GET /api/courses`
- `POST /api/refresh-courses`
- `DELETE /api/delete-course`
- `POST /api/course-folders`
- `POST /api/save-submission`
- `GET /api/submissions/:courseId`
- `POST /api/submissions/:courseId/download-batch`
- `GET /api/students`
- `GET /api/student-log`

## 关键环境变量（server）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 本地服务端口 |
| `STATIC_DIR` | `shared/public` | 静态资源根目录 |
| `LUMESYNC_PUBLIC_DIR` | `shared/public` | 课程与静态资源目录 |
| `LUMESYNC_COURSES_DIR` | `<public>/courses` | 课程文件目录 |
| `LUMESYNC_SUBMISSIONS_DIR` | `./submissions` | 学生提交目录 |
| `LUMESYNC_SUBMISSIONS_CONFIG` | `./submissions-config.json` | 提交目录配置文件 |

说明：使用 `npm run start` 时，上述核心变量会由 `electron/main.js` 自动注入，无需手动配置。

## 打包发布

```bash
npm run build
```

- 打包配置：`electron-builder.json`
- 产物目录：`../../dist/teacher`
- Windows 目标：`nsis`（`x64`）

## 常见问题

1. 教师端启动提示端口被占用
端口 `3000` 被非 LumeSync 进程占用时，应用会拒绝启动。先释放端口后重试。

2. 页面一直加载失败
优先检查本地服务健康接口 `http://127.0.0.1:3000/api/health`，再查看日志目录（应用内“打开日志目录”）。

3. 导入课程后看不到
确认文件扩展名为 `.lume/.tsx/.ts/.jsx/.js/.pdf`，并在界面执行刷新课程列表。

## 相关文档

- [server/src/README.md](./server/src/README.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [LICENSE](./LICENSE)
