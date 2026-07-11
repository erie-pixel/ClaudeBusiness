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

// 모드 팩 로더가 여기로 팩을 추가한다 (내장 팩과 동일한 취급 — 1급 시민)
const packs: PartsPack[] = [BUILTIN_PACK]

const VALID_SLOTS: ReadonlySet<string> = new Set(['hair', 'eyes', 'mouth', 'top'])
const MAX_PARTS_PER_PACK = 100
const MAX_ROWS = 24
const MAX_ROW_LEN = 16

/** 파츠 맵 구조 검사 — 문제가 있으면 오류 문자열, 없으면 null */
function lintMap(map: unknown, label: string): string | null {
  if (typeof map !== 'object' || map === null) return `${label}: map이 없음`
  const m = map as Partial<PartMap>
  if (typeof m.y0 !== 'number' || !Number.isInteger(m.y0) || m.y0 < 0 || m.y0 >= MAX_ROWS) {
    return `${label}: y0는 0~${MAX_ROWS - 1} 정수여야 함`
  }
  if (!Array.isArray(m.rows) || m.rows.length === 0 || m.rows.length > MAX_ROWS) {
    return `${label}: rows는 1~${MAX_ROWS}줄이어야 함`
  }
  for (const row of m.rows) {
    if (typeof row !== 'string' || row.length > MAX_ROW_LEN) {
      return `${label}: 각 행은 최대 ${MAX_ROW_LEN}자 문자열이어야 함`
    }
  }
  return null
}

/** 모드 manifest 검증 (Workshop 업로드 전 린트의 원형 — 순수 로직, 테스트 대상).
 * 반환: 통과하면 pack, 아니면 errors에 사람이 읽을 사유 목록 */
export function validatePack(raw: unknown): { pack: PartsPack | null; errors: string[] } {
  const errors: string[] = []
  if (typeof raw !== 'object' || raw === null) return { pack: null, errors: ['manifest가 객체가 아님'] }
  const p = raw as Partial<PartsPack>
  if (typeof p.name !== 'string' || !p.name.trim()) errors.push('name 누락')
  if (typeof p.author !== 'string') errors.push('author 누락')
  if (typeof p.version !== 'string') errors.push('version 누락')
  if (!Array.isArray(p.parts) || p.parts.length === 0) {
    errors.push('parts가 비어 있음')
    return { pack: null, errors }
  }
  if (p.parts.length > MAX_PARTS_PER_PACK) errors.push(`파츠는 팩당 최대 ${MAX_PARTS_PER_PACK}개`)
  const seen = new Set<string>()
  const parts: PartDef[] = []
  for (const rawPart of p.parts) {
    if (typeof rawPart !== 'object' || rawPart === null) {
      errors.push('파츠 항목이 객체가 아님')
      continue
    }
    const part = rawPart as Partial<PartDef>
    const label = typeof part.id === 'string' ? part.id : '(id 없음)'
    if (typeof part.id !== 'string' || !part.id.trim() || part.id.length > 40) {
      errors.push(`${label}: id는 1~40자 문자열이어야 함`)
      continue
    }
    if (seen.has(part.id)) {
      errors.push(`${label}: 팩 안에서 id 중복`)
      continue
    }
    if (typeof part.slot !== 'string' || !VALID_SLOTS.has(part.slot)) {
      errors.push(`${label}: slot은 hair/eyes/mouth/top 중 하나여야 함`)
      continue
    }
    if (typeof part.name !== 'string' || !part.name.trim()) {
      errors.push(`${label}: name 누락`)
      continue
    }
    const mapErr = lintMap(part.map, label)
    if (mapErr) {
      errors.push(mapErr)
      continue
    }
    if (part.back !== undefined) {
      const backErr = lintMap(part.back, `${label}(back)`)
      if (backErr) {
        errors.push(backErr)
        continue
      }
    }
    seen.add(part.id)
    parts.push({
      id: part.id,
      slot: part.slot as PartSlot,
      name: part.name.slice(0, 40),
      map: part.map as PartMap,
      back: part.back as PartMap | undefined,
    })
  }
  if (parts.length === 0) return { pack: null, errors }
  return {
    pack: {
      name: (p.name as string) ?? '?',
      author: (p.author as string) ?? '?',
      version: (p.version as string) ?? '0',
      parts,
    },
    errors,
  }
}

/** 모드 팩 전체 교체 (핫리로드) — 내장 팩은 항상 유지된다 */
export function setModPacks(modPacks: PartsPack[]) {
  packs.length = 0
  packs.push(BUILTIN_PACK, ...modPacks)
}

export function partsBySlot(slot: PartSlot): PartDef[] {
  return packs.flatMap((p) => p.parts.filter((part) => part.slot === slot))
}

/** id로 파츠 검색 — 없으면(설정이 옛 버전이거나 모드가 제거됨) 그 슬롯의 첫 파츠로 폴백 */
export function getPart(slot: PartSlot, id: string): PartDef {
  const list = partsBySlot(slot)
  return list.find((p) => p.id === id) ?? list[0]
}
