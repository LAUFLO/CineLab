import { useUIStore } from '../../stores/ui'

/**
 * 画布上的播放名额管理。
 * - 视频：素材节点与剪辑室 canvas 预览共享 4 个名额，超出时暂停最早播放的。
 * - 音频：全局最多 1 个出声源，新的出声自动暂停上一个。
 */

const MAX_VIDEO_PLAYING = 4
const MAX_AUDIO_PLAYING = 1

const activeVideo = new Map<string, () => void>()
const activeAudio = new Map<string, () => void>()

function acquire(
  pool: Map<string, () => void>,
  limit: number,
  id: string,
  pause: () => void,
  message: string
): void {
  if (pool.has(id)) return

  while (pool.size >= limit) {
    const oldest = pool.entries().next().value as
      | [string, () => void]
      | undefined
    if (!oldest) break
    const [oldestId, oldestPause] = oldest
    pool.delete(oldestId)
    try {
      oldestPause()
    } catch {
      // 组件可能已卸载，忽略
    }
    useUIStore.getState().showToast(message)
  }

  pool.set(id, pause)
}

export function acquireVideoPlayback(id: string, pause: () => void): void {
  acquire(
    activeVideo,
    MAX_VIDEO_PLAYING,
    id,
    pause,
    `同时最多播放 ${MAX_VIDEO_PLAYING} 个视频，已暂停最早播放的预览`
  )
}

export function releaseVideoPlayback(id: string): void {
  activeVideo.delete(id)
}

export function isVideoPlaybackActive(id: string): boolean {
  return activeVideo.has(id)
}

export function acquireAudioPlayback(id: string, pause: () => void): void {
  acquire(
    activeAudio,
    MAX_AUDIO_PLAYING,
    id,
    pause,
    '同一时间只能播放一个音频，已暂停上一个'
  )
}

export function releaseAudioPlayback(id: string): void {
  activeAudio.delete(id)
}

export function isAudioPlaybackActive(id: string): boolean {
  return activeAudio.has(id)
}

/** 导出等重任务前暂停画布上所有视频/音频播放 */
export function pauseAllPlayback(): void {
  for (const pause of activeVideo.values()) {
    try {
      pause()
    } catch {
      // 组件可能已卸载
    }
  }
  activeVideo.clear()
  for (const pause of activeAudio.values()) {
    try {
      pause()
    } catch {
      // 组件可能已卸载
    }
  }
  activeAudio.clear()
}
