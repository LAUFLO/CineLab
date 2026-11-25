import type {
  AgentGenerationModels,
  AgentScope,
  AgentToolCall
} from '@shared/agent'
import type { Capability } from '@shared/provider-schema'
import {
  DEFAULT_PREVIEW_OPTIONS,
  STAGE_ASPECTS,
  STAGE_EASINGS,
  STAGE_LIMITS,
  STAGE_OBJECT_TYPES,
  STAGE_POSE_PRESETS
} from '@shared/stage-schema'
import { listAllAssets } from '../library/store'
import { listProviders } from '../settings/store'
import { AGENT_CAPABILITIES } from './capabilities/registry'
import { listSkills, readSkill } from './skills'
import { createSkill, setSkillOverride } from './skills-admin'
import {
  installSkillImport,
  previewSkillImport
} from './skills-import'
import {
  deleteTemplate,
  listTemplates,
  saveTemplate
} from '../library/templates'
import {
  deleteStyle,
  listStyles,
  saveStyle
} from '../library/styles'
import { promises as fs } from 'node:fs'
import { extname } from 'node:path'
import { ingestAsset } from '../assets/ingest'
import { separateStems } from '../media/stems'
import { resolveMediaPath } from '../media/paths'
import {
  listWorkflows,
  readWorkflow,
  saveWorkflow
} from '../library/workflows'
import {
  openProject,
  saveCanvas
} from '../project/manager'
import { buildWorkflow } from '../workflows/build'
import { instantiateWorkflow } from '../workflows/instantiate'

export interface MainToolResult {
  ok: boolean
  result?: unknown
  error?: string
}

function outputKindOf(capability: Capability): string {
  if (capability.startsWith('image.')) return 'image'
  if (capability.startsWith('video.')) return 'video'
  if (capability.startsWith('audio.')) return 'audio'
  return 'text'
}

async function generationCatalog(
  capability?: string,
  selectedModels?: AgentGenerationModels
): Promise<MainToolResult> {
  const providers = await listProviders()
  const models: Array<Record<string, unknown>> = []

  for (const provider of providers) {
    if (!provider.hasKey) continue
    for (const model of provider.models) {
      const output = outputKindOf(model.capability)
      if (capability && output !== capability) continue
      const modelKey = `${provider.id}/${model.id}`
      models.push({
        modelKey,
        providerId: provider.id,
        providerName: provider.name,
        modelId: model.id,
        name: model.name,
        capability: model.capability,
        output,
        selected:
          selectedModels?.[
            output as keyof AgentGenerationModels
          ] === modelKey,
        inputs: model.inputs ?? [],
        operations: model.operations ?? [],
        params: model.params.map((param) => ({
          key: param.key,
          label: param.label,
          type: param.type,
          ...(param.defaultValue !== undefined
            ? { defaultValue: param.defaultValue }
            : {}),
          ...(param.options
            ? { options: param.options.map((option) => option.value) }
            : {}),
          ...(param.min !== undefined ? { min: param.min } : {}),
          ...(param.max !== undefined ? { max: param.max } : {}),
          ...(param.allowCustom ? { allowCustom: true } : {})
        }))
      })
    }
  }

  return {
    ok: true,
    result: {
      models,
      ...(models.length === 0
        ? { message: '没有可用的生成模型，请先在设置中配置供应商和 API Key' }
        : {})
    }
  }
}

async function librarySearch(
  query?: string,
  kind?: string,
  limit = 20
): Promise<MainToolResult> {
  const assets = await listAllAssets()
  const keyword = query?.trim().toLowerCase() ?? ''
  const filtered = assets.filter((asset) => {
    if (asset.kind === 'template') return false
    if (kind && asset.kind !== kind) return false
    if (!keyword) return true
    return (
      asset.name.toLowerCase().includes(keyword) ||
      asset.path.toLowerCase().includes(keyword)
    )
  })

  return {
    ok: true,
    result: {
      assets: filtered.slice(0, Math.max(1, Math.min(30, limit))).map((asset) => ({
        path: asset.path,
        name: asset.name,
        kind: asset.kind,
        size: asset.size,
        modifiedAt: asset.modifiedAt
      })),
      total: filtered.length
    }
  }
}

