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

// 서 있을 때 — 다리를 한 비트 짧게 (프레임 조립 시 몸통이 1px 내려와 발은 바닥 유지)
const LEGS_STAND = [
  '....PPPPPPPP....',
  '....PPP..PPP....',
  '....PPP..PPP....',
  '....PPP..PPP....',
  '...BBBB..BBBB...',
  '...BBBB..BBBB...',
]

// 걷기 디딤 (양발 벌림, 몸 1px 낮음 — 사이클에 상하 바운스가 생긴다)
const LEGS_WALK_CONTACT = [
  '....PPPPPPPP....',
  '...PPP...PPP....',
  '..PPP.....PPP...',
  '..PPP......PPP..',
  '.BBBB......BBBB.',
  '.BBBB......BBBB.',
]
const LEGS_WALK_CONTACT_R = LEGS_WALK_CONTACT.map((row) => row.split('').reverse().join(''))

// 걷기 지나감 (다리 모임, 뒷발 들림 — 몸이 반 박자 위로)
const LEGS_WALK_PASS = [
  '....PPPPPPPP....',
  '....PPPPPPP.....',
  '....PPP.PPP.....',
  '....PPP..PPP....',
  '....PPP..PPP....',
  '...BBBB..BBB....',
  '...BBBB.........',
]

// 달리기 디딤 (큰 보폭, 뒷발 차기)
const LEGS_RUN_CONTACT = [
  '....PPPPPPPP....',
  '..PPPP....PPP...',
  '.PPP........PPP.',
  '.PPP........PPP.',
  'BBBB........BBBB',
  'BBBB............',
]
const LEGS_RUN_CONTACT_R = LEGS_RUN_CONTACT.map((row) => row.split('').reverse().join(''))

// 달리기 공중 (양다리 접힘, 발이 바닥에서 2px 떠 있음)
const LEGS_RUN_TUCK = [
  '....PPPPPPPP....',
  '...PPPP..PPPP...',
  '..PPPP....PPPP..',
  '..BBB......BBB..',
  '..BBB......BBB..',
]

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
  | 'walkA' // 디딤 (왼발 앞)
  | 'walkMid' // 지나감 (다리 모임, 반 박자 위로)
  | 'walkB' // 디딤 (오른발 앞)
  | 'runA' // 디딤 (큰 보폭, 전경 자세)
  | 'runMid' // 공중 (다리 접힘)
  | 'runB'
  | 'sleep'
  | 'pant'
  | 'heldA'
  | 'heldB'
  | 'workA'
  | 'workB'
  | 'back'
  | 'sit'

const PAD = '................'

/** 팔 자세 — 걷기/달리기에서 팔이 함께 움직인다 */
type ArmPose = 'neutral' | 'swingA' | 'swingB' | 'pump'

interface FrameDef {
  back?: boolean
  arms?: ArmPose
  /** 달리기 전경(앞으로 기울기) — 머리 행을 진행 방향으로 1px 밀기 */
  lean?: boolean
  /** 몸통 블록 위에 넣을 빈 줄 수 (디딤 프레임 = 1, 몸이 낮아짐) */
  padTop?: number
  legs: string[]
  /** 다리 아래 빈 줄 수 (공중 프레임) */
  padBottom?: number
}

