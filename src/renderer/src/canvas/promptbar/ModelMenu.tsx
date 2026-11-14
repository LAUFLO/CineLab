import {
  MEDIA_INPUT_LABEL,
  missingInputsFor,
  type MediaInput
} from '@shared/provider-schema'
import { MenuItem } from '../../components/ui'
import type { ModelOption } from '../promptbar-model'

interface ModelMenuProps {
  open: boolean
  models: ModelOption[]
  activeKey?: string
  requiredInputs: MediaInput[]
  onSelect: (
    item: ModelOption,
    missing: MediaInput[],
    unavailable: boolean
  ) => void
}

const inputLabel = (inputs: MediaInput[]): string =>
  inputs.map((input) => MEDIA_INPUT_LABEL[input]).join('·')

export function ModelMenu({
  open,
  models,
  activeKey,
  requiredInputs,
  onSelect
}: ModelMenuProps) {
  if (!open) return null

  return (
    <div className="model-menu">
      {models.map((item) => {
        const missing = missingInputsFor(item.model, requiredInputs)
        const unavailable = missing.length > 0

        return (
          <MenuItem
            key={item.key}
            active={item.key === activeKey}
            className={`model-menu__item ${unavailable ? 'is-disabled' : ''}`}
            title={
              unavailable
                ? `该模型不支持${inputLabel(missing)}输入`
                : undefined
            }
            onSelect={() => onSelect(item, missing, unavailable)}
            trailing={
              <span className="flex flex-col items-end gap-0.5">
                {unavailable ? (
                  <span className="model-menu__reason">
                    不支持
                    {missing.map((input) => MEDIA_INPUT_LABEL[input]).join('·')}
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
