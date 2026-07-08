import { Character, type Home } from './engine/character'
import {
  bakeAllFrames,
  bakeMap,
  HEART,
  SOFA,
  SOFA_W,
  SOFA_H,
  SPRITE_W,
  SPRITE_H,
  DEFAULT_SCALE,
  DEFAULT_LOOK,
  SWATCHES,
  type Look,
  type FrameName,
  type BakedFrame,
} from './engine/sprite'
import { partsBySlot, type PartSlot } from './engine/parts'
import { NetClient, type NetPeerInfo, type NetState } from './net/client'
import { PeerStore, type Peer } from './net/peers'
import type { CompanionBridge, SofaState } from '../electron/preload'

declare global {
  interface Window {
    companion: CompanionBridge
  }
}

const bridge = window.companion

const canvas = document.getElementById('stage') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
canvas.width = window.innerWidth
canvas.height = window.innerHeight
ctx.imageSmoothingEnabled = false
window.addEventListener('resize', () => {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  ctx.imageSmoothingEnabled = false
})

// ---------- 프레임 (Phase 2: 팔레트 스왑 커스터마이징) ----------

let look: Look = { ...DEFAULT_LOOK }
let frames: Record<FrameName, BakedFrame> = bakeAllFrames(look)
const heart = bakeMap(HEART, 7, 6)
const sofaSprite = bakeMap(SOFA, SOFA_W, SOFA_H)

function applyLook(next: Look) {
  look = { ...next }
  frames = bakeAllFrames(look)
}

// ---------- 크기/경계 ----------

// 표시 배율 — 트레이 설정으로 런타임 변경 가능
let SCALE = DEFAULT_SCALE
let W = SPRITE_W * SCALE
let H = SPRITE_H * SCALE
/** 집었을 때 커서(=잡은 손)가 머리에 얼마나 파고드는지 */
let GRIP = 2 * SCALE
const EDGE = 4

function applyScale(scale: number) {
  SCALE = scale
  W = SPRITE_W * SCALE
  H = SPRITE_H * SCALE
  GRIP = 2 * SCALE
}

function computeBounds() {
  return {
    minX: W / 2 + EDGE,
    maxX: canvas.width - W / 2 - EDGE,
    minY: H + EDGE, // 발 기준 — 머리가 화면 위로 나가지 않게
    maxY: canvas.height - EDGE,
  }
}

// ---------- 소파 (가구 / 홈 모드) ----------

const sofa = {
  enabled: false,
  x: 0.72, // 정규화 좌표 (좌상단 기준)
  y: 0.78,
}

function sofaRect() {
  const w = SOFA_W * SCALE
  const h = SOFA_H * SCALE
  return {
    x: Math.max(0, Math.min(canvas.width - w, sofa.x * canvas.width)),
    y: Math.max(0, Math.min(canvas.height - h, sofa.y * canvas.height)),
    w,
    h,
  }
}

function homeState(): Home | null {
  if (!sofa.enabled) return null
  const r = sofaRect()
  return {
    x: r.x + r.w / 2,
    y: r.y + r.h,
    // 앉는 자리: 방석 중앙, 발이 소파 아래쪽에 오도록
    seatX: r.x + r.w / 2,
    seatY: r.y + r.h - 2 * SCALE,
    radius: 240,
  }
}

function overSofa(px: number, py: number): boolean {
  if (!sofa.enabled) return false
  const r = sofaRect()
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h
}

function saveSofa() {
  bridge.saveSofa({ enabled: sofa.enabled, x: sofa.x, y: sofa.y } as SofaState)
}

// ---------- 월드/캐릭터 ----------

const world = {
  cursor: null as { x: number; y: number } | null,
  bounds: computeBounds(),
  userActive: false,
  userIdleSec: 0,
  home: null as Home | null,
}
const char = new Character(canvas.width / 2, canvas.height * 0.7)

// 트레이/설정 반영 (시작 시 + 변경 시)
bridge.onSettings((s) => {
  applyScale(s.scale)
  char.applyActivity(s.activity)
  sofa.enabled = s.sofa.enabled
  sofa.x = s.sofa.x
  sofa.y = s.sofa.y
  applyLook(s.look)
  playerName = s.playerName
  serverUrl = s.serverUrl
})

// ---------- 멀티플레이 (Phase 3) ----------

let playerName = '친구'
let serverUrl = 'ws://127.0.0.1:8787'
let roomCode: string | null = null
let netNotice = '' // mp 패널에 표시할 상태/오류 메시지
const peers = new PeerStore()
const roomLog: Array<{ name: string; text: string; ts: number }> = []

// 피어 look별 프레임 캐시 (커스터마이징 반영)
const peerFramesCache = new Map<string, Record<FrameName, BakedFrame>>()
function peerFrames(look: Look | null): Record<FrameName, BakedFrame> {
  const key = JSON.stringify(look ?? DEFAULT_LOOK)
  let baked = peerFramesCache.get(key)
  if (!baked) {
    baked = bakeAllFrames(look ?? DEFAULT_LOOK)
    peerFramesCache.set(key, baked)
  }
  return baked
}

