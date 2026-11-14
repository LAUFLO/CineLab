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
    <div className="library-tree__node">
      <div
        className={`library-tree__row ${current === node.path ? 'is-active' : ''}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        <Button
          type="button"
          className="library-tree__toggle"
          onClick={() => toggle(node.path)}
          aria-label={open ? '折叠' : '展开'}
          unstyled
        >
          {hasChildren ? (
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size={11} />
          ) : (
            <span className="library-tree__dot" />
          )}
        </Button>

        <Button
          type="button"
          className="library-tree__label"
          onClick={() => onSelect(node.path)}
          onDoubleClick={() => toggle(node.path)}
          unstyled
        >
          <Icon name="folder" size={14} />
          <span className="library-tree__name">{node.name}</span>
          {node.assetCount > 0 ? (
            <span className="library-tree__count">{node.assetCount}</span>
          ) : null}
        </Button>

        {readOnly ? null : (
          <div className="library-tree__actions">
            <IconButton
              label="新建子文件夹"
              size="xs"
              onClick={() => onCreate(node.path)}
            >
              <Icon name="folder-plus" size={13} />
            </IconButton>
            {fixed ? null : (
              <>
                <IconButton
                  label="重命名"
                  size="xs"
                  onClick={() => onRename(node)}
                >
                  <Icon name="edit" size={13} />
                </IconButton>
                <IconButton
                  label="删除空文件夹"
                  size="xs"
                  className="text-danger hover:text-danger"
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
    <div className="library-tree">
      <div className={`library-tree__row ${current === '' ? 'is-active' : ''}`}>
        <span className="library-tree__toggle">
          <span className="library-tree__dot" />
        </span>
        <Button
          type="button"
          className="library-tree__label"
          onClick={() => onSelect('')}
          unstyled
        >
          <Icon name="grid" size={13} />
          <span className="library-tree__name">全部素材</span>
        </Button>
        {props.readOnly ? null : (
          <div className="library-tree__actions">
            <IconButton
              label="新建文件夹"
              size="xs"
              onClick={() => onCreate('')}
            >
              <Icon name="folder-plus" size={13} />
            </IconButton>
          </div>
        )}
      </div>

      <div className="library-tree__children">
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
