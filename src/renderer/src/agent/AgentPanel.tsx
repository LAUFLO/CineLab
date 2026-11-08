import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const undoLastTurn = useAgentStore((state) => state.undoLastTurn)
  const clearError = useAgentStore((state) => state.clearError)

  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadSession()
    void loadModelInfo()
  }, [loadSession, loadModelInfo])

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