const NET_ERRORS: Record<string, string> = {
  'no-room': '그 코드의 방이 없어요',
  'room-full': '방이 가득 찼어요 (최대 4명)',
  'already-in': '이미 그 방에 있어요',
}

const net = new NetClient({
  onJoined(room, _self, infos) {
    roomCode = room
    netNotice = ''
    peers.reset()
    for (const info of infos) peers.upsert(info)
    char.messages.push('!')
    refreshMpPanel()
  },
  onPeerJoin(info: NetPeerInfo) {
    peers.upsert(info)
    char.messages.push('!')
    pushLog('알림', `${info.name} 님이 왔어요`)
    refreshMpPanel()
  },
  onPeerLeave(id) {
    const name = peers.peers.get(id)?.name ?? '?'
    peers.remove(id)
    removeBubble(id)
    pushLog('알림', `${name} 님이 떠났어요`)
    refreshMpPanel()
  },
  onPeerState(id, state: NetState) {
    peers.updateState(id, state)
  },
  onChat(id, name, text) {
    pushLog(name, text)
    showBubble(id, text)
  },
  onError(code) {
    netNotice = NET_ERRORS[code] ?? `오류: ${code}`
    refreshMpPanel()
  },
  onClose() {
    if (roomCode) {
      roomCode = null
      peers.reset()
      clearBubbles()
      netNotice = '연결이 끊겼어요'
      char.messages.push('…')
      refreshMpPanel()
    }
  },
})

function pushLog(name: string, text: string) {
  roomLog.push({ name, text, ts: Date.now() })
  if (roomLog.length > 100) roomLog.shift()
  if (historyOpen) buildHistory()
}

function leaveRoom() {
  net.disconnect()
  roomCode = null
  peers.reset()
  clearBubbles()
  refreshMpPanel()
}

// 상태 전송 스로틀 (변화가 있을 때만, 최대 5Hz)
let netAccum = 0
let lastSentState = ''
function maybeSendState(dt: number) {
  if (!roomCode || !net.connected) return
  netAccum += dt
  if (netAccum < 0.2) return
  netAccum = 0
  const state: NetState = {
    nx: Math.round((char.x / canvas.width) * 1000) / 1000,
    ny: Math.round((char.y / canvas.height) * 1000) / 1000,
    pose: char.pose,
    facing: char.facing,
  }
  const key = JSON.stringify(state)
  if (key === lastSentState) return
  lastSentState = key
  net.sendState(state)
}

// 근접 인사 — 옆에 친구 캐릭터가 오면 가끔 반가워함
let greetCooldown = 5

// 사용자 활동 감지 (Co-work/방치 리액션)
let lastCursorMoveAt = 0
let prevCursor: { x: number; y: number } | null = null
let lastTypingAt = 0
let watcherIdleSec = 0

bridge.onUserInput((input) => {
  if (input.typing) lastTypingAt = performance.now()
  watcherIdleSec = input.idleSec
})

// ---------- 클릭통과 <-> 상호작용 전환 ----------

let interactive = false
let menuOpen = false
let wardrobeOpen = false
let mpOpen = false
let historyOpen = false
let chatOpen = false
/** 캐릭터 드래그: mousedown만으로는 잡지 않고, 실제로 끌기 시작해야 집는다 */
let pendingGrab: { x: number; y: number } | null = null
let dragging = false
let sofaDragging = false
let sofaDragOffset = { dx: 0, dy: 0 }
let suppressClick = false
const DRAG_THRESHOLD = 8 // px — 이만큼 끌어야 '집기'로 인정

/** 현재 프레임의 불투명 픽셀 위인지 per-pixel 검사 */
function overCharacter(px: number, py: number): boolean {
  const frame = currentFrame()
  const left = char.x - W / 2
  const top = char.y - H
  const fx = Math.floor((px - left) / SCALE)
  const fy = Math.floor((py - top) / SCALE)
  if (fx < 0 || fx >= SPRITE_W || fy < 0 || fy >= SPRITE_H) return false
  // 좌우 반전 표시 중이면 마스크도 반전 좌표로
  const mx = char.facing === 1 ? fx : SPRITE_W - 1 - fx
  return frame.mask[fy]?.[mx] ?? false
}

function syncInteractive(cursor: { x: number; y: number }) {
  const want =
    menuOpen ||
    wardrobeOpen ||
    mpOpen ||
    historyOpen ||
    chatOpen ||
    dragging ||
    sofaDragging ||
    pendingGrab !== null ||
    overCharacter(cursor.x, cursor.y) ||
    overSofa(cursor.x, cursor.y) ||
    peers.near(cursor.x, cursor.y, W / 2) !== null
  if (want !== interactive) {
    interactive = want
    bridge.setInteractive(want)
    document.body.style.cursor = want ? 'pointer' : 'default'
  }
}