export async function executeMainTool(
  call: AgentToolCall,
  scope: AgentScope
): Promise<MainToolResult> {
  if (call.name === 'workflow_list') {
    const query =
      typeof call.args.query === 'string'
        ? call.args.query.trim().toLowerCase()
        : ''
    const limit =
      typeof call.args.limit === 'number' ? call.args.limit : 50
    let items = await listWorkflows()
    if (query) {
      items = items.filter((item) =>
        item.name.toLowerCase().includes(query)
      )
    }
    return {
      ok: true,
      result: {
        workflows: items.slice(0, Math.max(1, Math.min(100, limit))),
        total: items.length
      }
    }
  }

  if (call.name === 'workflow_save') {
    const name = String(call.args.name ?? '').trim()
    if (!name) return { ok: false, error: '工作流名称不能为空' }
    if (!scope.projectPath) return { ok: false, error: '没有打开的项目' }

    try {
      const snapshot = await openProject(scope.projectPath)
      const { package: pkg, thumbnail } = await buildWorkflow({
        name,
        description:
          typeof call.args.description === 'string'
            ? call.args.description
            : undefined,
        nodes: snapshot.canvas.nodes,
        edges: snapshot.canvas.edges,
        projectPath: scope.projectPath
      })
      return {
        ok: true,
        result: { workflow: await saveWorkflow(pkg, thumbnail) }
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  if (call.name === 'workflow_apply') {
    const slug = String(call.args.slug ?? '').trim()
    if (!slug) return { ok: false, error: 'slug 不能为空' }
    if (!scope.projectPath) return { ok: false, error: '没有打开的项目' }

    try {
      const snapshot = await openProject(scope.projectPath)
      const pkg = await readWorkflow(slug)
      const result = await instantiateWorkflow(pkg, {
        projectPath: scope.projectPath
      })
      await saveCanvas(scope.projectPath, {
        ...snapshot.canvas,
        nodes: [...snapshot.canvas.nodes, ...result.nodes],
        edges: [...snapshot.canvas.edges, ...result.edges]
      })
      return {
        ok: true,
        result: { nodeIds: result.nodeIds, warnings: result.warnings }
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  if (call.name === 'stage_capabilities') {
    return {
      ok: true,
      result: {
        objectTypes: STAGE_OBJECT_TYPES,
        posePresets: STAGE_POSE_PRESETS,
        easings: STAGE_EASINGS,
        aspects: STAGE_ASPECTS,
        limits: STAGE_LIMITS,
        preview: DEFAULT_PREVIEW_OPTIONS
      }
    }
  }

  if (call.name === 'generation_catalog') {
    return generationCatalog(
      typeof call.args.capability === 'string'
        ? call.args.capability
        : undefined,
      scope.generationModels
    )
  }

  if (call.name === 'library_search') {
    return librarySearch(
      typeof call.args.query === 'string' ? call.args.query : undefined,
      typeof call.args.kind === 'string' ? call.args.kind : undefined,
      typeof call.args.limit === 'number' ? call.args.limit : 20
    )
  }

  if (call.name === 'preset_list' || call.name === 'preset_search') {
    const kind =
      typeof call.args.kind === 'string' ? call.args.kind : undefined
    const query =
      typeof call.args.query === 'string'
        ? call.args.query.trim().toLowerCase()
        : ''
    const limit =
      typeof call.args.limit === 'number' ? call.args.limit : 50
    let templates = await listTemplates()
    if (kind) templates = templates.filter((item) => item.kind === kind)
    if (query) {
      templates = templates.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.prompt.toLowerCase().includes(query)
      )
    }
    const max = Math.max(1, Math.min(100, limit))
    return {
      ok: true,
      result: {
        templates: templates.slice(0, max).map((item) => ({
          id: item.id,
          name: item.name,
          kind: item.kind,
          updatedAt: item.updatedAt,
          preview:
            item.prompt.length > 200
              ? `${item.prompt.slice(0, 200)}…`
              : item.prompt
        })),
        total: templates.length
      }
    }
  }

  if (call.name === 'preset_read') {
    const id = String(call.args.id ?? '').trim()
    const templates = await listTemplates()
    const template = templates.find((item) => item.id === id)
    if (!template) return { ok: false, error: '找不到这个提示词模板' }
    return { ok: true, result: template }
  }

  if (call.name === 'style_list' || call.name === 'style_search') {
    const category =
      typeof call.args.category === 'string'
        ? call.args.category.trim()
        : undefined
    const query =
      typeof call.args.query === 'string'
        ? call.args.query.trim().toLowerCase()
        : ''
    const limit =
      typeof call.args.limit === 'number' ? call.args.limit : 50
    let styles = await listStyles()
    if (category) styles = styles.filter((item) => item.category === category)
    if (query) {
      styles = styles.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query) ||
          item.prompt.toLowerCase().includes(query)
      )
    }
    const max = Math.max(1, Math.min(100, limit))
    return {
      ok: true,
      result: {
        styles: styles.slice(0, max).map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          source: item.source,
          prompt: item.prompt
        })),
        total: styles.length
      }
    }
  }

  if (call.name === 'skill_toggle') {
    const entry = await setSkillOverride(scope.projectPath, {
      scope: call.args.scope === 'project' ? 'project' : 'global',
      name: String(call.args.name ?? ''),
      enabled: Boolean(call.args.enabled)
    })
    return { ok: true, result: entry }
  }

  if (call.name === 'skill_create') {
    const entry = await createSkill(scope.projectPath, {
      scope: call.args.scope === 'project' ? 'project' : 'global',
      name: String(call.args.name ?? ''),
      description: String(call.args.description ?? ''),
      ...(typeof call.args.version === 'string'
        ? { version: call.args.version }
        : {}),
      body: String(call.args.body ?? '')
    })
    return { ok: true, result: entry }
  }

  if (call.name === 'skill_import') {
    const kind = call.args.kind === 'zip' ? 'zip' : 'folder'
    const targetScope = call.args.scope === 'project' ? 'project' : 'global'
    const preview = await previewSkillImport({
      kind,
      sourcePath: String(call.args.path ?? ''),
      projectRoot: scope.projectPath
    })
    const entry = await installSkillImport({
      projectRoot: scope.projectPath,
      data: {
        token: preview.token,
        scope: targetScope,
        ...(call.args.overwrite === true ? { overwrite: true } : {})
      }
    })
    return { ok: true, result: entry }
  }

  if (call.name === 'asset_ingest') {
    const relative = String(call.args.path ?? '').trim()
    const absolute = await resolveMediaPath(scope.projectPath, relative)
    const data = await fs.readFile(absolute)
    const ext = extname(absolute).toLowerCase()
    const kind =
      call.args.kind === 'image' ||
      call.args.kind === 'video' ||
      call.args.kind === 'audio'
        ? call.args.kind
        : ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext)
          ? 'image'
          : ['.mp4', '.mov', '.webm', '.mkv', '.avi'].includes(ext)
            ? 'video'
            : 'audio'
    const mime =
      typeof call.args.mime === 'string'
        ? call.args.mime
        : kind === 'image'
          ? `image/${ext === '.jpg' ? 'jpeg' : ext.slice(1)}`
          : kind === 'video'
            ? `video/${ext === '.mov' ? 'quicktime' : ext.slice(1)}`
            : `audio/${ext.slice(1)}`
    const asset = await ingestAsset({
      projectPath: scope.projectPath,
      data,
      kind,
      mime,
      model: 'agent-import'
    })
    return { ok: true, result: asset }
  }

  if (call.name === 'stem_separate') {
    const path = String(call.args.path ?? '').trim()
    const mode = call.args.mode === 'background' ? 'background' : 'vocal'
    const sourceKind =
      call.args.sourceKind === 'video' || call.args.sourceKind === 'audio'
        ? call.args.sourceKind
        : undefined
    const result = await separateStems(scope.projectPath, {
      path,
      mode,
      ...(sourceKind ? { sourceKind } : {})
    })
    return { ok: true, result }
  }

  if (call.name === 'preset_create') {
    const template = await saveTemplate({
      name: String(call.args.name ?? ''),
      kind: String(call.args.kind ?? 'image') as
        | 'text'
        | 'image'
        | 'video'
        | 'audio',
      prompt: String(call.args.prompt ?? '')
    })
    return { ok: true, result: template }
  }

  if (call.name === 'preset_update') {
    const id = String(call.args.id ?? '').trim()
    const existing = (await listTemplates()).find((item) => item.id === id)
    if (!existing) return { ok: false, error: '找不到这个提示词模板' }
    const template = await saveTemplate({
      id,
      name:
        typeof call.args.name === 'string' && call.args.name.trim()
          ? call.args.name
          : existing.name,
      kind:
        typeof call.args.kind === 'string'
          ? (call.args.kind as 'text' | 'image' | 'video' | 'audio')
          : existing.kind,
      prompt:
        typeof call.args.prompt === 'string'
          ? call.args.prompt
          : existing.prompt
    })
    return { ok: true, result: template }
  }

  if (call.name === 'preset_delete') {
    await deleteTemplate(String(call.args.id ?? ''))
    return { ok: true, result: { id: call.args.id } }
  }

  if (call.name === 'style_create') {
    const style = await saveStyle({
      name: String(call.args.name ?? ''),
      category: String(call.args.category ?? ''),
      prompt: String(call.args.prompt ?? '')
    })
    return { ok: true, result: style }
  }

  if (call.name === 'style_update') {
    const id = String(call.args.id ?? '').trim()
    const existing = (await listStyles()).find((item) => item.id === id)
    if (!existing) return { ok: false, error: '找不到这个风格' }
    if (existing.source === 'official') {
      return { ok: false, error: '官方风格不能修改' }
    }
    const style = await saveStyle({
      id,
      name:
        typeof call.args.name === 'string' && call.args.name.trim()
          ? call.args.name
          : existing.name,
      category:
        typeof call.args.category === 'string'
          ? call.args.category
          : existing.category,
      prompt:
        typeof call.args.prompt === 'string'
          ? call.args.prompt
          : existing.prompt
    })
    return { ok: true, result: style }
  }

  if (call.name === 'style_delete') {
    await deleteStyle(String(call.args.id ?? ''))
    return { ok: true, result: { id: call.args.id } }
  }

  if (call.name === 'style_read') {
    const id = String(call.args.id ?? '').trim()
    const styles = await listStyles()
    const style = styles.find((item) => item.id === id)
    if (!style) return { ok: false, error: '找不到这个风格' }
    return { ok: true, result: style }
  }

  if (call.name === 'capability_search') {
    const query = String(call.args.query ?? '').trim().toLowerCase()
    const limit =
      typeof call.args.limit === 'number' ? call.args.limit : 10
    const tokens = query.split(/\s+/).filter(Boolean)
    const matches = AGENT_CAPABILITIES.filter((item) => {
      const haystack =
        `${item.toolName} ${item.id} ${item.description}`.toLowerCase()
      return tokens.every((token) => haystack.includes(token))
    })

    return {
      ok: true,
      result: {
        tools: matches.slice(0, Math.max(1, Math.min(30, limit))).map(
          (item) => ({
            name: item.toolName,
            id: item.id,
            description: item.description,
            scope: item.scope,
            readOnly: item.readOnly,
            confirmation: item.confirmation,
            profiles: item.profiles
          })
        ),
        total: matches.length
      }
    }
  }

  if (call.name === 'skill_list') {
    return {
      ok: true,
      result: {
        skills: await listSkills(scope.projectPath)
      }
    }
  }

  if (call.name === 'skill_read') {
    const name = String(call.args.name ?? '').trim()
    const skills = await listSkills(scope.projectPath)
    const skill = skills.find((item) => item.name === name)
    if (skill?.disableModelInvocation) {
      return {
        ok: false,
        error: '该技能只能由用户显式选择后读取'
      }
    }
    const path =
      typeof call.args.path === 'string' ? call.args.path : undefined
    const offset =
      typeof call.args.offset === 'number' ? call.args.offset : undefined
    const limit =
      typeof call.args.limit === 'number' ? call.args.limit : undefined
    return {
      ok: true,
      result: await readSkill({
        root: scope.projectPath,
        name,
        ...(path ? { path } : {}),
        ...(offset !== undefined ? { offset } : {}),
        ...(limit !== undefined ? { limit } : {})
      })
    }
  }

  return {
    ok: false,
    error: `未实现的主进程工具：${call.name}`
  }
}
