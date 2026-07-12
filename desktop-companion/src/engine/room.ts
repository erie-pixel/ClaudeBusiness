// 엣지패널 방(집) — 순수 로직: 테마/크기/가구 카탈로그와 방 데이터 정규화.
// 방 데이터는 room.json에 저장되고, 멀티플레이에서는 room-info 메시지로
// 친구에게 전송되어 친구 화면에서 내 방이 그대로 재현된다 (vitest 대상).

import { MEMENTO_PALETTE } from './collection'

/** 방 렌더링 팔레트 — 기념품 팔레트 + 가구용 추가색 */
export const ROOM_PALETTE: Record<string, string> = {
  ...MEMENTO_PALETTE,
  F: '#6b4a35', // 가구 진한 나무
  C: '#a97c50', // 가구 밝은 나무
  D: '#4a3728', // 가장 진한 나무 (다리/그림자)
}

export type RoomSize = 'S' | 'M' | 'L'

export const ROOM_SIZES: Record<RoomSize, { w: number; h: number; label: string }> = {
  S: { w: 240, h: 140, label: '작게' },
  M: { w: 300, h: 170, label: '보통' },
  L: { w: 356, h: 200, label: '크게' },
}

export interface RoomTheme {
  name: string
  wall: string
  wallShade: string
  floor: string
  floorShade: string
}

export const ROOM_THEMES: RoomTheme[] = [
  { name: '아늑한 밤', wall: '#3a3550', wallShade: '#322d45', floor: '#6b4a35', floorShade: '#5d3f2d' },
  { name: '민트 오후', wall: '#4d6b5c', wallShade: '#425c4f', floor: '#8a6a4f', floorShade: '#7a5c44' },
  { name: '벚꽃 아침', wall: '#7a5568', wallShade: '#6a4859', floor: '#9c7a5a', floorShade: '#8a6a4d' },
  { name: '잿빛 서재', wall: '#44485c', wallShade: '#3a3e50', floor: '#55504a', floorShade: '#49443f' },
]

export interface FurnitureDef {
  id: string
  name: string
  /** floor = 바닥에 놓임 (x·깊이 배치), wall = 벽에 걸림 (x만 배치) */
  kind: 'floor' | 'wall'
  map: string[]
}

export const FURNITURE: FurnitureDef[] = [
  {
    id: 'couch',
    name: '소파',
    kind: 'floor',
    map: [
      '.FFFFFFFFFFFFFF.',
      'FCCCCCCCCCCCCCCF',
      'FCrrrrrrCrrrrrCF',
      'FCrrrrrrCrrrrrCF',
      'FFFFFFFFFFFFFFFF',
      '.DD..........DD.',
    ],
  },
  {
    id: 'table',
    name: '탁자',
    kind: 'floor',
    map: ['.CCCCCCCCCC.', 'CFFFFFFFFFFC', '.D........D.', '.D........D.', '.D........D.'],
  },
  {
    id: 'plant',
    name: '화분',
    kind: 'floor',
    map: [
      '...eEe....',
      '.eEeeEe...',
      'eEeEEeEe..',
      '.eeEEee...',
      '...ee.....',
      '..nNNn....',
      '..nNNn....',
      '...nn.....',
    ],
  },
  {
    id: 'bookshelf',
    name: '책장',
    kind: 'floor',
    map: [
      'FFFFFFFFFFFF',
      'FrrbbeeyyppF',
      'FFFFFFFFFFFF',
      'FbbyyrrEEbbF',
      'FFFFFFFFFFFF',
      'FeeppbbrryyF',
      'FFFFFFFFFFFF',
      'D..........D',
    ],
  },
  {
    id: 'lamp',
    name: '램프',
    kind: 'floor',
    map: [
      '.YYYYYY.',
      'YYyyyyYY',
      '.YyyyyY.',
      '...gg...',
      '...gg...',
      '...gg...',
      '...gg...',
      '..DDDD..',
    ],
  },
  {
    id: 'rug',
    name: '러그',
    kind: 'floor',
    map: ['..pPPPPPPPPPPp..', '.pPBBBBBBBBBBPp.', 'pPBBPPPPPPPPBBPp', '.pPBBBBBBBBBBPp.', '..pPPPPPPPPPPp..'],
  },
  {
    id: 'window',
    name: '창문',
    kind: 'wall',
    map: [
      'wwwwwwwwwwww',
      'wBBBBBwBBBBw',
      'wBBBYBwBBBBw',
      'wBBBBBwBBBBw',
      'wwwwwwwwwwww',
      'wBBBBBwBBBBw',
      'wBBBBBwBBBBw',
      'wwwwwwwwwwww',
    ],
  },
  {
    id: 'clock',
    name: '시계',
    kind: 'wall',
    map: ['..ggg..', '.gwwwg.', 'gwwkwwg', 'gwwkkwg', 'gwwwwwg', '.gwwwg.', '..ggg..'],
  },
  {
    id: 'poster',
    name: '액자',
    kind: 'wall',
    map: ['nnnnnnnnnn', 'nwwwwwwwwn', 'nwBBeeBBwn', 'nwBeEEeBwn', 'nwwwwwwwwn', 'nnnnnnnnnn'],
  },
]