bridge.onCursor((pos) => {
  if (prevCursor && (Math.abs(pos.x - prevCursor.x) > 1 || Math.abs(pos.y - prevCursor.y) > 1)) {
    lastCursorMoveAt = performance.now()
  }
  prevCursor = pos
  world.cursor = pos

  // 클릭 상태에서 임계값 이상 끌면 그때 집는다 (클릭만으로는 안 잡음)
  if (pendingGrab && !dragging) {
    if (Math.hypot(pos.x - pendingGrab.x, pos.y - pendingGrab.y) > DRAG_THRESHOLD) {
      dragging = true
      char.grab()
      bridge.setPollRate(true)
    }
  }
  if (dragging) {
    // 머리를 잡고 있으므로 발 위치 = 커서 아래쪽
    char.heldMoveTo(pos.x, pos.y + H - GRIP, world.bounds)
  }
  if (sofaDragging) {
    const r = sofaRect()
    sofa.x = (pos.x - sofaDragOffset.dx) / canvas.width
    sofa.y = (pos.y - sofaDragOffset.dy) / canvas.height
    sofa.x = Math.max(0, Math.min(1 - r.w / canvas.width, sofa.x))
    sofa.y = Math.max(0, Math.min(1 - r.h / canvas.height, sofa.y))
  }
  syncInteractive(pos)
})

// ---------- 활성 창 쳐다보기 (홈 모드에서는 외출 안 함) ----------

bridge.onActiveWindow((rect) => {
  if (rect.w < 120 || rect.h < 80) return // 툴팁/팝업류 무시
  // 창 상단 중앙, 발이 창 위 모서리에 살짝 걸치는 위치
  char.notifyActiveWindow({ x: rect.x + rect.w / 2, y: rect.y - 2 }, sofa.enabled)
})

// ---------- 마우스 입력 (집기 / 소파 옮기기) ----------

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  if ((menuOpen && menu.contains(e.target as Node)) || wardrobe.contains(e.target as Node)) return
  if (overCharacter(e.clientX, e.clientY)) {
    closeMenu()
    pendingGrab = { x: e.clientX, y: e.clientY }
  } else if (overSofa(e.clientX, e.clientY)) {
    closeMenu()
    const r = sofaRect()
    sofaDragging = true
    sofaDragOffset = { dx: e.clientX - r.x, dy: e.clientY - r.y }
  }
})

window.addEventListener('mouseup', () => {
  if (dragging) {
    dragging = false
    char.release()
    suppressClick = true // 끌었다면 이어지는 click을 쓰다듬기로 치지 않음
  }
  pendingGrab = null
  if (sofaDragging) {
    sofaDragging = false
    suppressClick = true
    saveSofa()
  }
  if (world.cursor) syncInteractive(world.cursor)
})

// ---------- 우클릭 컨텍스트 메뉴 ----------

const menu = document.getElementById('menu') as HTMLDivElement

function statRow(label: string, value: number, color: string): HTMLDivElement {
  const row = document.createElement('div')
  row.className = 'stat'
  const name = document.createElement('span')
  name.textContent = label
  const bar = document.createElement('div')
  bar.className = 'bar'
  const fill = document.createElement('div')
  fill.className = 'fill'
  fill.style.width = `${Math.round(value)}%`
  fill.style.background = color
  bar.appendChild(fill)
  row.appendChild(name)
  row.appendChild(bar)
  return row
}

