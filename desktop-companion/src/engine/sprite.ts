// Phase 0 플레이스홀더 스프라이트 — ASCII 픽셀 맵을 런타임에 캔버스로 굽는다.
// Phase 2에서 파츠 매니페스트 기반 스프라이트 시트로 교체 예정.
// 문자 = 팔레트 키. '.' 및 규격 밖은 투명. 파서는 행 길이에 관대하다.

export const SPRITE_W = 16
export const SPRITE_H = 24
export const SCALE = 3

const PALETTE: Record<string, string> = {
  K: '#4a3728', // hair
  S: '#f2c9a0', // skin
  E: '#2d2d3a', // eye
  L: '#a8794f', // closed eye / lash
  M: '#c96a5b', // mouth
  T: '#5b8bd9', // shirt
  P: '#3d4a63', // pants
  B: '#8a5a3b', // shoes
  H: '#e85d75', // heart
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

export const HEART = ['.HH.HH.', 'HHHHHHH', 'HHHHHHH', '.HHHHH.', '..HHH..', '...H...']

export type FrameName = 'idle' | 'blink' | 'walkA' | 'walkB' | 'sleep' | 'pant'

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
}

export interface BakedFrame {
  canvas: HTMLCanvasElement
  /** 클릭통과 per-pixel hit-test용 불투명 마스크 [y][x] */
  mask: boolean[][]
}

export function bakeFrame(name: FrameName): BakedFrame {
  return bakeMap(FRAME_MAPS[name], SPRITE_W, SPRITE_H)
}

export function bakeMap(rows: string[], w: number, h: number): BakedFrame {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const mask: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false))
  for (let y = 0; y < Math.min(h, rows.length); y++) {
    const row = rows[y]
    for (let x = 0; x < Math.min(w, row.length); x++) {
      const color = PALETTE[row[x]]
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x, y, 1, 1)
      mask[y][x] = true
    }
  }
  return { canvas, mask }
}
