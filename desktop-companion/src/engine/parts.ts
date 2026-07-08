// 파츠 레지스트리 — 기획서 §8 모드 시스템의 기반.
// 이 파일의 PartsPack 스키마가 그대로 Workshop 파츠 팩의 manifest.json 포맷이 된다:
// 유저 모드는 { name, author, version, parts: [...] } + PNG(또는 ASCII 맵)로 구성되고,
// 엔진은 내장 팩과 모드 팩을 구분하지 않는다.
//
// 파츠 맵 규격:
//  - 캐릭터 16x24 그리드 기준의 오버레이. y0 = 시작 행, rows = 팔레트 문자 행들
//  - '.' 또는 범위 밖 = 투명 (베이스를 덮지 않음)
//  - back = 뒷모습 프레임용 맵 (없으면 front를 재사용)

export type PartSlot = 'hair' | 'eyes' | 'mouth' | 'top'

export interface PartMap {
  y0: number
  rows: string[]
}

export interface PartDef {
  id: string
  slot: PartSlot
  name: string
  map: PartMap
  back?: PartMap
}

export interface PartsPack {
  name: string
  author: string
  version: string
  parts: PartDef[]
}

export const BUILTIN_PACK: PartsPack = {
  name: '기본 팩',
  author: 'built-in',
  version: '1.0.0',
  parts: [
    // ---------------- 머리스타일 ----------------
    {
      id: 'short',
      slot: 'hair',
      name: '짧은 머리',
      map: {
        y0: 1,
        rows: [
          '.....KKKKKK.....',
          '....KKKKKKKK....',
          '...KKKKKKKKKK...',
          '...KK......KK...',
          '...K........K...',
          '...K........K...',
          '...K........K...',
          '...K........K...',
        ],
      },
      back: {
        y0: 1,
        rows: [
          '.....KKKKKK.....',
          '....KKKKKKKK....',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '....KKKKKKKK....',
        ],
      },
    },
    {
      id: 'long',
      slot: 'hair',
      name: '긴 머리',
      map: {
        y0: 1,
        rows: [
          '.....KKKKKK.....',
          '....KKKKKKKK....',
          '...KKKKKKKKKK...',
          '...KK......KK...',
          '...KK......KK...',
          '...KK......KK...',
          '...KK......KK...',
          '...KK......KK...',
          '..KKK......KKK..',
          '..KKK......KKK..',
          '..KK........KK..',
        ],
      },
      back: {
        y0: 1,
        rows: [
          '.....KKKKKK.....',
          '....KKKKKKKK....',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '..KKKKKKKKKKKK..',
          '..KKKKKKKKKKKK..',
          '..KKKKKKKKKKKK..',
          '...KKKKKKKKKK...',
        ],
      },
    },
    {
      id: 'ponytail',
      slot: 'hair',
      name: '포니테일',
      map: {
        y0: 1,
        rows: [
          '.....KKKKKK.....',
          '....KKKKKKKK....',
          '...KKKKKKKKKKK..',
          '...KK......KKK..',
          '...K........KK..',
          '...K........KK..',
          '...K........KK..',
          '...K........K...',
        ],
      },
      back: {
        y0: 1,
        rows: [
          '.....KKKKKK.....',
          '....KKKKKKKK....',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '....KKKKKKKK....',
          '......KKKK......',
          '.......KK.......',
          '.......KK.......',
          '.......KK.......',
        ],
      },
    },
    {
      id: 'bob',
      slot: 'hair',
      name: '단발',
      map: {
        y0: 1,
        rows: [
          '.....KKKKKK.....',
          '....KKKKKKKK....',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '...KK......KK...',
          '...KK......KK...',
          '...KK......KK...',
          '...KKK....KKK...',
          '....K......K....',
        ],
      },
      back: {
        y0: 1,
        rows: [
          '.....KKKKKK.....',
          '....KKKKKKKK....',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '...KKKKKKKKKK...',
          '....KKKKKKKK....',
        ],
      },
    },
    // ---------------- 눈 ----------------
    {
      id: 'normal',
      slot: 'eyes',
      name: '보통 눈',
      map: { y0: 6, rows: ['.....E....E.....'] },
    },
    {
      id: 'round',
      slot: 'eyes',
      name: '동그란 눈',
      map: {
        y0: 5,
        rows: ['.....EE..EE.....', '.....EE..EE.....'],
      },
    },
    {
      id: 'sleepy',
      slot: 'eyes',
      name: '나른한 눈',
      map: {
        y0: 5,
        rows: ['.....LL..LL.....', '.....E....E.....'],
      },
    },
    // ---------------- 입 ----------------
    {
      id: 'smile',
      slot: 'mouth',
      name: '미소',
      map: { y0: 8, rows: ['.......MM.......'] },
    },
    {
      id: 'grin',
      slot: 'mouth',
      name: '벙긋',
      map: { y0: 8, rows: ['......MMMM......'] },
    },
    {
      id: 'small',
      slot: 'mouth',
      name: '오물',
      map: { y0: 8, rows: ['.......M........'] },
    },
    // ---------------- 상의 ----------------
    {
      id: 'tee',
      slot: 'top',
      name: '티셔츠',
      map: {
        y0: 11,
        rows: [
          '....TTTTTTTT....',
          '...TTTTTTTTTT...',
          '...TTTTTTTTTT...',
          '...TTTTTTTTTT...',
          '...TTTTTTTTTT...',
          '....TTTTTTTT....',
        ],
      },
    },
    {
      id: 'hoodie',
      slot: 'top',
      name: '후드티',
      map: {
        y0: 10,
        rows: [
          '....UUUUUUUU....',
          '....TTTTTTTT....',
          '..TTTTTTTTTTTT..',
          '..TTTTTTTTTTTT..',
          '..TTUUUUUUUUTT..',
          '...TTTTTTTTTT...',
          '....TTTTTTTT....',
        ],
      },
      back: {
        y0: 10,
        rows: [
          '....UUUUUUUU....',
          '...UUUUUUUUUU...',
          '..TTUUUUUUUUTT..',
          '..TTTTTTTTTTTT..',
          '..TTTTTTTTTTTT..',
          '...TTTTTTTTTT...',
          '....TTTTTTTT....',
        ],
      },
    },
    {
      id: 'shirt',
      slot: 'top',
      name: '셔츠',
      map: {
        y0: 11,
        rows: [
          '....TVVTTVVT....',
          '...TTTTVVTTTT...',
          '...TTTTVTTTTT...',
          '...TTTTVTTTTT...',
          '...TTTTTTTTTT...',
          '....TTTTTTTT....',
        ],
      },
      back: {
        y0: 11,
        rows: [
          '....TTTTTTTT....',
          '...TTTTTTTTTT...',
          '...TTTTTTTTTT...',
          '...TTTTTTTTTT...',
          '...TTTTTTTTTT...',
          '....TTTTTTTT....',
        ],
      },
    },
  ],
}

// 추후 모드 팩 로더가 여기로 팩을 추가한다 (내장 팩과 동일한 취급)
const packs: PartsPack[] = [BUILTIN_PACK]

export function partsBySlot(slot: PartSlot): PartDef[] {
  return packs.flatMap((p) => p.parts.filter((part) => part.slot === slot))
}

/** id로 파츠 검색 — 없으면(설정이 옛 버전이거나 모드가 제거됨) 그 슬롯의 첫 파츠로 폴백 */
export function getPart(slot: PartSlot, id: string): PartDef {
  const list = partsBySlot(slot)
  return list.find((p) => p.id === id) ?? list[0]
}