function buildMenu() {
  const following = char.state === 'follow' || char.state === 'exhausted'
  menu.innerHTML = ''

  const stats = document.createElement('div')
  stats.className = 'stats'
  stats.appendChild(statRow('기운', char.stamina, '#7ec46a'))
  stats.appendChild(statRow('허기', char.hunger, '#e0913f'))
  stats.appendChild(statRow('졸림', char.sleepiness, '#8f7fd4'))
  stats.appendChild(statRow('기분', char.mood, '#e85d75'))
  menu.appendChild(stats)
  const hr0 = document.createElement('div')
  hr0.className = 'sep'
  menu.appendChild(hr0)

  const items: Array<{ label: string; action: () => void } | 'sep'> = [
    following
      ? { label: '그만 따라와', action: () => char.commandStopFollow() }
      : { label: '마우스 따라와', action: () => char.commandFollow() },
    char.state === 'nap'
      ? { label: '일어나', action: () => char.poke() }
      : { label: '낮잠 자', action: () => char.commandNap() },
    { label: '여기서 기다려', action: () => char.commandStay() },
    'sep',
    { label: '간식 주기', action: () => char.feed() },
    { label: '쓰다듬기', action: () => char.poke() },
    'sep',
    { label: '옷장 열기…', action: () => openWardrobe() },
    { label: roomCode ? `친구들 (${peers.peers.size + 1}명 접속)…` : '친구들…', action: () => openMp() },
    ...(roomCode
      ? [
          { label: '채팅하기 (Ctrl+Shift+Space)', action: () => openChat() },
          { label: '대화 기록', action: () => openHistory() },
        ]
      : []),
    sofa.enabled
      ? {
          label: '소파 치우기',
          action: () => {
            sofa.enabled = false
            saveSofa()
          },
        }
      : {
          label: '소파 꺼내기',
          action: () => {
            sofa.enabled = true
            // 캐릭터 근처에 놓아준다
            sofa.x = Math.max(0, Math.min(0.9, (char.x + 40) / canvas.width))
            sofa.y = Math.max(0, Math.min(0.9, (char.y - SOFA_H * SCALE) / canvas.height))
            saveSofa()
          },
        },
    'sep',
    { label: '숨기기 (트레이)', action: () => bridge.hideWindow() },
    { label: '종료', action: () => bridge.quitApp() },
  ]
  for (const item of items) {
    if (item === 'sep') {
      const hr = document.createElement('div')
      hr.className = 'sep'
      menu.appendChild(hr)
      continue
    }
    const el = document.createElement('div')
    el.className = 'item'
    el.textContent = item.label
    el.addEventListener('click', () => {
      item.action()
      closeMenu()
    })
    menu.appendChild(el)
  }
}

function openMenu(x: number, y: number) {
  buildMenu()
  menuOpen = true
  menu.style.display = 'block'
  menu.style.left = `${Math.min(x, canvas.width - 190)}px`
  menu.style.top = `${Math.min(y, canvas.height - menu.offsetHeight - 8)}px`
  bridge.setInteractive(true)
  interactive = true
}

function closeMenu() {
  if (!menuOpen) return
  menuOpen = false
  menu.style.display = 'none'
  if (world.cursor) syncInteractive(world.cursor)
}

window.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  if (overCharacter(e.clientX, e.clientY)) openMenu(e.clientX + 8, e.clientY - 8)
  else closeMenu()
})

window.addEventListener('click', (e) => {
  if (suppressClick) {
    suppressClick = false
    return
  }
  // 메뉴/옷장 내부에서 시작된 클릭은 UI 조작 — 닫기 판정에서 제외.
  // contains() 대신 composedPath()를 쓰는 이유: 견본 클릭이 옷장 UI를 다시
  // 그리면(innerHTML 교체) 이 핸들러 시점에는 target이 이미 DOM에서 떨어져
  // contains()가 false가 되어 옷장이 클릭할 때마다 닫혀버린다.
  const path = e.composedPath()
  if (path.includes(menu) || path.includes(wardrobe) || path.includes(mp) || path.includes(history) || path.includes(chatWrap)) return
  if (menuOpen) {
    closeMenu()
    return
  }
  if (wardrobeOpen) {
    closeWardrobe()
    return
  }
  if (mpOpen) {
    closeMp()
    return
  }
  if (historyOpen) {
    closeHistory()
    return
  }
  if (overCharacter(e.clientX, e.clientY)) {
    char.poke()
    return
  }
  // 친구 캐릭터 클릭 → 대화 기록
  if (roomCode && peers.near(e.clientX, e.clientY - H / 2, W) !== null) openHistory()
})

// ---------- 옷장 (Phase 2: 색 커스터마이징) ----------

const wardrobe = document.getElementById('wardrobe') as HTMLDivElement

const COLOR_SLOTS: Array<{
  key: 'skin' | 'hair' | 'top' | 'bottom'
  label: string
  colors: readonly string[]
}> = [
  { key: 'skin', label: '피부', colors: SWATCHES.skin },
  { key: 'hair', label: '머리', colors: SWATCHES.hair },
  { key: 'top', label: '상의', colors: SWATCHES.top },
  { key: 'bottom', label: '하의', colors: SWATCHES.bottom },
]

const STYLE_SLOTS: Array<{
  key: 'hairStyle' | 'eyesStyle' | 'mouthStyle' | 'topStyle'
  label: string
  slot: PartSlot
}> = [
  { key: 'hairStyle', label: '머리', slot: 'hair' },
  { key: 'eyesStyle', label: '눈', slot: 'eyes' },
  { key: 'mouthStyle', label: '입', slot: 'mouth' },
  { key: 'topStyle', label: '상의', slot: 'top' },
]

function cycleStyle(key: (typeof STYLE_SLOTS)[number]['key'], slot: PartSlot, dir: 1 | -1) {
  const list = partsBySlot(slot)
  const idx = Math.max(
    0,
    list.findIndex((p) => p.id === look[key]),
  )
  const next = list[(idx + dir + list.length) % list.length]
  applyLook({ ...look, [key]: next.id })
  bridge.saveLook(look)
}

