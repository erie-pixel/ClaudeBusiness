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
}
const heart = bakeMap(HEART, 7, 6)

const EDGE = 4
function computeBounds() {
  return {
    minX: (SPRITE_W * SCALE) / 2 + EDGE,
    maxX: canvas.width - (SPRITE_W * SCALE) / 2 - EDGE,
    minY: SPRITE_H * SCALE + EDGE, // 발 기준 — 머리가 화면 위로 나가지 않게
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

/** 현재 프레임의 불투명 픽셀 위인지 per-pixel 검사 */
function overCharacter(px: number, py: number): boolean {
  const frame = currentFrame()
  const left = char.x - (SPRITE_W * SCALE) / 2
  const top = char.y - SPRITE_H * SCALE
  const fx = Math.floor((px - left) / SCALE)
  const fy = Math.floor((py - top) / SCALE)
  if (fx < 0 || fx >= SPRITE_W || fy < 0 || fy >= SPRITE_H) return false
  // 좌우 반전 표시 중이면 마스크도 반전 좌표로
  const mx = char.facing === 1 ? fx : SPRITE_W - 1 - fx
  return frame.mask[fy]?.[mx] ?? false
}

function syncInteractive(cursor: { x: number; y: number }) {
  const want = menuOpen || overCharacter(cursor.x, cursor.y)
  if (want !== interactive) {
    interactive = want
    bridge.setInteractive(want)
    document.body.style.cursor = want ? 'pointer' : 'default'
  }
}

bridge.onCursor((pos) => {
  world.cursor = pos
  syncInteractive(pos)
})

// ---------- 우클릭 컨텍스트 메뉴 ----------

const menu = document.getElementById('menu') as HTMLDivElement

function buildMenu() {
  const following = char.state === 'follow' || char.state === 'exhausted'
  const items: Array<{ label: string; action: () => void } | 'sep'> = [
    following
      ? { label: '그만 따라와', action: () => char.commandStopFollow() }
      : { label: '마우스 따라와', action: () => char.commandFollow() },
    char.state === 'nap'
      ? { label: '일어나', action: () => char.poke() }
      : { label: '낮잠 자', action: () => char.commandNap() },
    { label: '여기서 기다려', action: () => char.commandStay() },
    'sep',
    { label: '숨기기 (트레이)', action: () => bridge.hideWindow() },
    { label: '종료', action: () => bridge.quitApp() },
  ]
  menu.innerHTML = ''
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
  menu.style.left = `${Math.min(x, canvas.width - 180)}px`
  menu.style.top = `${Math.min(y, canvas.height - menu.offsetHeight - 8)}px`
  bridge.setInteractive(true)
  interactive = true
}

function closeMenu() {
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
  if (menuOpen) {
    if (!menu.contains(e.target as Node)) closeMenu()
    return
  }
  if (overCharacter(e.clientX, e.clientY)) char.poke()
})

// ---------- 애니메이션 & 메인 루프 ----------

let animTime = 0
let blinkTimer = 2 + Math.random() * 3

function currentFrame(): BakedFrame {
  switch (char.pose) {
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
  const w = SPRITE_W * SCALE
  const h = SPRITE_H * SCALE
  const top = char.y - h

  ctx.save()
  if (char.pose === 'sleep') {
    // 눕혀서 잠자기
    ctx.translate(char.x, char.y - w / 2)
    ctx.rotate(char.facing === 1 ? Math.PI / 2 : -Math.PI / 2)
    ctx.drawImage(frame.canvas, -w / 2, -h / 2, w, h)
  } else {
    // idle 호흡 바운스 / pant 웅크림
    const bounce =
      char.pose === 'idle' ? Math.round(Math.sin(animTime * 2) * 1) * SCALE * 0.34 : 0
    const crouch = char.pose === 'pant' ? SCALE * 2 : 0
    ctx.translate(char.x, 0)
    ctx.scale(char.facing, 1)
    ctx.drawImage(frame.canvas, -w / 2, top + bounce + crouch, w, h)
  }
  ctx.restore()

  // 이펙트: 하트(쓰다듬기), Zzz(낮잠), 땀(지침)
  if (char.emoteTimer > 0) {
    const rise = (1.6 - char.emoteTimer) * 20
    ctx.drawImage(heart.canvas, char.x + 10, top - 14 - rise, 7 * SCALE, 6 * SCALE)
  }
  if (char.pose === 'sleep') {
    ctx.fillStyle = '#cfd8ff'
    ctx.font = `bold ${8 * SCALE}px monospace`
    const phase = Math.floor(animTime) % 3
    ctx.fillText('z'.repeat(phase + 1).toUpperCase(), char.x + 20, char.y - h + 6)
  }
  if (char.pose === 'pant') {
    ctx.fillStyle = '#7fd4f0'
    const drop = Math.floor(animTime * 4) % 2 === 0 ? 0 : SCALE
    ctx.fillRect(char.x + w / 2 - SCALE, top + 6 * SCALE + drop, SCALE, SCALE * 2)
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

  // 따라다니는 동안만 커서 폴링을 고빈도로 (CPU 예산)
  const wantActive = char.state === 'follow' || char.state === 'exhausted'
  if (wantActive !== lastPollActive) {
    lastPollActive = wantActive
    bridge.setPollRate(wantActive)
  }

  draw()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
