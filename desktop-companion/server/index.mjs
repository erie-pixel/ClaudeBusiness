// 바탕화면 키우기 — relay 서버 (기획서 §3.3)
// 역할: 룸 관리 + presence + 행동 intent/채팅 중계. 게임 로직은 전부 클라이언트에.
// 실행: npm run server  (기본 포트 8787, PORT 환경변수로 변경)

import { WebSocketServer } from 'ws'
import { Rooms } from './rooms.mjs'

const PORT = Number(process.env.PORT ?? 8787)
const MAX_ROOM = 4
const CHAT_MAX_LEN = 200
const CHAT_BURST = 4 // 3초당 최대 메시지
const CHAT_WINDOW_MS = 3000

const wss = new WebSocketServer({ port: PORT })
const rooms = new Rooms(MAX_ROOM)
/** @type {Map<string, {ws: any, name: string, look: any, lastState: any, chatTimes: number[], emoteTimes: number[]}>} */
const clients = new Map()

// 빈 방은 2분 유예 후 정리 (전원이 잠깐 끊겨도 재접속 가능)
setInterval(() => rooms.sweep(), 30000)
let seq = 1

const send = (ws, obj) => {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj))
}

const toPeers = (id, obj) => {
  for (const pid of rooms.peersOf(id)) {
    const peer = clients.get(pid)
    if (peer) send(peer.ws, obj)
  }
}

const peerInfo = (id) => {
  const c = clients.get(id)
  return { id, name: c?.name ?? '?', look: c?.look ?? null, state: c?.lastState ?? null }
}

wss.on('connection', (ws) => {
  const id = String(seq++)
  clients.set(id, { ws, name: '?', look: null, lastState: null, chatTimes: [], emoteTimes: [] })

  ws.on('message', (data) => {
    let msg
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }
    const me = clients.get(id)
    if (!me) return

    switch (msg.t) {
      case 'create': {
        me.name = String(msg.name ?? '?').slice(0, 20)
        me.look = msg.look ?? null
        const code = rooms.create(id)
        send(ws, { t: 'joined', room: code, self: id, peers: [] })
        break
      }
      case 'join': {
        me.name = String(msg.name ?? '?').slice(0, 20)
        me.look = msg.look ?? null
        const code = String(msg.room ?? '').toUpperCase().trim()
        const res = rooms.join(code, id)
        if ('error' in res) {
          send(ws, { t: 'error', code: res.error })
          return
        }
        send(ws, { t: 'joined', room: code, self: id, peers: res.peers.map(peerInfo) })
        toPeers(id, { t: 'peer-join', peer: peerInfo(id) })
        break
      }
      case 'leave': {
        handleLeave(id)
        break
      }
      case 'state': {
        // 행동 intent — 정규화 좌표 + 포즈. 수신 측이 자기 화면에 맞게 재해석
        me.lastState = { nx: msg.nx, ny: msg.ny, pose: msg.pose, facing: msg.facing }
        toPeers(id, { t: 'state', id, ...me.lastState })
        break
      }
      case 'emote': {
        // 캐릭터 이모트 심볼(!, ?, ♪ 등) 중계 — 상대 화면에서도 보이게
        const now = Date.now()
        me.emoteTimes = me.emoteTimes.filter((t) => now - t < CHAT_WINDOW_MS)
        if (me.emoteTimes.length >= 6) return
        me.emoteTimes.push(now)
        const sym = String(msg.sym ?? '').slice(0, 4)
        if (!sym) return
        toPeers(id, { t: 'emote', id, sym })
        break
      }
      case 'chat': {
        const now = Date.now()
        me.chatTimes = me.chatTimes.filter((t) => now - t < CHAT_WINDOW_MS)
        if (me.chatTimes.length >= CHAT_BURST) return // 도배 방지
        me.chatTimes.push(now)
        const text = String(msg.text ?? '').slice(0, CHAT_MAX_LEN).trim()
        if (!text) return
        toPeers(id, { t: 'chat', id, name: me.name, text })
        break
      }
    }
  })

  ws.on('close', () => {
    handleLeave(id)
    clients.delete(id)
  })
})

function handleLeave(id) {
  const left = rooms.leave(id)
  if (!left) return
  for (const pid of left.remaining) {
    const peer = clients.get(pid)
    if (peer) send(peer.ws, { t: 'peer-leave', id })
  }
}

console.log(`desktop-companion relay listening on :${PORT}`)