function buildWardrobe() {
  wardrobe.innerHTML = ''
  const title = document.createElement('div')
  title.className = 'w-title'
  title.textContent = '옷장'
  wardrobe.appendChild(title)

  // 모양 (파츠) — ◀ 이름 ▶ 로 순환 선택
  for (const st of STYLE_SLOTS) {
    const row = document.createElement('div')
    row.className = 'w-row'
    const name = document.createElement('span')
    name.textContent = st.label
    row.appendChild(name)

    const prev = document.createElement('button')
    prev.className = 'w-arrow'
    prev.textContent = '◀'
    prev.addEventListener('click', () => {
      cycleStyle(st.key, st.slot, -1)
      buildWardrobe()
    })
    row.appendChild(prev)

    const current = document.createElement('span')
    current.className = 'w-current'
    const part = partsBySlot(st.slot).find((p) => p.id === look[st.key])
    current.textContent = part?.name ?? '?'
    row.appendChild(current)

    const next = document.createElement('button')
    next.className = 'w-arrow'
    next.textContent = '▶'
    next.addEventListener('click', () => {
      cycleStyle(st.key, st.slot, 1)
      buildWardrobe()
    })
    row.appendChild(next)

    wardrobe.appendChild(row)
  }

  const hr = document.createElement('div')
  hr.className = 'sep'
  wardrobe.appendChild(hr)

  for (const slot of COLOR_SLOTS) {
    const row = document.createElement('div')
    row.className = 'w-row'
    const name = document.createElement('span')
    name.textContent = slot.label
    row.appendChild(name)
    slot.colors.forEach((color, idx) => {
      const sw = document.createElement('button')
      sw.className = 'swatch' + (look[slot.key] === idx ? ' active' : '')
      sw.style.background = color
      sw.addEventListener('click', () => {
        applyLook({ ...look, [slot.key]: idx })
        bridge.saveLook(look)
        buildWardrobe() // active 표시 갱신
      })
      row.appendChild(sw)
    })
    wardrobe.appendChild(row)
  }

  const close = document.createElement('div')
  close.className = 'item w-close'
  close.textContent = '닫기'
  close.addEventListener('click', closeWardrobe)
  wardrobe.appendChild(close)
}

function openWardrobe() {
  buildWardrobe()
  wardrobeOpen = true
  wardrobe.style.display = 'block'
  const x = Math.min(char.x + W, canvas.width - 220)
  const y = Math.min(Math.max(8, char.y - H), canvas.height - 220)
  wardrobe.style.left = `${x}px`
  wardrobe.style.top = `${y}px`
  bridge.setInteractive(true)
  interactive = true
}

function closeWardrobe() {
  if (!wardrobeOpen) return
  wardrobeOpen = false
  wardrobe.style.display = 'none'
  if (world.cursor) syncInteractive(world.cursor)
}

// ---------- 멀티플레이 UI: 친구들 패널 / 채팅 / 기록 / 말풍선 ----------

const mp = document.getElementById('mp') as HTMLDivElement
const history = document.getElementById('history') as HTMLDivElement
const chatWrap = document.getElementById('chat') as HTMLDivElement
const chatInput = chatWrap.querySelector('input') as HTMLInputElement
const bubblesWrap = document.getElementById('bubbles') as HTMLDivElement

function el(tag: string, cls: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = cls
  if (text !== undefined) node.textContent = text
  return node
}

function refreshMpPanel() {
  if (mpOpen) buildMp()
}

