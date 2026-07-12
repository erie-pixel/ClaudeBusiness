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
import { partsBySlot, setModPacks, validatePack, type PartsPack, type PartSlot } from './engine/parts'
import {
  ROOM_PALETTE,
  ROOM_SIZES,
  ROOM_THEMES,
  FURNITURE,
  furnitureById,
  defaultRoomData,
  normalizeRoomData,
  MAX_FURNITURE,
  MAX_BOARD_ITEMS,
  type RoomData,
  type RoomSize,
  type BoardItem,
  type PlacedFurniture,
  type FurnitureDef,
} from './engine/room'
import {
  MEMENTOS,
  MEMENTO_PALETTE,
  emptyAlbum,
  normalizeAlbum,
  rollFind,
  foundKinds,
  daysTogether,
  type AlbumData,
  type MementoDef,
} from './engine/collection'
import { NetClient, type NetPeerInfo, type NetState, type PeekSignalType } from './net/client'
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
  positionEdgeHandle()
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

// ---------- 모드 파츠 팩 (핫리로드) ----------
// mods/ 폴더의 manifest.json이 바뀔 때마다 메인 프로세스가 다시 보내준다.
// 검증(린트) 통과분만 등록 → 프레임 리베이크 → 열려 있으면 옷장 갱신.

bridge.onModPacks((raws) => {
  const valid: PartsPack[] = []
  const problems: string[] = []
  for (const raw of Array.isArray(raws) ? raws : []) {
    const { pack, errors } = validatePack(raw)
    if (pack) valid.push(pack)
    if (errors.length > 0) {
      const name =
        typeof raw === 'object' && raw !== null && typeof (raw as PartsPack).name === 'string'
          ? (raw as PartsPack).name
          : '?'
      problems.push(`${name}: ${errors[0]}${errors.length > 1 ? ` 외 ${errors.length - 1}건` : ''}`)
    }
  }
  setModPacks(valid)
  applyLook(look) // 현재 look 기준 리베이크 (사라진 파츠는 getPart가 폴백)
  peerFramesCache.clear() // 친구 캐릭터도 새 파츠 기준으로 다시 굽는다
  if (valid.length > 0) pushLog('모드', `파츠 팩 ${valid.length}개 불러옴 (${valid.map((p) => p.name).join(', ')})`)
  for (const p of problems) pushLog('모드', `팩 검증 실패 — ${p}`)
  if (wardrobeOpen) buildWardrobe()
})

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
let hourlyChime = false
let onboardingStarted = false
let autoRejoinTried = false
bridge.onSettings((s) => {
  applyScale(s.scale)
  char.applyActivity(s.activity)
  sofa.enabled = s.sofa.enabled
  sofa.x = s.sofa.x
  sofa.y = s.sofa.y
  applyLook(s.look)
  playerName = s.playerName
  serverUrl = s.serverUrl
  hourlyChime = s.hourlyChime
  statusMsg = s.statusMsg

  // 마지막 방 자동 재접속 — 방을 '상주 공간'처럼 (명시적으로 나가기 전까지 유지)
  if (s.lastRoom && !autoRejoinTried && !roomCode) {
    autoRejoinTried = true
    const room = s.lastRoom
    setTimeout(() => {
      if (roomCode) return
      activeUrl = room.url
      netNotice = '이전 방에 다시 접속 중…'
      autoRejoining = true
      net.connectAnd(room.url, room.code, playerName, look)
    }, 800)
  }

  // 첫 실행 온보딩 — 캐릭터가 인사하고 옷장을 열어 꾸미기부터 안내한다.
  // (기획서 §5 Phase 6 "첫 실행 캐릭터 메이커"의 경량판)
  if (!s.onboarded && !onboardingStarted) {
    onboardingStarted = true
    bridge.saveOnboarded() // 다음 실행부터는 안 뜸 (지금 세션은 계속 진행)
    setTimeout(() => {
      char.messages.push('!')
      char.emoteTimer = 1.6
      showToast('안녕하세요! 이제 여기 살아요', 5000)
    }, 1200)
    setTimeout(() => {
      showToast('먼저 옷장에서 꾸며 주세요 — 언제든 우클릭으로 메뉴를 열 수 있어요', 7000)
      openWardrobe()
    }, 4500)
  }
})

// ---------- 멀티플레이 (Phase 3) ----------

let playerName = '친구'
let serverUrl = 'ws://127.0.0.1:8787'
let statusMsg = '' // 상태 메시지 (SNS 한 줄)
let roomCode: string | null = null
let netNotice = '' // mp 패널에 표시할 상태/오류 메시지
/** 시작 시 마지막 방 자동 재접속 시도 중인가 (실패하면 조용히 lastRoom 해제) */
let autoRejoining = false
const peers = new PeerStore()
const roomLog: Array<{ name: string; text: string; ts: number }> = []
/** 친구 캐릭터의 이모트 심볼 (머리 위 표시) */
const peerEmotes = new Map<string, { text: string; timer: number }>()
/** 예기치 않은 끊김 시 자동 재접속 */
const reconnect = { code: null as string | null, attempts: 0, timer: 0 }
/** 현재 세션이 실제로 접속한 주소 (호스트면 로컬, 참여면 입력한 주소) */
let activeUrl = ''
/** 내가 호스트일 때 친구에게 알려줄 접속 주소들 */
let hostIps: string[] = []
let hosting = false

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

/** 인사로 취급하는 기호 — 근처 친구가 이걸 보내면 다가가서 화답한다 */
const GREETING_SYMS: ReadonlySet<string> = new Set(['!', '♪'])

const net = new NetClient({
  onJoined(room, _self, infos) {
    roomCode = room
    netNotice = ''
    reconnect.code = null
    reconnect.attempts = 0
    autoRejoining = false
    peers.reset()
    for (const info of infos) peers.upsert(info)
    char.messages.push('!')
    // 내 상태 메시지/프레즌스를 방에 알린다
    if (statusMsg) net.sendStatus(statusMsg)
    net.sendPresence(currentPresence())
    net.sendRoomInfo(myRoom)
    // 참여한 방 기억 — 다음 실행 시 자동 재접속 (호스트는 재시작 시 코드가
    // 바뀌므로 제외, 명시적으로 나가면 해제)
    bridge.saveLastRoom(hosting ? null : { code: room, url: activeUrl })
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
    cleanupPeekView(id)
    closeShare(id)
    pushLog('알림', `${name} 님이 떠났어요`)
    refreshMpPanel()
  },
  onPeerState(id, state: NetState) {
    peers.updateState(id, state)
  },
  onPeerRename(id, name) {
    peers.rename(id, name)
    refreshMpPanel()
  },
  onPeerStatus(id, text) {
    peers.setStatus(id, text)
    refreshMpPanel()
  },
  onPeerPresence(id, mode) {
    peers.setPresence(id, mode)
    refreshMpPanel()
  },
  onPeerRoomInfo(id, info) {
    peers.setRoomInfo(id, info)
    // 그 친구의 방을 보고 있으면 즉시 반영
    if (roomOpen && viewingRoom === id) buildRoom()
    if (boardOpen && boardOwner === id) buildBoardPanel()
  },
  onChat(id, name, text) {
    pushLog(name, text)
    showBubble(id, text)
  },
  onEmote(id, sym) {
    peerEmotes.set(id, { text: sym, timer: 1.8 })
    // ★ = 친구가 희귀 기념품을 발견 — 내 화면에도 소식이 남는다 (수집 루프의 소셜 연결)
    if (sym === '★') {
      pushLog('알림', `${peers.peers.get(id)?.name ?? '?'} 님이 희귀한 보물을 발견했어요!`)
    }
    // 근처 친구가 인사 기호를 보내면 감지해서 화답하러 간다 (대화하듯 주고받기)
    if (GREETING_SYMS.has(sym)) {
      const peer = peers.peers.get(id)
      if (peer && peer.hasState) {
        const dist = Math.hypot(peer.x - char.x, peer.y - char.y)
        if (dist <= 420) char.notifyGreeted({ x: peer.x - 26 * char.facing, y: peer.y })
      }
    }
  },
  onDraw(_id, segs) {
    for (const s of segs) drawBoardSeg(s[0], s[1], s[2], s[3], s[4])
  },
  onDrawClear(id) {
    clearBoard(false)
    pushLog('알림', `${peers.peers.get(id)?.name ?? '?'} 님이 그림판을 지웠어요`)
  },
  onPeek(type, from, name, watching, payload) {
    handlePeekSignal(type, from, name, watching, payload)
  },
  onError(code) {
    netNotice = NET_ERRORS[code] ?? `오류: ${code}`
    if (reconnect.code && code === 'no-room') {
      // 방이 유예 기간을 넘겨 사라짐 — 재접속 포기
      reconnect.code = null
      netNotice = '방이 사라졌어요 — 새로 만들어 주세요'
    }
    if (autoRejoining) {
      // 시작 시 자동 재접속 실패 — 기억해둔 방을 조용히 잊는다
      autoRejoining = false
      netNotice = ''
      bridge.saveLastRoom(null)
    }
    refreshMpPanel()
  },
  onClose() {
    if (roomCode) {
      // 예기치 않은 끊김 → 같은 방으로 자동 재접속 시도
      reconnect.code = roomCode
      reconnect.attempts = 0
      reconnect.timer = 1.5
      roomCode = null
      peers.reset()
      clearBubbles()
      netNotice = '연결이 끊겼어요 — 재접속 시도 중…'
      char.messages.push('…')
      refreshMpPanel()
    } else if (reconnect.code) {
      // 재접속 시도가 또 실패 → 백오프 후 재시도
      reconnect.timer = Math.min(16, 2 * Math.max(1, reconnect.attempts))
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
  reconnect.code = null
  hosting = false
  hostIps = []
  peers.reset()
  clearBubbles()
  peerEmotes.clear()
  cleanupAllPeeks()
  bridge.saveLastRoom(null) // 명시적으로 나감 — 다음 실행에 자동 재접속 안 함
  refreshMpPanel()
}

function tickReconnect(dt: number) {
  if (!reconnect.code) return
  reconnect.timer -= dt
  if (reconnect.timer > 0) return
  if (reconnect.attempts >= 5) {
    netNotice = '재접속에 실패했어요 — "친구들" 메뉴에서 다시 참여해 주세요'
    reconnect.code = null
    refreshMpPanel()
    return
  }
  reconnect.attempts++
  reconnect.timer = 999 // 결과(onJoined/onClose/onError)가 다음 스텝을 정한다
  netNotice = `재접속 중… (${reconnect.attempts}/5)`
  refreshMpPanel()
  net.connectAnd(activeUrl || serverUrl, reconnect.code, playerName, look)
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
    pose: charHome ? 'sit' : char.pose,
    facing: char.facing,
    inRoom: charHome,
  }
  const key = JSON.stringify(state)
  if (key === lastSentState) return
  lastSentState = key
  net.sendState(state)
}

// 프레즌스 (SNS) — 집중 타이머 중/자리 비움/온라인을 자동 감지해 방에 알린다.
// Discord의 온라인 상태처럼 "옆자리 감각"을 만드는 ambient 신호.
let lastSentPresence: 'online' | 'focus' | 'away' | '' = ''

function currentPresence(): 'online' | 'focus' | 'away' {
  if (focus) return 'focus'
  if (watcherIdleSec >= 90) return 'away'
  return 'online'
}

function maybeSendPresence() {
  if (!roomCode || !net.connected) return
  const mode = currentPresence()
  if (mode === lastSentPresence) return
  lastSentPresence = mode
  net.sendPresence(mode)
}

// 근접 인사 — 옆에 친구 캐릭터가 오면 가끔 반가워함
let greetCooldown = 5

// 사용자 활동 감지 (Co-work/방치 리액션)
let lastCursorMoveAt = 0
let prevCursor: { x: number; y: number } | null = null
let lastTypingAt = 0
let watcherIdleSec = 0
let wasTyping = false

bridge.onUserInput((input) => {
  // 타이핑이 막 시작된 순간(엣지)에만 반응 — 계속 치는 동안 매번 반응하지 않는다
  if (input.typing && !wasTyping) char.notifyTypingStarted()
  wasTyping = input.typing
  if (input.typing) lastTypingAt = performance.now()
  watcherIdleSec = input.idleSec
})

// ---------- 클릭통과 <-> 상호작용 전환 ----------

let interactive = false
let menuOpen = false
let wardrobeOpen = false
let albumOpen = false
let todoOpen = false
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
  if (charHome) return false // 방에 들어가 있으면 바탕화면에 없다
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
    albumOpen ||
    todoOpen ||
    roomOpen ||
    wbOpen ||
    boardOpen ||
    overEdgeHandle(cursor.x, cursor.y) ||
    mpOpen ||
    historyOpen ||
    chatOpen ||
    peekAsk !== null ||
    dragging ||
    sofaDragging ||
    pendingGrab !== null ||
    overCharacter(cursor.x, cursor.y) ||
    overSofa(cursor.x, cursor.y) ||
    peerAt(cursor.x, cursor.y) !== null
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
  // 엣지 핸들 호버 → 내/친구 방 열기 (삼성 엣지패널 방식)
  maybeHoverOpenRoom(pos.x, pos.y)
  if (roomCode) updatePeekHover(pos)
  syncInteractive(pos)
})

