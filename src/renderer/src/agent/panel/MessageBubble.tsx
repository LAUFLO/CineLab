import type { AgentMessage } from '../agentStore'
import { MessageActions } from './MessageActions'
import { renderInline } from './utils'

export function MessageBubble({ message }: { message: AgentMessage }) {
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