function buildMp() {
  mp.innerHTML = ''
  mp.appendChild(el('div', 'w-title', '친구들 (최대 4명)'))

  const nameRow = el('div', 'w-row')
  nameRow.appendChild(el('span', '', '이름'))
  const nameInput = document.createElement('input')
  nameInput.className = 'w-input'
  nameInput.maxLength = 20
  nameInput.value = playerName
  nameRow.appendChild(nameInput)
  mp.appendChild(nameRow)

  const svRow = el('div', 'w-row')
  svRow.appendChild(el('span', '', '서버'))
  const svInput = document.createElement('input')
  svInput.className = 'w-input'
  svInput.value = serverUrl
  svRow.appendChild(svInput)
  mp.appendChild(svRow)

  const saveMpLocal = () => {
    playerName = nameInput.value.trim() || '친구'
    serverUrl = svInput.value.trim() || serverUrl
    bridge.saveMp({ playerName, serverUrl })
  }

  if (!roomCode) {
    const btnRow = el('div', 'w-row')
    const createBtn = el('button', 'w-btn', '방 만들기')
    createBtn.addEventListener('click', () => {
      saveMpLocal()
      netNotice = '접속 중…'
      refreshMpPanel()
      net.connectAnd(serverUrl, null, playerName, look)
    })
    btnRow.appendChild(createBtn)
    mp.appendChild(btnRow)

    const joinRow = el('div', 'w-row')
    const codeInput = document.createElement('input')
    codeInput.className = 'w-input'
    codeInput.placeholder = '초대 코드'
    codeInput.maxLength = 6
    joinRow.appendChild(codeInput)
    const joinBtn = el('button', 'w-btn', '참여')
    joinBtn.addEventListener('click', () => {
      const code = codeInput.value.trim().toUpperCase()
      if (!code) return
      saveMpLocal()
      netNotice = '접속 중…'
      refreshMpPanel()
      net.connectAnd(serverUrl, code, playerName, look)
    })
    joinRow.appendChild(joinBtn)
    mp.appendChild(joinRow)
  } else {
    const codeRow = el('div', 'w-row')
    codeRow.appendChild(el('span', '', '코드'))
    codeRow.appendChild(el('b', 'w-code', roomCode))
    mp.appendChild(codeRow)
    mp.appendChild(el('div', 'w-note', '이 코드를 친구에게 알려주면 참여할 수 있어요'))

    const names = [playerName + ' (나)', ...[...peers.peers.values()].map((p) => p.name)]
    mp.appendChild(el('div', 'w-note', '함께 있는 사람: ' + names.join(', ')))

    const leaveBtn = el('button', 'w-btn', '방 나가기')
    leaveBtn.addEventListener('click', () => {
      leaveRoom()
      refreshMpPanel()
    })
    mp.appendChild(leaveBtn)
  }

  if (netNotice) mp.appendChild(el('div', 'w-note w-alert', netNotice))

  const close = el('div', 'item w-close', '닫기')
  close.addEventListener('click', closeMp)
  mp.appendChild(close)
}

function openMp() {
  buildMp()
  mpOpen = true
  mp.style.display = 'block'
  mp.style.left = `${Math.min(Math.max(8, char.x - 110), canvas.width - 240)}px`
  mp.style.top = `${Math.min(Math.max(8, char.y - H - 240), canvas.height - 280)}px`
  bridge.setInteractive(true)
  interactive = true
}

function closeMp() {
  if (!mpOpen) return
  mpOpen = false
  mp.style.display = 'none'
  if (world.cursor) syncInteractive(world.cursor)
}

function buildHistory() {
  history.innerHTML = ''
  history.appendChild(el('div', 'w-title', '대화 기록'))
  const list = el('div', 'h-list')
  for (const entry of roomLog.slice(-60)) {
    const t = new Date(entry.ts)
    const hh = String(t.getHours()).padStart(2, '0')
    const mm = String(t.getMinutes()).padStart(2, '0')
    const row = el('div', 'h-row')
    row.appendChild(el('span', 'h-time', `${hh}:${mm}`))
    row.appendChild(el('span', 'h-name', entry.name))
    row.appendChild(el('span', 'h-text', entry.text))
    list.appendChild(row)
  }
  if (roomLog.length === 0) list.appendChild(el('div', 'w-note', '아직 대화가 없어요'))
  history.appendChild(list)
  const close = el('div', 'item w-close', '닫기')
  close.addEventListener('click', closeHistory)
  history.appendChild(close)
  list.scrollTop = list.scrollHeight
}

function openHistory() {
  buildHistory()
  historyOpen = true
  history.style.display = 'block'
  history.style.left = `${Math.min(Math.max(8, char.x + W), canvas.width - 280)}px`
  history.style.top = `${Math.min(Math.max(8, char.y - H - 160), canvas.height - 260)}px`
  bridge.setInteractive(true)
  interactive = true
}

function closeHistory() {
  if (!historyOpen) return
  historyOpen = false
  history.style.display = 'none'
  if (world.cursor) syncInteractive(world.cursor)
}

function openChat() {
  if (!roomCode) {
    openMp()
    return
  }
  chatOpen = true
  chatWrap.style.display = 'block'
  positionChat()
  bridge.setInteractive(true)
  interactive = true
  chatInput.value = ''
  chatInput.focus()
}

function closeChat() {
  if (!chatOpen) return
  chatOpen = false
  chatWrap.style.display = 'none'
  chatInput.blur()
  if (world.cursor) syncInteractive(world.cursor)
}

function positionChat() {
  chatWrap.style.left = `${Math.min(Math.max(8, char.x - 110), canvas.width - 230)}px`
  chatWrap.style.top = `${Math.max(8, char.y - H - 44)}px`
}

chatInput.addEventListener('keydown', (e) => {
  e.stopPropagation()
  if (e.key === 'Escape') closeChat()
  if (e.key === 'Enter') {
    const text = chatInput.value.trim().slice(0, 200)
    if (text && roomCode) {
      net.sendChat(text)
      pushLog(playerName, text)
      showBubble('me', text)
    }
    closeChat()
  }
})

bridge.onOpenChat(() => openChat())

