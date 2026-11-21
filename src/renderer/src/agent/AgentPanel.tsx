import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AgentModelInfo, AgentReference } from '@shared/agent'
import type { SkillAdminEntry } from '@shared/skills'
import { Icon } from '../components/Icon'
import {
  isGroupNode,
  selectedNodeOutput,
  useCanvasStore
} from '../stores/canvas'
import { useSettingsStore } from '../stores/settings'
import { useStudioStore } from '../stores/studio'
import { useUIStore } from '../stores/ui'
import { useStageStore } from '../stage/stageStore'
import {
  AGENT_CONTEXT_BUDGET_TOKENS,
  agentContextStats,
  agentTurnChangeCount,
  useAgentStore,
  type AgentMessage
} from './agentStore'
import agentIcon from '../assets/agent-icon.svg'
import { Button, Input, Popover, Textarea } from '../components/ui'
import { useShortcutLabel } from '../shortcuts/useShortcut'

import { ContextRing } from './panel/ContextRing'
import { MessageBubble } from './panel/MessageBubble'
import { ProposalCard } from './panel/ProposalCard'
import { ThoughtGroup } from './panel/ThoughtGroup'
import {
  buildRenderItems,
  modelNameOf,
  relativeTime,
  toolLabel,
  type MentionItem,
  type RenderItem
} from './panel/utils'

