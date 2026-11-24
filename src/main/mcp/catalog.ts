export type McpToolCategory =
  | '适配器'
  | '项目'
  | '画布'
  | '生成'
  | '剪辑室'
  | '导演台'
  | '拉片'
  | '资产'
  | '能力'
  | '技能'

export interface McpToolMeta {
  name: string
  title: string
  category: McpToolCategory
  readOnly: boolean
  /** 危险操作：删除、清空类 */
  destructive?: boolean
  /** 执行前需要应用内确认 */
  confirm: boolean
}

/**
 * MCP 工具目录。
 * 注册代码分布在 tools.ts / app-tools.ts / write-tools.ts，
 * 单测会校验这里的名称集合与注册代码一致，避免文档与实现漂移。
 */
export const MCP_TOOL_CATALOG: McpToolMeta[] = [
  { name: 'local_adapter_list', title: '列出本地适配器', category: '适配器', readOnly: true, confirm: false },
  { name: 'local_adapter_reload', title: '重载本地适配器', category: '适配器', readOnly: false, confirm: false },
  { name: 'local_adapter_logs', title: '读取适配器日志', category: '适配器', readOnly: true, confirm: false },

  { name: 'project_list', title: '最近项目', category: '项目', readOnly: true, confirm: false },
  { name: 'project_current', title: '当前项目', category: '项目', readOnly: true, confirm: false },

  { name: 'canvas_get', title: '读取画布', category: '画布', readOnly: true, confirm: false },
  { name: 'node_list', title: '列出节点', category: '画布', readOnly: true, confirm: false },
  { name: 'node_create', title: '创建节点', category: '画布', readOnly: false, confirm: true },
  { name: 'node_update', title: '修改节点', category: '画布', readOnly: false, confirm: true },
  { name: 'node_move', title: '移动节点', category: '画布', readOnly: false, confirm: true },
  { name: 'node_delete', title: '删除节点', category: '画布', readOnly: false, destructive: true, confirm: true },
  { name: 'node_connect', title: '连接节点', category: '画布', readOnly: false, confirm: true },
  { name: 'node_disconnect', title: '断开连线', category: '画布', readOnly: false, destructive: true, confirm: true },
  { name: 'canvas_group', title: '分组节点', category: '画布', readOnly: false, confirm: true },
  { name: 'canvas_ungroup', title: '解散分组', category: '画布', readOnly: false, confirm: true },
  { name: 'canvas_node_operations', title: '列出节点操作', category: '画布', readOnly: true, confirm: false },
  { name: 'canvas_node_operation', title: '执行节点操作', category: '画布', readOnly: false, confirm: true },

  { name: 'model_list', title: '列出模型', category: '生成', readOnly: true, confirm: false },
  { name: 'generation_start', title: '提交生成', category: '生成', readOnly: false, confirm: true },

  { name: 'timeline_open', title: '打开剪辑室', category: '剪辑室', readOnly: false, confirm: true },
  { name: 'timeline_get', title: '读取时间线', category: '剪辑室', readOnly: true, confirm: false },
  { name: 'timeline_set_video', title: '设置画幅参数', category: '剪辑室', readOnly: false, confirm: true },
  { name: 'timeline_move_clips', title: '移动片段', category: '剪辑室', readOnly: false, confirm: true },
  { name: 'timeline_trim_clip', title: '裁剪片段', category: '剪辑室', readOnly: false, confirm: true },
  { name: 'timeline_split_clips', title: '切分片段', category: '剪辑室', readOnly: false, confirm: true },
  { name: 'timeline_split_by_shots', title: '按镜头切分', category: '剪辑室', readOnly: false, confirm: true },
  { name: 'timeline_auto_subtitles', title: '自动字幕', category: '剪辑室', readOnly: false, confirm: true },
  { name: 'timeline_remove_clips', title: '删除片段', category: '剪辑室', readOnly: false, destructive: true, confirm: true },
  { name: 'timeline_update_clip', title: '修改片段', category: '剪辑室', readOnly: false, confirm: true },
  { name: 'timeline_set_track', title: '设置轨道', category: '剪辑室', readOnly: false, confirm: true },
  { name: 'timeline_add_marker', title: '添加标记', category: '剪辑室', readOnly: false, confirm: true },
  { name: 'timeline_set_transition', title: '设置转场', category: '剪辑室', readOnly: false, confirm: true },
  { name: 'timeline_export', title: '导出时间线', category: '剪辑室', readOnly: false, confirm: true },

  { name: 'stage_open', title: '打开导演台', category: '导演台', readOnly: false, confirm: true },
  { name: 'stage_get', title: '读取导演台', category: '导演台', readOnly: true, confirm: false },
  { name: 'stage_add_object', title: '添加对象', category: '导演台', readOnly: false, confirm: true },
  { name: 'stage_add_camera', title: '添加机位', category: '导演台', readOnly: false, confirm: true },
  { name: 'stage_transform_camera', title: '调整机位', category: '导演台', readOnly: false, confirm: true },
  { name: 'stage_add_shot', title: '添加镜头', category: '导演台', readOnly: false, confirm: true },
  { name: 'stage_update_shot', title: '修改镜头', category: '导演台', readOnly: false, confirm: true },
  { name: 'stage_set_camera_track', title: '设置运镜', category: '导演台', readOnly: false, confirm: true },
  { name: 'stage_auto_coverage', title: '自动分镜', category: '导演台', readOnly: false, confirm: true },
  { name: 'stage_remove_object', title: '删除对象', category: '导演台', readOnly: false, destructive: true, confirm: true },
  { name: 'stage_remove_shot', title: '删除镜头', category: '导演台', readOnly: false, destructive: true, confirm: true },
  { name: 'stage_export_preview', title: '导出预演', category: '导演台', readOnly: false, confirm: true },

  { name: 'film_study_get', title: '读取拉片', category: '拉片', readOnly: true, confirm: false },
  { name: 'film_study_get_shot', title: '读取镜头', category: '拉片', readOnly: true, confirm: false },
  { name: 'film_study_auto', title: '自动拉片', category: '拉片', readOnly: false, confirm: true },
  { name: 'film_study_update_shot', title: '修改镜头', category: '拉片', readOnly: false, confirm: true },
  { name: 'film_study_split_scenes', title: '自动分场', category: '拉片', readOnly: false, confirm: true },
  { name: 'film_study_update_segment', title: '修改段落', category: '拉片', readOnly: false, confirm: true },
  { name: 'film_study_extract_subtitles', title: '提取字幕', category: '拉片', readOnly: false, confirm: true },
  { name: 'film_study_remake', title: '复刻镜头', category: '拉片', readOnly: false, confirm: true },
  { name: 'film_study_build_timeline', title: '建时间线', category: '拉片', readOnly: false, confirm: true },
  { name: 'film_study_map_cast', title: '选角选景', category: '拉片', readOnly: false, confirm: true },
  { name: 'film_study_export', title: '导出拉片', category: '拉片', readOnly: false, confirm: true },

  { name: 'library_search', title: '搜索资产库', category: '资产', readOnly: true, confirm: false },

  { name: 'capability_catalog', title: '能力目录', category: '能力', readOnly: true, confirm: false },
  { name: 'capability_search', title: '搜索能力', category: '能力', readOnly: true, confirm: false },

  { name: 'skill_list', title: '技能列表', category: '技能', readOnly: true, confirm: false },
  { name: 'skill_read', title: '读取技能', category: '技能', readOnly: true, confirm: false }
]

export function mcpToolCatalog(): McpToolMeta[] {
  return MCP_TOOL_CATALOG
}
