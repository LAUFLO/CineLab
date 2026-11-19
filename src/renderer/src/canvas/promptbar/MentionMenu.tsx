import type { RefObject } from 'react'
import { Icon } from '../../components/Icon'
import { MenuItem, Popover } from '../../components/ui'
import { assetUrl } from '../../lib/asset-url'
import { isVideoPath, type MentionItem } from '../promptbar-model'

interface MentionMenuProps {
  open: boolean
  query: string
  groups: Array<{ name: string; items: MentionItem[] }>
  flat: MentionItem[]
  activeIndex: number
  onHover: (index: number) => void
  onSelect: (item: MentionItem) => void
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
}

const MENU =
  'mention-menu !p-0 flex !max-h-[340px] flex-col !overflow-hidden animate-[menu-in_120ms_ease-out]'
const HEAD =
  'flex h-9 shrink-0 items-center gap-[7px] border-b border-divider px-3 text-xs text-fg-subtle'
const LIST = 'flex-1 overflow-y-auto p-[5px]'
const SECTION = '[&+&]:mt-1'
const SECTION_TITLE = 'px-2 py-[5px] text-[10.5px] text-fg-subtle'
const ITEM =
  'mention-menu__item !min-h-[34px] !rounded-md !px-2 !py-1 text-xs [&>span:first-child]:text-current'
const ITEM_IDLE = '!text-fg-muted hover:!text-fg'
const ITEM_ACTIVE = '!text-fg'
const EMPTY = 'px-2.5 py-[18px] text-center text-xs text-fg-subtle'

export function MentionMenu({
  open,
  query,
  groups,
  flat,
  activeIndex,
  onHover,
  onSelect,
  onClose,
  anchorRef
}: MentionMenuProps) {
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      width={330}
      className={MENU}
    >
      <div className={HEAD}>
        <Icon name="search" size={12} />
        <span>{query || '搜索画布、资产库和角色'}</span>
      </div>

      <div className={LIST}>
        {groups.map((group) => (
          <div className={SECTION} key={group.name}>
            <div className={SECTION_TITLE}>{group.name}</div>

            {group.items.map((item) => {
              const index = flat.findIndex((entry) => entry.key === item.key)

              return (
                <MenuItem
                  key={item.key}
                  className={`${ITEM} ${
                    index === activeIndex ? ITEM_ACTIVE : ITEM_IDLE
                  }`}
                  icon={
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-hover">
                      {item.thumb ? (
                        item.kind === 'video' && isVideoPath(item.thumb) ? (
                          <video
                            className="h-full w-full object-cover"
                            src={`${assetUrl(item.thumb, item.scope)}#t=0.1`}
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <img
                            className="h-full w-full object-cover"
                            src={assetUrl(item.thumb, item.scope)}
                            alt=""
                          />
                        )
                      ) : (
                        <Icon
                          name={item.kind === 'video' ? 'video' : 'image'}
                          size={12}
                        />
                      )}
                    </span>
                  }
                  active={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => onHover(index)}
                  onSelect={() => onSelect(item)}
                  trailing={
                    <span className="shrink-0 text-[10px] text-fg-subtle">
                      {item.group === '角色'
                        ? '角色卡'
                        : item.kind === 'video'
                          ? '视频'
                          : '图片'}
                    </span>
                  }
                >
                  <span className="text-xs">{item.name}</span>
                </MenuItem>
              )
            })}
          </div>
        ))}

        {flat.length === 0 ? <div className={EMPTY}>没有匹配的素材</div> : null}
      </div>
    </Popover>
  )
}