export function AgentPanel() {
  const visible = useAgentStore((state) => state.visible)
  const agentShortcut = useShortcutLabel('app.agent.toggle')
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
  const activity = useAgentStore((state) => state.activity)
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
  const stageMode = useStageStore((state) => state.open)
  const openSettings = useSettingsStore((state) => state.openPanel)
  const requestConfirm = useUIStore((state) => state.requestConfirm)
  const showToast = useUIStore((state) => state.showToast)
  const [draft, setDraft] = useState('')
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false)
  const [sessionSearch, setSessionSearch] = useState('')
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [modelTab, setModelTab] = useState<
    'text' | 'image' | 'video' | 'audio'
  >('text')
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
  const sessionButtonRef = useRef<HTMLButtonElement>(null)
  const permissionButtonRef = useRef<HTMLButtonElement>(null)
  const skillButtonRef = useRef<HTMLButtonElement>(null)

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

  const submit = (): void => {
    const text = draft.trim()
    if (!text || running) return
    setDraft('')
    setSessionMenuOpen(false)
    void send(text)
  }

  const suggestion = stageMode
    ? '把这个场景搭成雨夜街道，加两个人物'
    : clipMode
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
    (session) => session.messageCount > 0 || session.sessionId === sessionId
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
    void window.api.skills
      .list()
      .then(setSkills)
      .catch(() => setSkills([]))
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
        name: String((node.data as { title?: unknown }).title ?? '未命名素材'),
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
      setMentionOpen(false)
      setMentionQuery('')
      if (!skillPickerOpen) {
        setSkillPickerOpen(true)
        setSkillIndex(0)
        void window.api.skills
          .list()
          .then(setSkills)
          .catch(() => setSkills([]))
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
      const cleaned = current.replace(/(^|[^\w/])\/[^\s/]*$/, '$1').trimEnd()
      return cleaned
        ? `${cleaned} 使用技能：${skill.name}`
        : `使用技能：${skill.name}`
    })
    setSkillPickerOpen(false)
    textareaRef.current?.focus()
  }

  const confirmDeleteSession = (session: (typeof sessions)[number]): void => {
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
    tabLabel: string
    label: string
    desc: string
    selected: string | null
    models: AgentModelInfo[]
    setModel: (modelKey: string | null) => Promise<void>
  }> = [
    {
      key: 'text',
      tabLabel: '文本',
      label: '文本对话',
      desc: '用于 CineBot 对话和工具调用',
      selected: modelKey,
      models: allModels.filter((model) => model.output === 'text'),
      setModel: setModelKey
    },
    {
      key: 'image',
      tabLabel: '图片',
      label: '生图',
      desc: 'CineBot 登记图片生成时使用',
      selected: generationModels.image ?? null,
      models: allModels.filter((model) => model.output === 'image'),
      setModel: (key) => setGenerationModel('image', key)
    },
    {
      key: 'video',
      tabLabel: '视频',
      label: '生视频',
      desc: 'CineBot 登记视频生成时使用',
      selected: generationModels.video ?? null,
      models: allModels.filter((model) => model.output === 'video'),
      setModel: (key) => setGenerationModel('video', key)
    },
    {
      key: 'audio',
      tabLabel: '音频',
      label: '音频',
      desc: 'CineBot 登记音频生成时使用',
      selected: generationModels.audio ?? null,
      models: allModels.filter((model) => model.output === 'audio'),
      setModel: (key) => setGenerationModel('audio', key)
    }
  ]

  const activeModelGroup =
    modelGroups.find((group) => group.key === modelTab) ?? modelGroups[0]

  const panel = createPortal(
    <>
      {visible ? (
        <section
          data-testid="agent-panel"
          className="fixed bottom-4 right-3 top-12 z-[95] flex w-[420px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-panel border border-border-strong bg-surface-raised text-[13px] text-fg shadow-float max-[560px]:inset-x-2 max-[560px]:bottom-4 max-[560px]:top-[44px] max-[560px]:w-auto"
          aria-label="CineBot"
        >
          <header className="flex shrink-0 items-center justify-between gap-2.5 border-b border-border px-3 py-2.5">
            <Button
              ref={sessionButtonRef}
              type="button"
              className="min-w-0 max-w-[280px] justify-start gap-[5px] px-2 py-1 text-[13px] !font-semibold !text-fg"
              onClick={() => setSessionMenuOpen((open) => !open)}
              title="CineBot 历史对话"
              variant="ghost"
              size="none"
            >
              <span className="shrink-0 font-bold text-fg">CineBot</span>
              <span className="shrink-0 text-fg-subtle">·</span>
              <span className="truncate font-medium text-fg-muted">
                {sessionTitle || '新对话'}
              </span>
              <Icon name="chevron-down" size={12} />
            </Button>
            <div className="flex shrink-0 items-center gap-[3px]">
              {running ? (
                <span className="mr-[3px] size-[7px] rounded-full bg-success animate-pulse" />
              ) : null}
              <Button
                type="button"
                className="size-[30px] p-0"
                title="新对话"
                onClick={() => void newSession()}
                disabled={running}
                variant="ghost"
                size="none"
              >
                <Icon name="plus" size={15} />
              </Button>
              <Button
                type="button"
                className="size-[30px] p-0"
                title="收起 CineBot"
                onClick={close}
                variant="ghost"
                size="none"
              >
                <Icon name="chevron-down" size={15} />
              </Button>
            </div>
          </header>

          {sessionMenuOpen ? (
            <Popover
              open={sessionMenuOpen}
              onClose={() => setSessionMenuOpen(false)}
              anchorRef={sessionButtonRef}
              align="start"
              width={400}
              className="!p-2.5 flex !max-h-[420px] flex-col gap-2 !overflow-hidden"
            >
              <div className="text-xs font-semibold text-fg">历史对话</div>
              <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 text-fg-subtle">
                <Icon name="search" size={13} />
                <Input
                  autoFocus
                  value={sessionSearch}
                  onChange={(event) => setSessionSearch(event.target.value)}
                  placeholder="搜索历史对话"
                  className="!h-auto min-w-0 flex-1 !rounded-none !border-0 !bg-transparent !p-0 !text-xs !text-fg placeholder:!text-fg-subtle"
                />
              </div>
              <Button
                type="button"
                className="shrink-0 justify-start gap-1.5 rounded-md border border-border bg-surface px-2 py-[7px] text-left text-xs !font-normal !text-fg disabled:!opacity-100"
                onClick={() => {
                  setSessionMenuOpen(false)
                  void newSession()
                }}
                disabled={running}
                variant="ghost"
                size="none"
              >
                <Icon name="plus" size={13} />
                新对话
              </Button>
              <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
                {filteredSessions.length === 0 ? (
                  <div className="px-1.5 py-2.5 text-[11px] text-fg-subtle">
                    没有匹配的对话
                  </div>
                ) : (
                  filteredSessions.map((session) => (
                    <div
                      key={session.sessionId}
                      className={`group flex items-center gap-0.5 rounded-md border pr-1 text-xs ${
                        session.sessionId === sessionId
                          ? 'border-border-strong bg-surface-hover text-fg'
                          : 'border-transparent text-fg-muted hover:bg-surface-hover'
                      }`}
                    >
                      <Button
                        type="button"
                        className="min-w-0 flex-1 !justify-between gap-2 !rounded-none px-1 py-[7px] pl-2 text-left text-xs !font-normal !text-inherit hover:!text-inherit disabled:!opacity-100"
                        onClick={() => {
                          setSessionMenuOpen(false)
                          void selectSession(session.sessionId)
                        }}
                        disabled={running}
                        variant="ghost"
                        size="none"
                      >
                        <span className="truncate">{session.title}</span>
                        <small className="shrink-0 text-[10px] text-fg-subtle">
                          {relativeTime(session.updatedAt)}
                        </small>
                      </Button>
                      <Button
                        type="button"
                        className={`size-[22px] shrink-0 !rounded-md !p-0 !text-fg-subtle hover:!bg-surface-raised hover:!text-danger disabled:!opacity-30 ${
                          session.sessionId === sessionId
                            ? 'opacity-100'
                            : 'opacity-0 group-hover:opacity-100'
                        }`}
                        title="删除对话"
                        disabled={running}
                        onClick={(event) => {
                          event.stopPropagation()
                          confirmDeleteSession(session)
                        }}
                        variant="ghost"
                        size="none"
                      >
                        <Icon name="trash" size={12} />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </Popover>
          ) : null}

          <div
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3.5"
            ref={listRef}
          >
            {messages.length === 0 ? (
              <div className="my-auto flex flex-col items-start gap-2.5 px-2 py-6">
                <img
                  className="size-14 rounded-full shadow-float"
                  src={agentIcon}
                  alt=""
                />
                <div className="mt-1 text-lg font-semibold text-fg">
                  我是 CineBot
                </div>
                <div className="max-w-[330px] text-xs leading-[1.7] text-fg-subtle">
                  {stageMode
                    ? '当前在导演台。我可以搭景、加人物和机位、设计镜头，并直接修改当前场景。'
                    : clipMode
                      ? '我可以读取时间线、移动片段、自动字幕、删静音、设置转场或导出成片。'
                      : '我可以整理画布、引用画布或资产库素材、登记生成提案，也可以读取你的技能。先点下方「上传」添加本地素材。'}
                </div>
                <Button
                  type="button"
                  className="max-w-full !justify-start !rounded-md bg-surface px-2.5 py-2 text-left text-xs !font-normal"
                  onClick={() => {
                    setDraft(suggestion)
                    textareaRef.current?.focus()
                  }}
                  variant="secondary"
                  size="none"
                >
                  {suggestion}
                </Button>
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
            <section className="mx-3 mb-2 shrink-0 rounded-card border border-[color-mix(in_srgb,var(--warning)_55%,var(--border-strong))] bg-surface p-2.5 text-[11px]">
              <header className="flex items-center justify-between gap-2 text-xs font-semibold text-warning">
                <span>需要确认</span>
                <span className="text-[10px] font-normal text-fg-subtle">
                  {toolLabel(pendingConfirm.call.name)}
                </span>
              </header>
              <div className="mt-1.5 leading-[1.5] text-fg">
                {pendingConfirm.reason}
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  className="!rounded-md px-2.5 py-1 text-[11px] !font-normal"
                  disabled={confirming}
                  onClick={() => void confirmTool(true)}
                  variant="primary"
                  size="none"
                >
                  {confirming ? '处理中…' : '允许一次'}
                </Button>
                <Button
                  type="button"
                  className="!rounded-md px-2.5 py-1 text-[11px] !font-normal"
                  disabled={confirming}
                  onClick={() => void confirmTool(false)}
                  variant="secondary"
                  size="none"
                >
                  取消
                </Button>
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
            <div
              className="mx-3 mb-2 flex shrink-0 items-center justify-between gap-2 rounded-card border border-[color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-2.5 py-[7px] text-[11px] text-danger"
              role="status"
            >
              <span>{error}</span>
              <Button
                type="button"
                className="shrink-0 !rounded-md px-1.5 py-0.5 text-[10px] !font-normal !text-inherit hover:!text-inherit"
                onClick={clearError}
                variant="secondary"
                size="none"
              >
                知道了
              </Button>
            </div>
          ) : null}

          {changedCount > 0 ? (
            <div className="mx-3 mb-2 flex shrink-0 items-center justify-between gap-2 rounded-card border border-border px-2.5 py-[7px] text-[11px] text-fg-muted">
              <span>本轮修改了 {changedCount} 处</span>
              <Button
                type="button"
                className="!rounded-md px-2 py-[3px] text-[11px] !font-normal !text-fg"
                onClick={undoLastTurn}
                disabled={running}
                variant="secondary"
                size="none"
              >
                撤销这一轮
              </Button>
            </div>
          ) : null}

          {activity.compaction ||
          activity.retry ||
          activity.thinking.trim() ||
          activity.steering.length > 0 ||
          activity.followUp.length > 0 ? (
            <div className="mx-3 mb-2 flex shrink-0 flex-col gap-1 rounded-card border border-border px-2.5 py-[7px] text-[11px] text-fg-muted">
              {activity.compaction ? <span>正在压缩上下文…</span> : null}
              {activity.retry ? <span>{activity.retry}</span> : null}
              {activity.steering.length > 0 || activity.followUp.length > 0 ? (
                <span>
                  排队：引导 {activity.steering.length} · 后续{' '}
                  {activity.followUp.length}
                </span>
              ) : null}
              {activity.thinking.trim() ? (
                <details className="group">
                  <summary className="cursor-pointer select-none text-fg-subtle">
                    思考过程
                  </summary>
                  <div className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-fg-subtle">
                    {activity.thinking}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}

          <div className="relative mx-2.5 mb-2.5 mt-2 shrink-0 rounded-panel border border-border-strong bg-surface p-2">
            {attachments.length > 0 || references.length > 0 ? (
              <div className="flex flex-wrap gap-1 px-0.5 pb-1.5 pt-0.5">
                {attachments.map((item) => (
                  <span
                    className="inline-flex max-w-[180px] items-center gap-1 rounded-md border border-border bg-surface-raised py-[3px] pl-1.5 pr-[5px] text-[10px] text-fg-muted"
                    key={item.nodeId}
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
                    <span className="truncate">{item.name}</span>
                    <Button
                      type="button"
                      className="size-4 !rounded-md !p-0 !text-fg-subtle disabled:!opacity-40"
                      title="移除附件"
                      disabled={running}
                      onClick={() => removeAttachment(item.nodeId)}
                      variant="ghost"
                      size="none"
                    >
                      <Icon name="close" size={10} />
                    </Button>
                  </span>
                ))}
                {references.map((item) => (
                  <span
                    className="inline-flex max-w-[180px] items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] bg-surface-raised py-[3px] pl-1.5 pr-[5px] text-[10px] text-fg"
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
                    <span className="truncate">@{item.name}</span>
                    <Button
                      type="button"
                      className="size-4 !rounded-md !p-0 !text-fg-subtle disabled:!opacity-40"
                      title="移除引用"
                      disabled={running}
                      onClick={() => removeReference(item)}
                      variant="ghost"
                      size="none"
                    >
                      <Icon name="close" size={10} />
                    </Button>
                  </span>
                ))}
              </div>
            ) : null}
            {mentionOpen ? (
              <Popover
                open={mentionOpen}
                onClose={() => setMentionOpen(false)}
                anchorRef={textareaRef}
                align="center"
                width={400}
                className="!p-2.5 flex !max-h-[300px] flex-col gap-2"
              >
                <div className="text-xs font-semibold text-fg">引用素材</div>
                <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
                  {filteredMentionItems.length === 0 ? (
                    <div className="px-2 py-3.5 text-[11px] leading-[1.6] text-fg-subtle">
                      没有匹配的素材
                    </div>
                  ) : (
                    filteredMentionItems.map((item, index) => (
                      <Button
                        key={item.key}
                        type="button"
                        className={`!justify-start gap-2 !rounded-md px-2 py-[7px] text-left text-xs !font-normal ${
                          index === mentionIndex
                            ? '!bg-surface-hover !text-fg'
                            : ''
                        }`}
                        onMouseEnter={() => setMentionIndex(index)}
                        onClick={() => insertReference(item)}
                        variant="ghost"
                        size="none"
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
                        <span className="flex-1 truncate">{item.name}</span>
                        <small className="shrink-0 text-[10px] text-fg-subtle">
                          {item.nodeId ? '画布' : '资产库'}
                        </small>
                      </Button>
                    ))
                  )}
                </div>
              </Popover>
            ) : null}
            <Textarea
              ref={textareaRef}
              className="!min-h-[42px] !max-h-[140px] !resize-none !rounded-none !border-0 !bg-transparent !px-1 !py-[3px] !text-[13px] !leading-[1.55] placeholder:!text-fg-subtle disabled:cursor-not-allowed disabled:!text-fg-subtle disabled:!opacity-100"
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
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap gap-1">
                <Button
                  type="button"
                  className="max-w-[150px] truncate !justify-start gap-1 !rounded-md px-[7px] py-1 text-[10px] !font-normal !text-fg-subtle hover:!bg-transparent disabled:!opacity-45"
                  onClick={() => void attachLocalAssets()}
                  disabled={running}
                  title="上传本地素材到画布"
                  variant="ghost"
                  size="none"
                >
                  <Icon name="paperclip" size={12} />
                  上传
                </Button>
                <Button
                  type="button"
                  className="max-w-[150px] truncate !justify-start gap-1 !rounded-md px-[7px] py-1 text-[10px] !font-normal !text-fg-subtle hover:!bg-transparent disabled:!opacity-45"
                  onClick={() => {
                    setModelTab('text')
                    setModelPickerOpen(true)
                  }}
                  title="选择模型"
                  variant="ghost"
                  size="none"
                >
                  <Icon name="robot" size={12} />
                  {modelNameOf(modelInfo)}
                </Button>
                <span className="relative inline-flex">
                  <Button
                    ref={permissionButtonRef}
                    type="button"
                    className="max-w-[150px] truncate !justify-start gap-1 !rounded-md px-[7px] py-1 text-[10px] !font-normal !text-fg-subtle hover:!bg-transparent disabled:!opacity-45"
                    onClick={() => setPermissionMenuOpen((open) => !open)}
                    title="权限范围"
                    variant="ghost"
                    size="none"
                  >
                    <Icon name="target" size={12} />
                    {permissionMode === 'read-only' ? '只读' : '当前空间'}
                  </Button>
                  {permissionMenuOpen ? (
                    <Popover
                      open={permissionMenuOpen}
                      onClose={() => setPermissionMenuOpen(false)}
                      anchorRef={permissionButtonRef}
                      align="center"
                      width={250}
                    >
                      <Button
                        type="button"
                        className={`!h-auto flex-col !items-stretch !justify-start gap-0.5 !rounded-md px-2 py-[7px] text-left text-xs !font-normal ${
                          permissionMode === 'read-only'
                            ? '!bg-surface-hover !text-fg'
                            : ''
                        }`}
                        onClick={() => {
                          setPermissionMode('read-only')
                          setPermissionMenuOpen(false)
                        }}
                        variant="ghost"
                        size="none"
                      >
                        <span className="text-xs">只读</span>
                        <small className="text-[10px] leading-[1.4] text-fg-subtle">
                          只读取，不修改画布或时间线
                        </small>
                      </Button>
                      <Button
                        type="button"
                        className={`!h-auto flex-col !items-stretch !justify-start gap-0.5 !rounded-md px-2 py-[7px] text-left text-xs !font-normal ${
                          permissionMode === 'current'
                            ? '!bg-surface-hover !text-fg'
                            : ''
                        }`}
                        onClick={() => {
                          setPermissionMode('current')
                          setPermissionMenuOpen(false)
                        }}
                        variant="ghost"
                        size="none"
                      >
                        <span className="text-xs">当前空间</span>
                        <small className="text-[10px] leading-[1.4] text-fg-subtle">
                          允许修改当前画布或时间线
                        </small>
                      </Button>
                    </Popover>
                  ) : null}
                </span>
                <span className="relative inline-flex">
                  <Button
                    ref={skillButtonRef}
                    type="button"
                    className="max-w-[150px] truncate !justify-start gap-1 !rounded-md px-[7px] py-1 text-[10px] !font-normal !text-fg-subtle hover:!bg-transparent disabled:!opacity-45"
                    onClick={openSkillPicker}
                    title="选择技能"
                    variant="ghost"
                    size="none"
                  >
                    <Icon name="sparkles" size={12} />
                    技能
                  </Button>
                  {skillPickerOpen ? (
                    <Popover
                      open={skillPickerOpen}
                      onClose={() => setSkillPickerOpen(false)}
                      anchorRef={skillButtonRef}
                      align="center"
                      width={300}
                      className="!p-2.5 flex !max-h-[360px] flex-col gap-2"
                    >
                      <div className="text-xs font-semibold text-fg">
                        选择技能
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 text-fg-subtle">
                        <Icon name="search" size={13} />
                        <Input
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
                              setSkillIndex((index) => Math.max(0, index - 1))
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
                          className="!h-auto min-w-0 flex-1 !rounded-none !border-0 !bg-transparent !p-0 !text-xs !text-fg placeholder:!text-fg-subtle"
                        />
                      </div>
                      <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
                        {filteredSkills.length === 0 ? (
                          <div className="px-2 py-3.5 text-[11px] leading-[1.6] text-fg-subtle">
                            没有可用技能
                          </div>
                        ) : (
                          filteredSkills.map((skill, index) => (
                            <Button
                              key={`${skill.scope}:${skill.name}`}
                              type="button"
                              className={`!h-auto !justify-between gap-2.5 !rounded-md border !border-transparent px-[9px] py-2 text-left !font-normal ${
                                index === skillIndex ? '!bg-surface-hover' : ''
                              }`}
                              onMouseEnter={() => setSkillIndex(index)}
                              onClick={() => insertSkill(skill)}
                              variant="ghost"
                              size="none"
                            >
                              <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="text-xs text-fg">
                                  {skill.name}
                                </span>
                                <small className="truncate text-[10px] leading-[1.4] text-fg-subtle">
                                  {skill.description}
                                </small>
                              </div>
                              <span className="shrink-0 text-[9px] text-fg-subtle">
                                {skill.scope}
                              </span>
                            </Button>
                          ))
                        )}
                      </div>
                      <Button
                        type="button"
                        className="!justify-center gap-[5px] !rounded-md border border-border !bg-surface px-2 py-1.5 text-[11px] !font-normal !text-fg-muted hover:!border-border-strong hover:!bg-surface hover:!text-fg"
                        onClick={() => {
                          setSkillPickerOpen(false)
                          openSettings('skills')
                        }}
                        variant="ghost"
                        size="none"
                      >
                        <Icon name="settings" size={12} />
                        管理技能
                      </Button>
                    </Popover>
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
                <Button
                  type="button"
                  className="size-[30px] shrink-0 !rounded-md !border !border-border-strong !bg-surface-hover p-0 !text-fg disabled:!opacity-[0.35]"
                  onClick={() => void cancel()}
                  title="停止"
                  variant="primary"
                  size="none"
                >
                  <Icon name="stop" size={14} />
                </Button>
              ) : (
                <Button
                  type="button"
                  className="size-[30px] shrink-0 !rounded-full p-0 disabled:!opacity-[0.35]"
                  onClick={submit}
                  disabled={!draft.trim()}
                  title="发送"
                  variant="primary"
                  size="none"
                >
                  <Icon name="arrow-up" size={14} />
                </Button>
              )}
            </div>
          </div>

          {modelPickerOpen ? (
            <div
              className="absolute inset-0 z-30 flex items-start justify-center bg-overlay px-3 pb-3 pt-[54px] backdrop-blur-[2px]"
              onPointerDown={() => setModelPickerOpen(false)}
            >
              <div
                className="flex max-h-full w-full flex-col overflow-hidden rounded-panel border border-border-strong bg-surface-raised shadow-float"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <header className="flex items-start justify-between gap-2.5 border-b border-border p-3">
                  <div>
                    <div className="text-sm font-semibold">选择模型</div>
                    <div className="mt-[3px] text-[10px] text-fg-subtle">
                      文本模型用于对话，图片 / 视频 / 音频模型用于 CineBot 生成
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="size-[30px] p-0"
                    onClick={() => setModelPickerOpen(false)}
                    variant="ghost"
                    size="none"
                  >
                    <Icon name="close" size={14} />
                  </Button>
                </header>
                <div
                  className="flex shrink-0 gap-1 border-b border-border px-2 pt-2"
                  role="tablist"
                >
                  {modelGroups.map((group) => (
                    <Button
                      key={group.key}
                      type="button"
                      role="tab"
                      aria-selected={modelTab === group.key}
                      className={`h-[30px] flex-1 !justify-center gap-[5px] !rounded-b-none !rounded-t-[7px] text-xs !font-normal ${
                        modelTab === group.key
                          ? '!bg-surface-hover !font-semibold !text-fg'
                          : '!text-fg-subtle'
                      }`}
                      onClick={() => setModelTab(group.key)}
                      variant="ghost"
                      size="none"
                    >
                      {group.tabLabel}
                      {group.selected ? (
                        <span className="size-[5px] rounded-full bg-success" />
                      ) : null}
                    </Button>
                  ))}
                </div>
                <div className="flex min-h-0 flex-col gap-[3px] overflow-y-auto p-2">
                  <section className="mb-1 flex flex-col gap-0.5 border-b border-border pb-2 last:mb-0 last:border-b-0">
                    <header className="flex flex-col gap-0.5 px-2 pb-1 pt-1.5">
                      <span className="text-xs font-semibold text-fg">
                        {activeModelGroup.label}
                      </span>
                      <small className="text-[10px] leading-[1.4] text-fg-subtle">
                        {activeModelGroup.desc}
                      </small>
                    </header>
                    <Button
                      type="button"
                      className={`!h-auto !justify-between gap-2.5 !rounded-md border !border-transparent px-[9px] py-2 text-left !font-normal ${
                        !activeModelGroup.selected
                          ? '!border-border-strong !bg-surface-hover'
                          : ''
                      }`}
                      onClick={() => {
                        void activeModelGroup.setModel(null)
                      }}
                      variant="ghost"
                      size="none"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-xs text-fg">自动选择</span>
                        <small className="truncate text-[10px] leading-[1.4] text-fg-subtle">
                          使用该能力下第一个可用模型
                        </small>
                      </div>
                      {!activeModelGroup.selected ? (
                        <Icon name="target" size={14} />
                      ) : null}
                    </Button>
                    {activeModelGroup.models.map((model) => {
                      const key = `${model.providerId}/${model.modelId}`
                      return (
                        <Button
                          key={`${activeModelGroup.key}:${key}`}
                          type="button"
                          className={`!h-auto !justify-between gap-2.5 !rounded-md border !border-transparent px-[9px] py-2 text-left !font-normal ${
                            activeModelGroup.selected === key
                              ? '!border-border-strong !bg-surface-hover'
                              : ''
                          }`}
                          onClick={() => {
                            void activeModelGroup.setModel(key)
                          }}
                          variant="ghost"
                          size="none"
                        >
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-xs text-fg">
                              {model.name}
                            </span>
                            <small className="truncate text-[10px] leading-[1.4] text-fg-subtle">
                              {model.providerName ?? model.providerId}
                            </small>
                          </div>
                          {activeModelGroup.selected === key ? (
                            <Icon name="target" size={14} />
                          ) : null}
                        </Button>
                      )
                    })}
                    {activeModelGroup.models.length === 0 ? (
                      <div className="px-2 py-3.5 text-[11px] leading-[1.6] text-fg-subtle">
                        没有配置可用的{activeModelGroup.label}模型
                      </div>
                    ) : null}
                  </section>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <Button
          type="button"
          className="fixed bottom-[26px] right-[26px] z-[95] size-11 !rounded-full !border-0 !bg-transparent p-0 shadow-float hover:-translate-y-px hover:!bg-transparent hover:shadow-float"
          onClick={toggle}
          aria-label="打开 CineBot"
          title={`CineBot（${agentShortcut}）`}
          variant="secondary"
          size="none"
        >
          <img
            className="block size-full rounded-full"
            src={agentIcon}
            alt=""
          />
        </Button>
      )}
    </>,
    document.body
  )

  return panel
}
