# MCP server

日期：2026-11-24
状态：现行
适用版本：v0.4.6
最后核对：2026-11-24

> 外部 Agent 通过 MCP（Model Context Protocol）连接 CineLab。
> 只监听 `127.0.0.1`，使用 Bearer token 认证。
> 写操作默认逐次确认，并提供只读模式。

## 1. 在应用内配置

打开「设置 → MCP」，可以完成全部配置：

- 查看 server 运行状态、版本、地址和端口；
- 显示 / 隐藏 / 复制 token，重置 token（旧 token 立即失效，客户端配置自动更新）；
- 一键复制 HTTP 或 stdio 的客户端配置，支持 Claude Desktop、Cursor、Cline、Windsurf、Codex、Trae、Qoder、WorkBuddy 等常用客户端；
- 打开 `mcp.json` 所在目录；
- 开关 MCP server、开关只读模式；
- 查看全部已注册工具及只读 / 写 / 危险标记。

修改开关后立即生效，不需要重启应用。关闭 server 会断开已连接的会话，并删除 `mcp.json`。

## 2. 配置文件

应用启动时在用户数据目录写入：

```text
Windows: %APPDATA%\cinelab\mcp.json
macOS:   ~/Library/Application Support/cinelab/mcp.json
```

```json
{
  "version": 1,
  "url": "http://127.0.0.1:7788/mcp",
  "token": "<随机 token>",
  "serverVersion": "0.4.6",
  "stdio": {
    "command": "C:\\...\\CineLab.exe",
    "args": ["C:\\...\\out\\main\\cinelab-mcp.js"],
    "env": { "ELECTRON_RUN_AS_NODE": "1" }
  },
  "pid": 1234,
  "startedAt": "2026-11-24T07:00:00.000Z"
}
```

- `token` 首次启动生成，之后跨重启复用；删除 `mcp.json` 会重新生成。
- 设置页可以重置 token；重置后旧 token 立即失效，已连接的客户端需要更新配置后重新连接，下方客户端配置会自动更新。
- 端口默认 `7788`，被占用时顺延到 `7789`–`7792`；实际地址以 `url` 为准。
- 文件权限为 `0600`；不要把 `mcp.json` 提交到仓库或发给别人。
- 应用正常退出或关闭 MCP server 时删除 `mcp.json`。

## 3. HTTP 配置

适合配置里能填 `url` 字段的客户端，需要 CineLab 保持运行。

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

## 4. stdio 配置

适合只能填 `command` / `args` 字段的客户端。客户端会启动一个桥接进程，转发到本机 HTTP server；能力与 HTTP 完全一致。

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

## 5. 只读模式

设置页开启「只读模式」后：

- 所有写工具直接返回 `MCP 当前为只读模式`，不弹确认框；
- 只读工具（项目、画布、模型、资产、能力、技能、拉片读取等）正常工作；
- 适合让外部 Agent 先分析项目，再由用户手动执行修改。

不提供「免确认」模式：外部 Agent 无人值守修改项目风险过高，写操作始终保持逐次确认。

## 6. 工具

共 61 个工具，按类别如下。写工具执行前都会弹出原生确认框。

### 6.1 本地适配器（3）

| 工具 | 作用 | 只读 |
|---|---|---|
| `local_adapter_list` | 列出本地适配器、版本、状态 | 是 |
| `local_adapter_reload` | 重新构建并加载指定适配器 | 否 |
| `local_adapter_logs` | 读取构建、加载和进程日志 | 是 |

### 6.2 项目（2）

| 工具 | 作用 | 只读 |
|---|---|---|
| `project_list` | 最近项目列表 | 是 |
| `project_current` | 当前项目、画布列表与数量 | 是 |

### 6.3 画布（12）

| 工具 | 作用 | 只读 | 危险 |
|---|---|---|---|
| `canvas_get` | 读取当前画布摘要与视口 | 是 | |
| `node_list` | 按 kind 列出节点 | 是 | |
| `node_create` | 创建 text / image / video / audio 节点 | 否 | |
| `node_update` | 修改节点标题或文本 | 否 | |
| `node_move` | 移动节点 | 否 | |
| `node_delete` | 删除节点及连线 | 否 | 是 |
| `node_connect` | 连接上下游节点 | 否 | |
| `node_disconnect` | 删除指定连线 | 否 | 是 |
| `canvas_group` | 分组顶层节点 | 否 | |
| `canvas_ungroup` | 解散分组 | 否 | |
| `canvas_node_operations` | 读取节点可用操作 | 是 | |
| `canvas_node_operation` | 执行节点操作（切分、裁剪、抽帧、抠图等） | 否 | |

### 6.4 生成（2）

| 工具 | 作用 | 只读 |
|---|---|---|
| `model_list` | 供应商与模型能力 | 是 |
| `generation_start` | 对已有节点提交生成 | 否 |

### 6.5 剪辑室（14）

| 工具 | 作用 | 只读 | 危险 |
|---|---|---|---|
| `timeline_open` | 创建剪辑室节点并打开 | 否 | |
| `timeline_get` | 读取时间线摘要 | 是 | |
| `timeline_set_video` | 设置画幅、分辨率、帧率、背景 | 否 | |
| `timeline_move_clips` | 移动片段 | 否 | |
| `timeline_trim_clip` | 裁剪片段 | 否 | |
| `timeline_split_clips` | 在指定时间切分 | 否 | |
| `timeline_split_by_shots` | 按镜头自动切分 | 否 | |
| `timeline_auto_subtitles` | 自动生成字幕 | 否 | |
| `timeline_remove_clips` | 删除片段 | 否 | 是 |
| `timeline_update_clip` | 修改片段属性 | 否 | |
| `timeline_set_track` | 设置轨道可见/静音/锁定 | 否 | |
| `timeline_add_marker` | 添加标记 | 否 | |
| `timeline_set_transition` | 设置入场转场 | 否 | |
| `timeline_export` | 导出时间线为视频 | 否 | |

