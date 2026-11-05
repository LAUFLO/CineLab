# P6-2 画布参考

## 功能

- 图片节点 prompt bar 的「画布参考」进入拾取模式
- 点击画布上任意有图片输出的节点，引用其当前输出
- 自动建立一条从参考节点到当前节点的连线
- 手动引用、上游连线引用、角色卡引用合并去重，最多 4 个
- prompt bar 显示引用缩略图，点击 × 删除引用，同时删除对应连线 / 角色卡引用
- 窗口顶部显示深绿色提示条，支持 Esc 或「取消」退出

## 实现

| 文件 | 内容 |
|---|---|
| `src/renderer/src/canvas/PromptBar.tsx` | 拾取状态、pointerdown + click 拦截、引用合并、缩略图、删除联动 |
| `src/renderer/src/styles/global.css` | 提示条、缩略图、拾取光标与节点高亮 |
| `src/renderer/src/styles/tokens.css` | `--pick-bar: #166534` |

## 关键修复

- 只拦 `pointerdown` 时，真实点击的 `click` 仍会让 React Flow 切换选中，prompt bar 重挂载导致引用丢失；已同时拦截 `click`
- 删除缩略图需同步删除对应 edge，否则上游 refs 会立即重新注入引用

## 验证

- 拾取模式开关、按钮高亮、顶部提示条显示
- 空白退出、Esc 退出、取消按钮退出
- 无输出节点提示「该节点还没有输出」，非图片提示「只能引用图片输出」
- 自动连线：edges `0 → 1`，canvas JSON 保存 `image → video`
- 点击源节点后目标节点保持选中，缩略图出现，素材计数 +1
- 缩略图 src：`cinelab-asset://local/assets/img/<hash>.png`
- 点击 ×：缩略图 `1 → 0`，素材标签消失，重新选中节点后引用不再出现
- `corepack pnpm typecheck` 通过

## 限制

- 当前只配置了 MOSS（仅文生图），引用参与生成需要支持 `image.i2i` 的 provider
- 视频/音频输出不能作为参考，只接受图片输出