// ---------- 활성 창 쳐다보기 (홈 모드에서는 외출 안 함) ----------

bridge.onActiveWindow((rect) => {
  if (rect.w < 120 || rect.h < 80) return // 툴팁/팝업류 무시
  // 구경(창 위 중앙)/올라타기(창 위 임의 지점)/빼꼼(창 옆) 중 하나는 캐릭터가 rect로 직접 고른다
  char.notifyActiveWindow(rect, sofa.enabled)
})

// ---------- 마우스 입력 (집기 / 소파 옮기기) ----------

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  // 패널 내부에서 시작된 mousedown은 UI 조작(또는 패널 드래그) — 캐릭터/소파 집기와 분리
  const t = e.target as Node
  if (
    menu.contains(t) ||
    wardrobe.contains(t) ||
    albumPanel.contains(t) ||
    todoPanel.contains(t) ||
    roomPanel.contains(t) ||
    edgeHandle.contains(t) ||
    peerHandles.contains(t) ||
    wbPanel.contains(t) ||
    boardPanel.contains(t) ||
    mp.contains(t) ||
    history.contains(t) ||
    chatWrap.contains(t) ||
    peekReq.contains(t)
  ) {
    return
  }
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

function buildMenu() {
  const following = char.state === 'follow' || char.state === 'exhausted'
  menu.innerHTML = ''

  // 스탯 게이지 없음 — 관리해야 하는 육성 게이지가 아니라
  // 함께 지내는 동료라는 컨셉 (스탯은 내부 행동 리듬으로만 존재)
  const items: Array<{ label: string; action: () => void } | 'sep'> = [
    following
      ? { label: '그만 따라와', action: () => char.commandStopFollow() }
      : { label: '마우스 따라와', action: () => char.commandFollow() },
    char.state === 'nap'
      ? { label: '일어나', action: () => char.poke() }
      : { label: '낮잠 자', action: () => char.commandNap() },
    { label: '여기서 기다려', action: () => char.commandStay() },
    'sep',
    ...(focus
      ? [
          {
            label: `집중 그만하기 (남은 ${Math.ceil(focus.remain / 60)}분)`,
            action: () => stopFocus(false),
          },
        ]
      : [
          { label: '집중 타이머 25분', action: () => startFocus(25) },
          { label: '집중 타이머 50분', action: () => startFocus(50) },
        ]),
    {
      label: (() => {
        const remaining = todos.filter((t) => !t.done).length
        return remaining > 0 ? `할 일 목록 (${remaining})…` : '할 일 목록…'
      })(),
      action: () => openTodo(),
    },
    'sep',
    { label: '옷장 열기…', action: () => openWardrobe() },
    { label: `앨범 보기 (${foundKinds(album)}/${MEMENTOS.length})…`, action: () => openAlbum() },
    { label: roomCode ? `친구들 (${peers.peers.size + 1}명 접속)…` : '친구들…', action: () => openMp() },
    ...(roomCode
      ? [
          { label: '채팅하기 (Ctrl+Shift+Space)', action: () => openChat() },
          { label: '대화 기록', action: () => openHistory() },
        ]
      : []),
    ...(shares.size > 0
      ? [{ label: `화면 공유 중지 (${shares.size}명)`, action: () => revokeAllShares() }]
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

function buildPeerMenu(peer: Peer) {
  menu.innerHTML = ''
  menu.appendChild(el('div', 'w-title', peer.name))
  const view = peekViews.get(peer.id)
  const items: Array<{ label: string; action: () => void }> = []
  if (view?.granted) {
    items.push({ label: '화면 그만 보기', action: () => stopViewing(peer.id) })
  } else if (peekPendingTo === peer.id) {
    items.push({ label: '요청 승인 대기 중…', action: () => undefined })
  } else {
    items.push({ label: '화면 보여줘 요청', action: () => requestPeek(peer.id) })
  }
  items.push({ label: '대화 기록', action: () => openHistory() })
  for (const item of items) {
    const node = el('div', 'item', item.label)
    node.addEventListener('click', () => {
      item.action()
      closeMenu()
    })
    menu.appendChild(node)
  }
}

function openPeerMenu(peer: Peer, x: number, y: number) {
  buildPeerMenu(peer)
  menuOpen = true
  menu.style.display = 'block'
  menu.style.left = `${Math.min(x, canvas.width - 190)}px`
  menu.style.top = `${Math.min(y, canvas.height - menu.offsetHeight - 8)}px`
  bridge.setInteractive(true)
  interactive = true
}

window.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  if (overCharacter(e.clientX, e.clientY)) {
    openMenu(e.clientX + 8, e.clientY - 8)
    return
  }
  const peer = roomCode ? peerAt(e.clientX, e.clientY) : null
  if (peer) {
    openPeerMenu(peer, e.clientX + 8, e.clientY - 8)
    return
  }
  closeMenu()
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
  if (path.includes(menu) || path.includes(wardrobe) || path.includes(albumPanel) || path.includes(todoPanel) || path.includes(roomPanel) || path.includes(edgeHandle) || path.includes(peerHandles) || path.includes(wbPanel) || path.includes(boardPanel) || path.includes(mp) || path.includes(history) || path.includes(chatWrap) || path.includes(peekReq)) return
  if (menuOpen) {
    closeMenu()
    return
  }
  if (wardrobeOpen) {
    closeWardrobe()
    return
  }
  if (albumOpen) {
    closeAlbum()
    return
  }
  if (todoOpen) {
    closeTodo()
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
    char.poke() // 낮잠 중이면 깨우기만 — 쓰다듬기 상호작용은 없다 (동료 컨셉)
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

  // 모드 파츠 팩 폴더 — 팩(manifest.json)을 넣으면 즉시 옷장에 나타난다 (핫리로드)
  const mods = document.createElement('div')
  mods.className = 'item w-close'
  mods.textContent = '모드 폴더 열기'
  mods.addEventListener('click', () => bridge.openModsFolder())
  wardrobe.appendChild(mods)

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

// ---------- 수집 앨범 "함께한 날들" ----------
// 배회하다 도착한 곳에서 가끔 기념품을 주워온다 — "켜두면 쌓이는 것".
// 파츠 잠금 해제가 아닌 순수 수집/기록 (buy-to-play 원칙과 충돌하지 않음).

const albumPanel = document.getElementById('album') as HTMLDivElement

let album: AlbumData = emptyAlbum(Date.now())
let albumSaveTimer = 0
/** 발견 연출: 주운 물건이 머리 위로 떠올랐다 사라진다 */
let pickupFx: { def: MementoDef; timer: number } | null = null
const PICKUP_TIME = 2.2

bridge.onAlbum((data) => {
  album = normalizeAlbum(data, Date.now())
})

function saveAlbumNow() {
  bridge.saveAlbum(album)
}

/** 기념품 8x8 픽셀 맵 → 캔버스 (id별 캐시) */
const mementoCanvases = new Map<string, HTMLCanvasElement>()
function mementoCanvas(def: MementoDef): HTMLCanvasElement {
  let c = mementoCanvases.get(def.id)
  if (c) return c
  c = document.createElement('canvas')
  c.width = 8
  c.height = 8
  const mc = c.getContext('2d')!
  def.map.forEach((row, y) => {
    for (let x = 0; x < 8; x++) {
      const color = MEMENTO_PALETTE[row[x]]
      if (!color) continue
      mc.fillStyle = color
      mc.fillRect(x, y, 1, 1)
    }
  })
  mementoCanvases.set(def.id, c)
  return c
}

function fmtHours(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`
}

function buildAlbum() {
  albumPanel.innerHTML = ''
  albumPanel.appendChild(el('div', 'w-title', '함께한 날들'))

  const j = album.journal
  const journal = el('div', 'a-journal')
  journal.innerHTML =
    `함께한 지 <b>${daysTogether(album, Date.now())}일째</b> · 함께 보낸 시간 <b>${fmtHours(j.totalSec)}</b><br>` +
    `같이 일하기 <b>${j.coworkSessions}</b> · 인사 <b>${j.greets}</b> · 할일 완료 <b>${j.todosDone}</b><br>` +
    `주운 보물 <b>${foundKinds(album)}</b> / ${MEMENTOS.length}종`
  albumPanel.appendChild(journal)

  const detail = el('div', 'a-detail', '칸을 눌러 보세요')

  const grid = el('div', 'a-grid')
  for (const def of MEMENTOS) {
    const entry = album.found[def.id]
    const cell = el('div', 'a-cell' + (entry && def.rarity === 'rare' ? ' rare' : '') + (entry ? '' : ' locked'))
    if (entry) {
      const thumb = mementoCanvas(def).cloneNode(false) as HTMLCanvasElement
      const tc = thumb.getContext('2d')!
      tc.imageSmoothingEnabled = false
      tc.drawImage(mementoCanvas(def), 0, 0)
      cell.appendChild(thumb)
      if (entry.count > 1) cell.appendChild(el('span', 'a-count', `${entry.count}`))
      cell.addEventListener('click', () => {
        detail.textContent = `${def.name} ×${entry.count} — ${def.desc}`
      })
    } else {
      cell.textContent = '?'
      cell.addEventListener('click', () => {
        detail.textContent = '아직 못 주운 물건이에요. 캐릭터가 돌아다니다 언젠가 찾아올 거예요.'
      })
    }
    grid.appendChild(cell)
  }
  albumPanel.appendChild(grid)
  albumPanel.appendChild(detail)

  const close = el('div', 'item a-close', '닫기')
  close.addEventListener('click', closeAlbum)
  albumPanel.appendChild(close)
}

function openAlbum() {
  buildAlbum()
  albumOpen = true
  albumPanel.style.display = 'block'
  albumPanel.style.left = `${Math.min(Math.max(8, char.x - 120), canvas.width - 270)}px`
  albumPanel.style.top = `${Math.min(Math.max(8, char.y - H - 240), canvas.height - 300)}px`
  bridge.setInteractive(true)
  interactive = true
}

function closeAlbum() {
  if (!albumOpen) return
  albumOpen = false
  albumPanel.style.display = 'none'
  if (world.cursor) syncInteractive(world.cursor)
}

/** 캐릭터 의미 이벤트 처리 — 배회 도착 시 기념품 추첨, 일지 카운터 */
function handleCharEvents(dt: number) {
  for (const ev of char.events.splice(0)) {
    if (ev === 'wander-arrive') {
      const found = rollFind(album, Math.random, Date.now())
      if (found) {
        pickupFx = { def: found, timer: PICKUP_TIME }
        // 희귀품이면 ★ 이모트 — 방에 있으면 기존 이모트 중계로 친구 화면에도 뜬다
        char.messages.push(found.rarity === 'rare' ? '★' : '!')
        pushLog('발견', `${found.name}을(를) 주웠어요!`)
        saveAlbumNow()
        if (albumOpen) buildAlbum()
      }
    } else if (ev === 'cowork-end') {
      album.journal.coworkSessions++
      saveAlbumNow()
    } else if (ev === 'greeted') {
      album.journal.greets++
      saveAlbumNow()
    }
  }
  // 함께 보낸 시간 누적 — 디스크에는 45초마다 저장 (매 프레임 쓰기 방지)
  album.journal.totalSec += dt
  albumSaveTimer += dt
  if (albumSaveTimer >= 45) {
    albumSaveTimer = 0
    saveAlbumNow()
  }
  if (pickupFx) {
    pickupFx.timer -= dt
    if (pickupFx.timer <= 0) pickupFx = null
  }
}

/** 발견 연출 그리기 — 주운 물건이 머리 위로 떠오르며 사라진다 */
function drawPickup() {
  if (!pickupFx) return
  const t = 1 - pickupFx.timer / PICKUP_TIME // 0→1
  const rise = t * 16 * (SCALE / 2)
  const alpha = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1
  const size = 8 * SCALE
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    mementoCanvas(pickupFx.def),
    Math.round(char.x - size / 2),
    Math.round(char.y - H - 26 - rise),
    size,
    size,
  )
  ctx.restore()
}

// ---------- 픽셀 토스트 (무음 알림 — 정각/집중 타이머 종료 등) ----------
// 이 게임에는 사운드가 없다는 원칙: 알림은 전부 캐릭터 곁 시각 연출로만.

function showToast(text: string, ms = 4200) {
  const node = el('div', 'toast', text)
  node.style.left = `${Math.min(Math.max(120, char.x), canvas.width - 130)}px`
  node.style.top = `${Math.max(48, char.y - H - 34)}px`
  document.body.appendChild(node)
  setTimeout(() => {
    node.style.opacity = '0'
  }, ms - 500)
  setTimeout(() => node.remove(), ms)
}

// ---------- 생산성 보조: 집중 타이머 (뽀모도로) ----------
// 타이머는 FSM과 독립 — 캐릭터는 평소처럼 살고, 시작/종료 순간에만 반응한다.
// 남은 시간은 캐릭터 머리 위 작은 칩으로 표시 (한눈에 보이는 무음 타이머).

let focus: { remain: number; total: number } | null = null

function startFocus(minutes: number) {
  focus = { remain: minutes * 60, total: minutes * 60 }
  char.messages.push('!')
  char.emoteTimer = 1.6
  showToast(`집중 시작 — ${minutes}분!`)
}

function stopFocus(finished: boolean) {
  focus = null
  if (finished) {
    char.messages.push('♪')
    char.emoteTimer = 1.6
    showToast('집중 끝 — 잠깐 쉬어요!')
  }
}

function tickFocus(dt: number) {
  if (!focus) return
  focus.remain -= dt
  if (focus.remain <= 0) stopFocus(true)
}

/** 집중 중 캐릭터 머리 위 남은 시간 칩 */
function drawFocusChip() {
  if (!focus) return
  const m = Math.floor(focus.remain / 60)
  const s = Math.floor(focus.remain % 60)
  const text = `${m}:${String(s).padStart(2, '0')}`
  const x = Math.round(char.x)
  const y = Math.round(char.y - H - 10)
  ctx.save()
  ctx.font = 'bold 11px monospace'
  ctx.textAlign = 'center'
  const w = ctx.measureText(text).width + 10
  ctx.fillStyle = 'rgba(29,31,43,0.92)'
  ctx.fillRect(x - w / 2, y - 12, w, 15)
  ctx.strokeStyle = '#ffd76a'
  ctx.lineWidth = 1
  ctx.strokeRect(x - w / 2 + 0.5, y - 11.5, w - 1, 14)
  ctx.fillStyle = '#ffd76a'
  ctx.fillText(text, x, y)
  ctx.restore()
}

// ---------- 생산성 보조: 정각 알림 (트레이에서 켜고 끔, 무음) ----------

let lastChimeHour = new Date().getHours()

function tickHourlyChime() {
  const hour = new Date().getHours()
  if (hour === lastChimeHour) return
  lastChimeHour = hour
  if (!hourlyChime) return
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  showToast(`${hour < 12 ? '오전' : '오후'} ${display}시예요`)
  char.messages.push('!')
}

// ---------- 생산성 보조: 할일 목록 ----------

const todoPanel = document.getElementById('todo') as HTMLDivElement

interface TodoItem {
  id: number
  text: string
  done: boolean
}

let todos: TodoItem[] = []
let todoSeq = 1

bridge.onTodos((data) => {
  todos = []
  if (Array.isArray(data)) {
    for (const raw of data) {
      if (typeof raw !== 'object' || raw === null) continue
      const t = raw as Partial<TodoItem>
      if (typeof t.text !== 'string' || !t.text) continue
      todos.push({ id: todoSeq++, text: t.text.slice(0, 80), done: t.done === true })
    }
  }
  if (todoOpen) buildTodo()
})

function saveTodosNow() {
  bridge.saveTodos(todos.map((t) => ({ text: t.text, done: t.done })))
}

function buildTodo() {
  todoPanel.innerHTML = ''
  const remaining = todos.filter((t) => !t.done).length
  todoPanel.appendChild(el('div', 'w-title', remaining > 0 ? `할 일 (${remaining}개 남음)` : '할 일'))

  const list = el('div', 't-list')
  for (const item of todos) {
    const row = el('div', 't-row')
    const check = el('button', 't-check', item.done ? '✓' : '')
    check.addEventListener('click', () => {
      item.done = !item.done
      if (item.done) {
        // 완료 순간 — 캐릭터가 같이 기뻐한다
        char.messages.push('♪')
        char.emoteTimer = 1.6
        album.journal.todosDone++
        saveAlbumNow()
      }
      saveTodosNow()
      buildTodo()
    })
    row.appendChild(check)
    row.appendChild(el('span', 't-text' + (item.done ? ' done' : ''), item.text))
    const del = el('button', 't-del', '×')
    del.addEventListener('click', () => {
      todos = todos.filter((t) => t.id !== item.id)
      saveTodosNow()
      buildTodo()
    })
    row.appendChild(del)
    list.appendChild(row)
  }
  if (todos.length === 0) list.appendChild(el('div', 'w-note', '아직 할 일이 없어요'))
  todoPanel.appendChild(list)

  const addRow = el('div', 'w-row')
  const input = document.createElement('input')
  input.className = 'w-input'
  input.maxLength = 80
  input.placeholder = '할 일 입력 후 Enter'
  const add = () => {
    const text = input.value.trim()
    if (!text) return
    todos.push({ id: todoSeq++, text, done: false })
    saveTodosNow()
    buildTodo()
    // 다시 그려진 패널의 입력창에 포커스 유지
    const next = todoPanel.querySelector('input')
    if (next) (next as HTMLInputElement).focus()
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') add()
    e.stopPropagation()
  })
  addRow.appendChild(input)
  const addBtn = el('button', 'w-btn', '추가')
  addBtn.addEventListener('click', add)
  addRow.appendChild(addBtn)
  todoPanel.appendChild(addRow)

  if (todos.some((t) => t.done)) {
    const clear = el('div', 'item t-close', '완료한 항목 지우기')
    clear.addEventListener('click', () => {
      todos = todos.filter((t) => !t.done)
      saveTodosNow()
      buildTodo()
    })
    todoPanel.appendChild(clear)
  }

  const close = el('div', 'item t-close', '닫기')
  close.addEventListener('click', closeTodo)
  todoPanel.appendChild(close)
}

function openTodo() {
  buildTodo()
  todoOpen = true
  todoPanel.style.display = 'block'
  todoPanel.style.left = `${Math.min(Math.max(8, char.x - 110), canvas.width - 260)}px`
  todoPanel.style.top = `${Math.min(Math.max(8, char.y - H - 220), canvas.height - 300)}px`
  bridge.setInteractive(true)
  interactive = true
  const input = todoPanel.querySelector('input')
  if (input) (input as HTMLInputElement).focus()
}

function closeTodo() {
  if (!todoOpen) return
  todoOpen = false
  todoPanel.style.display = 'none'
  if (world.cursor) syncInteractive(world.cursor)
}

// ---------- 엣지패널 방 v2 — 2.5D 거실 (집) ----------
// 화면 가장자리 핸들에 호버/클릭하면 열리는 "내 방". 작은 집의 거실을 2.5D로
// 렌더링하고, 테마(벽지/바닥)·가구 배치·방 크기를 꾸밀 수 있다. 그림판(공유
// 화이트보드)과 보드(하이퍼링크 가능한 공유 목록)는 버튼으로 여는 팝업.
// 멀티플레이에서는 친구의 방 핸들이 내 핸들 아래에 스택되고, 열면 친구가
// 꾸민 방이 그대로 재현된다 (room-info 동기화).

const edgeHandle = document.getElementById('edgehandle') as HTMLDivElement
const roomPanel = document.getElementById('room') as HTMLDivElement
const wbPanel = document.getElementById('wb') as HTMLDivElement
const boardPanel = document.getElementById('board') as HTMLDivElement
const peerHandles = document.getElementById('peerhandles') as HTMLDivElement

let roomSide: 'left' | 'right' = 'right'
let roomOffset = 0.35 // 핸들 세로 위치 (화면 높이 대비 0~1)
let charHome = false
let roomOpen = false
let wbOpen = false
let boardOpen = false
let myRoom: RoomData = defaultRoomData()
/** 지금 보고 있는 방 — null = 내 방, 아니면 피어 id */
let viewingRoom: string | null = null
/** 보드 팝업의 주인 — null = 내 보드(편집 가능), 아니면 피어 id(읽기 전용) */
let boardOwner: string | null = null
let roomEditMode = false
/** 방 데이터 변경 후 0.5초 묶어서 전송 (디바운스) */
let roomSyncDirty = false
let roomSyncTimer = 0
/** 바깥 클릭으로 닫은 직후 핸들 위에 커서가 남아 바로 다시 열리는 것 방지 */
let handleHoverLock = false

const HANDLE_H = 72
const HANDLE_W = 12
const PEER_HANDLE_H = 44

bridge.onRoom((raw) => {
  if (typeof raw === 'object' && raw !== null) {
    const r = raw as {
      side?: string
      offset?: number
      charHome?: boolean
      room?: unknown
      links?: Array<{ title?: string; url?: string }>
    }
    roomSide = r.side === 'left' ? 'left' : 'right'
    roomOffset = typeof r.offset === 'number' ? Math.min(0.92, Math.max(0, r.offset)) : 0.35
    myRoom = normalizeRoomData(r.room ?? null)
    // v1 저장 호환: 예전 '링크 보드'는 보드 항목으로 승계
    if (Array.isArray(r.links) && myRoom.board.length === 0) {
      for (const l of r.links) {
        if (typeof l?.title === 'string' && typeof l?.url === 'string') {
          myRoom.board.push({ text: l.title.slice(0, 80), url: l.url.slice(0, 500) })
        }
      }
      myRoom = normalizeRoomData(myRoom)
    }
    if (r.charHome === true && !charHome) enterHome()
  }
  positionEdgeHandle()
})

function saveRoomNow() {
  bridge.saveRoom({ side: roomSide, offset: roomOffset, charHome, room: myRoom })
}

/** 방 데이터 변경 → 저장 + (방에 있으면) 친구에게 전송 예약 */
function roomChanged() {
  saveRoomNow()
  roomSyncDirty = true
  roomSyncTimer = 0
}

function handleRect() {
  const x = roomSide === 'right' ? canvas.width - HANDLE_W : 0
  const y = Math.round(roomOffset * (canvas.height - HANDLE_H))
  return { x, y, w: HANDLE_W, h: HANDLE_H }
}

/** 친구 핸들 — 내 핸들 바로 아래에 스택 (친구가 설정한 위치와 무관, 내 화면 기준) */
function peerHandleRect(index: number) {
  const mine = handleRect()
  return {
    x: mine.x,
    y: mine.y + HANDLE_H + 6 + index * (PEER_HANDLE_H + 6),
    w: HANDLE_W,
    h: PEER_HANDLE_H,
  }
}

function orderedPeers(): Peer[] {
  return [...peers.peers.values()].sort((a, b) => a.id.localeCompare(b.id))
}

function positionEdgeHandle() {
  const r = handleRect()
  edgeHandle.style.left = `${r.x}px`
  edgeHandle.style.top = `${r.y}px`
  refreshPeerHandles()
  if (roomOpen) positionRoomPanel()
}

/** 내 핸들 + 친구 핸들 전체에 대한 호버 판정. 반환: 'me' | 피어 id | null */
function handleAt(px: number, py: number): string | null {
  const mine = handleRect()
  if (px >= mine.x - 2 && px <= mine.x + mine.w + 2 && py >= mine.y && py <= mine.y + mine.h) return 'me'
  const list = orderedPeers()
  for (let i = 0; i < list.length; i++) {
    const r = peerHandleRect(i)
    if (px >= r.x - 2 && px <= r.x + r.w + 2 && py >= r.y && py <= r.y + r.h) return list[i].id
  }
  return null
}

function overEdgeHandle(px: number, py: number): boolean {
  return handleAt(px, py) !== null
}

/** 엣지 핸들 호버 처리 (onCursor에서 호출) — 핸들에 따라 내/친구 방 열기 */
function maybeHoverOpenRoom(px: number, py: number) {
  const hit = handleAt(px, py)
  if (hit === null) {
    handleHoverLock = false
    return
  }
  if (handleHoverLock) return
  const target = hit === 'me' ? null : hit
  if (!roomOpen || viewingRoom !== target) openRoomFor(target)
}

const peerHandleEls = new Map<string, HTMLDivElement>()

function refreshPeerHandles() {
  const list = roomCode ? orderedPeers() : []
  const alive = new Set(list.map((p) => p.id))
  for (const [id, node] of peerHandleEls) {
    if (!alive.has(id)) {
      node.remove()
      peerHandleEls.delete(id)
    }
  }
  list.forEach((p, i) => {
    let node = peerHandleEls.get(p.id)
    if (!node) {
      node = document.createElement('div')
      node.className = 'edgehandle-peer'
      node.addEventListener('click', () => openRoomFor(p.id))
      node.addEventListener('mouseenter', () => {
        if (!handleHoverLock) openRoomFor(p.id)
      })
      peerHandles.appendChild(node)
      peerHandleEls.set(p.id, node)
    }
    node.textContent = p.name.slice(0, 1) || '?'
    node.title = `${p.name}의 방`
    const r = peerHandleRect(i)
    node.style.left = `${r.x}px`
    node.style.top = `${r.y}px`
  })
}

function positionRoomPanel() {
  const r = handleRect()
  const top = Math.min(Math.max(8, r.y - 40), Math.max(8, canvas.height - roomPanel.offsetHeight - 8))
  roomPanel.style.top = `${top}px`
  if (roomSide === 'right') {
    roomPanel.style.left = ''
    roomPanel.style.right = `${HANDLE_W + 4}px`
  } else {
    roomPanel.style.right = ''
    roomPanel.style.left = `${HANDLE_W + 4}px`
  }
}

// ----- 캐릭터 들여보내기/내보내기 -----

function enterHome() {
  charHome = true
  char.commandStay() // FSM 정지 — 방 안에서 조용히 지낸다
  lastSentState = '' // inRoom 변화를 즉시 전송
}

function leaveHome() {
  charHome = false
  const r = handleRect()
  char.x = roomSide === 'right' ? canvas.width - 70 : 70
  char.y = Math.min(Math.max(world.bounds.minY, r.y + 60), world.bounds.maxY)
  char.state = 'idle'
  char.messages.push('!')
  lastSentState = ''
}

// ----- 2.5D 거실 렌더링 -----

const furnitureSprites = new Map<string, HTMLCanvasElement>()
function furnitureSprite(def: FurnitureDef): HTMLCanvasElement {
  let c = furnitureSprites.get(def.id)
  if (c) return c
  const w = Math.max(...def.map.map((row) => row.length))
  const h = def.map.length
  c = document.createElement('canvas')
  c.width = w
  c.height = h
  const cc = c.getContext('2d')!
  def.map.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = ROOM_PALETTE[row[x]]
      if (!color) continue
      cc.fillStyle = color
      cc.fillRect(x, y, 1, 1)
    }
  })
  furnitureSprites.set(def.id, c)
  return c
}

/** 편집 모드 히트테스트용 — 마지막 렌더의 가구 화면 영역 */
let sceneRects: Array<{ index: number; x: number; y: number; w: number; h: number }> = []
let roomSceneCanvas: HTMLCanvasElement | null = null

function roomDataOf(ownerId: string | null): RoomData {
  if (ownerId === null) return myRoom
  return normalizeRoomData(peers.peers.get(ownerId)?.roomInfo ?? null)
}

function drawRoomScene(c: HTMLCanvasElement, data: RoomData, ownerId: string | null) {
  const { w, h } = ROOM_SIZES[data.size]
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.imageSmoothingEnabled = false
  const theme = ROOM_THEMES[data.theme] ?? ROOM_THEMES[0]
  const wallH = Math.round(h * 0.52)
  const inset = Math.round(w * 0.1)

  // 뒷벽
  g.fillStyle = theme.wall
  g.fillRect(0, 0, w, wallH)
  // 걸레받이
  g.fillStyle = theme.wallShade
  g.fillRect(0, wallH - 4, w, 4)
  // 바닥 (원근 사다리꼴 — 옆 벽 그림자 쐐기로 2.5D 느낌)
  g.fillStyle = theme.floor
  g.fillRect(0, wallH, w, h - wallH)
  g.fillStyle = theme.floorShade
  g.beginPath()
  g.moveTo(0, h)
  g.lineTo(0, wallH)
  g.lineTo(inset, wallH)
  g.closePath()
  g.fill()
  g.beginPath()
  g.moveTo(w, h)
  g.lineTo(w, wallH)
  g.lineTo(w - inset, wallH)
  g.closePath()
  g.fill()
  // 바닥 널빤지 선 (뒤로 갈수록 촘촘 — 원근 강조)
  g.strokeStyle = theme.floorShade
  g.lineWidth = 1
  for (let i = 1; i <= 4; i++) {
    const t = (i / 5) ** 1.4
    const y = Math.round(wallH + t * (h - wallH)) + 0.5
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(w, y)
    g.stroke()
  }

  sceneRects = []
  const SCALE2 = 2

  // 벽 가구 (창문/시계/액자)
  data.furniture.forEach((f, index) => {
    const def = furnitureById(f.id)
    if (!def || def.kind !== 'wall') return
    const sp = furnitureSprite(def)
    const dw = sp.width * SCALE2
    const dh = sp.height * SCALE2
    const x = Math.round(f.x * (w - dw))
    const y = Math.round(Math.max(4, wallH * 0.42 - dh / 2))
    g.drawImage(sp, x, y, dw, dh)
    if (ownerId === null) sceneRects.push({ index, x, y, w: dw, h: dh })
  })

  // 바닥 가구 — 깊이순 정렬 후 그리기 (뒤에 있는 것 먼저)
  const floorItems = data.furniture
    .map((f, index) => ({ f, index, def: furnitureById(f.id) }))
    .filter((e): e is { f: PlacedFurniture; index: number; def: FurnitureDef } => !!e.def && e.def.kind === 'floor')
    .sort((a, b) => a.f.d - b.f.d)
  for (const { f, index, def } of floorItems) {
    const sp = furnitureSprite(def)
    const dw = sp.width * SCALE2
    const dh = sp.height * SCALE2
    const x = Math.round(f.x * (w - dw))
    const bottom = wallH + 6 + f.d * (h - wallH - 10)
    const y = Math.round(bottom - dh + 4)
    g.drawImage(sp, x, y, dw, dh)
    if (ownerId === null) sceneRects.push({ index, x, y, w: dw, h: dh })
  }

  // 방 주인 캐릭터 — 집에 있으면 거실 가운데쯤에 앉아 있다
  const ownerHome = ownerId === null ? charHome : (peers.peers.get(ownerId)?.inRoom ?? false)
  if (ownerHome) {
    const baked = ownerId === null ? frames : peerFrames(peers.peers.get(ownerId)?.look ?? null)
    const cw = SPRITE_W * 2
    const chh = SPRITE_H * 2
    const cx = Math.round(w * 0.62 - cw / 2)
    const bottom = wallH + 6 + 0.62 * (h - wallH - 10)
    g.drawImage(baked.sit.canvas, cx, Math.round(bottom - chh + 4), cw, chh)
  } else if (ownerId !== null) {
    g.font = '10px monospace'
    g.textAlign = 'center'
    g.fillStyle = 'rgba(255,255,255,0.45)'
    g.fillText('지금은 밖에 있어요', w / 2, h - 10)
  }
}

function renderCurrentScene() {
  if (!roomSceneCanvas) return
  drawRoomScene(roomSceneCanvas, roomDataOf(viewingRoom), viewingRoom)
}

// 편집 모드 — 방 안 가구를 드래그로 배치, 더블클릭으로 제거 (내 방에서만)
let furnitureDrag: { index: number } | null = null

function sceneHit(e: MouseEvent): number | null {
  if (!roomSceneCanvas) return null
  const rect = roomSceneCanvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  for (let i = sceneRects.length - 1; i >= 0; i--) {
    const r = sceneRects[i]
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return r.index
  }
  return null
}

function attachSceneEditing(c: HTMLCanvasElement) {
  c.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !roomEditMode || viewingRoom !== null) return
    const hit = sceneHit(e)
    if (hit !== null) furnitureDrag = { index: hit }
    e.stopPropagation() // 패널 세로 드래그로 번지지 않게
  })
  c.addEventListener('dblclick', (e) => {
    if (!roomEditMode || viewingRoom !== null) return
    const hit = sceneHit(e)
    if (hit === null) return
    myRoom.furniture.splice(hit, 1)
    roomChanged()
    buildRoom()
  })
  window.addEventListener('mousemove', (e) => {
    if (!furnitureDrag || !roomSceneCanvas) return
    const item = myRoom.furniture[furnitureDrag.index]
    const def = item && furnitureById(item.id)
    if (!item || !def) {
      furnitureDrag = null
      return
    }
    const rect = roomSceneCanvas.getBoundingClientRect()
    const { w, h } = ROOM_SIZES[myRoom.size]
    const wallH = h * 0.52
    item.x = Math.min(1, Math.max(0, (e.clientX - rect.left) / w))
    if (def.kind === 'floor') {
      item.d = Math.min(1, Math.max(0, (e.clientY - rect.top - wallH) / (h - wallH)))
    }
    renderCurrentScene()
  })
  window.addEventListener('mouseup', () => {
    if (furnitureDrag) {
      furnitureDrag = null
      roomChanged()
    }
  })
}

// ----- 그림판 (공유 화이트보드 — 버튼으로 여는 팝업) -----
// 획은 정규화 좌표로 저장/전송 → 모두가 같은 비율의 보드를 본다.
// 캔버스 요소는 한 번만 만들어 재사용 — 팝업을 닫아도 그림이 유지된다.

const WB_W = 260
const WB_H = 160
const BOARD_COLORS = ['#22242f', '#d95763', '#5b8bd9', '#5f9e54', '#e8c04a']
const BOARD_BG = '#fdfdf6'
const boardCanvas = document.createElement('canvas')
boardCanvas.className = 'r-board'
boardCanvas.width = WB_W
boardCanvas.height = WB_H
const boardCtx = boardCanvas.getContext('2d')!
let boardColor = 0 // BOARD_COLORS 인덱스, BOARD_COLORS.length = 지우개
let boardStroke: { x: number; y: number } | null = null
let pendingSegs: number[][] = []
let drawFlushAccum = 0

function clearBoard(broadcast: boolean) {
  boardCtx.fillStyle = BOARD_BG
  boardCtx.fillRect(0, 0, WB_W, WB_H)
  if (broadcast && roomCode && net.connected) net.sendDrawClear()
}
clearBoard(false)

function drawBoardSeg(x0: number, y0: number, x1: number, y1: number, colorIdx: number) {
  const eraser = colorIdx >= BOARD_COLORS.length || colorIdx < 0
  boardCtx.strokeStyle = eraser ? BOARD_BG : BOARD_COLORS[colorIdx]
  boardCtx.lineWidth = eraser ? 10 : 2
  boardCtx.lineCap = 'round'
  boardCtx.beginPath()
  boardCtx.moveTo(x0 * WB_W, y0 * WB_H)
  boardCtx.lineTo(x1 * WB_W, y1 * WB_H)
  boardCtx.stroke()
}

function boardPos(e: MouseEvent) {
  const rect = boardCanvas.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
  }
}

boardCanvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  boardStroke = boardPos(e)
  e.stopPropagation()
})
window.addEventListener('mousemove', (e) => {
  if (!boardStroke) return
  const p = boardPos(e)
  drawBoardSeg(boardStroke.x, boardStroke.y, p.x, p.y, boardColor)
  if (pendingSegs.length < 512) {
    pendingSegs.push([
      Math.round(boardStroke.x * 1000) / 1000,
      Math.round(boardStroke.y * 1000) / 1000,
      Math.round(p.x * 1000) / 1000,
      Math.round(p.y * 1000) / 1000,
      boardColor,
    ])
  }
  boardStroke = p
})
window.addEventListener('mouseup', () => {
  boardStroke = null
})

/** 그린 획을 0.15초 간격으로 묶어 전송 (relay의 초당 상한 안쪽) */
function flushBoard(dt: number) {
  drawFlushAccum += dt
  if (drawFlushAccum < 0.15) return
  drawFlushAccum = 0
  if (pendingSegs.length === 0) return
  if (roomCode && net.connected) net.sendDraw(pendingSegs.splice(0, 64))
  else pendingSegs.length = 0 // 혼자일 때는 로컬에만 그린다
}

function buildWb() {
  wbPanel.innerHTML = ''
  wbPanel.appendChild(el('div', 'w-title', '그림판'))
  wbPanel.appendChild(
    el('div', 'w-note', roomCode ? '같은 방 친구 모두가 함께 그려요' : '지금은 나만 보여요 (방에 참여하면 공유)'),
  )
  wbPanel.appendChild(boardCanvas)
  const tools = el('div', 'r-tools')
  BOARD_COLORS.forEach((color, idx) => {
    const sw = el('button', 'r-color' + (boardColor === idx ? ' active' : ''))
    sw.style.background = color
    sw.addEventListener('click', () => {
      boardColor = idx
      buildWb()
    })
    tools.appendChild(sw)
  })
  const eraser = el('button', 'r-color' + (boardColor === BOARD_COLORS.length ? ' active' : ''), 'E')
  eraser.style.background = BOARD_BG
  eraser.style.color = '#22242f'
  eraser.style.fontSize = '9px'
  eraser.addEventListener('click', () => {
    boardColor = BOARD_COLORS.length
    buildWb()
  })
  tools.appendChild(eraser)
  const clearBtn = el('button', 'w-btn', '지우기')
  clearBtn.style.marginLeft = 'auto'
  clearBtn.addEventListener('click', () => clearBoard(true))
  tools.appendChild(clearBtn)
  wbPanel.appendChild(tools)
  const close = el('div', 'item r-close', '닫기')
  close.addEventListener('click', closeWb)
  wbPanel.appendChild(close)
}

function openWb() {
  buildWb()
  wbOpen = true
  wbPanel.style.display = 'block'
  const side = roomSide === 'right' ? canvas.width - WB_W - 320 : 320
  wbPanel.style.left = `${Math.min(Math.max(8, side), canvas.width - WB_W - 30)}px`
  wbPanel.style.top = `${Math.max(8, Math.round(roomOffset * canvas.height) - 60)}px`
  bridge.setInteractive(true)
  interactive = true
}

function closeWb() {
  if (!wbOpen) return
  wbOpen = false
  wbPanel.style.display = 'none'
  if (world.cursor) syncInteractive(world.cursor)
}

// ----- 보드 (하이퍼링크 가능한 공유 목록 — 친구는 읽기 전용) -----

function buildBoardPanel() {
  boardPanel.innerHTML = ''
  const ownerPeer = boardOwner === null ? null : peers.peers.get(boardOwner)
  const mine = boardOwner === null
  boardPanel.appendChild(el('div', 'w-title', mine ? '보드' : `${ownerPeer?.name ?? '?'}의 보드`))
  boardPanel.appendChild(
    el('div', 'w-note', mine ? '방에 함께 있는 친구가 볼 수 있어요 (링크 첨부 가능)' : '읽기 전용'),
  )
  const data = mine ? myRoom : roomDataOf(boardOwner)
  const list = el('div', 't-list')
  for (const item of data.board) {
    const row = el('div', 't-row')
    if (item.url) {
      const a = el('a', 'b-link', item.text)
      a.title = item.url
      const url = item.url
      a.addEventListener('click', () => bridge.openLink(url))
      row.appendChild(a)
    } else {
      row.appendChild(el('span', 't-text', item.text))
    }
    if (mine) {
      const del = el('button', 't-del', '×')
      del.addEventListener('click', () => {
        myRoom.board = myRoom.board.filter((b) => b !== item)
        roomChanged()
        buildBoardPanel()
      })
      row.appendChild(del)
    }
    list.appendChild(row)
  }
  if (data.board.length === 0) list.appendChild(el('div', 'w-note', '아직 아무것도 없어요'))
  boardPanel.appendChild(list)

  if (mine) {
    const textRow = el('div', 'w-row')
    const textInput = document.createElement('input')
    textInput.className = 'w-input'
    textInput.maxLength = 80
    textInput.placeholder = '내용'
    textRow.appendChild(textInput)
    boardPanel.appendChild(textRow)
    const urlRow = el('div', 'w-row')
    const urlInput = document.createElement('input')
    urlInput.className = 'w-input'
    urlInput.placeholder = '링크 (선택, https://…)'
    urlRow.appendChild(urlInput)
    const addBtn = el('button', 'w-btn', '+')
    const add = () => {
      const text = textInput.value.trim()
      if (!text || myRoom.board.length >= MAX_BOARD_ITEMS) return
      const url = urlInput.value.trim()
      const item: BoardItem = { text: text.slice(0, 80) }
      if (/^https?:\/\//i.test(url)) item.url = url.slice(0, 500)
      myRoom.board.push(item)
      roomChanged()
      buildBoardPanel()
      const next = boardPanel.querySelector('input')
      if (next) (next as HTMLInputElement).focus()
    }
    addBtn.addEventListener('click', add)
    for (const input of [textInput, urlInput]) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') add()
        e.stopPropagation()
      })
    }
    urlRow.appendChild(addBtn)
    boardPanel.appendChild(urlRow)
  }

  const close = el('div', 'item r-close', '닫기')
  close.addEventListener('click', closeBoardPanel)
  boardPanel.appendChild(close)
}

function openBoardPanel(owner: string | null) {
  boardOwner = owner
  buildBoardPanel()
  boardOpen = true
  boardPanel.style.display = 'block'
  const side = roomSide === 'right' ? canvas.width - 560 : 300
  boardPanel.style.left = `${Math.min(Math.max(8, side), canvas.width - 260)}px`
  boardPanel.style.top = `${Math.min(Math.max(8, Math.round(roomOffset * canvas.height) + 40), canvas.height - 260)}px`
  bridge.setInteractive(true)
  interactive = true
}

function closeBoardPanel() {
  if (!boardOpen) return
  boardOpen = false
  boardPanel.style.display = 'none'
  if (world.cursor) syncInteractive(world.cursor)
}

// ----- 방 패널 UI -----

function buildRoom() {
  roomPanel.innerHTML = ''
  const mine = viewingRoom === null
  const ownerPeer = mine ? null : peers.peers.get(viewingRoom!)
  const data = roomDataOf(viewingRoom)
  roomPanel.style.width = `${ROOM_SIZES[data.size].w + 22}px`

  roomPanel.appendChild(el('div', 'w-title', mine ? '내 방' : `${ownerPeer?.name ?? '?'}의 방`))

  // 2.5D 거실 장면
  const scene = document.createElement('canvas')
  scene.className = 'r-scene-canvas' + (roomEditMode && mine ? ' editing' : '')
  roomSceneCanvas = scene
  drawRoomScene(scene, data, viewingRoom)
  attachSceneEditing(scene)
  roomPanel.appendChild(scene)

  // 버튼 줄 — 그림판/보드 + (내 방) 꾸미기·들여보내기
  const btns = el('div', 'r-btns')
  const wbBtn = el('button', 'w-btn', '그림판')
  wbBtn.addEventListener('click', openWb)
  btns.appendChild(wbBtn)
  const boardBtn = el('button', 'w-btn', '보드')
  boardBtn.addEventListener('click', () => openBoardPanel(viewingRoom))
  btns.appendChild(boardBtn)
  if (mine) {
    const editBtn = el('button', 'w-btn' + (roomEditMode ? ' r-active' : ''), '꾸미기')
    editBtn.addEventListener('click', () => {
      roomEditMode = !roomEditMode
      buildRoom()
    })
    btns.appendChild(editBtn)
    const homeBtn = el('button', 'w-btn', charHome ? '내보내기' : '들여보내기')
    homeBtn.addEventListener('click', () => {
      if (charHome) leaveHome()
      else enterHome()
      roomChanged()
      buildRoom()
    })
    btns.appendChild(homeBtn)
  }
  roomPanel.appendChild(btns)

  // 꾸미기 모드 — 테마/크기/가구/방 위치
  if (mine && roomEditMode) {
    roomPanel.appendChild(el('div', 'w-note', '가구는 방 안에서 드래그로 이동, 더블클릭으로 제거'))

    const themeRow = el('div', 'w-row')
    themeRow.appendChild(el('span', '', '테마'))
    ROOM_THEMES.forEach((t, idx) => {
      const sw = el('button', 'swatch' + (data.theme === idx ? ' active' : ''))
      sw.style.background = t.wall
      sw.title = t.name
      sw.addEventListener('click', () => {
        myRoom.theme = idx
        roomChanged()
        buildRoom()
      })
      themeRow.appendChild(sw)
    })
    roomPanel.appendChild(themeRow)

    const sizeRow = el('div', 'w-row')
    sizeRow.appendChild(el('span', '', '크기'))
    for (const key of ['S', 'M', 'L'] as RoomSize[]) {
      const b = el('button', 'w-btn' + (data.size === key ? ' r-active' : ''), ROOM_SIZES[key].label)
      b.addEventListener('click', () => {
        myRoom.size = key
        roomChanged()
        buildRoom()
        positionRoomPanel()
      })
      sizeRow.appendChild(b)
    }
    roomPanel.appendChild(sizeRow)

    const furnRow = el('div', 'r-furnrow')
    for (const def of FURNITURE) {
      const b = el('button', 'w-btn', `+${def.name}`)
      b.addEventListener('click', () => {
        if (myRoom.furniture.length >= MAX_FURNITURE) return
        myRoom.furniture.push({ id: def.id, x: 0.5, d: def.kind === 'wall' ? 0 : 0.5 })
        roomChanged()
        buildRoom()
      })
      furnRow.appendChild(b)
    }
    roomPanel.appendChild(furnRow)

    const sideBtn = el(
      'div',
      'item r-close',
      roomSide === 'right' ? '방을 왼쪽 가장자리로' : '방을 오른쪽 가장자리로',
    )
    sideBtn.addEventListener('click', () => {
      roomSide = roomSide === 'right' ? 'left' : 'right'
      saveRoomNow()
      positionEdgeHandle()
      positionRoomPanel()
    })
    roomPanel.appendChild(sideBtn)
  }

  const close = el('div', 'item r-close', '닫기')
  close.addEventListener('click', closeRoom)
  roomPanel.appendChild(close)
}

function openRoomFor(owner: string | null) {
  viewingRoom = owner
  if (owner !== null) roomEditMode = false
  buildRoom()
  roomOpen = true
  roomPanel.style.display = 'block'
  positionRoomPanel()
  bridge.setInteractive(true)
  interactive = true
}

function closeRoom() {
  if (!roomOpen) return
  roomOpen = false
  roomEditMode = false
  roomPanel.style.display = 'none'
  handleHoverLock = true // 핸들 위에서 닫았을 때 즉시 재오픈 방지 (커서가 벗어나면 해제)
  if (world.cursor) syncInteractive(world.cursor)
}

// 방 패널이 열려 있을 때도 빈 영역을 잡고 위아래로 끌면 방(과 핸들) 위치가 움직인다
let roomPanelDrag: { startY: number; startOffset: number } | null = null
roomPanel.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  const target = e.target as HTMLElement
  if (target.closest('button, input, a, canvas, .item, .swatch, .r-color, .t-del')) return
  roomPanelDrag = { startY: e.clientY, startOffset: roomOffset }
  e.preventDefault()
})
window.addEventListener('mousemove', (e) => {
  if (!roomPanelDrag) return
  const dy = e.clientY - roomPanelDrag.startY
  roomOffset = Math.min(0.92, Math.max(0, roomPanelDrag.startOffset + dy / (canvas.height - HANDLE_H)))
  positionEdgeHandle()
  positionRoomPanel()
})
window.addEventListener('mouseup', () => {
  if (roomPanelDrag) {
    roomPanelDrag = null
    saveRoomNow()
  }
})

// 핸들 드래그 — 세로 위치 조정 (클릭만 하면 열기)
let handleDrag: { startY: number; startOffset: number; moved: boolean } | null = null
edgeHandle.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  handleDrag = { startY: e.clientY, startOffset: roomOffset, moved: false }
  e.preventDefault()
  e.stopPropagation()
})
window.addEventListener('mousemove', (e) => {
  if (!handleDrag) return
  const dy = e.clientY - handleDrag.startY
  if (Math.abs(dy) > 6) handleDrag.moved = true
  if (handleDrag.moved) {
    roomOffset = Math.min(0.92, Math.max(0, handleDrag.startOffset + dy / (canvas.height - HANDLE_H)))
    positionEdgeHandle()
    if (roomOpen) positionRoomPanel()
  }
})
window.addEventListener('mouseup', () => {
  if (!handleDrag) return
  if (handleDrag.moved) saveRoomNow()
  else openRoomFor(null) // 드래그 없이 클릭 → 내 방 열기
  handleDrag = null
})
edgeHandle.addEventListener('mouseenter', () => {
  if (!handleHoverLock && !roomOpen) openRoomFor(null) // 삼성 엣지패널처럼 호버로도 열림
})

// 방 데이터 전송(디바운스) + 열려 있는 동안 1초마다 장면/핸들 갱신
let roomRefreshAccum = 0
function tickRoom(dt: number) {
  flushBoard(dt)
  if (roomSyncDirty) {
    roomSyncTimer += dt
    if (roomSyncTimer >= 0.5) {
      roomSyncDirty = false
      roomSyncTimer = 0
      if (roomCode && net.connected) net.sendRoomInfo(myRoom)
    }
  }
  roomRefreshAccum += dt
  if (roomRefreshAccum >= 1) {
    roomRefreshAccum = 0
    refreshPeerHandles()
    if (roomOpen) renderCurrentScene()
  }
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
  const nameSaveBtn = el('button', 'w-btn', '저장')
  nameRow.appendChild(nameSaveBtn)
  mp.appendChild(nameRow)

  // 상태 메시지 — "회의 중", "점심 먹는 중" 같은 한 줄 (친구 캐릭터 이름표 아래 표시)
  const stRow = el('div', 'w-row')
  stRow.appendChild(el('span', '', '상태'))
  const stInput = document.createElement('input')
  stInput.className = 'w-input'
  stInput.maxLength = 40
  stInput.placeholder = '상태 메시지 (예: 회의 중)'
  stInput.value = statusMsg
  stRow.appendChild(stInput)
  mp.appendChild(stRow)

  const svRow = el('div', 'w-row')
  svRow.appendChild(el('span', '', '참여 서버'))
  const svInput = document.createElement('input')
  svInput.className = 'w-input'
  svInput.value = serverUrl
  svRow.appendChild(svInput)
  mp.appendChild(svRow)

  // 이름/상태는 방에 있는 동안에도 바꿀 수 있다 - 바뀌면 같은 방의 다른 사람에게도 바로 알린다.
  const saveMpLocal = () => {
    const newName = nameInput.value.trim() || '친구'
    const renamed = newName !== playerName
    const newStatus = stInput.value.trim().slice(0, 40)
    const statusChanged = newStatus !== statusMsg
    playerName = newName
    statusMsg = newStatus
    serverUrl = svInput.value.trim() || serverUrl
    bridge.saveMp({ playerName, serverUrl, statusMsg })
    if (renamed && roomCode && net.connected) net.sendRename(playerName)
    if (statusChanged && roomCode && net.connected) net.sendStatus(statusMsg)
  }
  stInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveMpLocal()
      refreshMpPanel()
    }
  })
  nameSaveBtn.addEventListener('click', () => {
    saveMpLocal()
    refreshMpPanel()
  })
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveMpLocal()
      refreshMpPanel()
    }
  })

  if (!roomCode) {
    const btnRow = el('div', 'w-row')
    const createBtn = el('button', 'w-btn', '방 만들기 (내 PC가 호스트)')
    createBtn.addEventListener('click', async () => {
      saveMpLocal()
      netNotice = '호스트 시작 중…'
      refreshMpPanel()
      // 서버가 앱에 내장 — 별도 실행 없이 여기서 바로 띄운다
      const relay = await bridge.ensureRelay()
      if (!relay.ok) {
        netNotice = `호스트 시작 실패: ${relay.error ?? '?'}`
        refreshMpPanel()
        return
      }
      hosting = true
      hostIps = relay.ips ?? []
      activeUrl = `ws://127.0.0.1:${relay.port}`
      net.connectAnd(activeUrl, null, playerName, look)
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
      activeUrl = serverUrl
      net.connectAnd(activeUrl, code, playerName, look)
    })
    joinRow.appendChild(joinBtn)
    mp.appendChild(joinRow)
  } else {
    const codeRow = el('div', 'w-row')
    codeRow.appendChild(el('span', '', '코드'))
    codeRow.appendChild(el('b', 'w-code', roomCode))
    mp.appendChild(codeRow)
    if (hosting) {
      mp.appendChild(el('div', 'w-note', '코드와 함께 아래 서버 주소를 친구에게 알려주세요:'))
      const addrs = hostIps.length > 0 ? hostIps : ['<내 IP를 확인해 주세요>']
      for (const ip of addrs) {
        mp.appendChild(el('div', 'w-note w-addr', `ws://${ip}:8787`))
      }
      mp.appendChild(
        el(
          'div',
          'w-note',
          '같은 와이파이면 위 주소 그대로, 다른 곳이면 Tailscale IP 또는 터널 주소 사용 (README 참고)',
        ),
      )
    } else {
      mp.appendChild(el('div', 'w-note', '이 코드를 친구에게 알려주면 참여할 수 있어요'))
    }

    // 함께 있는 사람 — 프레즌스(●)와 상태 메시지를 함께 (Discord 멤버 목록 느낌)
    const PRESENCE_LABEL: Record<string, string> = { focus: '집중 중', away: '자리 비움', online: '' }
    const meLine = el('div', 'w-note')
    meLine.textContent = `● ${playerName} (나)${statusMsg ? ' — ' + statusMsg : ''}`
    meLine.style.color = currentPresence() === 'focus' ? '#ffd76a' : currentPresence() === 'away' ? '#666d8c' : '#7ec46a'
    mp.appendChild(el('div', 'w-note', '함께 있는 사람:'))
    mp.appendChild(meLine)
    for (const p of peers.peers.values()) {
      const line = el('div', 'w-note')
      const presence = PRESENCE_LABEL[p.presence] ? ` [${PRESENCE_LABEL[p.presence]}]` : ''
      line.textContent = `● ${p.name}${presence}${p.status ? ' — ' + p.status : ''}`
      line.style.color = p.presence === 'focus' ? '#ffd76a' : p.presence === 'away' ? '#666d8c' : '#7ec46a'
      mp.appendChild(line)
    }

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

// ---------- 화면 엿보기 (Phase 4) — WebRTC P2P ----------
// 흐름: 상대 캐릭터 우클릭 → 요청 → 상대의 명시적 승인 → 승인 후에는 상대
// 캐릭터에 마우스를 올리는 동안만 화면이 보인다 (벗어나면 송출 일시정지).
// 프라이버시: 공유 중 상시 표시, 시청 시작 알림, 언제든 원클릭 중지.

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

// 화면 엿보기는 전체 화면이 아니라 "내 캐릭터가 있는 위치 주변"만 잘라서 보낸다.
// 원본 캡처(shareStream)는 로컬에만 머물고, WebRTC로는 잘라낸 작은 캔버스의
// 스트림만 나간다 — 대역폭도 줄고 상대 화면 전체가 노출되지 않는다.
const CROP_OUT_W = 320
const CROP_OUT_H = 220
const CROP_FRAC = 0.24 // 캐릭터를 중심으로 원본 화면의 이 비율(가로 기준)만큼만 잘라낸다

const peeksWrap = document.getElementById('peeks') as HTMLDivElement
const peekReq = document.getElementById('peekreq') as HTMLDivElement

// --- 보는 쪽 (viewer) ---
interface PeekView {
  pc: RTCPeerConnection | null
  frame: HTMLDivElement
  video: HTMLVideoElement
  granted: boolean
}
const peekViews = new Map<string, PeekView>()
let peekPendingTo: string | null = null
let hoveredPeekId: string | null = null

// --- 보여주는 쪽 (sender) ---
interface ShareOut {
  pc: RTCPeerConnection
  track: MediaStreamTrack
  name: string
  notified: boolean
}
const shares = new Map<string, ShareOut>()
let shareStream: MediaStream | null = null
let shareVideo: HTMLVideoElement | null = null
let cropCanvas: HTMLCanvasElement | null = null
let cropCtx: CanvasRenderingContext2D | null = null
let cropStream: MediaStream | null = null
let peekAsk: { id: string; name: string } | null = null

function requestPeek(peerId: string) {
  if (peekPendingTo || peekViews.has(peerId)) return
  peekPendingTo = peerId
  net.sendPeek('peek-request', peerId)
  pushLog('알림', '화면 보기를 요청했어요 — 상대의 승인을 기다리는 중')
}

function ensurePeekView(peerId: string): PeekView {
  let view = peekViews.get(peerId)
  if (view) return view
  const frame = document.createElement('div')
  frame.className = 'peekframe'
  const video = document.createElement('video')
  video.autoplay = true
  video.muted = true
  const label = document.createElement('div')
  label.className = 'peeklabel'
  label.textContent = peers.peers.get(peerId)?.name ?? '?'
  frame.appendChild(video)
  frame.appendChild(label)
  peeksWrap.appendChild(frame)
  view = { pc: null, frame, video, granted: false }
  peekViews.set(peerId, view)
  return view
}

function cleanupPeekView(peerId: string) {
  const view = peekViews.get(peerId)
  if (!view) return
  view.pc?.close()
  view.frame.remove()
  peekViews.delete(peerId)
  if (hoveredPeekId === peerId) hoveredPeekId = null
  if (peekPendingTo === peerId) peekPendingTo = null
}

/** 보기 중지 (viewer가 스스로) — 상대에게도 알려 세션을 닫게 한다 */
function stopViewing(peerId: string) {
  net.sendPeek('peek-revoke', peerId)
  cleanupPeekView(peerId)
}

/** 화면 캡처 + 크롭 캔버스를 (없으면) 준비하고 크롭된 스트림을 반환한다. 여러
 * 시청자가 있어도 원본 캡처와 크롭 캔버스는 하나만 유지한다 — 다 같은 위치를 본다. */
async function ensureCropStream(): Promise<MediaStream> {
  if (cropStream) return cropStream
  shareStream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 8 }, // 크롭 전이라 해상도를 제한하지 않는다 — 잘라낸 결과만 전송되므로 대역폭 걱정 없음
    audio: false,
  })
  shareVideo = document.createElement('video')
  shareVideo.autoplay = true
  shareVideo.muted = true
  shareVideo.srcObject = shareStream
  await shareVideo.play().catch(() => undefined)
  cropCanvas = document.createElement('canvas')
  cropCanvas.width = CROP_OUT_W
  cropCanvas.height = CROP_OUT_H
  cropCtx = cropCanvas.getContext('2d')
  cropStream = cropCanvas.captureStream(8)
  return cropStream
}