const FRAME_DEFS: Record<FrameName, FrameDef> = {
  idle: { padTop: 1, legs: LEGS_STAND },
  blink: { padTop: 1, legs: LEGS_STAND },
  walkA: { padTop: 1, arms: 'swingA', legs: LEGS_WALK_CONTACT },
  walkMid: { legs: LEGS_WALK_PASS },
  walkB: { padTop: 1, arms: 'swingB', legs: LEGS_WALK_CONTACT_R },
  runA: { padTop: 1, arms: 'pump', lean: true, legs: LEGS_RUN_CONTACT },
  runMid: { arms: 'pump', lean: true, legs: LEGS_RUN_TUCK, padBottom: 2 },
  runB: { padTop: 1, arms: 'pump', lean: true, legs: LEGS_RUN_CONTACT_R },
  sleep: { padTop: 1, legs: LEGS_STAND },
  pant: { padTop: 1, legs: LEGS_STAND },
  heldA: { legs: LEGS_FLAIL_A },
  heldB: { legs: LEGS_FLAIL_B },
  workA: { legs: LEGS_WORK_A },
  workB: { legs: LEGS_WORK_B },
  back: { back: true, padTop: 1, legs: LEGS_STAND },
  sit: { legs: LEGS_SIT },
}

/** 팔 스윙 — 몸통 블록(17행)의 어깨/팔 픽셀을 이동 */
function applyArms(rows: string[][], pose: ArmPose) {
  const set = (y: number, x: number, ch: string) => {
    if (rows[y] && rows[y][x] !== undefined) rows[y][x] = ch
  }
  if (pose === 'swingA') {
    set(12, 2, 'S') // 왼팔 앞/위로
    set(14, 2, '.')
    set(13, 13, '.') // 오른팔 뒤/아래로
    set(15, 13, 'S')
  } else if (pose === 'swingB') {
    set(12, 13, 'S')
    set(14, 13, '.')
    set(13, 2, '.')
    set(15, 2, 'S')
  } else if (pose === 'pump') {
    set(12, 2, 'S') // 양팔 접어 올림 (달리기)
    set(12, 13, 'S')
    set(14, 2, '.')
    set(14, 13, '.')
  }
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
 * 1) 몸통 블록(17행)에 파츠(상의→머리→눈→입)와 팔 자세를 합성
 * 2) 프레임 정의에 따라 [윗 패딩 + 몸통 + 다리 + 아랫 패딩]으로 조립
 *    — 디딤 프레임은 몸이 1px 낮고, 공중 프레임은 발이 바닥에서 뜬다
 */
export function composeMap(frame: FrameName, look: Look = DEFAULT_LOOK): string[] {
  const def = FRAME_DEFS[frame]
  const isBack = def.back === true

  // 뒷모습도 같은 민머리 베이스 — 얼굴 파츠를 생략하고 파츠의 back 맵이 덮는다
  const body: string[][] = BASE_BODY.map((r) => r.padEnd(SPRITE_W, '.').split(''))
  if (def.arms && !isBack) applyArms(body, def.arms)

  const top = getPart('top', look.topStyle)
  overlay(body, isBack ? (top.back ?? top.map) : top.map)

  const hair = getPart('hair', look.hairStyle)
  overlay(body, isBack ? (hair.back ?? hair.map) : hair.map)

  if (!isBack) {
    overlay(body, getPart('eyes', look.eyesStyle).map)
    overlay(body, getPart('mouth', look.mouthStyle).map)
  }

  // 전경 자세: 머리 행(0~10)을 진행 방향으로 1px 밀기 (좌우 반전은 렌더러가 처리)
  if (def.lean) {
    for (let y = 0; y <= 10; y++) {
      body[y] = ['.', ...body[y].slice(0, SPRITE_W - 1)]
    }
  }

  const rows: string[] = []
  for (let i = 0; i < (def.padTop ?? 0); i++) rows.push(PAD)
  for (const r of body) rows.push(r.join(''))
  for (const r of def.legs) rows.push(r.padEnd(SPRITE_W, '.'))
  for (let i = 0; i < (def.padBottom ?? 0); i++) rows.push(PAD)

  let out = rows.slice(0, SPRITE_H)
  while (out.length < SPRITE_H) out.push(PAD)
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
  for (const name of Object.keys(FRAME_DEFS) as FrameName[]) out[name] = bakeFrame(name, look)
  return out
}

export const ALL_FRAME_NAMES = Object.keys(FRAME_DEFS) as FrameName[]

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
