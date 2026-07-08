// 픽셀 스프라이트 — 베이스(민머리 몸) 위에 파츠(머리/눈/입/상의)를 레이어 합성한 뒤
// 팔레트 스왑(색 커스터마이징)을 적용해 캔버스로 굽는다. (기획서 §2.2, §8)
// 합성 순서: 베이스+다리 → 상의 → 머리 → 눈 → 입. compose는 순수 함수라 헤드리스 테스트 가능.

import { getPart, type PartMap } from './parts'

export const SPRITE_W = 16
export const SPRITE_H = 24
/** 기본 표시 배율 — 설정(트레이 메뉴)에서 2/3x 변경 가능 */
export const DEFAULT_SCALE = 2

/** 커스터마이징 가능한 색상 견본 (옷장 UI) — 인덱스로 저장 */
export const SWATCHES = {
  skin: ['#f2c9a0', '#e8b48a', '#c68d5f', '#8d5b3b'],
  hair: ['#4a3728', '#2d2d3a', '#7a4a2f', '#c9a04e', '#b55a6e', '#5b7a9e'],
  top: ['#5b8bd9', '#c96a5b', '#6aa06a', '#8f7fd4', '#d9a45b', '#4a4f66'],
  bottom: ['#3d4a63', '#6e4a3d', '#4a664f', '#2d2d3a'],
} as const

export interface Look {
  // 색 (견본 인덱스)
  skin: number
  hair: number
  top: number
  bottom: number
  // 모양 (파츠 id)
  hairStyle: string
  eyesStyle: string
  mouthStyle: string
  topStyle: string
}

export const DEFAULT_LOOK: Look = {
  skin: 0,
  hair: 0,
  top: 0,
  bottom: 0,
  hairStyle: 'short',
  eyesStyle: 'normal',
  mouthStyle: 'smile',
  topStyle: 'tee',
}

/** hex 컬러를 어둡게 (파생 음영색 — 후드 그늘 등) */
function darken(hex: string, f = 0.72): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * f)
  const g = Math.round(((n >> 8) & 255) * f)
  const b = Math.round((n & 255) * f)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

const BASE_PALETTE: Record<string, string> = {
  K: SWATCHES.hair[0], // hair
  S: SWATCHES.skin[0], // skin
  E: '#2d2d3a', // eye
  L: '#a8794f', // closed eye / lash
  M: '#c96a5b', // mouth
  T: SWATCHES.top[0], // shirt
  U: darken(SWATCHES.top[0]), // shirt shade (후드 등)
  V: '#f2f2ec', // collar white
  P: SWATCHES.bottom[0], // pants
  B: '#8a5a3b', // shoes
  H: '#e85d75', // heart
  D: '#3a3f52', // laptop body
  W: '#cfe6ff', // laptop screen glow
  F: '#8a4f3d', // sofa frame
  C: '#d98c7a', // sofa cushion
  N: '#b9695a', // sofa cushion shade
}

function paletteWithLook(look: Look): Record<string, string> {
  const clamp = (arr: readonly string[], i: number) => arr[Math.max(0, Math.min(arr.length - 1, i))]
  const top = clamp(SWATCHES.top, look.top)
  return {
    ...BASE_PALETTE,
    S: clamp(SWATCHES.skin, look.skin),
    K: clamp(SWATCHES.hair, look.hair),
    T: top,
    U: darken(top),
    P: clamp(SWATCHES.bottom, look.bottom),
  }
}

// 민머리 베이스 몸 (17행) — 머리/눈/입/상의는 파츠가 덮는다
const BASE_BODY = [
  '................',
  '................',
  '....SSSSSSSS....',
  '...SSSSSSSSSS...',
  '...SSSSSSSSSS...',
  '...SSSSSSSSSS...',
  '...SSSSSSSSSS...',
  '...SSSSSSSSSS...',
  '...SSSSSSSSSS...',
  '....SSSSSSSS....',
  '.....SSSSSS.....',
  '....TTTTTTTT....',
  '...TTTTTTTTTT...',
  '..STTTTTTTTTTS..',
  '..STTTTTTTTTTS..',
  '...TTTTTTTTTT...',
  '....TTTTTTTT....',
]

const LEGS_IDLE = [
  '....PPPPPPPP....',
  '....PPP..PPP....',
  '....PPP..PPP....',
  '....PPP..PPP....',
  '....PPP..PPP....',
  '...BBBB..BBBB...',
  '...BBBB..BBBB...',
]

const LEGS_WALK_A = [
  '....PPPPPPPP....',
  '...PPP...PPP....',
  '...PPP....PPP...',
  '..PPP.....PPP...',
  '..PPP......PPP..',
  '.BBBB......BBBB.',
  '................',
]

const LEGS_WALK_B = LEGS_WALK_A.map((row) => row.split('').reverse().join(''))

// 집혀서 공중에 뜬 상태 — 다리를 허둥대는 두 프레임
const LEGS_FLAIL_A = [
  '....PPPPPPPP....',
  '...PPPP..PPPP...',
  '..PPP......PPP..',
  '.PPP........PPP.',
  '.BBB........BBB.',
  '................',
  '................',
]

const LEGS_FLAIL_B = [
  '....PPPPPPPP....',
  '....PPP..PPP....',
  '.....PPP.PPP....',
  '....PPP...PPP...',
  '....BBB...BBB...',
  '................',
  '................',
]

// 앉아서 무릎 위 노트북으로 타이핑 (Co-work)
const LEGS_WORK_A = [
  '....PPPPPPPP....',
  '...PPPPPPPPPP...',
  '..DDDDDDDDDDD...',
  '..DWWWWWWWWWD...',
  '..DDDDDDDDDDD...',
  '...BB.....BB....',
  '................',
]