/** 캐릭터의 화면상 위치(정규화)를 기준으로 원본 캡처에서 주변 영역만 크롭 캔버스에 그린다 */
function updateShareCrop() {
  if (!cropCtx || !shareVideo || !shareVideo.videoWidth || !canvas.width || !canvas.height) return
  const vw = shareVideo.videoWidth
  const vh = shareVideo.videoHeight
  const normX = char.x / canvas.width
  const normY = char.y / canvas.height
  const cw = vw * CROP_FRAC
  const ch = cw * (CROP_OUT_H / CROP_OUT_W)
  const sx = Math.min(Math.max(0, normX * vw - cw / 2), Math.max(0, vw - cw))
  const sy = Math.min(Math.max(0, normY * vh - ch / 2), Math.max(0, vh - ch))
  cropCtx.drawImage(shareVideo, sx, sy, cw, ch, 0, 0, CROP_OUT_W, CROP_OUT_H)
}

async function grantPeek(viewerId: string, viewerName: string) {
  let stream: MediaStream
  try {
    stream = await ensureCropStream()
  } catch {
    net.sendPeek('peek-deny', viewerId)
    pushLog('알림', '화면 캡처를 시작하지 못했어요')
    return
  }
  const base = stream.getVideoTracks()[0]
  const track = base.clone()
  track.enabled = false // 상대가 hover하기 전까지 송출 정지
  const pc = new RTCPeerConnection(RTC_CONFIG)
  pc.addTrack(track, stream)
  pc.onicecandidate = (e) => {
    if (e.candidate) net.sendPeek('rtc', viewerId, { payload: { ice: e.candidate.toJSON() } })
  }
  shares.set(viewerId, { pc, track, name: viewerName, notified: false })
  net.sendPeek('peek-grant', viewerId)
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  net.sendPeek('rtc', viewerId, { payload: { sdp: pc.localDescription } })
  pushLog('알림', `${viewerName} 님에게 화면 공유를 시작했어요 (캐릭터 메뉴에서 중지 가능)`)
}

