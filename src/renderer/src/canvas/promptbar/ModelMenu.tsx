import {
  MEDIA_INPUT_LABEL,
  missingInputsFor,
  modelModeCompatibility,
  type MediaInput,
  type ModeContext
} from '@shared/provider-schema'
import type { RefObject } from 'react'
import { MenuItem, Popover } from '../../components/ui'
import type { ModelOption } from '../promptbar-model'

interface ModelMenuProps {
  open: boolean
  models: ModelOption[]
  activeKey?: string
  requiredInputs: MediaInput[]
  modeContext: ModeContext
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  onSelect: (
    item: ModelOption,
    missing: MediaInput[],
    unavailable: boolean,
    reason?: string
  ) => void
}

const inputLabel = (inputs: MediaInput[]): string =>
  inputs.map((input) => MEDIA_INPUT_LABEL[input]).join('·')

const MENU = '!max-h-[280px]'
const ITEM = '!h-8 !rounded-md !px-2 !py-0 text-xs'
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
  onSelect,
  onClose,
  anchorRef
}: ModelMenuProps) {
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      width={240}
      className={MENU}
    >
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
    </Popover>
  )
}
