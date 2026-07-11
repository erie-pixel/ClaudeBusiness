// 수집 앨범 "함께한 날들" — 순수 로직 (DOM/Electron 비의존, vitest 대상).
// 캐릭터가 배회하다 도착한 지점에서 가끔 기념품을 주워온다. 잠금 해제형 보상이
// 아니라(파츠는 전부 개방 — buy-to-play 원칙) 순수한 장식용 수집품/기록이며,
// "켜두면 쌓이는 것"을 만들어 상주 앱의 관찰 재미(glanceable loop)를 담당한다.

export type Rarity = 'common' | 'uncommon' | 'rare'

export interface MementoDef {
  id: string
  name: string
  desc: string
  rarity: Rarity
  /** 8x8 픽셀 맵 — MEMENTO_PALETTE의 문자만 사용, '.'은 투명 */
  map: string[]
}

/** 기념품 전용 팔레트 (캐릭터 팔레트와 독립) */
export const MEMENTO_PALETTE: Record<string, string> = {
  g: '#8a8f98', // 회색 (금속)
  G: '#c8cdd6', // 밝은 회색
  y: '#e8c04a', // 노랑 (금색)
  Y: '#f6e08a', // 밝은 노랑
  r: '#d95763', // 빨강
  R: '#f0919b', // 밝은 빨강
  b: '#5b8bd9', // 파랑
  B: '#9ab8ef', // 밝은 파랑
  n: '#8a5a3b', // 갈색
  N: '#c08552', // 밝은 갈색
  e: '#5f9e54', // 초록
  E: '#93c47d', // 밝은 초록
  p: '#9b6bd3', // 보라
  P: '#c39ff0', // 밝은 보라
  w: '#fdfdf6', // 흰색
  k: '#22242f', // 검정 (윤곽)
}

// 발견 가중치 — 흔함:가끔:희귀 = 8:3:1
const RARITY_WEIGHT: Record<Rarity, number> = { common: 8, uncommon: 3, rare: 1 }

/** 배회 도착 1회당 발견 확률 (도착 주기 ~20-60초 → 평균 10-25분에 1개) */
export const FIND_CHANCE = 0.12

