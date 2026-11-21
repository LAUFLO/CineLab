import { useEffect, useState } from 'react'
import type { LibraryFolderNode } from '@shared/library-schema'
import { DEFAULT_LIBRARY_FOLDERS } from '@shared/library-schema'
import { Icon } from '../../components/Icon'
import { IconButton, Button } from '../../components/ui'

interface FolderTreeProps {
  tree: LibraryFolderNode[]
  current: string
  onSelect: (path: string) => void
  onCreate: (parent: string) => void
  onRename: (node: LibraryFolderNode) => void
  onDelete: (node: LibraryFolderNode) => void
  readOnly?: boolean
}

function isDefaultFolder(node: LibraryFolderNode): boolean {
  return (
    !node.path.includes('/') &&
    (DEFAULT_LIBRARY_FOLDERS as readonly string[]).includes(node.path)
  )
}

interface TreeRowProps extends FolderTreeProps {
  node: LibraryFolderNode
  depth: number
  expanded: Set<string>
  toggle: (path: string) => void
}

function TreeRow({
  node,
  depth,
  expanded,
  toggle,
  current,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  readOnly
}: TreeRowProps) {
  const open = expanded.has(node.path)
  const hasChildren = node.children.length > 0
  const fixed = isDefaultFolder(node)

  return (
    <div>
      <div
        className={`group flex h-[30px] items-center gap-0.5 rounded-md pr-1.5 text-fg-muted hover:bg-surface-hover hover:text-fg ${
          current === node.path ? 'bg-surface-hover text-fg' : ''
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        <Button
          type="button"
          variant="ghost"
          size="none"
          className="h-full w-5 shrink-0 cursor-pointer !p-0 text-fg-subtle hover:!bg-transparent hover:!text-fg-subtle"
          onClick={() => toggle(node.path)}
          aria-label={open ? '折叠' : '展开'}
        >
          {hasChildren ? (
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size={11} />
          ) : (
            <span className="h-[3px] w-[3px] rounded-full bg-fg-subtle opacity-50" />
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="none"
          className="h-full min-w-0 flex-1 cursor-pointer !justify-start gap-[7px] !p-0 text-left text-[12.5px] !text-inherit hover:!bg-transparent hover:!text-inherit"
          onClick={() => onSelect(node.path)}
          onDoubleClick={() => toggle(node.path)}
        >
          <Icon name="folder" size={14} />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {node.assetCount > 0 ? (
            <span className="h-4 min-w-[18px] shrink-0 rounded-md border border-border bg-surface px-[5px] text-center text-[10px] leading-[14px] text-fg-subtle">
              {node.assetCount}
            </span>
          ) : null}
        </Button>

        {readOnly ? null : (
          <div className="flex gap-px opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100">
            <IconButton
              label="新建子文件夹"
              size="xs"
              className="!h-[21px] !w-[21px] !rounded-md cursor-pointer !text-fg-subtle hover:!bg-surface hover:!text-fg"
              onClick={() => onCreate(node.path)}
            >
              <Icon name="folder-plus" size={13} />
            </IconButton>
            {fixed ? null : (
              <>
                <IconButton
                  label="重命名"
                  size="xs"
                  className="!h-[21px] !w-[21px] !rounded-md cursor-pointer !text-fg-subtle hover:!bg-surface hover:!text-fg"
                  onClick={() => onRename(node)}
                >
                  <Icon name="edit" size={13} />
                </IconButton>
                <IconButton
                  label="删除空文件夹"
                  size="xs"
                  className="!h-[21px] !w-[21px] !rounded-md cursor-pointer !text-fg-subtle hover:!bg-surface hover:!text-danger"
                  onClick={() => onDelete(node)}
                >
                  <Icon name="trash" size={13} />
                </IconButton>
              </>
            )}
          </div>
        )}
      </div>

      {open
        ? node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              current={current}
              onSelect={onSelect}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
              readOnly={readOnly}
              tree={[]}
            />
          ))
        : null}
    </div>
  )
}

export function FolderTree(props: FolderTreeProps) {
  const { tree, current, onSelect, onCreate } = props
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!current) return
    const parts = current.split('/')
    const ancestors = parts.map((_, index) =>
      parts.slice(0, index + 1).join('/')
    )
    setExpanded((previous) => {
      const next = new Set(previous)
      for (const path of ancestors) next.add(path)
      return next
    })
  }, [current])

  const toggle = (path: string): void => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
      <div
        className={`group flex h-[30px] items-center gap-0.5 rounded-md pr-1.5 text-fg-muted hover:bg-surface-hover hover:text-fg ${
          current === '' ? 'bg-surface-hover text-fg' : ''
        }`}
      >
        <span className="flex h-full w-5 shrink-0 items-center justify-center">
          <span className="h-[3px] w-[3px] rounded-full bg-fg-subtle opacity-50" />
        </span>
        <Button
          type="button"
          variant="ghost"
          size="none"
          className="h-full min-w-0 flex-1 cursor-pointer !justify-start gap-[7px] !p-0 text-left text-[12.5px] !text-inherit hover:!bg-transparent hover:!text-inherit"
          onClick={() => onSelect('')}
        >
          <Icon name="grid" size={13} />
          <span className="min-w-0 flex-1 truncate">全部素材</span>
        </Button>
        {props.readOnly ? null : (
          <div className="flex gap-px opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100">
            <IconButton
              label="新建文件夹"
              size="xs"
              className="!h-[21px] !w-[21px] !rounded-md cursor-pointer !text-fg-subtle hover:!bg-surface hover:!text-fg"
              onClick={() => onCreate('')}
            >
              <Icon name="folder-plus" size={13} />
            </IconButton>
          </div>
        )}
      </div>

      <div>
        {tree.map((node) => (
          <TreeRow
            key={node.path}
            node={node}
            depth={0}
            expanded={expanded}
            toggle={toggle}
            tree={tree}
            current={current}
            onSelect={onSelect}
            onCreate={onCreate}
            onRename={props.onRename}
            onDelete={props.onDelete}
            readOnly={props.readOnly}
          />
        ))}
      </div>
    </div>
  )
}