function closeShare(viewerId: string) {
  const share = shares.get(viewerId)
  if (!share) return
  share.pc.close()
  share.track.stop()
  shares.delete(viewerId)
  if (shares.size === 0) {
    if (cropStream) for (const t of cropStream.getTracks()) t.stop()
    if (shareStream) for (const t of shareStream.getTracks()) t.stop()
    cropStream = null
    shareStream = null
    if (shareVideo) shareVideo.srcObject = null
    shareVideo = null
    cropCanvas = null
    cropCtx = null
  }
}

function revokeAllShares() {
  for (const viewerId of [...shares.keys()]) {
    net.sendPeek('peek-revoke', viewerId)
    closeShare(viewerId)
  }
}

function cleanupAllPeeks() {
  for (const id of [...peekViews.keys()]) cleanupPeekView(id)
  for (const id of [...shares.keys()]) closeShare(id)
  peekPendingTo = null
  peekAsk = null
  peekReq.style.display = 'none'
}

function showPeekAsk(id: string, name: string) {
  peekAsk = { id, name }
  peekReq.innerHTML = ''
  peekReq.appendChild(el('div', 'w-title', '화면 보기 요청'))
  peekReq.appendChild(el('div', 'w-note', `${name} 님이 내 화면을 보고 싶어해요.`))
  peekReq.appendChild(
    el(
      'div',
      'w-note',
      '허용하면 상대가 내 캐릭터에 마우스를 올린 동안 내 캐릭터 주변 화면 일부만 보여요 (화면 전체가 아니에요). 공유 중에는 캐릭터에 ● 표시가 뜨고, 언제든 중지할 수 있어요.',
    ),
  )
  const row = el('div', 'w-row')
  const allow = el('button', 'w-btn', '허용')
  allow.addEventListener('click', () => {
    peekReq.style.display = 'none'
    if (peekAsk) grantPeek(peekAsk.id, peekAsk.name)
    peekAsk = null
    if (world.cursor) syncInteractive(world.cursor)
  })
  const deny = el('button', 'w-btn', '거절')
  deny.addEventListener('click', () => {
    peekReq.style.display = 'none'
    if (peekAsk) net.sendPeek('peek-deny', peekAsk.id)
    peekAsk = null
    if (world.cursor) syncInteractive(world.cursor)
  })
  row.appendChild(allow)
  row.appendChild(deny)
  peekReq.appendChild(row)
  peekReq.style.display = 'block'
  peekReq.style.left = `${Math.min(Math.max(8, char.x - 130), canvas.width - 290)}px`
  peekReq.style.top = `${Math.min(Math.max(8, char.y - H - 170), canvas.height - 200)}px`
  bridge.setInteractive(true)
  interactive = true
}

