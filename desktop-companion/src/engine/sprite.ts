// 픽셀 스프라이트 — ASCII 픽셀 맵을 런타임에 캔버스로 굽는다.
// Phase 2: 팔레트 스왑 커스터마이징 (피부/머리/상의/하의 색) 지원.
// 문자 = 팔레트 키. '.' 및 규격 밖은 투명. 파서는 행 길이에 관대하다.

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
  skin: number
  hair: number
  top: number
  bottom: number
}

export const DEFAULT_LOOK: Look = { skin: 0, hair: 0, top: 0, bottom: 0 }

const BASE_PALETTE: Record<string, string> = {
  K: SWATCHES.hair[0], // hair
  S: SWATCHES.skin[0], // skin
  E: '#2d2d3a', // eye
  L: '#a8794f', // closed eye / lash
  M: '#c96a5b', // mouth
  T: SWATCHES.top[0], // shirt
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
  return {
    ...BASE_PALETTE,
    S: clamp(SWATCHES.skin, look.skin),
    K: clamp(SWATCHES.hair, look.hair),
    T: clamp(SWATCHES.top, look.top),
    P: clamp(SWATCHES.bottom, look.bottom),
  }
}

// 몸통(머리~허리, 17행) — 다리 변형과 조합해 24행 프레임을 만든다
const BODY = [
  '................',
  '.....KKKKKK.....',
  '....KKKKKKKK....',
  '...KKKKKKKKKK...',
  '...KKSSSSSSKK...',
  '...KSSSSSSSSK...',
  '...KSESSSSESK...',
  '...KSSSSSSSSK...',
  '...KSSSMMSSSK...',
  '....SSSSSSSS....',
  '.....SSSSSS.....',
  '....TTTTTTTT....',
  '...TTTTTTTTTT...',
  '..STTTTTTTTTTS..',
  '..STTTTTTTTTTS..',
  '...TTTTTTTTTT...',
  '....TTTTTTTT....',
]

// 뒷모습 (사용자 화면/창을 쳐다볼 때) — 얼굴 없이 뒷머리
const BODY_BACK = [
  '................',
  '.....KKKKKK.....',
  '....KKKKKKKK....',
  '...KKKKKKKKKK...',
  '...KKKKKKKKKK...',
  '...KKKKKKKKKK...',
  '...KKKKKKKKKK...',
  '...KKKKKKKKKK...',
  '...KKKKKKKKKK...',
  '....KKKKKKKK....',
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

function closeEyes(rows: string[]): string[] {
  return rows.map((r) => r.replace(/E/g, 'L'))
}

const FRAME_MAPS: Record<FrameName, string[]> = {
  idle: [...BODY, ...LEGS_IDLE],
  blink: [...closeEyes(BODY), ...LEGS_IDLE],
  walkA: [...BODY, ...LEGS_WALK_A],
  walkB: [...BODY, ...LEGS_WALK_B],
  sleep: [...closeEyes(BODY), ...LEGS_IDLE], // 렌더 시 90° 눕혀 그린다
  pant: [...closeEyes(BODY), ...LEGS_IDLE], // 렌더 시 웅크림 오프셋 + 땀방울
  heldA: [...BODY, ...LEGS_FLAIL_A], // 렌더 시 머리 잡힘 피벗으로 살랑살랑
  heldB: [...BODY, ...LEGS_FLAIL_B],
  workA: [...BODY, ...LEGS_WORK_A],
  workB: [...BODY, ...LEGS_WORK_B],
  back: [...BODY_BACK, ...LEGS_IDLE], // 뒤돌아보기 (창/작업 구경)
  sit: [...BODY, ...LEGS_SIT],
}

export interface BakedFrame {
  canvas: HTMLCanvasElement
  /** 클릭통과 per-pixel hit-test용 불투명 마스크 [y][x] */
  mask: boolean[][]
}

export function bakeFrame(name: FrameName, look: Look = DEFAULT_LOOK): BakedFrame {
  return bakeMap(FRAME_MAPS[name], SPRITE_W, SPRITE_H, paletteWithLook(look))
}

export function bakeAllFrames(look: Look): Record<FrameName, BakedFrame> {
  const out = {} as Record<FrameName, BakedFrame>
  for (const name of Object.keys(FRAME_MAPS) as FrameName[]) out[name] = bakeFrame(name, look)
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
