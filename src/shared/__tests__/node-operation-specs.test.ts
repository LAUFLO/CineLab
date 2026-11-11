import { describe, expect, it } from 'vitest'
import {
  NODE_OPERATION_AGENT_SPECS,
  validateNodeOperationParams
} from '../node-operation-specs'

describe('node operation agent specs', () => {
  it('requires a menu item for grid split', () => {
    expect(
      validateNodeOperationParams('grid-split', undefined, {})
    ).toContain('itemId')
    expect(
      validateNodeOperationParams('grid-split', '3x3', {})
    ).toBeNull()
    expect(
      validateNodeOperationParams('grid-split', '9x9', {})
    ).toContain('不支持')
  })

  it('requires a rect for free crop', () => {
    expect(
      validateNodeOperationParams('crop', 'free', {})
    ).toContain('params.rect')
    expect(
      validateNodeOperationParams('crop', 'free', {
        rect: { x: 0, y: 0, width: 100, height: 80 }
      })
    ).toBeNull()
  })

  it('validates trim ranges', () => {
    expect(
      validateNodeOperationParams('clip-trim', undefined, {
        start: 2,
        end: 1
      })
    ).toContain('end')
    expect(
      validateNodeOperationParams('clip-trim', undefined, {
        start: 1,
        end: 2
      })
    ).toBeNull()
  })

  it('requires a rect for boxed subtitle removal', () => {
    expect(
      validateNodeOperationParams('subtitle', 'box', {})
    ).toContain('params.rect')
    expect(
      validateNodeOperationParams('subtitle', 'smart', {})
    ).toBeNull()
  })

  it('validates rect size for object removal', () => {
    expect(
      validateNodeOperationParams('object-remove', undefined, {})
    ).toContain('rect')
    expect(
      validateNodeOperationParams('object-remove', undefined, {
        rect: { x: 0, y: 0, width: 0, height: 10 }
      })
    ).toContain('宽高')
    expect(
      validateNodeOperationParams('object-remove', undefined, {
        rect: { x: 0, y: 0, width: 10, height: 10 }
      })
    ).toBeNull()
  })

  it('validates motion capture options', () => {
    expect(
      validateNodeOperationParams('motion-capture', undefined, {
        quality: 'ultra'
      })
    ).toContain('quality')
    expect(
      validateNodeOperationParams('motion-capture', undefined, {
        fps: 120
      })
    ).toContain('fps')
    expect(
      validateNodeOperationParams('motion-capture', undefined, {
        quality: 'standard',
        fps: 24
      })
    ).toBeNull()
  })

  it('explains why model or mask operations are not agent-executable', () => {
    const blocked = Object.values(NODE_OPERATION_AGENT_SPECS).filter(
      (spec) => !spec.executable
    )
    expect(blocked.length).toBeGreaterThan(0)
    for (const spec of blocked) {
      expect(spec.reason).toBeTruthy()
    }
  })

  it('marks model operations as generation proposable', () => {
    expect(
      NODE_OPERATION_AGENT_SPECS['grid-generate'].generationProposable
    ).toBe(true)
    expect(
      NODE_OPERATION_AGENT_SPECS['character-sheet'].generationProposable
    ).toBe(true)
    expect(NODE_OPERATION_AGENT_SPECS.inpaint.generationProposable).toBe(
      false
    )
  })
})