async function handlePeekSignal(
  type: PeekSignalType,
  from: string,
  name: string,
  watching?: boolean,
  payload?: unknown,
) {
  switch (type) {
    case 'peek-request':
      showPeekAsk(from, name)
      break
    case 'peek-grant': {
      if (peekPendingTo === from) peekPendingTo = null
      const view = ensurePeekView(from)
      view.granted = true
      pushLog('알림', `${name} 님이 화면 보기를 허용했어요 — 캐릭터에 마우스를 올려 보세요`)
      char.messages.push('!')
      break
    }
    case 'peek-deny':
      if (peekPendingTo === from) peekPendingTo = null
      pushLog('알림', `${name} 님이 화면 보기를 거절했어요`)
      char.messages.push('…')
      break
    case 'peek-revoke':
      // 상대가 공유를 중지했거나 (sender), 시청자가 그만 보기로 함 (viewer)
      cleanupPeekView(from)
      closeShare(from)
      break
    case 'peek-watch': {
      const share = shares.get(from)
      if (!share) return
      share.track.enabled = watching === true
      if (watching && !share.notified) {
        share.notified = true
        pushLog('알림', `${share.name} 님이 지금 내 화면을 보고 있어요`)
        char.messages.push('!')
      }
      break
    }
    case 'rtc': {
      const data = payload as { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit }
      if (!data) return
      // sender 쪽: answer/ICE 수신
      const share = shares.get(from)
      if (share && data.sdp?.type === 'answer') {
        await share.pc.setRemoteDescription(data.sdp)
        return
      }
      if (share && data.ice) {
        await share.pc.addIceCandidate(data.ice).catch(() => undefined)
        return
      }
      // viewer 쪽: offer/ICE 수신
      const view = ensurePeekView(from)
      if (data.sdp?.type === 'offer') {
        const pc = new RTCPeerConnection(RTC_CONFIG)
        view.pc = pc
        pc.ontrack = (e) => {
          view.video.srcObject = e.streams[0] ?? new MediaStream([e.track])
        }
        pc.onicecandidate = (e) => {
          if (e.candidate) net.sendPeek('rtc', from, { payload: { ice: e.candidate.toJSON() } })
        }
        await pc.setRemoteDescription(data.sdp)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        net.sendPeek('rtc', from, { payload: { sdp: pc.localDescription } })
      } else if (data.ice && view.pc) {
        await view.pc.addIceCandidate(data.ice).catch(() => undefined)
      }
      break
    }
  }
}

