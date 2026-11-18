import { describe, expect, it } from 'vitest'
import {
  createPrevisRoomPlan,
  isPrevisRoomPlan,
  normalizePrevisRoomSpec,
  previsRoomFurniture,
  previsRoomSpecOf,
  previsRoomTypeFromText
} from '../previs/room'

describe('previs room', () => {
  it('detects room types from text', () => {
    expect(previsRoomTypeFromText('一间咖啡店')).toBe('cafe')
    expect(previsRoomTypeFromText('open plan office')).toBe('office')
    expect(previsRoomTypeFromText('meeting room')).toBe('meeting_room')
    expect(previsRoomTypeFromText('unknown place')).toBe('generic')
  })

  it('normalizes specs with defaults and clamps', () => {
    const spec = normalizePrevisRoomSpec({
      room: 'cafe',
      widthM: 1,
      depthM: 100,
      description: '  a   cafe  '
    })

    expect(spec.type).toBe('cafe')
    expect(spec.widthM).toBeGreaterThanOrEqual(4)
    expect(spec.depthM).toBeLessThanOrEqual(24)
    expect(spec.description).toBe('a cafe')
  })

  it('falls back to the request and default description', () => {
    const spec = normalizePrevisRoomSpec({}, '一个安静的图书馆')
    expect(spec.type).toBe('library')
    expect(spec.description.length).toBeGreaterThan(0)
  })

  it('builds furniture for several room types', () => {
    const rooms = [
      'cafe',
      'restaurant',
      'bar',
      'office',
      'meeting_room',
      'classroom',
      'living_room',
      'bedroom',
      'kitchen',
      'shop',
      'library',
      'lobby',
      'hospital_ward',
      'generic'
    ] as const

    for (const room of rooms) {
      const spec = normalizePrevisRoomSpec({ room })
      const props = previsRoomFurniture(spec)
      expect(props.length).toBeGreaterThan(0)
      expect(props.some((prop) => prop.kind === 'door')).toBe(true)
      expect(props.every((prop) => prop.fixed)).toBe(true)
    }
  })

  it('creates a room plan and reads its spec', () => {
    const spec = normalizePrevisRoomSpec({ room: 'office' })
    const plan = createPrevisRoomPlan(spec, 12)

    expect(isPrevisRoomPlan(plan)).toBe(true)
    expect(previsRoomSpecOf(plan).type).toBe('office')
    expect(plan.props.length).toBeGreaterThan(0)
  })
})
