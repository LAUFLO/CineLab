import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/ui'

export function MessageActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="agent-message__actions">
      <Button
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
        unstyled
      >
        <Icon name={copied ? 'history' : 'copy'} size={12} />
      </Button>
    </div>
  )
}
