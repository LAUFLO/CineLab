import type { AgentMessage } from '../agentStore'
import { MessageActions } from './MessageActions'
import { renderInline } from './utils'

const ROLE_CLASS: Record<string, string> = {
  user: 'items-end self-end',
  assistant: 'items-start self-start'
}

const CONTENT_CLASS: Record<string, string> = {
  user: 'rounded-card border-transparent bg-surface-hover px-[11px] py-[9px]',
  assistant: 'rounded-md border-transparent bg-transparent px-[2px] py-0'
}

export function MessageBubble({ message }: { message: AgentMessage }) {
  return (
    <div
      className={`group flex max-w-[92%] shrink-0 flex-col gap-1 ${
        ROLE_CLASS[message.role] ?? ''
      }`}
    >
      <div
        className={`border leading-[1.65] whitespace-pre-wrap break-words [&_code]:rounded-md [&_code]:bg-surface-hover [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[0.92em] [&_code]:text-fg [&_strong]:font-semibold [&_strong]:text-fg ${
          CONTENT_CLASS[message.role] ??
          'rounded-card border-border bg-surface px-[11px] py-[9px]'
        }`}
      >
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