// 말풍선 (채팅 전용 — 캐릭터 자체 의사표현은 이모트 심볼)
const bubbles = new Map<string, { div: HTMLDivElement; timer: number }>()

function showBubble(id: string, text: string) {
  removeBubble(id)
  const div = document.createElement('div')
  div.className = 'chatbubble'
  div.textContent = text
  bubblesWrap.appendChild(div)
  bubbles.set(id, { div, timer: Math.min(12, 5 + text.length * 0.06) })
}

function removeBubble(id: string) {
  const b = bubbles.get(id)
  if (b) {
    b.div.remove()
    bubbles.delete(id)
  }
}

function clearBubbles() {
  for (const id of [...bubbles.keys()]) removeBubble(id)
}

function updateBubbles(dt: number) {
  for (const [id, b] of bubbles) {
    b.timer -= dt
    if (b.timer <= 0) {
      removeBubble(id)
      continue
    }
    let bx = char.x
    let by = char.y
    if (id !== 'me') {
      const peer = peers.peers.get(id)
      if (!peer || !peer.hasState) {
        removeBubble(id)
        continue
      }
      bx = peer.x
      by = peer.y
    }
    b.div.style.left = `${bx}px`
    b.div.style.top = `${by - H - 10}px`
    b.div.style.opacity = b.timer < 0.6 ? String(b.timer / 0.6) : '1'
  }
}

// ---------- 이모트 (텍스트 박스 없이 심볼만) ----------

let emoteText: string | null = null
let emoteTimer = 0
const EMOTE_TIME = 1.8

function updateEmote(dt: number) {
  if (emoteTimer <= 0 && char.messages.length > 0) {
    emoteText = char.messages.shift()!
    emoteTimer = EMOTE_TIME
  }
  if (emoteTimer > 0) {
    emoteTimer -= dt
    if (emoteTimer <= 0) emoteText = null
  }
}

function drawEmote() {
  if (!emoteText) return
  const t = 1 - emoteTimer / EMOTE_TIME // 0→1
  const rise = t * 10 * (SCALE / 2)
  const alpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1
  const pop = t < 0.15 ? 0.7 + (t / 0.15) * 0.3 : 1
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = `bold ${Math.round(9 * SCALE * pop)}px 'Courier New', monospace`
  ctx.textAlign = 'center'
  ctx.lineWidth = 3
  ctx.strokeStyle = '#22242f'
  ctx.fillStyle = '#ffffff'
  const ex = char.x
  const ey = char.y - H - 8 - rise
  ctx.strokeText(emoteText, ex, ey)
  ctx.fillText(emoteText, ex, ey)
  ctx.restore()
}

// ---------- 애니메이션 & 메인 루프 ----------

let animTime = 0
let blinkTimer = 2 + Math.random() * 3

function currentFrame(): BakedFrame {
  switch (char.pose) {
    case 'held':
      return Math.floor(animTime * 8) % 2 === 0 ? frames.heldA : frames.heldB
    case 'work':
      return Math.floor(animTime * 4) % 2 === 0 ? frames.workA : frames.workB
    case 'back':
      return frames.back
    case 'sit':
      return frames.sit
    case 'sleep':
      return frames.sleep
    case 'pant':
      return frames.pant
    case 'walk':
      return Math.floor(animTime * 6) % 2 === 0 ? frames.walkA : frames.walkB
    case 'run':
      return Math.floor(animTime * 12) % 2 === 0 ? frames.walkA : frames.walkB
    default:
      return blinkTimer < 0.15 ? frames.blink : frames.idle
  }
}

function frameForPeer(peer: Peer): BakedFrame {
  const baked = peerFrames(peer.look)
  switch (peer.pose) {
    case 'held':
      return Math.floor(animTime * 8) % 2 === 0 ? baked.heldA : baked.heldB
    case 'work':
      return Math.floor(animTime * 4) % 2 === 0 ? baked.workA : baked.workB
    case 'back':
      return baked.back
    case 'sit':
      return baked.sit
    case 'sleep':
      return baked.sleep
    case 'pant':
      return baked.pant
    case 'walk':
      return Math.floor(animTime * 6) % 2 === 0 ? baked.walkA : baked.walkB
    case 'run':
      return Math.floor(animTime * 12) % 2 === 0 ? baked.walkA : baked.walkB
    default:
      return baked.idle
  }
}

