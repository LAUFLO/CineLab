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

## 安全

- 只绑定 `127.0.0.1`，不监听局域网。
- 所有请求必须带 `Authorization: Bearer <token>`；无 token 返回 401。
- 当前工具只读或重载适配器，不写项目文件、不提交生成、不删除数据。
- `local_adapter_reload` 只接受已存在的适配器目录名，不能用于任意路径。
- 外部 Agent 仍可直接写 `adapters/<id>/`；文件监听会自动构建和重载。

## 当前范围

- 已提供：本地适配器查询、重载、日志。
- 后续：项目/画布/节点、生成提交与状态、时间线、导演台、拉片、导出。
- 写操作会复用 CineBot 的提案/确认机制，默认不直接修改用户数据。

## 排查

| 现象 | 检查 |
|---|---|
| 401 | `mcp.json` 的 token 是否与客户端配置一致 |
| 连接失败 | CineLab 是否运行；`url` 端口是否被其他进程占用 |
| stdio 无响应 | 客户端是否设置 `ELECTRON_RUN_AS_NODE=1`；`mcp.json` 是否存在 |
| 工具返回适配器错误 | 调 `local_adapter_logs` 查看构建/进程输出 |
| token 变了 | 删除过 `mcp.json`；重新复制新的 token |