const LEGS_WORK_B = [
  '....PPPPPPPP....',
  '...PPPPPPPPPP...',
  '..DDDDDDDDDDD...',
  '..DWWWWWWWWWD...',
  '..DDDDDDDDDDD...',
  '....BB...BB.....',
  '................',
]

// 그냥 앉기 (소파 등)
const LEGS_SIT = [
  '....PPPPPPPP....',
  '...PPPPPPPPPP...',
  '...PPP....PPP...',
  '...PPP....PPP...',
  '...BBB....BBB...',
  '................',
  '................',
]

export const HEART = ['.HH.HH.', 'HHHHHHH', 'HHHHHHH', '.HHHHH.', '..HHH..', '...H...']

// 1인용 소파 (가구) — 24x16
export const SOFA_W = 24
export const SOFA_H = 16
export const SOFA = [
  '..FFFFFFFFFFFFFFFFFF...',
  '.FCCCCCCCCCCCCCCCCCCF..',
  '.FCCCCCCCCCCCCCCCCCCF..',
  '.FCCCCCCCCCCCCCCCCCCF..',
  '.FCCCCCCCCCCCCCCCCCCF..',
  '.FCCCCCCCCCCCCCCCCCCF..',
  'FFNNNNNNNNNNNNNNNNNNFF.',
  'FCCNNNNNNNNNNNNNNNNCCF.',
  'FCCCCCCCCCCCCCCCCCCCCF.',
  'FCCCCCCCCCCCCCCCCCCCCF.',
  'FFFFFFFFFFFFFFFFFFFFFF.',
  'FFFFFFFFFFFFFFFFFFFFFF.',
  '.FF................FF..',
  '.FF................FF..',
  '.FF................FF..',
  '........................',
]

export type FrameName =
  | 'idle'
  | 'blink'
  | 'walkA'
  | 'walkB'
  | 'sleep'
  | 'pant'
  | 'heldA'
  | 'heldB'
  | 'workA'
  | 'workB'
  | 'back'
  | 'sit'

const FRAME_LEGS: Record<FrameName, string[]> = {
  idle: LEGS_IDLE,
  blink: LEGS_IDLE,
  walkA: LEGS_WALK_A,
  walkB: LEGS_WALK_B,
  sleep: LEGS_IDLE,
  pant: LEGS_IDLE,
  heldA: LEGS_FLAIL_A,
  heldB: LEGS_FLAIL_B,
  workA: LEGS_WORK_A,
  workB: LEGS_WORK_B,
  back: LEGS_IDLE,
  sit: LEGS_SIT,
}

/** 눈을 감고 있는 프레임들 (눈 파츠의 E를 L로 치환) */
const CLOSED_EYE_FRAMES: ReadonlySet<FrameName> = new Set(['blink', 'sleep', 'pant'])

/** 파츠 오버레이 — '.'이 아닌 문자만 베이스를 덮는다 */
function overlay(rows: string[][], part: PartMap) {
  part.rows.forEach((row, i) => {
    const y = part.y0 + i
    if (y < 0 || y >= rows.length) return
    for (let x = 0; x < Math.min(SPRITE_W, row.length); x++) {
      if (row[x] !== '.') rows[y][x] = row[x]
    }
  })
}

/**
 * 프레임 합성 (순수 함수 — 캔버스 없이 문자 그리드 반환, 테스트 대상).
 * 순서: 베이스+다리 → 상의 → 머리 → (앞면이면) 눈 → 입
 */
export function composeMap(frame: FrameName, look: Look = DEFAULT_LOOK): string[] {
  const isBack = frame === 'back'
  const rows: string[][] = [...BASE_BODY, ...FRAME_LEGS[frame]].map((r) =>
    r.padEnd(SPRITE_W, '.').split(''),
  )

  const top = getPart('top', look.topStyle)
  overlay(rows, isBack ? (top.back ?? top.map) : top.map)

  const hair = getPart('hair', look.hairStyle)
  overlay(rows, isBack ? (hair.back ?? hair.map) : hair.map)

  if (!isBack) {
    overlay(rows, getPart('eyes', look.eyesStyle).map)
    overlay(rows, getPart('mouth', look.mouthStyle).map)
  }

  let out = rows.map((r) => r.join(''))
  if (CLOSED_EYE_FRAMES.has(frame)) out = out.map((r) => r.replace(/E/g, 'L'))
  return out
}

export interface BakedFrame {
  canvas: HTMLCanvasElement
  /** 클릭통과 per-pixel hit-test용 불투명 마스크 [y][x] */
  mask: boolean[][]
}

export function bakeFrame(name: FrameName, look: Look = DEFAULT_LOOK): BakedFrame {
  return bakeMap(composeMap(name, look), SPRITE_W, SPRITE_H, paletteWithLook(look))
}

export function bakeAllFrames(look: Look): Record<FrameName, BakedFrame> {
  const out = {} as Record<FrameName, BakedFrame>
  for (const name of Object.keys(FRAME_LEGS) as FrameName[]) out[name] = bakeFrame(name, look)
  return out
}

export function bakeMap(
  rows: string[],
  w: number,
  h: number,
  palette: Record<string, string> = BASE_PALETTE,
): BakedFrame {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const mask: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false))
  for (let y = 0; y < Math.min(h, rows.length); y++) {
    const row = rows[y]
    for (let x = 0; x < Math.min(w, row.length); x++) {
      const color = palette[row[x]]
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x, y, 1, 1)
      mask[y][x] = true
    }
  }
  return { canvas, mask }
}