/** 커서가 어느 친구 캐릭터 스프라이트 위에 있는지 (바운딩 박스) */
function peerAt(px: number, py: number): Peer | null {
  for (const peer of peers.peers.values()) {
    if (!peer.hasState || Number.isNaN(peer.x) || peer.inRoom) continue
    if (px >= peer.x - W / 2 && px <= peer.x + W / 2 && py >= peer.y - H && py <= peer.y) {
      return peer
    }
  }
  return null
}

/** hover 상태 변화 → 시청 시작/정지 신호 + 액자 표시 */
function updatePeekHover(cursor: { x: number; y: number }) {
  const over = peerAt(cursor.x, cursor.y)
  const id = over?.id ?? null
  if (id === hoveredPeekId) return
  if (hoveredPeekId) {
    const prev = peekViews.get(hoveredPeekId)
    if (prev?.granted) {
      net.sendPeek('peek-watch', hoveredPeekId, { watching: false })
      prev.frame.style.display = 'none'
    }
  }
  hoveredPeekId = id
  if (id) {
    const view = peekViews.get(id)
    if (view?.granted) {
      net.sendPeek('peek-watch', id, { watching: true })
      view.frame.style.display = 'block'
    }
  }
}

/** 액자 위치를 피어 캐릭터 위에 유지 */
function updatePeekFrames() {
  if (!hoveredPeekId) return
  const view = peekViews.get(hoveredPeekId)
  const peer = peers.peers.get(hoveredPeekId)
  if (!view || !peer || view.frame.style.display === 'none') return
  const fw = view.frame.offsetWidth || 264
  const fh = view.frame.offsetHeight || 170
  view.frame.style.left = `${Math.min(Math.max(4, peer.x - fw / 2), canvas.width - fw - 4)}px`
  view.frame.style.top = `${Math.max(4, peer.y - H - fh - 10)}px`
}

