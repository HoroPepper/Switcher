# Switcher

把「资源压缩包」或「离线链接」自动变成 **115 网盘上的云下载任务**：解压 → 找链接文件 → 逐行解析 → 在 115 新建文件夹 → 发起云下载 → 回填任务状态。

- 网盘操作全部通过 **CloudDrive2** 的 gRPC API 完成（登录、建夹、离线下载、任务查询），本项目不直接对接 115。
- 后端为常驻服务（Node.js），另附带一个由后端托管的轻量网页，供 Quest 2 等设备在浏览器里“一键”触发。

---

## 工作原理

```
压缩包(.zip/.rar) ─┐
                   ├─► 解压/解码 ─► 逐行解析链接 ─► 建文件夹 ─► 云下载 ─► 状态回填
直接粘贴链接 ──────┘                                   │
                                                       ▼
                                            CloudDrive2 (gRPC)
                                              └─ 115 账号登录 / 离线下载
```

1. **取链接**
   - 压缩包：按魔数识别 zip/rar，内存解压，取匹配的文本文件（默认 `*.txt|*.url|*.list|*.md`），自动处理 UTF-8 / GBK。
   - 直接链接：解析文本中的 `ed2k / magnet / thunder / http / 115分享`。
2. **筛格式**：压缩包模式默认只保留文件名为 `mp4` 的 115 云链（可配）；直接链接模式默认不过滤（可选）。
3. **建夹**：在 115 挂载路径下 `CreateFolder`（同名已存在则复用）。
4. **云下载**：`ed2k/magnet/http/thunder` → `AddOfflineFiles`；`115分享` → `AddSharedLink`。
   - 重复任务（115 返回 `10008 任务已存在`）视为**幂等成功**。
5. **状态回填**：拉取离线任务列表，按 url/信息哈希匹配，回填 `downloading / finished / error`（可选等待）。

---

## 目录结构

```
src/
  server.ts              HTTP 服务 + 托管前端页面
  cli.ts                 命令行
  config.ts              环境变量 / .env 配置
  types.ts               类型与 CloudClient 接口
  text.ts                UTF-8/BOM/GBK 解码
  archive/               zip/rar 读取与链接文件匹配
    index.ts             (按魔数分发)
    zip.ts  rar.ts  types.ts
  extract/
    offline.ts           逐行解析 115 云链 + 后缀过滤
    links.ts             通用链接识别（备用）
  cloud/
    clouddriveClient.ts  CloudDrive2 gRPC 客户端
    mockCloudClient.ts   内存 Mock（离线开发/测试）
    index.ts             客户端工厂
  pipeline/
    processArchive.ts    processArchive / processLinks 编排
  web/index.html         前端页面（无构建）
proto/clouddrive.proto   CloudDrive2 官方 proto
scripts/probe.ts         实机联调探针
test/                    Vitest 测试
data/                    示例压缩包
```

---

## 环境要求

