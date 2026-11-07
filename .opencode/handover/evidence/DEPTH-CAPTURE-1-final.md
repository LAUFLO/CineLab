# DEPTH-CAPTURE-1 最终验收

日期：2026-11-07
状态：通过

## 用户验证结论

用户确认深度动作捕捉功能已端到端验证通过：

- 设置页成功下载 `depth-runtime`（Release `depth-components-v1`）
- 模型组件沿用官方 HF 源
- 新安装包下可正常读取视频信息并启动深度捕捉
- 输出结果正常写回画布节点

## 关联修复

- runtime Release 发布：`RUNTIME-COMPONENTS-1.md`
- 内存优化：快速/长片 inputSize 238（约 2.6GB），标准 280（约 4.1GB）
- 全局资产路径：`MEDIA-FIXES-2026-11-07.md`

## 遗留

- 占位节点在真实深度任务中的表现可继续观察（K20 部分收敛）
