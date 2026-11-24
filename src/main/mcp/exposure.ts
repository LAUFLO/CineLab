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

export interface McpExposureMeta {
  /** MCP 客户端与设置页展示标题，中文必填 */
  title: string
  category: McpToolCategory
  /** false = 不暴露给 MCP；缺省暴露 */
  expose?: boolean
  /** 危险操作：删除、清空类 */
  destructive?: boolean
  /** 对外描述；缺省复用 AgentToolDefinition.description */
  description?: string
}

/** 设置页与文档使用的工具元数据 */
export interface McpToolMeta {
  name: string
  title: string
  category: McpToolCategory
  readOnly: boolean
  destructive?: boolean
  confirm: boolean
}

/**
 * AGENT_TOOLS 的 MCP 对外元数据。
 *
 * 阶段 1/2 集中在这里，避免改动 70 个工具定义；
 * 阶段 3 迁移到命令注册表后，本表内容并入注册项。
 */
export const MCP_EXPOSURE: Record<string, McpExposureMeta> = {
  // 画布（12）
  canvas_get: { title: '读取画布', category: '画布' },
  canvas_remove_edge: {
    title: '删除连线',
    category: '画布',
    destructive: true
  },
  canvas_update_text: { title: '修改节点正文', category: '画布' },
  canvas_update_title: { title: '修改节点标题', category: '画布' },
  canvas_move_node: { title: '移动节点', category: '画布' },
  canvas_add_node: { title: '创建节点', category: '画布' },
  canvas_connect: { title: '连接节点', category: '画布' },
  canvas_delete_node: {
    title: '删除节点',
    category: '画布',
    destructive: true
  },
  canvas_group: { title: '分组节点', category: '画布' },
  canvas_ungroup: { title: '解散分组', category: '画布' },
  canvas_node_operations: { title: '列出节点操作', category: '画布' },
  canvas_node_operation: { title: '执行节点操作', category: '画布' },

  // 生成与资产（3）
  generation_catalog: { title: '列出模型', category: '生成' },
  library_search: { title: '搜索资产库', category: '资产' },
  generation_propose: {
    title: '生成提案',
    category: '生成',
    expose: false
  },

  // 导演台（23）
  stage_get: { title: '读取导演台', category: '导演台' },
  stage_capabilities: { title: '读取导演台能力', category: '导演台' },
  stage_add_object: { title: '添加对象', category: '导演台' },
  stage_transform_object: { title: '变换对象', category: '导演台' },
  stage_add_camera: { title: '添加机位', category: '导演台' },
  stage_transform_camera: { title: '调整机位', category: '导演台' },
  stage_add_shot: { title: '添加镜头', category: '导演台' },
  stage_update_shot: { title: '修改镜头', category: '导演台' },
  stage_remove_shot: {
    title: '删除镜头',
    category: '导演台',
    destructive: true
  },
  stage_set_camera_track: { title: '设置运镜', category: '导演台' },
  stage_set_background: { title: '设置背景', category: '导演台' },
  stage_update_object: { title: '修改对象', category: '导演台' },
  stage_export_preview: { title: '导出预演', category: '导演台' },
  stage_set_active_camera: { title: '切换活动机位', category: '导演台' },
  stage_remove_object: {
    title: '删除对象',
    category: '导演台',
    destructive: true
  },
  stage_set_shot_intent: { title: '设置镜头意图', category: '导演台' },
  stage_clear_shot_intent: { title: '清除镜头意图', category: '导演台' },
  stage_auto_coverage: { title: '自动分镜', category: '导演台' },
  stage_dialogue_coverage: { title: '按对白分镜', category: '导演台' },
  stage_set_world: { title: '设置世界', category: '导演台' },
  stage_add_objects: { title: '批量添加对象', category: '导演台' },
  stage_randomize_world: { title: '随机化世界', category: '导演台' },
  stage_from_scene_image: {
    title: '从场景图生成白膜',
    category: '导演台'
  },

  // 剪辑室（17）
  timeline_get: { title: '读取时间线', category: '剪辑室' },
  timeline_set_video: { title: '设置画幅参数', category: '剪辑室' },
  timeline_select_clips: { title: '选择片段', category: '剪辑室' },
  timeline_move_clips: { title: '移动片段', category: '剪辑室' },
  timeline_trim_clip: { title: '裁剪片段', category: '剪辑室' },
  timeline_split_clips: { title: '切分片段', category: '剪辑室' },
  timeline_split_by_shots: { title: '按镜头切分', category: '剪辑室' },
  timeline_beat_markers: { title: '添加节拍标记', category: '剪辑室' },
  timeline_beat_split: { title: '按节拍切分', category: '剪辑室' },
  timeline_remove_clips: {
    title: '删除片段',
    category: '剪辑室',
    destructive: true
  },
  timeline_update_clip: { title: '修改片段', category: '剪辑室' },
  timeline_set_track: { title: '设置轨道', category: '剪辑室' },
  timeline_add_marker: { title: '添加标记', category: '剪辑室' },
  timeline_auto_subtitles: { title: '自动字幕', category: '剪辑室' },
  timeline_remove_silence: { title: '删除静音', category: '剪辑室' },
  timeline_set_transition: { title: '设置转场', category: '剪辑室' },
  timeline_export: { title: '导出时间线', category: '剪辑室' },

  // 拉片（11）
  film_study_get: { title: '读取拉片', category: '拉片' },
  film_study_get_shot: { title: '读取镜头', category: '拉片' },
  film_study_update_shot: { title: '修改镜头', category: '拉片' },
  film_study_remake: { title: '复刻镜头', category: '拉片' },
  film_study_split_scenes: { title: '自动分场', category: '拉片' },
  film_study_map_cast: { title: '选角选景', category: '拉片' },
  film_study_build_timeline: { title: '建时间线', category: '拉片' },
  film_study_auto: { title: '自动拉片', category: '拉片' },
  film_study_export: { title: '导出拉片', category: '拉片' },
  film_study_update_segment: { title: '修改段落', category: '拉片' },
  film_study_extract_subtitles: { title: '提取字幕', category: '拉片' },

  // 能力（2）
  capability_catalog: { title: '能力目录', category: '能力' },
  capability_search: { title: '搜索能力', category: '能力' },

  // 技能（2）
  skill_list: { title: '技能列表', category: '技能' },
  skill_read: { title: '读取技能', category: '技能' }
}
