# 老叔之家象棋 · 部署说明（Vercel Serverless）

纯云端架构：前端展示（墨水屏 UI）+ Vercel 云函数算棋（Pikafish）。
前端不再带本地搜索引擎，AI 每步走子都调用云端 API。

## 1. 目录结构

```
index.html                  前端页面
css/style.css               样式
js/ai.js                    规则库(走法/将军/判和/FEN) + 云端引擎客户端
js/ui.js                    界面与对局流程
api/move.js                 Vercel Serverless 函数：启动 Pikafish 算棋
engine/pikafish-sse41-popcnt  Pikafish Linux 二进制（随函数打包，765KB）
vercel.json                 函数配置(maxDuration=10s + includeFiles)
package.json                空依赖，声明 Node 18
DEPLOY.md                   本文档
```

## 2. 一次性准备：NNUE 网络文件（53MB）

Pikafish 2026 起仅支持 NNUE 评估，必须在引擎运行前提供 `pikafish.nnue`。
该文件**不随代码打包**（否则超过 Vercel 函数 50MB 体积限制），改为冷启动时下载到 `/tmp` 并复用。

1. 提取 `pikafish.nnue`（约 53,212,941 字节）：
   - 从官方发布包内提取：https://github.com/official-pikafish/Pikafish/releases/download/Pikafish-2026-01-02/Pikafish.2026-01-02.7z
   - 或使用本机已下载的副本 `C:\Users\i'UC\AppData\Local\Temp\opencode\xqengine\net2026\pikafish.nnue`。
   - ⚠️ 注意：Pikafish「Networks」仓库里的 `master-net` 是 2023 年版，与 2026 二进制**不兼容**（启动即报 Network evaluation ... not loaded），切勿使用。
2. 把 `pikafish.nnue` 上传到你自己的 GitHub 仓库 **Release asset**（命名 `pikafish.nnue`）。
3. 得到直链：
   `https://github.com/<你的用户名>/<仓库名>/releases/latest/download/pikafish.nnue`
4. 在 Vercel 项目设置 Environment Variables 中添加：
   ```
   NNUE_URL = https://github.com/<你的用户名>/<仓库名>/releases/latest/download/pikafish.nnue
   ```

## 3. 部署步骤

1. 用 `git init` 把本项目推到 GitHub 仓库（保留 `engine/`、`api/`、`vercel.json`，确认 `pikafish.nnue` **不要** push 进仓库）。
2. Vercel → New Project → Import 该 GitHub 仓库：
   - Framework Preset：**Other**
   - Build Command / Output Directory：留空
   - 会自动识别 `api/` 为 Serverless 函数、其余为静态文件。
3. 设置 `NNUE_URL`（见上）。
4. Deploy。完成后默认域名形如 `https://你的项目.vercel.app`。
   - 前端默认调用**同源** `/api/move`，无需额外配置。

## 4. 环境变量

| 变量         | 必填 | 说明 |
|--------------|------|------|
| `NNUE_URL`   | 是   | `pikafish.nnue` 的 Release 直链 |
| `LAOSHUJI_API` | 否 | 前端覆盖，仅当 API 与前端不同源时设置（生产用同源即可） |

前端覆盖方式（若非同源）：在 `index.html` 的脚本之前加入
`<script>window.LAOSHUJI_API = 'https://API域名/api/move';</script>`。

## 5. 超时与防 504 策略

- `vercel.json` 强制函数 `maxDuration: 10`（Hobby 版上限）。
- 函数内部 `TOTAL_BUDGET = 8.5s` 兜底；引擎单次搜索硬上限 `SEARCH_MS_CAP = 4.8s`。
- 难度→搜索时长：新手 0.4s / 入门 0.8s / 中级 1.5s / 高级 2.5s / 大师 4.8s。
- 总耗时 ≈ 启动(0.1s) + 无NNUE时下载53MB(~0.5-1s，之后复用) + 搜索(≤4.8s)，最大约 6-7s，远低于 10s。
- 前端 20s 兜底超时 + 用户悔棋立即 abort；云端无响应时界面提示“AI 无响应，请检查网络”。

## 6. 本地调试

```bash
# 前端(静态)
npx serve .     # 或任意静态服务器；页面从同源调用 /api/move

# API 本地验证(需先在环境变量覆盖)：
#   PIKAFISH_BIN=<Windows版pikafish路径> PIKAFISH_NNUE=<本机nnue路径> node api/move.js
# 然后 Node http 包装该 handler 调用 /api/move?fen=...&level=3（参考已有脚本 api-local-test.js）
```

## 7. 域名与国内访问（可选）

GitHub release 下载 53MB 一般很快（Vercel 函数位于美国），若在墨案设备上偶发慢，可叠加：
1. 域名 CNAME 到 Vercel；2. 前面套 Cloudflare 免费版（DNS 解析 + 可选缓存），自定义域访问。
注意 Hobby 计划函数最长 10s，叠加 CDN 一跳延迟（通常 <50ms）不影响预算。

## 8. 常见问题

- **函数返回 502/流程超时**：多为冷启动下载 NNUE 首次拉取慢。确认 `NNUE_URL` 正确、网络可达；暖实例后不再下载。
- **报“Network evaluation ... not loaded”**：NNUE 是 2023 旧版（用了 Networks 仓库 master-net），换官方 2026-01-02 发布包内的 `pikafish.nnue`。
- **AI 每次都走同一步/很慢**：先看 `/api/move.js` 日志的 `totalMs`；正常大师级约 5.3s。
- **墨水屏接口**：保持零动画、高对比、无残影（设置内“刷新屏幕”手动重绘）。
