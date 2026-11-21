# MCP server

日期：2026-11-21
状态：现行
适用版本：v0.4.0
最后核对：2026-11-21

> 外部 Agent 通过 MCP（Model Context Protocol）连接 CineLab。
> 当前先暴露本地适配器工具，后续按模块扩展项目、画布、生成、时间线和导出。
> 只监听 `127.0.0.1`，使用 Bearer token 认证。

## 配置文件

应用启动时写入：

```text
Windows: %APPDATA%\cinelab\mcp.json
macOS:   ~/Library/Application Support/cinelab/mcp.json
```

```json
{
  "version": 1,
  "url": "http://127.0.0.1:7788/mcp",
  "token": "<随机 token>",
  "serverVersion": "0.4.0",
  "stdio": {
    "command": "C:\\...\\CineLab.exe",
    "args": ["C:\\...\\out\\main\\cinelab-mcp.js"],
    "env": { "ELECTRON_RUN_AS_NODE": "1" }
  },
  "pid": 1234,
  "startedAt": "2026-11-21T07:00:00.000Z"
}
```

- `token` 首次启动生成，之后跨重启复用；删除 `mcp.json` 会重新生成。
- 端口默认 `7788`，被占用时顺延到 `7789`–`7792`；实际地址以 `url` 为准。
- 文件权限为 `0600`；不要把 `mcp.json` 提交到仓库或发给别人。
- 应用正常退出时删除 `mcp.json`；异常退出可能残留，下次启动会覆盖。

## HTTP 配置

外部 Agent 支持 Streamable HTTP 时直接使用：

```json
{
  "mcpServers": {
    "cinelab": {
      "url": "http://127.0.0.1:7788/mcp",
      "headers": {
        "Authorization": "Bearer <mcp.json 里的 token>"
      }
    }
  }
}
```

## stdio 配置

客户端只支持 stdio 时，使用 `mcp.json` 里的 `stdio` 块：

```json
{
  "mcpServers": {
    "cinelab": {
      "command": "C:\\...\\CineLab.exe",
      "args": ["C:\\...\\out\\main\\cinelab-mcp.js"],
      "env": {
        "ELECTRON_RUN_AS_NODE": "1"
      }
    }
  }
}
```

`cinelab-mcp.js` 是薄桥接进程：通过 stdio 接收 MCP 消息，再转发到本地 HTTP server。它不承载业务逻辑，也不提供额外命令。

## 工具

### `local_adapter_list`

列出本地适配器，只读。

返回：适配器 `id`、版本、状态（`ready` / `loading` / `error`）、模型、错误、目录、更新时间。

### `local_adapter_reload`

重新构建并加载指定适配器。

参数：

```json
{ "id": "echo" }
```

### `local_adapter_logs`

读取最近的构建、加载和进程输出日志，只读。

参数：

```json
{ "id": "echo", "limit": 50 }
```

`id` 可省略；`limit` 默认 50，最大 200。

### `project_list`

列出最近打开的 CineLab 项目：路径、名称、最近打开时间。只读。

### `project_current`

读取当前项目：名称、画布列表、当前画布、节点/连线数量。只读。

### `canvas_get`

读取当前画布摘要：节点、连线、视口。

参数：

```json
{ "includeEdges": true, "limit": 200 }
```

- 只返回节点摘要，不返回 outputs、prompt、媒体数据。
- `limit` 默认 200，最大 500。

### `node_list`

读取当前画布节点摘要，可按 `kind` 过滤。

```json
{ "kind": "image", "limit": 200 }
```

### `model_list`

列出供应商与模型能力：id、名称、能力、输入、模式。只读，不返回 API Key、Secret 或请求头。

### 写工具

| 工具 | 作用 | 确认 |
|---|---|---|
| `node_create` | 创建 text / image / video / audio 节点 | 是 |
| `node_update` | 修改标题或文本 | 是 |
| `node_move` | 移动节点 | 是 |
| `node_delete` | 删除节点及连线 | 危险确认 |
| `node_connect` | 连接两个节点 | 是 |
| `node_disconnect` | 删除指定连线 | 危险确认 |
| `generation_start` | 对已有节点提交生成 | 是 |