function drawPeer(peer: Peer) {
  if (!peer.hasState || Number.isNaN(peer.x)) return
  const frame = frameForPeer(peer)
  const top = peer.y - H
  ctx.save()
  if (peer.pose === 'sleep') {
    ctx.translate(peer.x, peer.y - W / 2)
    ctx.rotate(peer.facing === 1 ? Math.PI / 2 : -Math.PI / 2)
    ctx.drawImage(frame.canvas, -W / 2, -H / 2, W, H)
  } else {
    ctx.translate(peer.x, 0)
    ctx.scale(peer.facing, 1)
    ctx.drawImage(frame.canvas, -W / 2, top, W, H)
  }
  ctx.restore()
  // 이름표 (발 아래, 은은하게)
  ctx.save()
  ctx.font = '10px monospace'
  ctx.textAlign = 'center'
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(20,22,32,0.7)'
  ctx.fillStyle = 'rgba(230,232,245,0.85)'
  ctx.strokeText(peer.name, peer.x, peer.y + 12)
  ctx.fillText(peer.name, peer.x, peer.y + 12)
  ctx.restore()
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // 소파 (캐릭터보다 뒤에)
  if (sofa.enabled) {
    const r = sofaRect()
    ctx.drawImage(sofaSprite.canvas, r.x, r.y, r.w, r.h)
  }

  // 친구 캐릭터들 (내 캐릭터보다 뒤에)
  for (const peer of peers.peers.values()) drawPeer(peer)

  const frame = currentFrame()
  const top = char.y - H

  ctx.save()
  if (char.pose === 'held') {
    // 머리(잡힌 지점)를 피벗으로 살랑살랑 흔들리며 다리를 허둥댄다
    const sway = Math.sin(animTime * 5) * 0.12
    ctx.translate(char.x, top + GRIP)
    ctx.rotate(sway)
    ctx.scale(char.facing, 1)
    ctx.drawImage(frame.canvas, -W / 2, -GRIP, W, H)
  } else if (char.pose === 'sleep') {
    // 눕혀서 잠자기
    ctx.translate(char.x, char.y - W / 2)
    ctx.rotate(char.facing === 1 ? Math.PI / 2 : -Math.PI / 2)
    ctx.drawImage(frame.canvas, -W / 2, -H / 2, W, H)
  } else {
    // idle 호흡 바운스 / pant 웅크림
    const bounce = char.pose === 'idle' ? Math.round(Math.sin(animTime * 2) * 1) * SCALE * 0.34 : 0
    const crouch = char.pose === 'pant' ? SCALE * 2 : 0
    ctx.translate(char.x, 0)
    ctx.scale(char.facing, 1)
    ctx.drawImage(frame.canvas, -W / 2, top + bounce + crouch, W, H)
  }
  ctx.restore()

  // 이펙트: 하트(쓰다듬기/간식), Zzz(낮잠), 땀(지침)
  if (char.emoteTimer > 0) {
    const rise = (1.6 - char.emoteTimer) * 20
    ctx.drawImage(heart.canvas, char.x + 10, top - 14 - rise, 7 * SCALE, 6 * SCALE)
  }
  if (char.pose === 'sleep') {
    ctx.fillStyle = '#cfd8ff'
    ctx.font = `bold ${8 * SCALE}px monospace`
    const phase = Math.floor(animTime) % 3
    ctx.fillText('z'.repeat(phase + 1).toUpperCase(), char.x + 20, char.y - H + 6)
  }
  if (char.pose === 'pant') {
    ctx.fillStyle = '#7fd4f0'
    const drop = Math.floor(animTime * 4) % 2 === 0 ? 0 : SCALE
    ctx.fillRect(char.x + W / 2 - SCALE, top + 6 * SCALE + drop, SCALE, SCALE * 2)
  }

  drawEmote()
}

let last = performance.now()
let lastPollActive = false

function loop(now: number) {
  const dt = Math.min((now - last) / 1000, 0.1)
  last = now
  animTime += dt
  blinkTimer -= dt
  if (blinkTimer < 0) blinkTimer = 2 + Math.random() * 3

  world.bounds = computeBounds()
  world.home = homeState()
  // 활동 판정: 커서 이동 or 최근 타이핑. 방치 시간은 워처(키+마우스 통합) 기준
  const cursorActive = now - lastCursorMoveAt < 5000
  const typingActive = now - lastTypingAt < 4000
  world.userActive = cursorActive || typingActive
  world.userIdleSec = watcherIdleSec
  char.update(dt, world)
  updateEmote(dt)

  // 멀티플레이: 피어 보간, 상태 전송, 말풍선 위치, 근접 인사
  if (roomCode) {
    peers.tick(dt, canvas.width, canvas.height)
    maybeSendState(dt)
    greetCooldown -= dt
    if (greetCooldown <= 0) {
      if (peers.near(char.x, char.y, 70)) {
        char.messages.push('♪')
        greetCooldown = 25 + Math.random() * 25
      } else {
        greetCooldown = 3
      }
    }
    if (chatOpen) positionChat()
  }
  updateBubbles(dt)

  // 따라다니거나 집혀 있는 동안만 커서 폴링을 고빈도로 (CPU 예산)
  const wantActive =
    char.state === 'follow' || char.state === 'exhausted' || dragging || sofaDragging
  if (wantActive !== lastPollActive) {
    lastPollActive = wantActive
    bridge.setPollRate(wantActive)
  }

  draw()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
