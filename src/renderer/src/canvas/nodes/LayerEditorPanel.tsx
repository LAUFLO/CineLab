import type { OutputRef } from '@shared/canvas-schema'
import { Icon } from '../../components/Icon'
import { Button, IconButton, Select } from '../../components/ui'
import { assetUrl } from '../../lib/asset-url'
import type { LayerGroup } from './layer-compose'

interface LayerEditorPanelProps {
  group: LayerGroup
  groups: Array<{ id: string; label: string }>
  detachedLayers: OutputRef[]
  activeLayerId: string | null
  onSelectGroup: (groupId: string) => void
  onActiveLayerChange: (id: string | null) => void
  onUpdateLayer: (
    id: string,
    patch: { layerVisible?: boolean; layerLocked?: boolean }
  ) => void
  onRestore: (output: OutputRef) => void
}

export function LayerEditorPanel({
  group,
  groups,
  detachedLayers,
  activeLayerId,
  onSelectGroup,
  onActiveLayerChange,
  onUpdateLayer,
  onRestore
}: LayerEditorPanelProps) {
  return (
    <div className="nodrag nopan rounded-card border border-border bg-surface-raised p-2 text-[10.5px] shadow-float">
      {groups.length > 1 ? (
        <div className="mb-1.5">
          <Select
            size="xs"
            value={group.groupId}
            options={groups.map((entry) => ({
              value: entry.id,
              label: entry.label
            }))}
            onChange={onSelectGroup}
            className="!w-full"
            ariaLabel="图层组"
          />
        </div>
      ) : null}

      <div className="mb-1 flex items-center justify-between text-fg-subtle">
        <span>图层</span>
        <span>
          {
            group.layers.filter((layer) => layer.layerAttached !== false)
              .length
          }
        </span>
      </div>
      <div className="flex max-h-[150px] flex-col gap-0.5 overflow-y-auto">
        {group.layers
          .filter((layer) => layer.layerAttached !== false)
          .map((layer) => {
            const visible = layer.layerVisible !== false
            const locked = layer.layerLocked === true
            return (
              <div
                key={layer.id}
                className={`flex h-7 items-center gap-1.5 rounded-md px-1 ${
                  layer.id === activeLayerId
                    ? 'bg-surface-hover text-fg'
                    : 'text-fg-muted'
                }`}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  onActiveLayerChange(layer.id)
                }}
              >
                <span className="h-[18px] w-[18px] shrink-0 overflow-hidden rounded-[2px] bg-canvas">
                  <img
                    src={assetUrl(layer.path, layer.scope)}
                    alt=""
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {layer.layer?.name?.trim() ||
                    `图层 ${layer.layer?.zIndex ?? ''}`}
                </span>
                <IconButton
                  label={visible ? '隐藏图层' : '显示图层'}
                  size="xs"
                  onClick={(event) => {
                    event.stopPropagation()
                    onUpdateLayer(layer.id, { layerVisible: !visible })
                  }}
                >
                  <Icon
                    name="eye"
                    size={11}
                    className={visible ? '' : 'opacity-30'}
                  />
                </IconButton>
                <IconButton
                  label={locked ? '解锁图层' : '锁定图层'}
                  size="xs"
                  onClick={(event) => {
                    event.stopPropagation()
                    onUpdateLayer(layer.id, { layerLocked: !locked })
                  }}
                >
                  <Icon name={locked ? 'lock' : 'unlock'} size={11} />
                </IconButton>
              </div>
            )
          })}
      </div>

      {detachedLayers.length > 0 ? (
        <>
          <div className="mb-1 mt-2 text-fg-subtle">已分离</div>
          <div className="flex max-h-[110px] flex-col gap-0.5 overflow-y-auto">
            {detachedLayers.map((output) => (
              <div
                key={output.id}
                className="flex h-7 items-center gap-1.5 rounded-md px-1 text-fg-subtle"
              >
                <span className="h-[18px] w-[18px] shrink-0 overflow-hidden rounded-[2px] bg-canvas">
                  <img
                    src={assetUrl(output.path, output.scope)}
                    alt=""
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {output.layer?.name?.trim() ||
                    `图层 ${output.layer?.zIndex ?? ''}`}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className="!h-5 shrink-0 !rounded-md !px-1.5 !text-[10px]"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRestore(output)
                  }}
                >
                  放回
                </Button>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
