import {
  MEDIA_INPUT_LABEL,
  missingInputsFor,
  modelModeCompatibility,
  type MediaInput,
  type ModeContext
} from '@shared/provider-schema'
import { MenuItem } from '../../components/ui'
import type { ModelOption } from '../promptbar-model'

interface ModelMenuProps {
  open: boolean
  models: ModelOption[]
  activeKey?: string
  requiredInputs: MediaInput[]
  modeContext: ModeContext
  onSelect: (
    item: ModelOption,
    missing: MediaInput[],
    unavailable: boolean,
    reason?: string
  ) => void
}

const inputLabel = (inputs: MediaInput[]): string =>
  inputs.map((input) => MEDIA_INPUT_LABEL[input]).join('·')

const MENU =
  'absolute bottom-8 left-0 z-[60] max-h-[280px] w-60 overflow-y-auto rounded-[10px] border border-border bg-surface p-1 shadow-menu'
const ITEM = '!h-8 !rounded-[6px] !px-2 !py-0 text-xs'
const ITEM_IDLE = '!text-fg-muted hover:!text-fg'
const ITEM_ACTIVE = '!text-fg'
const ITEM_DISABLED =
  'cursor-not-allowed !text-fg-muted opacity-55 hover:!bg-transparent hover:!text-fg-muted'

export function ModelMenu({
  open,
  models,
  activeKey,
  requiredInputs,
  modeContext,
  onSelect
}: ModelMenuProps) {
  if (!open) return null

  return (
    <div className={MENU}>
      {models.map((item) => {
        const missing = missingInputsFor(item.model, requiredInputs)
        const compatibility = modelModeCompatibility(item.model, modeContext)
        const unavailable = missing.length > 0 || !compatibility.ok
        const reason =
          missing.length > 0
            ? `该模型不支持${inputLabel(missing)}输入`
            : compatibility.reason
        const active = item.key === activeKey

        return (
          <MenuItem
            key={item.key}
            active={active}
            className={`${ITEM} ${
              unavailable ? ITEM_DISABLED : active ? ITEM_ACTIVE : ITEM_IDLE
            }`}
            title={reason}
            onSelect={() => onSelect(item, missing, unavailable, reason)}
            trailing={
              <span className="flex flex-col items-end gap-px">
                {unavailable ? (
                  <span className="whitespace-nowrap text-[10px] text-danger">
                    {reason ?? '不支持当前输入'}
                  </span>
                ) : null}
                <span className="text-[11px] text-fg-subtle">
                  {item.providerName}
                </span>
              </span>
            }
          >
            <span className="text-xs">{item.model.name}</span>
          </MenuItem>
        )
      })}
    </div>
  )
}
