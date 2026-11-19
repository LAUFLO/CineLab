import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/ui'

export function MessageActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
      <Button
        type="button"
        className="h-[22px] w-6 !rounded-md p-0 !font-normal !text-fg-subtle"
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
        variant="ghost"
        size="none"
      >
        <Icon name={copied ? 'history' : 'copy'} size={12} />
      </Button>
    </div>
  )
}
