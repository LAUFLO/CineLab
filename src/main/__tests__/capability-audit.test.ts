import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ModelDef } from '@shared/provider-schema'
import { MODEL_PRESETS } from '@shared/provider-schema'
import {
  PROTOCOL_TEMPLATES,
  type ProtocolTemplate
} from '@shared/protocol-templates'
import {
  PROVIDER_PRESETS,
  recommendedModelsForPreset
} from '@shared/provider-presets'
import {
  ADAPTER_CAPABILITIES,
  effectiveCapabilities,
  type CapabilityGap
} from '@shared/capabilities'
import { OFFICIAL_CONTRACTS } from '@shared/model-contracts'
import { getModelModeDefinition } from '@shared/model-modes'

type AuditSource = 'preset' | 'recommended' | 'template'

interface Exemption {
  source?: AuditSource
  model: string
  kind: CapabilityGap['kind']
  value: string
  reason: string
  expiresAt: string
}

interface AuditRow {
  source: AuditSource
  model: string
  adapter: string
  gap: CapabilityGap
}

function readExemptions(): Exemption[] {
  try {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), 'capability-gaps.json'), 'utf8')
    ) as { exemptions?: Exemption[] }
    return raw.exemptions ?? []
  } catch {
    return []
  }
}

function rowsFor(source: AuditSource, model: ModelDef): AuditRow[] {
  const capabilities = effectiveCapabilities(model)
  return capabilities.gaps.map((gap) => ({
    source,
    model: model.id,
    adapter: capabilities.adapter,
    gap
  }))
}

function templateModel(template: ProtocolTemplate): ModelDef {
  const output = getModelModeDefinition(template.modes[0]?.id ?? 't2v')?.output
  return {
    id: template.id,
    name: template.label,
    capability: output === 'image' ? 'image.t2i' : 'video.t2v',
    remoteModel: template.id,
    params: template.params,
    protocol: template.id,
    adapter: template.adapter,
    modes: template.modes,
    features: template.features
  }
}

function auditRows(): AuditRow[] {
  const presets = MODEL_PRESETS.flatMap((model) => rowsFor('preset', model))
  const recommended = PROVIDER_PRESETS.flatMap((preset) =>
    recommendedModelsForPreset(preset.id).flatMap((model) =>
      rowsFor('recommended', model)
    )
  )
  const templates = PROTOCOL_TEMPLATES.flatMap((template) =>
    rowsFor('template', templateModel(template))
  )

  return [...presets, ...recommended, ...templates]
}

describe('capability audit', () => {
  it('has no unexempted capability gaps', () => {
    const rows = auditRows()
    const exemptions = readExemptions()
    const now = Date.now()

    const unexempted = rows.filter((row) => {
      const exemption = exemptions.find(
        (item) =>
          (!item.source || item.source === row.source) &&
          item.model === row.model &&
          item.kind === row.gap.kind &&
          item.value === row.gap.value
      )
      if (!exemption) return true
      return Date.parse(exemption.expiresAt) < now
    })

    if (unexempted.length > 0) {
      console.table(
        unexempted.map((row) => ({
          source: row.source,
          model: row.model,
          adapter: row.adapter,
          kind: row.gap.kind,
          value: row.gap.value,
          message: row.gap.message
        }))
      )
    }

    expect(unexempted).toEqual([])
  })
})

describe('model contracts', () => {
  it('covers every official adapter with matching modes', () => {
    for (const [adapter, capability] of Object.entries(
      ADAPTER_CAPABILITIES
    )) {
      const contract = OFFICIAL_CONTRACTS[adapter]
      expect(contract, adapter).toBeDefined()
      expect(new Set(contract.modes), adapter).toEqual(
        new Set(capability.modes)
      )
    }
  })

  it('declares fields for every keyframe and reference mode', () => {
    for (const [adapter, contract] of Object.entries(OFFICIAL_CONTRACTS)) {
      if (
        contract.modes.includes('first-frame') ||
        contract.modes.includes('first-last')
      ) {
        expect(contract.fields.firstFrame, adapter).toBeTruthy()
      }
      if (contract.modes.includes('first-last')) {
        expect(contract.fields.lastFrame, adapter).toBeTruthy()
      }
      if (contract.modes.includes('reference')) {
        expect(contract.fields.referenceImage, adapter).toBeTruthy()
      }
    }
  })

  it('includes source metadata for every contract', () => {
    for (const [adapter, contract] of Object.entries(OFFICIAL_CONTRACTS)) {
      expect(contract.source.url, adapter).toBeTruthy()
      expect(contract.source.retrievedAt, adapter).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(['high', 'medium', 'low'], adapter).toContain(
        contract.source.confidence
      )
    }
  })
})
