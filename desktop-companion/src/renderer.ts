import { Character } from './engine/character'
import {
  bakeFrame,
  bakeMap,
  HEART,
  SPRITE_W,
  SPRITE_H,
  SCALE,
  type FrameName,
  type BakedFrame,
} from './engine/sprite'
import type { CompanionBridge } from '../electron/preload'

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

const frames: Record<FrameName, BakedFrame> = {
  idle: bakeFrame('idle'),
  blink: bakeFrame('blink'),
  walkA: bakeFrame('walkA'),
  walkB: bakeFrame('walkB'),
  sleep: bakeFrame('sleep'),
  pant: bakeFrame('pant'),
  heldA: bakeFrame('heldA'),
  heldB: bakeFrame('heldB'),
}
const heart = bakeMap(HEART, 7, 6)

const W = SPRITE_W * SCALE
const H = SPRITE_H * SCALE
const EDGE = 4
/** 집었을 때 커서(=잡은 손)가 머리에 얼마나 파고드는지 */
const GRIP = 2 * SCALE

function computeBounds() {
  return {
    minX: W / 2 + EDGE,
    maxX: canvas.width - W / 2 - EDGE,
    minY: H + EDGE, // 발 기준 — 머리가 화면 위로 나가지 않게
    maxY: canvas.height - EDGE,
  }
}
const world = {
  cursor: null as { x: number; y: number } | null,
  bounds: computeBounds(),
}
const char = new Character(canvas.width / 2, canvas.height * 0.7)

// ---------- 클릭통과 <-> 상호작용 전환 ----------

let interactive = false
let menuOpen = false
let dragging = false
let dragMoved = 0
let suppressClick = false

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
  const want = menuOpen || dragging || overCharacter(cursor.x, cursor.y)
  if (want !== interactive) {
    interactive = want
    bridge.setInteractive(want)
    document.body.style.cursor = want ? 'pointer' : 'default'
  }
}

bridge.onCursor((pos) => {
  world.cursor = pos
  if (dragging) {
    // 머리를 잡고 있으므로 발 위치 = 커서 아래쪽
    char.heldMoveTo(pos.x, pos.y + H - GRIP, world.bounds)
  }
  syncInteractive(pos)
})

// ---------- 활성 창 쳐다보기 ----------

bridge.onActiveWindow((rect) => {
  if (rect.w < 120 || rect.h < 80) return // 툴팁/팝업류 무시
  // 창 상단 중앙, 발이 창 위 모서리에 살짝 걸치는 위치
  char.notifyActiveWindow({ x: rect.x + rect.w / 2, y: rect.y - 2 })
})

// ---------- 집어 옮기기 (드래그) ----------

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  if (menuOpen && menu.contains(e.target as Node)) return
  if (overCharacter(e.clientX, e.clientY)) {
    closeMenu()
    dragging = true
    dragMoved = 0
    char.grab()
    char.heldMoveTo(e.clientX, e.clientY + H - GRIP, world.bounds)
    bridge.setPollRate(true)
  }
})

window.addEventListener('mousemove', (e) => {
  if (dragging) dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY)
})

window.addEventListener('mouseup', () => {
  if (!dragging) return
  dragging = false
  char.release()
  suppressClick = dragMoved > 6 // 실제로 끌었다면 이어지는 click을 쓰다듬기로 치지 않음
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
  if (menuOpen) {
    if (!menu.contains(e.target as Node)) closeMenu()
    return
  }
  if (overCharacter(e.clientX, e.clientY)) char.poke()
})

// ---------- 말풍선 ----------

const bubble = document.getElementById('bubble') as HTMLDivElement
let bubbleTimer = 0

function updateBubble(dt: number) {
  if (bubbleTimer <= 0 && char.messages.length > 0) {
    bubble.textContent = char.messages.shift()!
    bubbleTimer = 2.8
    bubble.style.display = 'block'
  }
  if (bubbleTimer > 0) {
    bubbleTimer -= dt
    bubble.style.left = `${char.x}px`
    bubble.style.top = `${char.y - H - 12}px`
    if (bubbleTimer <= 0) bubble.style.display = 'none'
  }
}

// ---------- 애니메이션 & 메인 루프 ----------

let animTime = 0
let blinkTimer = 2 + Math.random() * 3

function currentFrame(): BakedFrame {
  switch (char.pose) {
    case 'held':
      return Math.floor(animTime * 8) % 2 === 0 ? frames.heldA : frames.heldB
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

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
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
  char.update(dt, world)
  updateBubble(dt)

  // 따라다니거나 집혀 있는 동안만 커서 폴링을 고빈도로 (CPU 예산)
  const wantActive = char.state === 'follow' || char.state === 'exhausted' || dragging
  if (wantActive !== lastPollActive) {
    lastPollActive = wantActive
    bridge.setPollRate(wantActive)
  }

  draw()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