export function furnitureById(id: string): FurnitureDef | undefined {
  return FURNITURE.find((f) => f.id === id)
}

export interface PlacedFurniture {
  id: string
  /** 가로 위치 (0~1) */
  x: number
  /** 깊이 (0=벽쪽, 1=화면 앞) — wall 가구는 무시 */
  d: number
}

export interface BoardItem {
  text: string
  url?: string
}

/** 방 데이터 — 저장(room.json)과 멀티플레이 전송(room-info)에 같은 형태 사용 */
export interface RoomData {
  size: RoomSize
  theme: number
  furniture: PlacedFurniture[]
  board: BoardItem[]
}

export const MAX_FURNITURE = 12
export const MAX_BOARD_ITEMS = 20

export function defaultRoomData(): RoomData {
  return {
    size: 'M',
    theme: 0,
    furniture: [
      { id: 'couch', x: 0.3, d: 0.55 },
      { id: 'plant', x: 0.85, d: 0.35 },
      { id: 'window', x: 0.5, d: 0 },
    ],
    board: [],
  }
}

const clamp01 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5)

/** 저장 파일/네트워크에서 온 방 데이터 정규화 — 깨진 필드는 기본값, 모르는 가구는 제외 */
export function normalizeRoomData(raw: unknown): RoomData {
  const base = defaultRoomData()
  if (typeof raw !== 'object' || raw === null) return base
  const r = raw as Partial<RoomData>
  const size: RoomSize = r.size === 'S' || r.size === 'L' ? r.size : 'M'
  const theme =
    typeof r.theme === 'number' && Number.isInteger(r.theme) && r.theme >= 0 && r.theme < ROOM_THEMES.length
      ? r.theme
      : 0
  const furniture: PlacedFurniture[] = []
  if (Array.isArray(r.furniture)) {
    for (const f of r.furniture.slice(0, MAX_FURNITURE)) {
      const pf = f as Partial<PlacedFurniture>
      if (typeof pf.id !== 'string' || !furnitureById(pf.id)) continue
      furniture.push({ id: pf.id, x: clamp01(pf.x), d: clamp01(pf.d) })
    }
  }
  const board: BoardItem[] = []
  if (Array.isArray(r.board)) {
    for (const b of r.board.slice(0, MAX_BOARD_ITEMS)) {
      const item = b as Partial<BoardItem>
      if (typeof item.text !== 'string' || !item.text.trim()) continue
      const entry: BoardItem = { text: item.text.slice(0, 80) }
      if (typeof item.url === 'string' && /^https?:\/\//i.test(item.url)) {
        entry.url = item.url.slice(0, 500)
      }
      board.push(entry)
    }
  }
  return { size, theme, furniture, board }
}
