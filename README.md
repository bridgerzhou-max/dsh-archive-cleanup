# dsh-archive-cleanup

> DeepSeek Harness 插件：列出已归档会话，并把它们的**会话日志 + 投影缓存 + 归档登记**一起永久删除。
> A DeepSeek Harness plugin that lists archived sessions and permanently purges their logs, projection caches and archive entries.

[![check](https://github.com/bridgerzhou-max/dsh-archive-cleanup/actions/workflows/check.yml/badge.svg)](https://github.com/bridgerzhou-max/dsh-archive-cleanup/actions/workflows/check.yml)

---

## 为什么需要它

在 Harness 里「归档」一个会话，只是把它从侧边栏藏起来：

- 会话日志仍然留在 `~/.dsh/sessions/<项目键>/<会话 id>/`；
- 投影缓存仍然留在 `~/.dsh/storages/session_projcache/sessions/<会话 id>.json`；
- 归档 id 仍然记在 `~/.dsh/storages/workspace.json` 的 `archivedSessionIds` 里。

归档得多了，`sessions/` 会悄悄涨到几百 MB，界面上却"看不见"。目前 Host 侧没有删除会话的 API，这个插件补上了这个缺口。

## 功能

- 在 **设置 → 归档会话清理** 里列出所有归档会话：标题、工作区、创建时间、占用大小；
- 勾选后「删除所选 → 永久删除」，一次性移除：
  - 会话日志目录 `sessions/<项目键>/<会话 id>/`
  - 投影缓存 `storages/session_projcache/sessions/<会话 id>.json`
  - 归档登记与工作区引用（`workspace.json` 的 `archivedSessionIds`，并从所属工作区的 `sessionIds` 中摘除）
- 每次操作后即时刷新列表与总占用。

<!-- 有截图后放这里：把图片放进 screenshots/ 目录再取消注释
![归档会话清理](screenshots/settings.png)
-->

## 安装

要求：DeepSeek Harness（桌面版 / Web 版），插件在 **44.7.0** 上开发并验证，无任何 npm 依赖。

**方式一：从目录安装（推荐）**

```bash
git clone https://github.com/bridgerzhou-max/dsh-archive-cleanup.git
```

然后在 Harness 里让 agent 安装该目录：

> 把 `D:\path\to\dsh-archive-cleanup` 这个 bundle 安装并启用

对应操作是 `plugin_manager` 的 `install_bundle`，`target` 传**该目录的绝对路径**。安装会请求一次授权（要写 profile 的依赖与 bundle 列表）。

**方式二：发布到 npm 之后**

```text
install_bundle target: "dsh-archive-cleanup"
```

**安装完成后刷新页面（Ctrl+R）**，设置里就会出现「归档会话清理」。

## 使用

1. 打开 **设置 → 归档会话清理**；
2. 勾选要清理的会话（支持全选）；
3. 点 **删除所选** → 再点 **永久删除** 确认。

## 安全设计

| 措施 | 说明 |
| --- | --- |
| 只删归档会话 | 不在 `archivedSessionIds` 里的 id 一律拒绝（`not-archived`） |
| 保护当前会话 | 拒绝删除正在运行的会话（`session-active`） |
| 单条失败不影响整批 | 逐条返回 `removed` / `failed[{id, code, message}]` / `warnings` |
| 只删自己的数据 | 只操作本机 `.dsh` 数据目录，不联网、不上传 |

⚠️ 删除不可恢复：请先核对标题与大小。

## 工作原理

- **Host 侧**（`lib/index.js`）：注册 `archiveCleanup` 服务，通过 `typert` 暴露 `listArchived` / `purgeArchived` 两个远程方法；
  - 会话目录通过 `sessionPersistence.locate()` 精确定位，拿不到时回退到 `sessions/<项目键>/<id>` 并校验目录名等于会话 id；
  - 清除归档登记用 `workspaceRegistry.unarchiveSession(id)`，从工作区摘除用 `Workspace.detachSession(id)`。
- **Client 侧**（`client.js`）：作为 `settings.section` 的一个条目渲染设置页，`ctx.remote.$mount()` 挂载远程契约后用 `ctx.inject(['remote.archiveCleanup'])` 取接口。

> 命名注意：远程方法**不能叫** `list` / `remove` 等名字——客户端网关的命名空间服务把 `remove`、`install`、`has` 等作为保留成员，重名会让插件在启动自检时直接失败（`web boot: 1 entry did not activate`）。

## 开发

```bash
node --check lib/index.js
node --check client.js
```

打包给朋友：

```powershell
Compress-Archive -Path .\* -DestinationPath ..\dsh-archive-cleanup.zip -Force
# 或
npm pack
```

## 卸载

在「插件」页停用 `dsh-archive-cleanup`，然后删除该目录即可。

## License

[MIT](./LICENSE) © 2026 bridgerzhou-max