### 6.6 导演台（12）

| 工具 | 作用 | 只读 | 危险 |
|---|---|---|---|
| `stage_open` | 创建导演台节点并打开 | 否 | |
| `stage_get` | 读取对象、机位、镜头和世界 | 是 | |
| `stage_add_object` | 添加人物/立方体/球体/平面/模型/群众 | 否 | |
| `stage_add_camera` | 添加机位 | 否 | |
| `stage_transform_camera` | 调整机位位置、朝向、视场角 | 否 | |
| `stage_add_shot` | 添加镜头 | 否 | |
| `stage_update_shot` | 修改镜头 | 否 | |
| `stage_set_camera_track` | 设置机位关键帧轨道 | 否 | |
| `stage_auto_coverage` | 自动分镜 | 否 | |
| `stage_remove_object` | 删除对象 | 否 | 是 |
| `stage_remove_shot` | 删除镜头 | 否 | 是 |
| `stage_export_preview` | 导出整片/单镜预演 | 否 | |

### 6.7 拉片（11）

| 工具 | 作用 | 只读 | 危险 |
|---|---|---|---|
| `film_study_get` | 读取拉片摘要 | 是 | |
| `film_study_get_shot` | 读取单个镜头 | 是 | |
| `film_study_auto` | 自动拉片 | 否 | |
| `film_study_update_shot` | 修改镜头分析 | 否 | |
| `film_study_split_scenes` | 自动分场 | 否 | |
| `film_study_update_segment` | 修改拉片段落 | 否 | |
| `film_study_extract_subtitles` | 提取字幕 | 否 | |
| `film_study_remake` | 复刻镜头 | 否 | |
| `film_study_build_timeline` | 用复刻视频建时间线 | 否 | |
| `film_study_map_cast` | 设置选角选景映射 | 否 | |
| `film_study_export` | 导出 Markdown / 分析 / 打包 | 否 | |

### 6.8 资产（1）

| 工具 | 作用 | 只读 |
|---|---|---|
| `library_search` | 按名称或路径搜索全局资产库 | 是 |

### 6.9 能力（2）

| 工具 | 作用 | 只读 |
|---|---|---|
| `capability_catalog` | 列出 CineBot 已开放能力 | 是 |
| `capability_search` | 按关键词搜索能力 | 是 |

### 6.10 技能（2）

| 工具 | 作用 | 只读 |
|---|---|---|
| `skill_list` | 列出内置、全局和项目技能 | 是 |
| `skill_read` | 读取 SKILL.md 或引用文件 | 是 |

时间线工具要求剪辑室已打开；导演台工具需要 `nodeId`；拉片工具需要 `nodeId` 或 `studyId`。写工具复用 CineBot 的画布、时间线、导演台和拉片执行器，不直接改项目 JSON。

## 7. 写操作确认

- 每次写操作都会在 CineLab 窗口弹出原生确认框，显示操作摘要和参数。
- 选择「取消」返回 `{ "cancelled": true }`，不执行。
- 删除节点、删除连线、删除片段、删除对象/镜头使用危险操作确认。
- 不提供批量删除、清空画布、删除项目、删除画布等能力。
- `generation_start` 只对已有节点提交生成，模型和参数由 CineLab 校验。
- 只读模式下所有写工具直接拒绝，不弹确认框。

## 8. 安全

- 只绑定 `127.0.0.1`，不监听局域网。
- 所有请求必须带 `Authorization: Bearer <token>`；无 token 返回 401。
- token 仅写入用户数据目录，文件权限 `0600`，设置页默认打码显示。
- 写工具只通过 CineBot 执行器修改当前打开的项目，不直接写项目文件。
- `local_adapter_reload` 只接受已存在的适配器目录名，不能用于任意路径。
- 外部 Agent 仍可直接写 `adapters/<id>/`；文件监听会自动构建和重载。

## 9. 当前范围

- 已提供：适配器查询/重载/日志；项目列表与当前项目；画布摘要、节点增删改连线、分组、节点操作；生成提交；剪辑室时间线读取、画幅、片段/轨道/标记/转场、按镜头切分、自动字幕与导出；导演台对象、机位、镜头、运镜、自动分镜与预演导出；拉片读取、修改、自动拉片、分场、字幕、复刻、建时间线与导出；资产库搜索；能力目录与技能读取。
- 后续：项目创建/打开/导出、撤销与重做、生成提案（`generation_propose`）、模型目录（`generation_catalog`）、时间线节拍与去静音、导演台对象变换与程序化世界。

## 10. 排查

| 现象 | 检查 |
|---|---|
| 401 | 设置页或 `mcp.json` 的 token 是否与客户端配置一致 |
| 连接失败 | CineLab 是否运行；设置页 MCP 是否启用；端口是否被其他进程占用 |
| stdio 无响应 | 客户端是否设置 `ELECTRON_RUN_AS_NODE=1`；`mcp.json` 是否存在 |
| 写工具被拒绝 | 是否开启了只读模式；确认框是否被最小化窗口挡住 |
| 工具返回适配器错误 | 调 `local_adapter_logs` 查看构建、进程输出 |
| token 变了 | 删除过 `mcp.json` 或重置过设置；重新复制新 token |
