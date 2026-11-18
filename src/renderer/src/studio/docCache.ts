import type { TimelineDoc } from '@shared/timeline-schema'

const MAX_ENTRIES = 20
const cache = new Map<string, TimelineDoc>()

/** 读取缓存并刷新 LRU 顺序 */
export function getCachedTimeline(id: string): TimelineDoc | undefined {
  const doc = cache.get(id)
  if (!doc) return undefined
  cache.delete(id)
  cache.set(id, doc)
  return doc
}

export function setCachedTimeline(id: string, doc: TimelineDoc): void {
  cache.delete(id)
  cache.set(id, doc)
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (!oldest) break
    cache.delete(oldest)
  }
}

export function invalidateTimelineCache(id: string): void {
  cache.delete(id)
}
