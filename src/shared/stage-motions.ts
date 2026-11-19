export const STAGE_BONES = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'leftUpperArm',
  'leftForeArm',
  'rightUpperArm',
  'rightForeArm',
  'leftThigh',
  'leftShin',
  'rightThigh',
  'rightShin'
] as const

export type StageBone = (typeof STAGE_BONES)[number]

export type StagePoseName =
  | 'stand'
  | 'sit'
  | 'kneel'
  | 'crouch'
  | 'fallen'
  | 'armsCrossed'
  | 'wave'
  | 'point'
  | 'walk'
  | 'run'
  | 'sitDown'
  | 'standUp'
  | 'bow'
  | 'nod'
  | 'reach'
  | 'confront'
  | 'lookBack'

export type BoneRotation = [number, number, number]

export interface MotionFrame {
  timeMs: number
  rotations: Partial<Record<StageBone, BoneRotation>>
  hipsOffset?: [number, number, number]
}

export interface StageMotion {
  name: string
  durationMs: number
  loop: boolean
  /** 动作设计速度（米/秒），用于和实际位移匹配 */
  designSpeed?: number
  frames: MotionFrame[]
}

function frame(
  timeMs: number,
  rotations: Partial<Record<StageBone, BoneRotation>>,
  hipsOffset?: [number, number, number]
): MotionFrame {
  return { timeMs, rotations, ...(hipsOffset ? { hipsOffset } : {}) }
}

const sitRotations = {
  leftThigh: [-90, 0, 0] as BoneRotation,
  rightThigh: [-90, 0, 0] as BoneRotation,
  leftShin: [90, 0, 0] as BoneRotation,
  rightShin: [90, 0, 0] as BoneRotation
}