export const MEMENTOS: MementoDef[] = [
  {
    id: 'paperclip',
    name: '클립',
    desc: '책상 밑에서 주웠어요. 어디서 떨어졌을까?',
    rarity: 'common',
    map: ['........', '..gggg..', '.g....g.', '.g.gg.g.', '.g.g..g.', '.g.gggg.', '.g......', '.gggggg.'],
  },
  {
    id: 'button',
    name: '단추',
    desc: '누군가의 옷에서 떨어진 파란 단추.',
    rarity: 'common',
    map: ['........', '..bbbb..', '.bBBBBb.', '.bBk.kBb', '.bBk.kBb', '.bBBBBb.', '..bbbb..', '........'],
  },
  {
    id: 'candy',
    name: '사탕',
    desc: '아직 포장도 안 뜯었어요. 딸기맛인 것 같아요.',
    rarity: 'common',
    map: ['........', 'w.....w.', '.wrrrw..', '.wrRrw..', '.wrrrw..', '.w...w..', 'w.....w.', '........'],
  },
  {
    id: 'cookie',
    name: '쿠키 조각',
    desc: '반쯤 먹다 만… 아니, 반만 남긴 쿠키예요.',
    rarity: 'common',
    map: ['........', '..NNNN..', '.NNkNNN.', '.NNNNkN.', '.NkNNNN.', '..NNNN..', '...NN...', '........'],
  },
  {
    id: 'leaf',
    name: '나뭇잎',
    desc: '창틈으로 들어온 걸까요? 아직 초록이에요.',
    rarity: 'common',
    map: ['........', '.....e..', '...eEe..', '..eEEe..', '..eEe...', '.eEe....', '..e.....', '..n.....'],
  },
  {
    id: 'coin',
    name: '동전',
    desc: '소파 밑은 언제나 동전이 있는 법이죠.',
    rarity: 'common',
    map: ['........', '..yyyy..', '.yYYYYy.', '.yY..Yy.', '.yY..Yy.', '.yYYYYy.', '..yyyy..', '........'],
  },
  {
    id: 'eraser',
    name: '지우개',
    desc: '모서리가 다 닳았어요. 열심히 공부한 흔적.',
    rarity: 'common',
    map: ['........', '........', '..wwww..', '.wwwwR..', '.wwwRR..', '.wwRRR..', '..RRR...', '........'],
  },
  {
    id: 'stamp',
    name: '우표',
    desc: '먼 나라에서 온 편지에 붙어 있던 것 같아요.',
    rarity: 'common',
    map: ['........', '.w.w.w..', 'wBBBBBw.', '.BbBbB..', 'wBBbBBw.', '.BbBbB..', 'wBBBBBw.', '.w.w.w..'],
  },
  {
    id: 'ribbon',
    name: '리본',
    desc: '선물 상자에서 풀린 빨간 리본.',
    rarity: 'uncommon',
    map: ['........', '.rr..rr.', 'rRRrrRRr', 'rRR..RRr', '.rr..rr.', '..r..r..', '.rr..rr.', '........'],
  },
  {
    id: 'marble',
    name: '유리구슬',
    desc: '안에 작은 소용돌이가 들어 있어요.',
    rarity: 'uncommon',
    map: ['........', '..pppp..', '.pPPBPp.', '.pPBbPp.', '.pBbPPp.', '.pPPPPp.', '..pppp..', '........'],
  },
  {
    id: 'feather',
    name: '깃털',
    desc: '새가 창가에 다녀갔나 봐요. 아주 가벼워요.',
    rarity: 'uncommon',
    map: ['.....w..', '....wG..', '...wGG..', '...wG...', '..wGG...', '..wG....', '.gG.....', 'g.......'],
  },
  {
    id: 'key',
    name: '오래된 열쇠',
    desc: '어떤 자물쇠의 열쇠였을까요? 이제는 알 수 없어요.',
    rarity: 'uncommon',
    map: ['........', '.yy.....', 'y..y....', 'y..yyyyy', 'y..y..y.', '.yy...y.', '......yy', '........'],
  },
  {
    id: 'bottlecap',
    name: '병뚜껑',
    desc: '가장자리가 톱니처럼 생겼어요. 수집가들이 좋아한대요.',
    rarity: 'uncommon',
    map: ['........', '.g.gg.g.', 'gGGGGGGg', '.GgGGgG.', '.GGggGG.', 'gGGGGGGg', '.g.gg.g.', '........'],
  },
  {
    id: 'starcandy',
    name: '별사탕',
    desc: '밤하늘에서 떨어진 것 같은 모양이에요.',
    rarity: 'uncommon',
    map: ['...Y....', '...YY...', '.YYYYYY.', '..YYYY..', '..YYYY..', '.YY..YY.', 'Y......Y', '........'],
  },
  {
    id: 'clover',
    name: '네잎클로버',
    desc: '정말로 잎이 네 장이에요! 오늘은 좋은 일이 있을 거예요.',
    rarity: 'rare',
    map: ['........', '.EE.EE..', '.EeeeE..', '..eee...', '.EeeeE..', '.EE.EE..', '...e....', '...e....'],
  },
  {
    id: 'tinystar',
    name: '작은 별',
    desc: '진짜 별은 아니겠지만… 반짝이는 건 확실해요.',
    rarity: 'rare',
    map: ['...y....', '..yYy...', 'yyYYYyy.', '.yYYYy..', '..yYy...', '.yy.yy..', 'y.....y.', '........'],
  },
  {
    id: 'rainbowshard',
    name: '무지개 조각',
    desc: '빛을 받으면 일곱 색으로 반짝여요. 아주 귀한 발견!',
    rarity: 'rare',
    map: ['........', '....r...', '...rYe..', '..rYeb..', '.rYebp..', 'rYebp...', 'Yebp....', '........'],
  },
  {
    id: 'snowglobe',
    name: '미니 스노우볼',
    desc: '흔들면 눈이 내려요. 이렇게 작은 건 처음 봐요.',
    rarity: 'rare',
    map: ['..gggg..', '.gBBBBg.', 'gBwB.wBg', 'gB.w.BBg', 'gBBw.wBg', '.gBBBBg.', '.nnnnnn.', '.nnnnnn.'],
  },
]

