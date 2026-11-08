import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AgentProposal } from '@shared/agent'
import {
  formatProposalCost,
  proposalStatusLabel
} from '@shared/agent-proposal'
import {
  agentTurnChangeCount,
  useAgentStore,
  type AgentMessage
} from './agentStore'
import '../styles/agent.css'

function MessageBubble({ message }: { message: AgentMessage }) {
  if (message.role === 'tool') {
    return (
      <div className={`agent-tool agent-tool--${message.toolStatus ?? 'running'}`}>
        <div className="agent-tool__head">
          <span className="agent-tool__name">{message.toolName}</span>
          <span className="agent-tool__status">
            {message.toolStatus === 'running'
              ? '执行中'
              : message.toolStatus === 'error'
                ? '失败'
                : '完成'}
          </span>
        </div>
        <div className="agent-tool__body">{message.content}</div>
      </div>
    )
  }

  return (
    <div className={`agent-message agent-message--${message.role}`}>
      <div className="agent-message__role">
        {message.role === 'user' ? '你' : '助手'}
      </div>
      <div className="agent-message__content">{message.content}</div>
    </div>
  )
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
    .map(([key, value]) => {
      const text = String(value)
      return `${key}=${text.length > 24 ? `${text.slice(0, 24)}…` : text}`
    })

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
      <div className="agent-proposal__row">
        <span>预估费用</span>
        <strong>{formatProposalCost(proposal.estimatedCost)}</strong>
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
        <div className="agent-proposal__hint">已提交，生成完成后会自动写回节点。</div>
      ) : proposal.status === 'expired' ? (
        <div className="agent-proposal__hint">提案已失效，请让助手重新生成。</div>
      ) : proposal.status === 'failed' ? (
        <div className="agent-proposal__hint">
          该提案已提交过，不会重复扣费；请让助手重新生成。
        </div>
      ) : null}
    </section>
  )
}

export function AgentPanel() {
  const visible = useAgentStore((state) => state.visible)
  const messages = useAgentStore((state) => state.messages)
  const running = useAgentStore((state) => state.running)
  const error = useAgentStore((state) => state.error)
  const modelInfo = useAgentStore((state) => state.modelInfo)
  const permissionMode = useAgentStore((state) => state.permissionMode)
  const lastTurn = useAgentStore((state) => state.lastTurn)
  const toggle = useAgentStore((state) => state.toggle)
  const close = useAgentStore((state) => state.close)
  const send = useAgentStore((state) => state.send)
  const cancel = useAgentStore((state) => state.cancel)
  const setPermissionMode = useAgentStore((state) => state.setPermissionMode)
  const loadSession = useAgentStore((state) => state.loadSession)
  const loadModelInfo = useAgentStore((state) => state.loadModelInfo)
  const loadProposal = useAgentStore((state) => state.loadProposal)
  const proposal = useAgentStore((state) => state.proposal)
  const proposalBusy = useAgentStore((state) => state.proposalBusy)
  const submitProposal = useAgentStore((state) => state.submitProposal)
  const cancelProposal = useAgentStore((state) => state.cancelProposal)
  const undoLastTurn = useAgentStore((state) => state.undoLastTurn)
  const clearError = useAgentStore((state) => state.clearError)

  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadSession()
    void loadModelInfo()
    void loadProposal()
  }, [loadSession, loadModelInfo, loadProposal])

  useEffect(() => {
    if (!visible) return
    const element = listRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages, visible])

  const submit = (): void => {
    const text = draft.trim()
    if (!text || running) return
    setDraft('')
    void send(text)
  }

  const changedCount = agentTurnChangeCount(lastTurn)

  const panel = createPortal(
    <>
      {visible ? (
        <section className="agent-panel" aria-label="CineLab 助手">
          <header className="agent-panel__head">
            <div>
              <div className="agent-panel__title">CineLab 助手</div>
              <div className="agent-panel__model">
                {modelInfo
                  ? `${modelInfo.name}`
                  : '未配置文本模型'}
              </div>
            </div>
            <div className="agent-panel__head-actions">
              <div className="agent-permission" role="group" aria-label="助手权限">
                <button
                  type="button"
                  className={permissionMode === 'read-only' ? 'is-active' : ''}
                  onClick={() => setPermissionMode('read-only')}
                  disabled={running}
                >
                  只读
                </button>
                <button
                  type="button"
                  className={permissionMode === 'current' ? 'is-active' : ''}
                  onClick={() => setPermissionMode('current')}
                  disabled={running}
                >
                  当前画布
                </button>
              </div>
              <button
                type="button"
                className="agent-icon-button"
                onClick={close}
                aria-label="关闭助手"
              >
                ×
              </button>
            </div>
          </header>

          <div className="agent-panel__messages" ref={listRef}>
            {messages.length === 0 ? (
              <div className="agent-empty">
                选中一个节点，然后让助手帮你修改标题。
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))
            )}
          </div>

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
              <span>本轮修改了 {changedCount} 个节点</span>
              <button type="button" onClick={undoLastTurn} disabled={running}>
                撤销这一轮
              </button>
            </div>
          ) : null}

          <div className="agent-composer">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submit()
                }
              }}
              placeholder={
                modelInfo
                  ? '例如：把选中节点改名为 开场镜头'
                  : '请先在设置中配置文本模型'
              }
              disabled={!modelInfo}
              rows={2}
            />
            <div className="agent-composer__actions">
              {running ? (
                <button type="button" className="agent-stop" onClick={() => void cancel()}>
                  停止
                </button>
              ) : (
                <button
                  type="button"
                  className="agent-send"
                  onClick={submit}
                  disabled={!draft.trim() || !modelInfo}
                >
                  发送
                </button>
              )}
            </div>
          </div>
        </section>
      ) : (
        <button
          type="button"
          className="agent-fab"
          onClick={toggle}
          aria-label="打开 CineLab 助手"
          title="CineLab 助手（Ctrl+Shift+A）"
        >
          AI
        </button>
      )}
    </>,
    document.body
  )

  return panel
}
