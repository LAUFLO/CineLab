import { Icon } from '../../components/Icon'
import { MenuItem } from '../../components/ui'
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
}

export function MentionMenu({
  open,
  query,
  groups,
  flat,
  activeIndex,
  onHover,
  onSelect
}: MentionMenuProps) {
  if (!open) return null

  return (
    <div className="mention-menu">
      <div className="mention-menu__head">
        <Icon name="search" size={12} />
        <span>{query || '搜索画布、资产库和角色'}</span>
      </div>

      <div className="mention-menu__list">
        {groups.map((group) => (
          <div className="mention-menu__section" key={group.name}>
            <div className="mention-menu__title">{group.name}</div>

            {group.items.map((item) => {
              const index = flat.findIndex((entry) => entry.key === item.key)

              return (
                <MenuItem
                  key={item.key}
                  className="mention-menu__item"
                  icon={
                    <span className="mention-menu__thumb">
                      {item.thumb ? (
                        item.kind === 'video' && isVideoPath(item.thumb) ? (
                          <video
                            src={`${assetUrl(item.thumb, item.scope)}#t=0.1`}
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <img src={assetUrl(item.thumb, item.scope)} alt="" />
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
                    <span className="mention-menu__kind">
                      {item.group === '角色'
                        ? '角色卡'
                        : item.kind === 'video'
                          ? '视频'
                          : '图片'}
                    </span>
                  }
                >
                  <span className="mention-menu__name">{item.name}</span>
                </MenuItem>
              )
            })}
          </div>
        ))}

        {flat.length === 0 ? (
          <div className="mention-menu__empty">没有匹配的素材</div>
        ) : null}
      </div>
    </div>
  )
}