// ---------- 이모트 (텍스트 박스 없이 심볼만) ----------

let emoteText: string | null = null
let emoteTimer = 0
const EMOTE_TIME = 1.8

function updateEmote(dt: number) {
  if (emoteTimer <= 0 && char.messages.length > 0) {
    emoteText = char.messages.shift()!
    emoteTimer = EMOTE_TIME
    if (roomCode && net.connected) net.sendEmote(emoteText)
  }
  if (emoteTimer > 0) {
    emoteTimer -= dt
    if (emoteTimer <= 0) emoteText = null
  }
}

function drawEmoteSymbol(text: string, x: number, y: number, remain: number) {
  const t = 1 - remain / EMOTE_TIME
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
  ctx.strokeText(text, x, y - rise)
  ctx.fillText(text, x, y - rise)
  ctx.restore()
}

function drawPeerEmotes(dt: number) {
  for (const [id, e] of peerEmotes) {
    e.timer -= dt
    const peer = peers.peers.get(id)
    if (e.timer <= 0 || !peer || !peer.hasState) {
      peerEmotes.delete(id)
      continue
    }
    drawEmoteSymbol(e.text, peer.x, peer.y - H - 8, e.timer)
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
    case 'walk': {
      // 디딤 → 지나감 → 디딤(반대) → 지나감: 상하 바운스 + 팔 스윙이 있는 4프레임 보행
      const seq: FrameName[] = ['walkA', 'walkMid', 'walkB', 'walkMid']
      return frames[seq[Math.floor(animTime * 9) % 4]]
    }
    case 'run': {
      // 디딤 → 공중 → 디딤(반대) → 공중: 전용 달리기 사이클 (전경 자세)
      const seq: FrameName[] = ['runA', 'runMid', 'runB', 'runMid']
      return frames[seq[Math.floor(animTime * 14) % 4]]
    }
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
    case 'walk': {
      const seq: FrameName[] = ['walkA', 'walkMid', 'walkB', 'walkMid']
      return baked[seq[Math.floor(animTime * 9) % 4]]
    }
    case 'run': {
      const seq: FrameName[] = ['runA', 'runMid', 'runB', 'runMid']
      return baked[seq[Math.floor(animTime * 14) % 4]]
    }
    default:
      return baked.idle
  }
}