- Node.js ≥ 18（开发用 22）
- 一台常开机器运行 [CloudDrive2 Core](https://www.clouddrive2.com/)，且已登录 115（本服务与其同机时用 `127.0.0.1:19798`）
- CloudDrive2 设置页里的 **gRPC 端口**（默认与 Web UI 同端口 `19798`）

---

## 安装

```bash
npm install
cp .env.example .env   # Windows: copy .env.example .env
```

---

## 配置（`.env`）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` / `HOST` | `8787` / `0.0.0.0` | HTTP 服务监听 |
| `CLOUDDRIVE_GRPC_ADDR` | `127.0.0.1:19798` | CloudDrive2 gRPC 地址 |
| `CLOUDDRIVE_GRPC_TLS` | `0` | gRPC 是否 TLS |
| `CLOUDDRIVE_TOKEN` | 空 | 推荐：CloudDrive2 里创建的**受限 API Token** |
| `CLOUDDRIVE_USERNAME` / `_PASSWORD` / `_TOTP` | 空 | 或用账号密码（+2FA）换 JWT |
| `CLOUDDRIVE_CLOUD_NAME` / `_ACCOUNT` | 空 | 指定云盘账号；空则取第一个 |
| `CLOUDDRIVE_MOCK` | `0` | `1` 用内存 Mock，不连真实网盘 |
| `CD_PARENT_PATH` | `/115` | 115 挂载下的父目录（如 `/115open`） |
| `LINK_FILE_REGEX` | `\.(txt|url|list|md)$` | 压缩包内“链接文件”匹配规则（逗号分隔多条） |
| `TARGET_EXTENSIONS` | `mp4` | 压缩包模式保留的后缀（逗号分隔，空=不过滤） |
| `CLOUDDRIVE_OFFLINE_BATCH` | `1` | 每批投递的链接数 |
| `OFFLINE_WAIT_MS` | `0` | `0`=只取状态快照；`>0`=最多等待多久 |

> `.env` 已被 `.gitignore` 忽略，请勿提交 token。环境变量优先级高于 `.env`。

---

## 运行

```bash
npm start          # 启动 HTTP 服务 + 前端页面
npm run dev        # 开发模式（watch）
npm run cli -- <压缩包路径> [--folder 名称] [--parent /115open]
npm test           # 运行测试
npm run typecheck  # 类型检查
```

浏览器打开 `http://<本机IP>:8787/`。

---

## 前端页面

`GET /`，两个标签页：

- **压缩包**：选 `.zip/.rar` → （可选）文件夹名/父目录 → 上传进度 → 结果。
- **直接链接**：多行粘贴链接 → （可选）仅保留后缀 → 直接云下载。

结果卡片显示：115 目录路径、`新增/已存在/失败` 计数、每条链接状态徽章、离线任务列表。页面为深色大按钮，适配 Quest 2 浏览器。

---

## HTTP API

### `GET /health`
云客户端连通性 + 默认父目录。
```json
{ "ok": true, "message": "login=true ready=true", "parentPath": "/115open", "mock": false }
```

### `POST /process`（压缩包）
`multipart/form-data`，第一个文件即压缩包；query 可选 `folderName`、`parentPath`。
```bash
curl -F "archive=@data/13dsvr02009.rar" \
  "http://127.0.0.1:8787/process?folderName=13dsvr02009&parentPath=%2F115open"
```

### `POST /process-path`（服务器本地压缩包）
```json
{ "path": "D:/path/to/13dsvr02009.rar", "folderName": "13dsvr02009", "parentPath": "/115open" }
```

### `POST /download`（直接链接）
```json
{
  "links": "ed2k://|file|movie.mp4|111|HASH|/\nmagnet:?xt=urn:btih:...",
  "folderName": "手动下载",
  "parentPath": "/115open",
  "extensions": "mp4"
}
```
`links` 可为字符串或数组；`extensions` 留空=不过滤（仅作用于 ed2k/magnet）。

### 返回结构 `ProcessResult`
```json
{
  "source": "13dsvr02009.rar",
  "folderName": "13dsvr02009",
  "folder": { "id": "...", "name": "13dsvr02009", "path": "/115open/13dsvr02009" },
  "linkFiles": ["13dsvr02009.txt"],
  "links": [{ "raw": "ed2k://...", "kind": "ed2k" }],
  "outcomes": [{ "link": "ed2k://...", "kind": "ed2k", "ok": true, "duplicate": false, "status": "finished", "percentDone": 100, "infoHash": "..." }],
  "added": 2, "duplicates": 0, "failed": 0,
  "offline": [{ "name": "...", "url": "ed2k://...", "status": "finished", "infoHash": "...", "percentDone": 100 }]
}
```
错误：缺参 `400`；流程错误 `422 { "error": "..." }`。

---

## 快捷调用（推荐）

`scripts/probe.ts` 用于实机联调：
```bash
npx tsx scripts/probe.ts                                  # 系统信息 + 云盘账号
PROBE_LIST="/,/115open/" npx tsx scripts/probe.ts          # 列目录
MSYS_NO_PATHCONV=1 PROBE_PARENT=/115open/ \
  PROBE_LINK="ed2k://|file|movie.mp4|111|HASH|/" npx tsx scripts/probe.ts
```
> Git Bash 会把 `/...` 环境变量值当路径转换，需加 `MSYS_NO_PATHCONV=1`；`.env` 读取不受影响。

---

## 解析规则

- **逐行解析**：每行判断是否为 115 云链（`ed2k://|file|名|大小|32位hash|/` 或 `magnet:?...&dn=名`），再按文件名字段后缀过滤。
- **链接文件匹配**：压缩包内文件名匹配 `LINK_FILE_REGEX`。
- **编码**：优先 UTF-8（含 BOM），失败回退 GBK。
- **去重**：按原始链接字符串。

---

## 测试

```bash
npm test
```
覆盖：通用链接识别、逐行云链解析与后缀过滤、zip/rar 读取（含 GBK）、压缩包→云下载编排、重复幂等、状态回填、直接链接编排。

---

## 已知限制 / 待办

- 无鉴权，暴露到局域网/公网请注意安全（可加 Token 或 HTTPS）。
- 无“列出 115 目录文件”接口；页面仅展示状态快照，无刷新按钮。
- `115分享` 依赖账号 `canAddShareLink`（本环境的 `115open` 为 false）；`ed2k/magnet` 已验证可用。
- 大压缩包一次性读入内存。
- 目标站点的**自动下载压缩包**（站点适配层）尚未实现。

---

## 安全与合规

- API Token 建议设为**受限范围 + 有效期**，并妥善保管，勿提交到仓库。
- 请遵守目标站点与 115 / CloudDrive2 的服务条款及当地法律法规，仅处理你有权下载的内容。

---

## License

[MIT](LICENSE) © 2026 狼与胡椒