/** 함께한 기록 (앨범 상단 일지) */
export interface Journal {
  /** 처음 함께한 시각 (epoch ms) — 함께한 일수 계산용 */
  firstRunAt: number
  /** 함께 보낸 누적 시간 (초) */
  totalSec: number
  feeds: number
  pets: number
  coworkSessions: number
  greets: number
  /** 할일 목록에서 완료 처리한 횟수 */
  todosDone: number
}

export interface FoundEntry {
  count: number
  firstAt: number
}

export interface AlbumData {
  journal: Journal
  found: Record<string, FoundEntry>
}

export function emptyAlbum(now: number): AlbumData {
  return {
    journal: { firstRunAt: now, totalSec: 0, feeds: 0, pets: 0, coworkSessions: 0, greets: 0, todosDone: 0 },
    found: {},
  }
}

/** 저장 파일에서 읽은 값 정규화 (구버전/손상 필드는 기본값으로) */
export function normalizeAlbum(raw: unknown, now: number): AlbumData {
  const base = emptyAlbum(now)
  if (typeof raw !== 'object' || raw === null) return base
  const r = raw as Partial<AlbumData>
  const j = (typeof r.journal === 'object' && r.journal) || {}
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d)
  const journal: Journal = {
    firstRunAt: num((j as Journal).firstRunAt, now) || now,
    totalSec: num((j as Journal).totalSec, 0),
    feeds: num((j as Journal).feeds, 0),
    pets: num((j as Journal).pets, 0),
    coworkSessions: num((j as Journal).coworkSessions, 0),
    greets: num((j as Journal).greets, 0),
    todosDone: num((j as Journal).todosDone, 0),
  }
  const found: Record<string, FoundEntry> = {}
  if (typeof r.found === 'object' && r.found) {
    for (const def of MEMENTOS) {
      const e = (r.found as Record<string, FoundEntry>)[def.id]
      if (e && typeof e === 'object' && num(e.count, 0) > 0) {
        found[def.id] = { count: Math.floor(num(e.count, 0)), firstAt: num(e.firstAt, now) || now }
      }
    }
  }
  return { journal, found }
}

/** 배회 도착 시 호출 — 발견했으면 기념품 정의를 반환하고 앨범에 기록 */
export function rollFind(album: AlbumData, rng: () => number, now: number): MementoDef | null {
  if (rng() >= FIND_CHANCE) return null
  // 가중치 추첨 (희귀할수록 드묾)
  const total = MEMENTOS.reduce((s, m) => s + RARITY_WEIGHT[m.rarity], 0)
  let pick = rng() * total
  let def = MEMENTOS[MEMENTOS.length - 1]
  for (const m of MEMENTOS) {
    pick -= RARITY_WEIGHT[m.rarity]
    if (pick < 0) {
      def = m
      break
    }
  }
  const prev = album.found[def.id]
  album.found[def.id] = prev
    ? { count: prev.count + 1, firstAt: prev.firstAt }
    : { count: 1, firstAt: now }
  return def
}

/** 발견한 기념품 종류 수 */
export function foundKinds(album: AlbumData): number {
  return Object.keys(album.found).length
}

/** 함께한 일수 (1일째부터 시작) */
export function daysTogether(album: AlbumData, now: number): number {
  return Math.max(1, Math.floor((now - album.journal.firstRunAt) / 86400000) + 1)
}
