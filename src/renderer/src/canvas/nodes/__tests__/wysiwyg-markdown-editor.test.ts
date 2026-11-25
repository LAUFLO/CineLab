// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import {
  WysiwygMarkdownEditor,
  type WysiwygMarkdownEditorHandle
} from '../WysiwygMarkdownEditor'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

const mounted: Array<{ unmount: () => void; container: HTMLElement }> = []

afterEach(() => {
  for (const item of mounted.splice(0)) {
    act(() => item.unmount())
    item.container.remove()
  }
})

describe('WysiwygMarkdownEditor', () => {
  it('mounts markdown and returns the latest markdown synchronously', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const ref = createRef<WysiwygMarkdownEditorHandle>()

    await act(async () => {
      root.render(
        createElement(WysiwygMarkdownEditor, {
          ref,
          initialMarkdown: '# Hello',
          onChange: () => undefined
        })
      )
    })
    mounted.push({ unmount: () => root.unmount(), container })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    for (
      let attempt = 0;
      attempt < 20 && !container.querySelector('.ProseMirror');
      attempt += 1
    ) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
      })
    }

    expect(container.querySelector('.ProseMirror')).not.toBeNull()
    expect(container.textContent).toContain('Hello')
    expect(ref.current?.getMarkdown()).toContain('# Hello')
  })
})