### 时间线工具

| 工具 | 作用 | 确认 |
|---|---|---|
| `timeline_open` | 创建剪辑室节点并打开时间线 | 是 |
| `timeline_get` | 读取当前时间线摘要 | 否 |
| `timeline_move_clips` | 移动片段 | 是 |
| `timeline_trim_clip` | 裁剪片段起点/终点 | 是 |
| `timeline_split_clips` | 在指定时间切分片段 | 是 |
| `timeline_remove_clips` | 删除片段 | 危险确认 |
| `timeline_update_clip` | 修改片段属性 | 是 |
| `timeline_set_track` | 设置轨道可见/静音/锁定 | 是 |
| `timeline_add_marker` | 添加时间线标记 | 是 |
| `timeline_set_transition` | 设置片段入场转场 | 是 |
| `timeline_export` | 导出时间线为视频 | 是，可能耗时 |

### 导演台工具

| 工具 | 作用 | 确认 |
|---|---|---|
| `stage_open` | 创建导演台节点并打开舞台 | 是 |
| `stage_get` | 读取对象、机位、镜头摘要 | 否 |
| `stage_add_object` | 添加人物/立方体/球体/平面/模型/群众 | 是 |
| `stage_add_camera` | 添加机位 | 是 |
| `stage_add_shot` | 用机位创建镜头 | 是 |
| `stage_auto_coverage` | 自动分镜 | 是 |
| `stage_remove_object` | 删除对象 | 危险确认 |
| `stage_remove_shot` | 删除镜头 | 危险确认 |
| `stage_export_preview` | 导出整片/单镜预演 | 是，可能耗时 |

导演台工具需要 `nodeId`；可先用 `stage_open` 创建并打开导演台。

时间线工具要求剪辑室已打开；可以先用 `timeline_open` 创建并打开一个剪辑室。

写工具复用 CineBot 的画布执行器和生成队列，不直接改项目 JSON。

## 写操作确认

- 每次写操作都会在 CineLab 窗口弹出原生确认框，显示操作摘要和参数。
- 选择「取消」返回 `{ "cancelled": true }`，不执行。
- 删除节点、删除连线使用危险操作确认。
- 不提供批量删除、清空画布、删除项目等能力。
- `generation_start` 只对已有节点提交生成，模型和参数由 CineLab 校验。

## 安全

- 只绑定 `127.0.0.1`，不监听局域网。
- 所有请求必须带 `Authorization: Bearer <token>`；无 token 返回 401。
- 当前工具只读或重载适配器，不写项目文件、不提交生成、不删除数据。
- `local_adapter_reload` 只接受已存在的适配器目录名，不能用于任意路径。
- 外部 Agent 仍可直接写 `adapters/<id>/`；文件监听会自动构建和重载。

## 当前范围

- 已提供：本地适配器查询/重载/日志；项目列表/当前项目、画布摘要、节点摘要、模型能力（只读）；画布节点创建/修改/移动/删除/连线，以及提交生成；剪辑室时间线读取与片段/轨道/标记/转场操作，以及时间线导出；导演台对象/机位/镜头/自动分镜与预演导出。
- 后续：拉片与项目导出。
- 写操作复用 CineBot 的画布/时间线/导演台执行器和生成队列，执行前需要应用内确认。

## 排查

| 现象 | 检查 |
|---|---|
| 401 | `mcp.json` 的 token 是否与客户端配置一致 |
| 连接失败 | CineLab 是否运行；`url` 端口是否被其他进程占用 |
| stdio 无响应 | 客户端是否设置 `ELECTRON_RUN_AS_NODE=1`；`mcp.json` 是否存在 |
| 工具返回适配器错误 | 调 `local_adapter_logs` 查看构建/进程输出 |
| token 变了 | 删除过 `mcp.json`；重新复制新的 token |
