import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import type {
  AgentModelInfo,
  AgentProposal,
  AgentReference
} from '@shared/agent'
import type { SkillAdminEntry } from '@shared/skills'
import { proposalStatusLabel } from '@shared/agent-proposal'
import { Icon } from '../components/Icon'
import {
  isGroupNode,
  selectedNodeOutput,
  useCanvasStore
} from '../stores/canvas'
import { useSettingsStore } from '../stores/settings'
import { useStudioStore } from '../stores/studio'
import { useUIStore } from '../stores/ui'
import {
  AGENT_CONTEXT_BUDGET_TOKENS,
  agentContextStats,
  agentTurnChangeCount,
  useAgentStore,
  type AgentMessage
} from './agentStore'
import agentIcon from '../assets/agent-icon.svg'
import '../styles/agent.css'

const TOOL_LABELS: Record<string, string> = {
  canvas_get: '读取画布',
  canvas_update_title: '修改标题',
  canvas_move_node: '移动节点',
  canvas_add_node: '添加节点',
  canvas_connect: '连接节点',
  canvas_delete_node: '删除节点',
  canvas_group: '分组节点',
  canvas_ungroup: '解散分组',
  generation_catalog: '查看生成模型',
  generation_propose: '登记生成提案',
  library_search: '搜索资产库',
  stage_get: '读取导演台',
  stage_capabilities: '读取导演台能力',
  stage_add_object: '添加场景对象',
  stage_transform_object: '移动场景对象',
  stage_add_camera: '添加机位',
  stage_set_active_camera: '切换机位',
  stage_remove_object: '删除场景对象',
  timeline_get: '读取时间线',
  timeline_select_clips: '选择片段',
  timeline_move_clips: '移动片段',
  timeline_trim_clip: '裁剪片段',
  timeline_split_clips: '切分片段',
  timeline_remove_clips: '删除片段',
  timeline_update_clip: '调整片段',
  timeline_set_track: '调整轨道',
  timeline_add_marker: '添加标记',
  timeline_auto_subtitles: '自动字幕',
  timeline_remove_silence: '删除静音',
  timeline_set_transition: '设置转场',
  timeline_export: '导出成片',
  skill_list: '查看技能',
  skill_read: '读取技能'
}

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name
}