const baseMotions: Record<string, StageMotion> = {
  stand: {
    name: '站立',
    durationMs: 1000,
    loop: true,
    frames: [frame(0, {})]
  },
  sit: {
    name: '坐',
    durationMs: 1000,
    loop: true,
    frames: [frame(0, sitRotations, [0, -0.45, 0])]
  },
  kneel: {
    name: '跪',
    durationMs: 1000,
    loop: true,
    frames: [
      frame(
        0,
        {
          leftThigh: [-90, 0, 0],
          rightThigh: [-90, 0, 0],
          leftShin: [180, 0, 0],
          rightShin: [180, 0, 0]
        },
        [0, -0.5, 0]
      )
    ]
  },
  crouch: {
    name: '蹲',
    durationMs: 1000,
    loop: true,
    frames: [
      frame(
        0,
        {
          leftThigh: [-80, 0, 0],
          rightThigh: [-80, 0, 0],
          leftShin: [80, 0, 0],
          rightShin: [80, 0, 0],
          spine: [15, 0, 0]
        },
        [0, -0.35, 0]
      )
    ]
  },
  fallen: {
    name: '倒地',
    durationMs: 1000,
    loop: true,
    frames: [
      frame(
        0,
        {
          hips: [90, 0, 0],
          leftUpperArm: [0, 0, 30],
          rightUpperArm: [0, 0, -30],
          leftThigh: [-20, 0, 0],
          rightThigh: [-20, 0, 0]
        },
        [0, -0.8, 0]
      )
    ]
  },
  armsCrossed: {
    name: '抱臂',
    durationMs: 1000,
    loop: true,
    frames: [
      frame(0, {
        leftUpperArm: [0, 0, 70],
        rightUpperArm: [0, 0, -70],
        leftForeArm: [0, 60, 0],
        rightForeArm: [0, -60, 0]
      })
    ]
  },
  wave: {
    name: '挥手',
    durationMs: 1000,
    loop: true,
    frames: [
      frame(0, {
        rightUpperArm: [0, 0, -120],
        rightForeArm: [0, 0, -20]
      }),
      frame(500, {
        rightUpperArm: [0, 0, -140],
        rightForeArm: [0, 0, -10]
      }),
      frame(1000, {
        rightUpperArm: [0, 0, -120],
        rightForeArm: [0, 0, -20]
      })
    ]
  },
  point: {
    name: '指',
    durationMs: 1000,
    loop: true,
    frames: [
      frame(0, {
        rightUpperArm: [-80, 0, 0],
        rightForeArm: [0, 0, 0]
      })
    ]
  },
  reach: {
    name: '伸手',
    durationMs: 1000,
    loop: true,
    frames: [
      frame(0, {
        rightUpperArm: [-90, 0, 0],
        rightForeArm: [0, 0, 0]
      })
    ]
  },
  walk: {
    name: '走',
    durationMs: 1000,
    loop: true,
    designSpeed: 1.3,
    frames: [
      frame(0, {
        leftThigh: [30, 0, 0],
        rightThigh: [-30, 0, 0],
        leftShin: [0, 0, 0],
        rightShin: [30, 0, 0],
        leftUpperArm: [-20, 0, 0],
        rightUpperArm: [20, 0, 0]
      }),
      frame(250, {
        leftThigh: [0, 0, 0],
        rightThigh: [0, 0, 0],
        leftShin: [15, 0, 0],
        rightShin: [15, 0, 0]
      }),
      frame(500, {
        leftThigh: [-30, 0, 0],
        rightThigh: [30, 0, 0],
        leftShin: [30, 0, 0],
        rightShin: [0, 0, 0],
        leftUpperArm: [20, 0, 0],
        rightUpperArm: [-20, 0, 0]
      }),
      frame(750, {
        leftThigh: [0, 0, 0],
        rightThigh: [0, 0, 0],
        leftShin: [15, 0, 0],
        rightShin: [15, 0, 0]
      }),
      frame(1000, {
        leftThigh: [30, 0, 0],
        rightThigh: [-30, 0, 0],
        leftShin: [0, 0, 0],
        rightShin: [30, 0, 0],
        leftUpperArm: [-20, 0, 0],
        rightUpperArm: [20, 0, 0]
      })
    ]
  },
  run: {
    name: '跑',
    durationMs: 800,
    loop: true,
    designSpeed: 3,
    frames: [
      frame(0, {
        leftThigh: [55, 0, 0],
        rightThigh: [-55, 0, 0],
        leftShin: [20, 0, 0],
        rightShin: [60, 0, 0],
        spine: [12, 0, 0],
        leftUpperArm: [-40, 0, 0],
        rightUpperArm: [40, 0, 0]
      }),
      frame(200, {
        leftThigh: [0, 0, 0],
        rightThigh: [0, 0, 0],
        leftShin: [40, 0, 0],
        rightShin: [40, 0, 0],
        spine: [12, 0, 0]
      }),
      frame(400, {
        leftThigh: [-55, 0, 0],
        rightThigh: [55, 0, 0],
        leftShin: [60, 0, 0],
        rightShin: [20, 0, 0],
        spine: [12, 0, 0],
        leftUpperArm: [40, 0, 0],
        rightUpperArm: [-40, 0, 0]
      }),
      frame(600, {
        leftThigh: [0, 0, 0],
        rightThigh: [0, 0, 0],
        leftShin: [40, 0, 0],
        rightShin: [40, 0, 0],
        spine: [12, 0, 0]
      }),
      frame(800, {
        leftThigh: [55, 0, 0],
        rightThigh: [-55, 0, 0],
        leftShin: [20, 0, 0],
        rightShin: [60, 0, 0],
        spine: [12, 0, 0],
        leftUpperArm: [-40, 0, 0],
        rightUpperArm: [40, 0, 0]
      })
    ]
  },
  sitDown: {
    name: '坐下',
    durationMs: 1000,
    loop: false,
    frames: [
      frame(0, {}),
      frame(500, sitRotations, [0, -0.22, 0]),
      frame(1000, sitRotations, [0, -0.45, 0])
    ]
  },
  standUp: {
    name: '起身',
    durationMs: 1000,
    loop: false,
    frames: [
      frame(0, sitRotations, [0, -0.45, 0]),
      frame(500, sitRotations, [0, -0.22, 0]),
      frame(1000, {})
    ]
  },
  bow: {
    name: '鞠躬',
    durationMs: 1200,
    loop: false,
    frames: [
      frame(0, {}),
      frame(500, { spine: [60, 0, 0], chest: [15, 0, 0] }),
      frame(1200, {})
    ]
  },
  nod: {
    name: '点头',
    durationMs: 800,
    loop: false,
    frames: [
      frame(0, {}),
      frame(400, { neck: [20, 0, 0] }),
      frame(800, {})
    ]
  },
  confront: {
    name: '对峙',
    durationMs: 1000,
    loop: true,
    frames: [
      frame(0, {
        leftUpperArm: [0, 0, 70],
        rightUpperArm: [0, 0, -70],
        leftForeArm: [0, 60, 0],
        rightForeArm: [0, -60, 0],
        chest: [0, 0, 0]
      })
    ]
  },
  lookBack: {
    name: '回头',
    durationMs: 1000,
    loop: true,
    frames: [
      frame(0, {
        neck: [0, 120, 0],
        chest: [0, 40, 0]
      })
    ]
  }
}

