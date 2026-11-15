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
    <div className="model-menu">
      {models.map((item) => {
        const missing = missingInputsFor(item.model, requiredInputs)
        const compatibility = modelModeCompatibility(item.model, modeContext)
        const unavailable = missing.length > 0 || !compatibility.ok
        const reason =
          missing.length > 0
            ? `该模型不支持${inputLabel(missing)}输入`
            : compatibility.reason

        return (
          <MenuItem
            key={item.key}
            active={item.key === activeKey}
            className={`model-menu__item ${unavailable ? 'is-disabled' : ''}`}
            title={reason}
            onSelect={() => onSelect(item, missing, unavailable, reason)}
            trailing={
              <span className="flex flex-col items-end gap-0.5">
                {unavailable ? (
                  <span className="model-menu__reason">
                    {reason ?? '不支持当前输入'}
                  </span>
                ) : null}
                <span className="model-menu__provider">{item.providerName}</span>
              </span>
            }
          >
            <span className="model-menu__name">{item.model.name}</span>
          </MenuItem>
        )
      })}
    </div>
  )
}