function relativeTime(iso: string): string {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return ''
  const diff = Date.now() - time
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时`
  return new Date(time).toLocaleDateString('zh-CN')
}

function modelNameOf(model: AgentModelInfo | null): string {
  if (!model) return '选择模型'
  return model.name
}

interface MentionItem {
  key: string
  name: string
  kind: 'image' | 'video' | 'audio'
  path: string
  scope: 'project' | 'global'
  nodeId?: string
}

function ContextRing({
  percent,
  compacting,
  title,
  disabled,
  onClick
}: {
  percent: number
  compacting: boolean
  title: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`agent-context-ring ${
        percent >= 80 ? 'is-high' : ''
      }`}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle className="agent-context-ring__track" cx="16" cy="16" r="13" />
        <circle
          className="agent-context-ring__value"
          cx="16"
          cy="16"
          r="13"
          pathLength={100}
          strokeDasharray={`${Math.max(0, Math.min(100, percent))} ${
            100 - Math.max(0, Math.min(100, percent))
          }`}
        />
      </svg>
      <span>{compacting ? '…' : `${percent}%`}</span>
    </button>
  )
}

function MessageActions({
  content
}: {
  content: string
}) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="agent-message__actions">
      <button
        type="button"
        title="复制"
        onClick={() => {
          void navigator.clipboard
            .writeText(content)
            .then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1200)
            })
            .catch(() => undefined)
        }}
      >
        <Icon name={copied ? 'history' : 'copy'} size={12} />
      </button>
    </div>
  )
}

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const token = match[0]
    const key = `${match.index}-${token.slice(0, 8)}`
    if (token.startsWith('**')) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else {
      parts.push(<code key={key}>{token.slice(1, -1)}</code>)
    }
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function MessageBubble({ message }: { message: AgentMessage }) {
  return (
    <div className={`agent-message agent-message--${message.role}`}>
      <div className="agent-message__content">
        {message.role === 'assistant'
          ? renderInline(message.content)
          : message.content}
      </div>
      {message.role === 'assistant' && message.content.trim() ? (
        <MessageActions content={message.content} />
      ) : null}
    </div>
  )
}

function ThoughtGroup({ tools }: { tools: AgentMessage[] }) {
  const hasProblem = tools.some(
    (tool) => tool.toolStatus === 'error' || tool.toolStatus === 'running'
  )
  const [open, setOpen] = useState(hasProblem)

  useEffect(() => {
    if (hasProblem) setOpen(true)
  }, [hasProblem])

  return (
    <details
      className="agent-thoughts"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <Icon name="sparkles" size={12} />
        <span>思考过程</span>
        <small>{tools.length} 步</small>
        <Icon name="chevron-down" size={12} className="agent-thoughts__chev" />
      </summary>
      <div className="agent-thoughts__list">
        {tools.map((tool) => (
          <div
            key={tool.id}
            className={`agent-thought agent-thought--${tool.toolStatus ?? 'running'}`}
          >
            <span className="agent-thought__dot" />
            <span className="agent-thought__name">
              {toolLabel(tool.toolName ?? '')}
            </span>
            <span className="agent-thought__status">
              {tool.toolStatus === 'running'
                ? '执行中'
                : tool.toolStatus === 'error'
                  ? '未完成'
                  : '完成'}
            </span>
            {tool.toolStatus === 'error' ? (
              <div className="agent-thought__error">{tool.content}</div>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  )
}

type RenderItem =
  | { kind: 'message'; message: AgentMessage }
  | { kind: 'thoughts'; id: string; tools: AgentMessage[] }

function buildRenderItems(messages: AgentMessage[]): RenderItem[] {
  const items: RenderItem[] = []
  let tools: AgentMessage[] = []

  const flush = (): void => {
    if (tools.length === 0) return
    items.push({
      kind: 'thoughts',
      id: tools[0].callId ?? tools[0].id,
      tools
    })
    tools = []
  }

  for (const message of messages) {
    if (message.role === 'tool') {
      tools.push(message)
      continue
    }
    flush()
    items.push({ kind: 'message', message })
  }
  flush()
  return items
}

function ProposalCard({
  proposal,
  busy,
  onSubmit,
  onCancel
}: {
  proposal: AgentProposal
  busy: boolean
  onSubmit: () => void
  onCancel: () => void
}) {
  const pending = proposal.status === 'pending'
  const params = Object.entries(proposal.request.params)
    .filter(
      ([key, value]) =>
        key !== 'negative_prompt' &&
        (typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean')
    )
    .slice(0, 5)
    .map(([key, value]) => `${key}=${String(value)}`)
  const refNames = [
    ...(proposal.request.refs ?? []).map(
      (ref) => ref.path.split('/').pop() ?? ref.path
    ),
    ...(proposal.request.video
      ? [proposal.request.video.path.split('/').pop() ?? proposal.request.video.path]
      : [])
  ]

  return (
    <section className={`agent-proposal agent-proposal--${proposal.status}`}>
      <header className="agent-proposal__head">
        <span className="agent-proposal__title">生成提案</span>
        <span className="agent-proposal__status">
          {proposalStatusLabel(proposal.status)}
        </span>
      </header>
      <div className="agent-proposal__row">
        <span>节点</span>
        <strong>{proposal.nodeTitle || proposal.request.nodeId}</strong>
      </div>
      <div className="agent-proposal__row">
        <span>模型</span>
        <strong>{proposal.modelName}</strong>
      </div>
      {refNames.length > 0 ? (
        <div className="agent-proposal__row">
          <span>引用</span>
          <strong title={refNames.join('、')}>
            {refNames.length} 个 · {refNames.slice(0, 2).join('、')}
            {refNames.length > 2 ? ' …' : ''}
          </strong>
        </div>
      ) : null}
      {params.length > 0 ? (
        <div className="agent-proposal__row">
          <span>参数</span>
          <strong>{params.join(' · ')}</strong>
        </div>
      ) : null}
      <div className="agent-proposal__row">
        <span>数量</span>
        <strong>{proposal.count}</strong>
      </div>
      <div className="agent-proposal__prompt">{proposal.request.prompt}</div>
      {proposal.error ? (
        <div className="agent-proposal__error">{proposal.error}</div>
      ) : null}
      {pending ? (
        <div className="agent-proposal__actions">
          <button
            type="button"
            className="agent-proposal__confirm"
            onClick={onSubmit}
            disabled={busy}
          >
            {busy ? '提交中…' : '确认生成'}
          </button>
          <button
            type="button"
            className="agent-proposal__cancel"
            onClick={onCancel}
            disabled={busy}
          >
            取消
          </button>
        </div>
      ) : proposal.status === 'submitted' ? (
        <div className="agent-proposal__hint">
          已提交，生成完成后会自动写回节点。
        </div>
      ) : proposal.status === 'failed' ? (
        <div className="agent-proposal__hint">
          该提案已提交过，不会重复扣费；请让 CineBot 重新生成。
        </div>
      ) : proposal.status === 'expired' ? (
        <div className="agent-proposal__hint">
          提案已失效，请让 CineBot 重新生成。
        </div>
      ) : null}
    </section>
  )
}

export function AgentPanel() {
  const visible = useAgentStore((state) => state.visible)
  const sessionId = useAgentStore((state) => state.sessionId)
  const sessionTitle = useAgentStore((state) => state.sessionTitle)
  const sessions = useAgentStore((state) => state.sessions)
  const messages = useAgentStore((state) => state.messages)
  const attachments = useAgentStore((state) => state.attachments)
  const references = useAgentStore((state) => state.references)
  const contextSummary = useAgentStore((state) => state.contextSummary)
  const compacting = useAgentStore((state) => state.compacting)
  const running = useAgentStore((state) => state.running)
  const error = useAgentStore((state) => state.error)
  const modelInfo = useAgentStore((state) => state.modelInfo)
  const modelKey = useAgentStore((state) => state.modelKey)
  const allModels = useAgentStore((state) => state.allModels)
  const generationModels = useAgentStore((state) => state.generationModels)
  const permissionMode = useAgentStore((state) => state.permissionMode)
  const lastTurn = useAgentStore((state) => state.lastTurn)
  const proposal = useAgentStore((state) => state.proposal)
  const proposalBusy = useAgentStore((state) => state.proposalBusy)
  const pendingConfirm = useAgentStore((state) => state.pendingConfirm)
  const confirming = useAgentStore((state) => state.confirming)

  const toggle = useAgentStore((state) => state.toggle)
  const close = useAgentStore((state) => state.close)
  const send = useAgentStore((state) => state.send)
  const cancel = useAgentStore((state) => state.cancel)
  const setPermissionMode = useAgentStore((state) => state.setPermissionMode)
  const attachLocalAssets = useAgentStore((state) => state.attachLocalAssets)
  const removeAttachment = useAgentStore((state) => state.removeAttachment)
  const addReference = useAgentStore((state) => state.addReference)
  const removeReference = useAgentStore((state) => state.removeReference)
  const compactContext = useAgentStore((state) => state.compactContext)
  const loadSessions = useAgentStore((state) => state.loadSessions)
  const newSession = useAgentStore((state) => state.newSession)
  const selectSession = useAgentStore((state) => state.selectSession)
  const deleteSession = useAgentStore((state) => state.deleteSession)
  const loadModelInfo = useAgentStore((state) => state.loadModelInfo)
  const loadModels = useAgentStore((state) => state.loadModels)
  const setModelKey = useAgentStore((state) => state.setModelKey)
  const setGenerationModel = useAgentStore((state) => state.setGenerationModel)
  const loadProposal = useAgentStore((state) => state.loadProposal)
  const submitProposal = useAgentStore((state) => state.submitProposal)
  const cancelProposal = useAgentStore((state) => state.cancelProposal)
  const confirmTool = useAgentStore((state) => state.confirmTool)
  const undoLastTurn = useAgentStore((state) => state.undoLastTurn)
  const clearError = useAgentStore((state) => state.clearError)

  const clipMode = useStudioStore((state) => state.open)
  const openSettings = useSettingsStore((state) => state.openPanel)
  const requestConfirm = useUIStore((state) => state.requestConfirm)
  const showToast = useUIStore((state) => state.showToast)
  const [draft, setDraft] = useState('')
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false)
  const [sessionSearch, setSessionSearch] = useState('')
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false)
  const [skillPickerOpen, setSkillPickerOpen] = useState(false)
  const [skillSearch, setSkillSearch] = useState('')
  const [skills, setSkills] = useState<SkillAdminEntry[]>([])
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const [skillIndex, setSkillIndex] = useState(0)
  const mentionLoadedRef = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!visible) return
    void loadSessions()
    void loadModels()
    void loadModelInfo()
  }, [visible, loadSessions, loadModels, loadModelInfo])

  useEffect(() => {
    if (!visible || !sessionId) return
    void loadProposal()
  }, [visible, sessionId, loadProposal])

  useEffect(() => {
    if (!visible) return
    const element = listRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages, visible])

  useEffect(() => {
    if (
      !sessionMenuOpen &&
      !modelPickerOpen &&
      !permissionMenuOpen &&
      !skillPickerOpen
    ) {
      return
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (!panelRef.current) return
      if (
        event.target instanceof Node &&
        panelRef.current.contains(event.target)
      ) {
        return
      }
      setSessionMenuOpen(false)
      setModelPickerOpen(false)
      setPermissionMenuOpen(false)
      setSkillPickerOpen(false)
      setMentionOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [
    sessionMenuOpen,
    modelPickerOpen,
    permissionMenuOpen,
    skillPickerOpen,
    mentionOpen
  ])

  const submit = (): void => {
    const text = draft.trim()
    if (!text || running) return
    setDraft('')
    setSessionMenuOpen(false)
    void send(text)
  }

  const suggestion = clipMode
    ? '把选中片段整体前移 1 秒'
    : attachments.length > 0 || references.length > 0
      ? '用引用的素材生成一段视频'
      : '帮我整理一下当前选中的节点'
  const changedCount = agentTurnChangeCount(lastTurn)
  const contextStats = useMemo(
    () => agentContextStats(messages, contextSummary),
    [messages, contextSummary]
  )
  const contextTitle = compacting
    ? '正在压缩上下文…'
    : `对话上下文约 ${contextStats.usedTokens.toLocaleString()} / ${Math.round(
        AGENT_CONTEXT_BUDGET_TOKENS / 1000
      )}K tokens${
        contextStats.coveredMessages > 0
          ? `，已压缩 ${contextStats.coveredMessages} 条旧消息`
          : ''
      }；点击手动压缩`
  const requestCompact = (): void => {
    if (running || compacting) return
    if (contextStats.compactableMessages === 0) {
      showToast('当前上下文较短，不需要压缩', 'info')
      return
    }
    requestConfirm({
      title: '压缩上下文',
      message: `当前约 ${contextStats.usedTokens.toLocaleString()} tokens。将把较早的 ${contextStats.compactableMessages} 条对话总结成摘要，后续对话使用摘要；原始消息仍保留在会话记录中。`,
      confirmLabel: '压缩',
      onConfirm: () => {
        void compactContext()
      }
    })
  }
  const renderItems = useMemo(() => buildRenderItems(messages), [messages])
  const visibleSessions = sessions.filter(
    (session) =>
      session.messageCount > 0 || session.sessionId === sessionId
  )
  const filteredSessions = visibleSessions.filter((session) => {
    const query = sessionSearch.trim().toLowerCase()
    if (!query) return true
    return (
      session.title.toLowerCase().includes(query) ||
      (session.preview ?? '').toLowerCase().includes(query)
    )
  })
  const filteredSkills = skills.filter(
    (skill) =>
      skill.enabled &&
      (!skillSearch.trim() ||
        skill.name.toLowerCase().includes(skillSearch.trim().toLowerCase()) ||
        skill.description
          .toLowerCase()
          .includes(skillSearch.trim().toLowerCase()))
  )
  const filteredMentionItems = mentionItems
    .filter((item) => {
      const query = mentionQuery.trim().toLowerCase()
      if (!query) return true
      return (
        item.name.toLowerCase().includes(query) ||
        item.path.toLowerCase().includes(query)
      )
    })
    .slice(0, 24)

  const openSkillPicker = (): void => {
    setSkillPickerOpen(true)
    setSkillSearch('')
    setSkillIndex(0)
    setMentionOpen(false)
    void window.api.skills.list().then(setSkills).catch(() => setSkills([]))
  }

  const loadMentionItems = async (): Promise<void> => {
    if (mentionLoadedRef.current) return
    mentionLoadedRef.current = true
    const items: MentionItem[] = []
    const seen = new Set<string>()
    const push = (item: MentionItem): void => {
      const key = `${item.scope}:${item.path}`
      if (seen.has(key)) return
      seen.add(key)
      items.push(item)
    }

    const nodes = useCanvasStore.getState().nodes
    for (const node of nodes) {
      if (isGroupNode(node)) continue
      const output = selectedNodeOutput(node)
      if (
        !output ||
        (output.kind !== 'image' &&
          output.kind !== 'video' &&
          output.kind !== 'audio')
      ) {
        continue
      }
      push({
        key: `node:${node.id}`,
        name: String(
          (node.data as { title?: unknown }).title ?? '未命名素材'
        ),
        kind: output.kind,
        path: output.path,
        scope: output.scope ?? 'project',
        nodeId: node.id
      })
    }

    try {
      const assets = await window.api.library.listAllAssets()
      for (const asset of assets) {
        if (asset.kind === 'template') continue
        push({
          key: `asset:${asset.path}`,
          name: asset.name,
          kind: asset.kind,
          path: asset.path,
          scope: 'global'
        })
      }
    } catch {
      // 资产库读取失败时仅展示画布素材
    }

    setMentionItems(items.slice(0, 80))
  }

  const syncInputTriggers = (value: string): void => {
    const mentionMatch = /(^|[^\w@])@([^\s@]*)$/.exec(value)
    if (mentionMatch) {
      setSkillPickerOpen(false)
      setPermissionMenuOpen(false)
      setMentionOpen(true)
      setMentionQuery(mentionMatch[2] ?? '')
      setMentionIndex(0)
      if (!mentionLoadedRef.current) void loadMentionItems()
    } else if (mentionOpen) {
      setMentionOpen(false)
      setMentionQuery('')
    }

    const slashMatch = /(^|[^\w/])\/([^\s/]*)$/.exec(value)
    if (slashMatch && !mentionMatch) {
      if (!skillPickerOpen) {
        setSkillPickerOpen(true)
        setSkillIndex(0)
        void window.api.skills.list().then(setSkills).catch(() => setSkills([]))
      }
      setSkillSearch(slashMatch[2] ?? '')
    }
  }

  const insertReference = (item: MentionItem): void => {
    addReference({
      ...(item.nodeId ? { nodeId: item.nodeId } : {}),
      name: item.name,
      path: item.path,
      scope: item.scope,
      kind: item.kind
    })
    setDraft((current) =>
      current.replace(/(^|[^\w@])@[^\s@]*$/, '$1').trimEnd()
    )
    setMentionOpen(false)
    setMentionQuery('')
    setMentionIndex(0)
    textareaRef.current?.focus()
  }

  const insertSkill = (skill: SkillAdminEntry): void => {
    setDraft((current) => {
      const cleaned = current
        .replace(/(^|[^\w/])\/[^\s/]*$/, '$1')
        .trimEnd()
      return cleaned
        ? `${cleaned} 使用技能：${skill.name}`
        : `使用技能：${skill.name}`
    })
    setSkillPickerOpen(false)
    textareaRef.current?.focus()
  }

  const confirmDeleteSession = (
    session: (typeof sessions)[number]
  ): void => {
    requestConfirm({
      title: '删除对话',
      message: `确定删除「${session.title}」？该对话的消息和生成提案会被删除，无法恢复。`,
      confirmLabel: '删除',
      onConfirm: () => {
        setSessionMenuOpen(false)
        void deleteSession(session.sessionId)
      }
    })
  }

  const modelGroups: Array<{
    key: 'text' | 'image' | 'video' | 'audio'
    label: string
    desc: string
    selected: string | null
    models: AgentModelInfo[]
    setModel: (modelKey: string | null) => Promise<void>
  }> = [
    {
      key: 'text',
      label: '文本对话',
      desc: '用于 CineBot 对话和工具调用',
      selected: modelKey,
      models: allModels.filter((model) => model.output === 'text'),
      setModel: setModelKey
    },
    {
      key: 'image',
      label: '生图',
      desc: 'CineBot 登记图片生成时使用',
      selected: generationModels.image ?? null,
      models: allModels.filter((model) => model.output === 'image'),
      setModel: (key) => setGenerationModel('image', key)
    },
    {
      key: 'video',
      label: '生视频',
      desc: 'CineBot 登记视频生成时使用',
      selected: generationModels.video ?? null,
      models: allModels.filter((model) => model.output === 'video'),
      setModel: (key) => setGenerationModel('video', key)
    },
    {
      key: 'audio',
      label: '音频',
      desc: 'CineBot 登记音频生成时使用',
      selected: generationModels.audio ?? null,
      models: allModels.filter((model) => model.output === 'audio'),
      setModel: (key) => setGenerationModel('audio', key)
    }
  ]

  const panel = createPortal(
    <>
      {visible ? (
        <section className="agent-panel" aria-label="CineBot" ref={panelRef}>
          <header className="agent-panel__head">
            <button
              type="button"
              className="agent-session-trigger"
              onClick={() => setSessionMenuOpen((open) => !open)}
              title="CineBot 历史对话"
            >
              <span className="agent-session-brand">CineBot</span>
              <span className="agent-session-divider">·</span>
              <span className="agent-session-title">
                {sessionTitle || '新对话'}
              </span>
              <Icon name="chevron-down" size={12} />
            </button>
            <div className="agent-panel__head-actions">
              {running ? <span className="agent-running-dot" /> : null}
              <button
                type="button"
                className="agent-icon-button"
                title="新对话"
                onClick={() => void newSession()}
                disabled={running}
              >
                <Icon name="plus" size={15} />
              </button>
              <button
                type="button"
                className="agent-icon-button"
                title="收起 CineBot"
                onClick={close}
              >
                <Icon name="chevron-down" size={15} />
              </button>
            </div>
          </header>

          {sessionMenuOpen ? (
            <div className="agent-popover agent-session-menu">
              <div className="agent-popover__title">历史对话</div>
              <div className="agent-popover__search">
                <Icon name="search" size={13} />
                <input
                  autoFocus
                  value={sessionSearch}
                  onChange={(event) => setSessionSearch(event.target.value)}
                  placeholder="搜索历史对话"
                />
              </div>
              <button
                type="button"
                className="agent-session-new"
                onClick={() => {
                  setSessionMenuOpen(false)
                  void newSession()
                }}
                disabled={running}
              >
                <Icon name="plus" size={13} />
                新对话
              </button>
              <div className="agent-session-list">
                {filteredSessions.length === 0 ? (
                  <div className="agent-session-empty">没有匹配的对话</div>
                ) : (
                  filteredSessions.map((session) => (
                    <div
                      key={session.sessionId}
                      className={`agent-session-item ${
                        session.sessionId === sessionId ? 'is-active' : ''
                      }`}
                    >
                      <button
                        type="button"
                        className="agent-session-item__main"
                        onClick={() => {
                          setSessionMenuOpen(false)
                          void selectSession(session.sessionId)
                        }}
                        disabled={running}
                      >
                        <span>{session.title}</span>
                        <small>{relativeTime(session.updatedAt)}</small>
                      </button>
                      <button
                        type="button"
                        className="agent-session-item__delete"
                        title="删除对话"
                        disabled={running}
                        onClick={(event) => {
                          event.stopPropagation()
                          confirmDeleteSession(session)
                        }}
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <div className="agent-panel__messages" ref={listRef}>
            {messages.length === 0 ? (
              <div className="agent-empty">
                <img className="agent-empty__icon" src={agentIcon} alt="" />
                <div className="agent-empty__title">我是 CineBot</div>
                <div className="agent-empty__desc">
                  {clipMode
                    ? '我可以读取时间线、移动片段、自动字幕、删静音、设置转场或导出成片。'
                    : '我可以整理画布、引用画布或资产库素材、登记生成提案，也可以读取你的技能。先点下方「上传」添加本地素材。'}
                </div>
                <button
                  type="button"
                  className="agent-suggestion"
                  onClick={() => {
                    setDraft(suggestion)
                    textareaRef.current?.focus()
                  }}
                >
                  {suggestion}
                </button>
              </div>
            ) : (
              renderItems.map((item) =>
                item.kind === 'thoughts' ? (
                  <ThoughtGroup key={item.id} tools={item.tools} />
                ) : (
                  <MessageBubble key={item.message.id} message={item.message} />
                )
              )
            )}
          </div>

          {pendingConfirm ? (
            <section className="agent-confirm">
              <header className="agent-confirm__head">
                <span>需要确认</span>
                <span className="agent-confirm__tool">
                  {toolLabel(pendingConfirm.call.name)}
                </span>
              </header>
              <div className="agent-confirm__reason">
                {pendingConfirm.reason}
              </div>
              <div className="agent-confirm__actions">
                <button
                  type="button"
                  className="agent-confirm__approve"
                  disabled={confirming}
                  onClick={() => void confirmTool(true)}
                >
                  {confirming ? '处理中…' : '允许一次'}
                </button>
                <button
                  type="button"
                  className="agent-confirm__reject"
                  disabled={confirming}
                  onClick={() => void confirmTool(false)}
                >
                  取消
                </button>
              </div>
            </section>
          ) : null}

          {proposal ? (
            <ProposalCard
              proposal={proposal}
              busy={proposalBusy}
              onSubmit={() => void submitProposal()}
              onCancel={() => void cancelProposal()}
            />
          ) : null}

          {error ? (
            <div className="agent-error" role="status">
              <span>{error}</span>
              <button type="button" onClick={clearError}>
                知道了
              </button>
            </div>
          ) : null}

          {changedCount > 0 ? (
            <div className="agent-change">
              <span>本轮修改了 {changedCount} 处</span>
              <button type="button" onClick={undoLastTurn} disabled={running}>
                撤销这一轮
              </button>
            </div>
          ) : null}

          <div className="agent-composer">
            {attachments.length > 0 || references.length > 0 ? (
              <div className="agent-attachments">
                {attachments.map((item) => (
                  <span className="agent-attachment" key={item.nodeId}>
                    <Icon
                      name={
                        item.kind === 'video'
                          ? 'video'
                          : item.kind === 'audio'
                            ? 'audio'
                            : 'image'
                      }
                      size={11}
                    />
                    <span className="agent-attachment__name">{item.name}</span>
                    <button
                      type="button"
                      title="移除附件"
                      disabled={running}
                      onClick={() => removeAttachment(item.nodeId)}
                    >
                      <Icon name="close" size={10} />
                    </button>
                  </span>
                ))}
                {references.map((item) => (
                  <span
                    className="agent-attachment agent-attachment--reference"
                    key={`${item.scope}:${item.path}`}
                  >
                    <Icon
                      name={
                        item.kind === 'video'
                          ? 'video'
                          : item.kind === 'audio'
                            ? 'audio'
                            : 'image'
                      }
                      size={11}
                    />
                    <span className="agent-attachment__name">
                      @{item.name}
                    </span>
                    <button
                      type="button"
                      title="移除引用"
                      disabled={running}
                      onClick={() => removeReference(item)}
                    >
                      <Icon name="close" size={10} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            {mentionOpen ? (
              <div className="agent-mention-popover">
                <div className="agent-popover__title">引用素材</div>
                <div className="agent-mention-list">
                  {filteredMentionItems.length === 0 ? (
                    <div className="agent-modal__empty">
                      没有匹配的素材
                    </div>
                  ) : (
                    filteredMentionItems.map((item, index) => (
                      <button
                        key={item.key}
                        type="button"
                        className={`agent-mention-item ${
                          index === mentionIndex ? 'is-active' : ''
                        }`}
                        onMouseEnter={() => setMentionIndex(index)}
                        onClick={() => insertReference(item)}
                      >
                        <Icon
                          name={
                            item.kind === 'video'
                              ? 'video'
                              : item.kind === 'audio'
                                ? 'audio'
                                : 'image'
                          }
                          size={13}
                        />
                        <span>{item.name}</span>
                        <small>
                          {item.nodeId ? '画布' : '资产库'}
                        </small>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => {
                const value = event.target.value
                setDraft(value)
                syncInputTriggers(value)
              }}
              onKeyDown={(event) => {
                if (mentionOpen) {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setMentionIndex((index) =>
                      Math.min(
                        index + 1,
                        Math.max(0, filteredMentionItems.length - 1)
                      )
                    )
                    return
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setMentionIndex((index) => Math.max(0, index - 1))
                    return
                  }
                  if (event.key === 'Enter') {
                    const item = filteredMentionItems[mentionIndex]
                    if (item) {
                      event.preventDefault()
                      insertReference(item)
                      return
                    }
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setMentionOpen(false)
                    return
                  }
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submit()
                }
              }}
              placeholder={
                clipMode
                  ? '描述你想怎么剪，例如：把选中片段前移 1 秒'
                  : '输入 @ 引用素材，输入 / 选择技能'
              }
              disabled={running}
              rows={2}
              onFocus={() => {
                if (skillPickerOpen) setSkillPickerOpen(false)
                if (permissionMenuOpen) setPermissionMenuOpen(false)
              }}
            />
            <div className="agent-composer__bar">
              <div className="agent-composer__chips">
                <button
                  type="button"
                  className="agent-chip"
                  onClick={() => void attachLocalAssets()}
                  disabled={running}
                  title="上传本地素材到画布"
                >
                  <Icon name="paperclip" size={12} />
                  上传
                </button>
                <button
                  type="button"
                  className="agent-chip"
                  onClick={() => setModelPickerOpen(true)}
                  title="选择文本模型"
                >
                  <Icon name="robot" size={12} />
                  {modelNameOf(modelInfo)}
                </button>
                <span className="agent-chip-anchor">
                  <button
                    type="button"
                    className="agent-chip"
                    onClick={() => setPermissionMenuOpen((open) => !open)}
                    title="权限范围"
                  >
                    <Icon name="target" size={12} />
                    {permissionMode === 'read-only' ? '只读' : '当前空间'}
                  </button>
                  {permissionMenuOpen ? (
                    <div className="agent-permission-menu">
                      <button
                        type="button"
                        className={
                          permissionMode === 'read-only' ? 'is-active' : ''
                        }
                        onClick={() => {
                          setPermissionMode('read-only')
                          setPermissionMenuOpen(false)
                        }}
                      >
                        <span>只读</span>
                        <small>只读取，不修改画布或时间线</small>
                      </button>
                      <button
                        type="button"
                        className={
                          permissionMode === 'current' ? 'is-active' : ''
                        }
                        onClick={() => {
                          setPermissionMode('current')
                          setPermissionMenuOpen(false)
                        }}
                      >
                        <span>当前空间</span>
                        <small>允许修改当前画布或时间线</small>
                      </button>
                    </div>
                  ) : null}
                </span>
                <span className="agent-chip-anchor agent-chip-anchor--skill">
                  <button
                    type="button"
                    className="agent-chip"
                    onClick={openSkillPicker}
                    title="选择技能"
                  >
                    <Icon name="sparkles" size={12} />
                    技能
                  </button>
                  {skillPickerOpen ? (
                    <div className="agent-skill-popover">
                      <div className="agent-popover__title">选择技能</div>
                      <div className="agent-popover__search">
                        <Icon name="search" size={13} />
                        <input
                          autoFocus
                          value={skillSearch}
                          onChange={(event) => {
                            setSkillSearch(event.target.value)
                            setSkillIndex(0)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'ArrowDown') {
                              event.preventDefault()
                              setSkillIndex((index) =>
                                Math.min(
                                  index + 1,
                                  Math.max(0, filteredSkills.length - 1)
                                )
                              )
                              return
                            }
                            if (event.key === 'ArrowUp') {
                              event.preventDefault()
                              setSkillIndex((index) =>
                                Math.max(0, index - 1)
                              )
                              return
                            }
                            if (event.key === 'Enter') {
                              const skill = filteredSkills[skillIndex]
                              if (skill) {
                                event.preventDefault()
                                insertSkill(skill)
                              }
                              return
                            }
                            if (event.key === 'Escape') {
                              event.preventDefault()
                              setSkillPickerOpen(false)
                            }
                          }}
                          placeholder="搜索技能"
                        />
                      </div>
                      <div className="agent-skill-list">
                        {filteredSkills.length === 0 ? (
                          <div className="agent-modal__empty">
                            没有可用技能
                          </div>
                        ) : (
                          filteredSkills.map((skill, index) => (
                            <button
                              key={`${skill.scope}:${skill.name}`}
                              type="button"
                              className={`agent-skill-item ${
                                index === skillIndex ? 'is-active' : ''
                              }`}
                              onMouseEnter={() => setSkillIndex(index)}
                              onClick={() => insertSkill(skill)}
                            >
                              <div>
                                <span>{skill.name}</span>
                                <small>{skill.description}</small>
                              </div>
                              <span className="agent-skill-scope">
                                {skill.scope}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                      <button
                        type="button"
                        className="agent-skill-manage"
                        onClick={() => {
                          setSkillPickerOpen(false)
                          openSettings('skills')
                        }}
                      >
                        <Icon name="settings" size={12} />
                        管理技能
                      </button>
                    </div>
                  ) : null}
                </span>
              </div>
              <ContextRing
                percent={contextStats.percent}
                compacting={compacting}
                title={contextTitle}
                disabled={running || compacting}
                onClick={requestCompact}
              />
              {running ? (
                <button
                  type="button"
                  className="agent-send agent-send--stop"
                  onClick={() => void cancel()}
                  title="停止"
                >
                  <Icon name="stop" size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  className="agent-send agent-send--round"
                  onClick={submit}
                  disabled={!draft.trim()}
                  title="发送"
                >
                  <Icon name="arrow-up" size={14} />
                </button>
              )}
            </div>
          </div>

          {modelPickerOpen ? (
            <div
              className="agent-modal-backdrop"
              onPointerDown={() => setModelPickerOpen(false)}
            >
              <div
                className="agent-modal"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <header className="agent-modal__head">
                  <div>
                    <div className="agent-modal__title">选择模型</div>
                    <div className="agent-modal__desc">
                      文本模型用于对话，生成模型用于 CineBot 生图、生视频和音频
                    </div>
                  </div>
                  <button
                    type="button"
                    className="agent-icon-button"
                    onClick={() => setModelPickerOpen(false)}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </header>
                <div className="agent-modal__list">
                  {modelGroups.map((group) => (
                    <section className="agent-model-group" key={group.key}>
                      <header className="agent-model-group__head">
                        <span>{group.label}</span>
                        <small>{group.desc}</small>
                      </header>
                      <button
                        type="button"
                        className={`agent-model-item ${
                          !group.selected ? 'is-active' : ''
                        }`}
                        onClick={() => {
                          void group.setModel(null)
                        }}
                      >
                        <div>
                          <span>自动选择</span>
                          <small>使用该能力下第一个可用模型</small>
                        </div>
                        {!group.selected ? (
                          <Icon name="target" size={14} />
                        ) : null}
                      </button>
                      {group.models.map((model) => {
                        const key = `${model.providerId}/${model.modelId}`
                        return (
                          <button
                            key={`${group.key}:${key}`}
                            type="button"
                            className={`agent-model-item ${
                              group.selected === key ? 'is-active' : ''
                            }`}
                            onClick={() => {
                              void group.setModel(key)
                            }}
                          >
                            <div>
                              <span>{model.name}</span>
                              <small>
                                {model.providerName ?? model.providerId}
                              </small>
                            </div>
                            {group.selected === key ? (
                              <Icon name="target" size={14} />
                            ) : null}
                          </button>
                        )
                      })}
                      {group.models.length === 0 ? (
                        <div className="agent-modal__empty">
                          没有配置可用的{group.label}模型
                        </div>
                      ) : null}
                    </section>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

        </section>
      ) : (
        <button
          type="button"
          className="agent-fab"
          onClick={toggle}
          aria-label="打开 CineBot"
          title="CineBot（Ctrl+Shift+A）"
        >
          <img className="agent-fab__icon" src={agentIcon} alt="" />
        </button>
      )}
    </>,
    document.body
  )

  return panel
}