export const STAGE_MOTIONS: Record<StagePoseName, StageMotion> = {
  stand: baseMotions.stand!,
  sit: baseMotions.sit!,
  kneel: baseMotions.kneel!,
  crouch: baseMotions.crouch!,
  fallen: baseMotions.fallen!,
  armsCrossed: baseMotions.armsCrossed!,
  wave: baseMotions.wave!,
  point: baseMotions.point!,
  walk: baseMotions.walk!,
  run: baseMotions.run!,
  sitDown: baseMotions.sitDown!,
  standUp: baseMotions.standUp!,
  bow: baseMotions.bow!,
  nod: baseMotions.nod!,
  reach: baseMotions.reach!,
  confront: baseMotions.confront!,
  lookBack: baseMotions.lookBack!
}

function lerpValue(from: number, to: number, amount: number): number {
  return from + (to - from) * amount
}

function rotationAt(
  frameValue: MotionFrame,
  bone: StageBone
): BoneRotation {
  return frameValue.rotations[bone] ?? [0, 0, 0]
}

export function sampleStageMotion(
  name: StagePoseName,
  timeMs: number
): MotionFrame {
  const motion = STAGE_MOTIONS[name] ?? STAGE_MOTIONS.stand
  const duration = Math.max(1, motion.durationMs)
  let time = Number.isFinite(timeMs) ? timeMs : 0
  if (motion.loop) {
    time = ((time % duration) + duration) % duration
  } else {
    time = Math.max(0, Math.min(duration, time))
  }

  const frames = [...motion.frames].sort((a, b) => a.timeMs - b.timeMs)
  let before = frames[0]!
  let after = frames[frames.length - 1]!
  for (let index = 0; index < frames.length - 1; index += 1) {
    if (time >= frames[index]!.timeMs && time <= frames[index + 1]!.timeMs) {
      before = frames[index]!
      after = frames[index + 1]!
      break
    }
  }

  const span = Math.max(1, after.timeMs - before.timeMs)
  const amount = Math.max(0, Math.min(1, (time - before.timeMs) / span))
  const rotations: Partial<Record<StageBone, BoneRotation>> = {}
  for (const bone of STAGE_BONES) {
    const from = rotationAt(before, bone)
    const to = rotationAt(after, bone)
    rotations[bone] = [
      lerpValue(from[0], to[0], amount),
      lerpValue(from[1], to[1], amount),
      lerpValue(from[2], to[2], amount)
    ]
  }

  const fromOffset = before.hipsOffset ?? [0, 0, 0]
  const toOffset = after.hipsOffset ?? fromOffset
  return {
    timeMs: time,
    rotations,
    hipsOffset: [
      lerpValue(fromOffset[0], toOffset[0], amount),
      lerpValue(fromOffset[1], toOffset[1], amount),
      lerpValue(fromOffset[2], toOffset[2], amount)
    ]
  }
}

export function motionRateForSpeed(
  name: StagePoseName,
  metersPerSecond: number
): number {
  const motion = STAGE_MOTIONS[name]
  if (!motion?.designSpeed) return 1
  const speed = Math.max(0.1, metersPerSecond)
  return Math.max(0.5, Math.min(2, motion.designSpeed / speed))
}

export function isStagePoseName(value: string): value is StagePoseName {
  return value in STAGE_MOTIONS
}
