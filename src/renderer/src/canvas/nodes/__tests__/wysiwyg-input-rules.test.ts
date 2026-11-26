// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  rootCtx
} from '@milkdown/core'
import { history } from '@milkdown/plugin-history'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'

const editors: Array<{ editor: Editor; root: HTMLElement }> = []

async function createEditor() {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, '')
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .create()
  editors.push({ editor, root })
  return { editor, view: editor.action((ctx) => ctx.get(editorViewCtx)) }
}

function type(
  view: Awaited<ReturnType<typeof createEditor>>['view'],
  previous: string,
  last: string
): void {
  if (previous) {
    view.dispatch(view.state.tr.insertText(previous))
  }
  const { from, to } = view.state.selection
  view.someProp('handleTextInput', (handler) =>
    handler(view, from, to, last, () => view.state.tr)
  )
}

afterEach(() => {
  for (const { editor, root } of editors.splice(0)) {
    void editor.destroy()
    root.remove()
  }
})

describe('WYSIWYG markdown input rules', () => {
  it('turns # and space into a heading', async () => {
    const { view } = await createEditor()
    type(view, '#', ' ')
    expect(view.state.doc.firstChild?.type.name).toBe('heading')
  })

  it('turns - and space into a bullet list', async () => {
    const { view } = await createEditor()
    type(view, '-', ' ')
    expect(view.state.doc.firstChild?.type.name).toBe('bullet_list')
  })

  it('turns > and space into a blockquote', async () => {
    const { view } = await createEditor()
    type(view, '>', ' ')
    expect(view.state.doc.firstChild?.type.name).toBe('blockquote')
  })

  it('turns 1. and space into an ordered list', async () => {
    const { view } = await createEditor()
    type(view, '1.', ' ')
    expect(view.state.doc.firstChild?.type.name).toBe('ordered_list')
  })

  it('turns ``` and space into a code block', async () => {
    const { view } = await createEditor()
    type(view, '```', ' ')
    expect(view.state.doc.firstChild?.type.name).toBe('code_block')
  })

  it('turns |3x3| and space into a table', async () => {
    const { view } = await createEditor()
    type(view, '|3x3|', ' ')
    expect(view.state.doc.firstChild?.type.name).toBe('table')
  })

  it('turns **bold** into a strong mark', async () => {
    const { view } = await createEditor()
    type(view, '**bold*', '*')
    const text = view.state.doc.textContent
    expect(text).toBe('bold')
    const marks = view.state.doc.firstChild?.firstChild?.marks ?? []
    expect(marks.some((mark) => mark.type.name === 'strong')).toBe(true)
  })
})
