import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AgentModelInfo, AgentProposal } from '@shared/agent'
import type { SkillAdminEntry } from '@shared/skills'
import { proposalStatusLabel } from '@shared/agent-proposal'
import { Icon } from '../components/Icon'
import { useStudioStore } from '../stores/studio'
import {
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

function MessageBubble({ message }: { message: AgentMessage }) {
  return (
    <div className={`agent-message agent-message--${message.role}`}>
      <div className="agent-message__role">
        {message.role === 'user' ? '你' : '助手'}
      </div>
      <div className="agent-message__content">{message.content}</div>
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
          该提案已提交过，不会重复扣费；请让助手重新生成。
        </div>
      ) : proposal.status === 'expired' ? (
        <div className="agent-proposal__hint">
          提案已失效，请让助手重新生成。
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
  const running = useAgentStore((state) => state.running)
  const error = useAgentStore((state) => state.error)
  const modelInfo = useAgentStore((state) => state.modelInfo)
  const modelKey = useAgentStore((state) => state.modelKey)
  const textModels = useAgentStore((state) => state.textModels)
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
  const loadSessions = useAgentStore((state) => state.loadSessions)
  const newSession = useAgentStore((state) => state.newSession)
  const selectSession = useAgentStore((state) => state.selectSession)
  const loadModelInfo = useAgentStore((state) => state.loadModelInfo)
  const loadTextModels = useAgentStore((state) => state.loadTextModels)
  const setModelKey = useAgentStore((state) => state.setModelKey)
  const loadProposal = useAgentStore((state) => state.loadProposal)
  const submitProposal = useAgentStore((state) => state.submitProposal)
  const cancelProposal = useAgentStore((state) => state.cancelProposal)
  const confirmTool = useAgentStore((state) => state.confirmTool)
  const undoLastTurn = useAgentStore((state) => state.undoLastTurn)
  const clearError = useAgentStore((state) => state.clearError)

  const clipMode = useStudioStore((state) => state.open)
  const [draft, setDraft] = useState('')
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false)
  const [sessionSearch, setSessionSearch] = useState('')
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false)
  const [skillPickerOpen, setSkillPickerOpen] = useState(false)
  const [skillSearch, setSkillSearch] = useState('')
  const [skills, setSkills] = useState<SkillAdminEntry[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!visible) return
    void loadSessions()
    void loadTextModels()
    void loadModelInfo()
  }, [visible, loadSessions, loadTextModels, loadModelInfo])

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
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [
    sessionMenuOpen,
    modelPickerOpen,
    permissionMenuOpen,
    skillPickerOpen
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
    : '帮我整理一下当前选中的节点'
  const changedCount = agentTurnChangeCount(lastTurn)
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

  const openSkillPicker = (): void => {
    setSkillPickerOpen(true)
    setSkillSearch('')
    void window.api.skills.list().then(setSkills).catch(() => setSkills([]))
  }

  const insertSkill = (skill: SkillAdminEntry): void => {
    setDraft((current) =>
      current.trim()
        ? `${current.trim()} 使用技能：${skill.name}`
        : `使用技能：${skill.name}`
    )
    setSkillPickerOpen(false)
    textareaRef.current?.focus()
  }

  const panel = createPortal(
    <>
      {visible ? (
        <section className="agent-panel" aria-label="CineLab 助手" ref={panelRef}>
          <header className="agent-panel__head">
            <button
              type="button"
              className="agent-session-trigger"
              onClick={() => setSessionMenuOpen((open) => !open)}
              title="历史对话"
            >
              <span>{sessionTitle || '新对话'}</span>
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
                title="选择文本模型"
                onClick={() => setModelPickerOpen(true)}
              >
                <Icon name="settings" size={15} />
              </button>
              <button
                type="button"
                className="agent-icon-button"
                title="收起助手"
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
                    <button
                      key={session.sessionId}
                      type="button"
                      className={`agent-session-item ${
                        session.sessionId === sessionId ? 'is-active' : ''
                      }`}
                      onClick={() => {
                        setSessionMenuOpen(false)
                        void selectSession(session.sessionId)
                      }}
                      disabled={running}
                    >
                      <span>{session.title}</span>
                      <small>{relativeTime(session.updatedAt)}</small>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <div className="agent-panel__messages" ref={listRef}>
            {messages.length === 0 ? (
              <div className="agent-empty">
                <img className="agent-empty__icon" src={agentIcon} alt="" />
                <div className="agent-empty__title">有什么可以帮你？</div>
                <div className="agent-empty__desc">
                  {clipMode
                    ? '我可以读取时间线、移动片段、裁剪、切分或删除片段。'
                    : '我可以整理画布、搭导演台、登记生成提案，或读取你的技能。'}
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
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submit()
                }
              }}
              placeholder={
                clipMode
                  ? '描述你想怎么剪，例如：把选中片段前移 1 秒'
                  : '描述你想做什么，例如：给选中节点改名并移动'
              }
              disabled={running}
              rows={2}
            />
            <div className="agent-composer__bar">
              <div className="agent-composer__chips">
                <button
                  type="button"
                  className="agent-chip"
                  onClick={() => setModelPickerOpen(true)}
                  title="选择文本模型"
                >
                  <Icon name="robot" size={12} />
                  {modelNameOf(modelInfo)}
                </button>
                <button
                  type="button"
                  className="agent-chip"
                  onClick={() => setPermissionMenuOpen((open) => !open)}
                  title="权限范围"
                >
                  <Icon name="target" size={12} />
                  {permissionMode === 'read-only' ? '只读' : '当前空间'}
                </button>
                <button
                  type="button"
                  className="agent-chip"
                  onClick={openSkillPicker}
                  title="选择技能"
                >
                  <Icon name="sparkles" size={12} />
                  技能
                </button>
              </div>
              {running ? (
                <button
                  type="button"
                  className="agent-send agent-send--stop"
                  onClick={() => void cancel()}
                  title="停止"
                >
                  <Icon name="stop" size={15} />
                </button>
              ) : (
                <button
                  type="button"
                  className="agent-send agent-send--round"
                  onClick={submit}
                  disabled={!draft.trim()}
                  title="发送"
                >
                  <Icon name="arrow-up" size={16} />
                </button>
              )}
            </div>

            {permissionMenuOpen ? (
              <div className="agent-permission-menu">
                <button
                  type="button"
                  className={permissionMode === 'read-only' ? 'is-active' : ''}
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
                  className={permissionMode === 'current' ? 'is-active' : ''}
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
                    <div className="agent-modal__title">选择文本模型</div>
                    <div className="agent-modal__desc">
                      用于助手对话和工具调用
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
                  <button
                    type="button"
                    className={`agent-model-item ${
                      !modelKey ? 'is-active' : ''
                    }`}
                    onClick={() => {
                      void setModelKey(null)
                      setModelPickerOpen(false)
                    }}
                  >
                    <div>
                      <span>自动选择</span>
                      <small>使用第一个可用文本模型</small>
                    </div>
                    {!modelKey ? <Icon name="target" size={14} /> : null}
                  </button>
                  {textModels.map((model) => {
                    const key = `${model.providerId}/${model.modelId}`
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`agent-model-item ${
                          modelKey === key ? 'is-active' : ''
                        }`}
                        onClick={() => {
                          void setModelKey(key)
                          setModelPickerOpen(false)
                        }}
                      >
                        <div>
                          <span>{model.name}</span>
                          <small>{model.providerName ?? model.providerId}</small>
                        </div>
                        {modelKey === key ? (
                          <Icon name="target" size={14} />
                        ) : null}
                      </button>
                    )
                  })}
                  {textModels.length === 0 ? (
                    <div className="agent-modal__empty">
                      还没有配置 text.chat 模型，请先在设置中添加。
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {skillPickerOpen ? (
            <div
              className="agent-modal-backdrop"
              onPointerDown={() => setSkillPickerOpen(false)}
            >
              <div
                className="agent-modal"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <header className="agent-modal__head">
                  <div>
                    <div className="agent-modal__title">选择技能</div>
                    <div className="agent-modal__desc">
                      选中的技能会插入到输入框
                    </div>
                  </div>
                  <button
                    type="button"
                    className="agent-icon-button"
                    onClick={() => setSkillPickerOpen(false)}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </header>
                <div className="agent-popover__search">
                  <Icon name="search" size={13} />
                  <input
                    autoFocus
                    value={skillSearch}
                    onChange={(event) => setSkillSearch(event.target.value)}
                    placeholder="搜索技能"
                  />
                </div>
                <div className="agent-modal__list">
                  {filteredSkills.length === 0 ? (
                    <div className="agent-modal__empty">没有可用技能</div>
                  ) : (
                    filteredSkills.map((skill) => (
                      <button
                        key={`${skill.scope}:${skill.name}`}
                        type="button"
                        className="agent-skill-item"
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
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <button
          type="button"
          className="agent-fab"
          onClick={toggle}
          aria-label="打开 CineLab 助手"
          title="CineLab 助手（Ctrl+Shift+A）"
        >
          <img className="agent-fab__icon" src={agentIcon} alt="" />
        </button>
      )}
    </>,
    document.body
  )

  return panel
}