function drawPeer(peer: Peer) {
  if (!peer.hasState || Number.isNaN(peer.x)) return
  if (peer.inRoom) return // 방에 들어간 친구는 방 패널 풍경에 나온다
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
  // 이름표 (발 아래). 보간된 peer.x/y는 소수점 좌표라 그대로 그리면 매 프레임
  // 서브픽셀 위치가 흔들려 흐릿하게 보인다 - 정수 좌표로 스냅해서 크게 그린다.
  ctx.save()
  ctx.font = 'bold 10px monospace'
  ctx.textAlign = 'center'
  ctx.lineWidth = 2
  ctx.strokeStyle = '#22242f'
  ctx.fillStyle = '#e8e9f5'
  const nameX = Math.round(peer.x)
  const nameY = Math.round(peer.y + 12)
  ctx.strokeText(peer.name, nameX, nameY)
  ctx.fillText(peer.name, nameX, nameY)
  // 프레즌스 점 — 이름 왼쪽 (집중=노랑, 자리비움=회색, 온라인=초록)
  const dotColor = peer.presence === 'focus' ? '#ffd76a' : peer.presence === 'away' ? '#666d8c' : '#7ec46a'
  const nameW = ctx.measureText(peer.name).width
  ctx.fillStyle = dotColor
  ctx.fillRect(nameX - nameW / 2 - 8, nameY - 7, 5, 5)
  // 상태 메시지 — 이름 아래 한 줄, 은은하게
  if (peer.status) {
    ctx.font = '9px monospace'
    ctx.lineWidth = 2
    const st = peer.status.length > 24 ? peer.status.slice(0, 23) + '…' : peer.status
    ctx.strokeText(st, nameX, nameY + 11)
    ctx.fillStyle = '#aab0cc'
    ctx.fillText(st, nameX, nameY + 11)
  }
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
  drawPeerEmotes(dtForDraw)

  // 내 캐릭터가 방(집)에 들어가 있으면 바탕화면에는 그리지 않는다 —
  // 방 패널 풍경에 나온다. 화면 공유 중 표시는 프라이버시 원칙상 항상 유지.
  if (charHome) {
    drawSharesIndicator(70, 26)
    return
  }

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
  drawPickup()
  drawFocusChip()
  drawSharesIndicator(char.x - W / 2 - 6, char.y - H + 4)
}

/** 화면 공유 중 상시 표시 — 몰래 공유되는 일이 없도록 (프라이버시 원칙).
 * 평소에는 캐릭터 옆, 캐릭터가 방에 들어가 있으면 화면 구석에 고정 표시 */
function drawSharesIndicator(x: number, y: number) {
  if (shares.size === 0) return
  const live = [...shares.values()].some((s) => s.track.enabled)
  const blink = Math.floor(animTime * 2) % 2 === 0
  ctx.save()
  ctx.fillStyle = blink ? '#ff4d5e' : '#b32836'
  ctx.beginPath()
  ctx.arc(x, y, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = 'bold 10px monospace'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ff8b96'
  ctx.fillText(live ? 'LIVE' : '공유중', x + 4, y + 16)
  ctx.restore()
}

// ---------- 패널 드래그 이동 ----------
// 모든 픽셀 패널(옷장/앨범/할일/친구들/기록/채팅/승인)은 빈 영역(제목·배경)을
// 잡고 끌어 원하는 자리에 둘 수 있다. 버튼/입력/목록 같은 조작 요소 위에서는
// 드래그가 시작되지 않는다.

function makeDraggable(panel: HTMLElement) {
  let drag: { dx: number; dy: number } | null = null
  panel.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button, input, .item, .swatch, .a-cell, .w-addr, .h-list, .t-list')) return
    drag = { dx: e.clientX - panel.offsetLeft, dy: e.clientY - panel.offsetTop }
    e.preventDefault()
  })
  window.addEventListener('mousemove', (e) => {
    if (!drag) return
    // 최소 40px은 화면 안에 남겨 패널을 잃어버리지 않게
    panel.style.left = `${Math.min(Math.max(40 - panel.offsetWidth, e.clientX - drag.dx), canvas.width - 40)}px`
    panel.style.top = `${Math.min(Math.max(0, e.clientY - drag.dy), canvas.height - 30)}px`
  })
  window.addEventListener('mouseup', () => {
    drag = null
  })
}

for (const panel of [wardrobe, albumPanel, todoPanel, mp, history, chatWrap, peekReq, wbPanel, boardPanel]) {
  makeDraggable(panel)
}

let dtForDraw = 0

let last = performance.now()
let lastPollActive = false

function loop(now: number) {
  // now가 이전 last보다 작게 들어오는 경우가 실제로 있다(첫 rAF 프레임의
  // 타임스탬프가 performance.now()보다 앞서는 브라우저/Electron 타이밍 케이스).
  // dt가 음수면 animTime이 음수가 되고, walk/run 프레임 인덱스(음수 % 4)가
  // 배열 밖(-1 등)을 가리켜 frames[undefined] → 렌더러 크래시로 이어진다.
  const dt = Math.max(0, Math.min((now - last) / 1000, 0.1))
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
  handleCharEvents(dt)
  tickFocus(dt)
  tickHourlyChime()
  tickRoom(dt)

  // 멀티플레이: 피어 보간, 상태 전송, 말풍선 위치, 다가가서 인사
  tickReconnect(dt)
  if (roomCode) {
    peers.tick(dt, canvas.width, canvas.height)
    maybeSendState(dt)
    maybeSendPresence()
    greetCooldown -= dt
    if (greetCooldown <= 0) {
      greetCooldown = 5
      // 화면 안에 친구가 있으면 가끔 다가가 인사 (홈 모드면 반경 안일 때만)
      const target = peers.near(char.x, char.y, 420)
      if (target) {
        const inHome =
          !world.home ||
          Math.hypot(target.x - world.home.x, target.y - world.home.y) <= world.home.radius
        if (inHome) char.notifyPeerNearby({ x: target.x - 26 * char.facing, y: target.y })
      }
    }
    if (chatOpen) positionChat()
    updatePeekFrames()
  }
  if (shares.size > 0) updateShareCrop()
  updateBubbles(dt)

  // 따라다니거나 집혀 있는 동안만 커서 폴링을 고빈도로 (CPU 예산)
  const wantActive =
    char.state === 'follow' || char.state === 'exhausted' || dragging || sofaDragging
  if (wantActive !== lastPollActive) {
    lastPollActive = wantActive
    bridge.setPollRate(wantActive)
  }

  dtForDraw = dt
  draw()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
