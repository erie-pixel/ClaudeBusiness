// relay 서버 본체 — 단독 실행(index.mjs)과 앱 내장(electron/main.ts) 겸용.
// 역할: 룸 관리 + presence + 행동 intent/채팅/이모트 중계. 게임 로직은 전부 클라이언트에.

import { WebSocketServer } from 'ws'
import { Rooms } from './rooms.mjs'

const MAX_ROOM = 4
const CHAT_MAX_LEN = 200
const CHAT_BURST = 4 // 3초당 최대 메시지
const CHAT_WINDOW_MS = 3000

export function startRelay({ port = 8787 } = {}) {
  const wss = new WebSocketServer({ port })
  const rooms = new Rooms(MAX_ROOM)
  /** @type {Map<string, {ws: any, name: string, look: any, lastState: any, status: string, presence: string, chatTimes: number[], emoteTimes: number[], drawTimes: number[]}>} */
  const clients = new Map()
  let seq = 1

  // 빈 방은 2분 유예 후 정리 (전원이 잠깐 끊겨도 재접속 가능)
  const sweeper = setInterval(() => rooms.sweep(), 30000)

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
    return {
      id,
      name: c?.name ?? '?',
      look: c?.look ?? null,
      state: c?.lastState ?? null,
      status: c?.status ?? '',
      presence: c?.presence ?? 'online',
      roomInfo: c?.roomInfo ?? null,
    }
  }

  function handleLeave(id) {
    const left = rooms.leave(id)
    if (!left) return
    for (const pid of left.remaining) {
      const peer = clients.get(pid)
      if (peer) send(peer.ws, { t: 'peer-leave', id })
    }
  }

  wss.on('connection', (ws) => {
    const id = String(seq++)
    clients.set(id, {
      ws,
      name: '?',
      look: null,
      lastState: null,
      status: '',
      presence: 'online',
      roomInfo: null,
      chatTimes: [],
      emoteTimes: [],
      drawTimes: [],
    })

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
        case 'rename': {
          const name = String(msg.name ?? '?').slice(0, 20)
          if (!name || name === me.name) return
          me.name = name
          toPeers(id, { t: 'peer-rename', id, name })
          break
        }
        // 상태 메시지 (SNS 프레즌스) — "회의 중", "점심" 같은 한 줄
        case 'status': {
          const text = String(msg.text ?? '').slice(0, 40)
          if (text === me.status) return
          me.status = text
          toPeers(id, { t: 'peer-status', id, text })
          break
        }
        // 내 방(엣지패널) 정보 — 크기/테마/가구/보드. 친구 화면에서 내 방이 재현된다.
        // 데이터(JSON)만 저장·중계, 크기 상한으로 남용 방지
        case 'room-info': {
          const info = msg.info
          if (typeof info !== 'object' || info === null) return
          try {
            if (JSON.stringify(info).length > 8000) return
          } catch {
            return
          }
          me.roomInfo = info
          toPeers(id, { t: 'peer-room-info', id, info })
          break
        }
        // 프레즌스 모드 — 집중 타이머 중 / 자리 비움 / 온라인 (자동 감지)
        case 'presence': {
          const mode = String(msg.mode ?? '')
          if (!['online', 'focus', 'away'].includes(mode) || mode === me.presence) return
          me.presence = mode
          toPeers(id, { t: 'peer-presence', id, mode })
          break
        }
        case 'state': {
          // 행동 intent — 정규화 좌표 + 포즈. 수신 측이 자기 화면에 맞게 재해석.
          // inRoom = 캐릭터가 엣지패널 방(집)에 들어가 있음 → 상대 화면에서는
          // 바탕화면 대신 상대의 방 패널 안에 표시된다.
          me.lastState = {
            nx: msg.nx,
            ny: msg.ny,
            pose: msg.pose,
            facing: msg.facing,
            inRoom: msg.inRoom === true,
          }
          toPeers(id, { t: 'state', id, ...me.lastState })
          break
        }
        // 방 벽면 그림판 — 획(세그먼트 묶음)을 같은 방 전원에게 중계.
        // 서버는 내용을 저장하지 않는다 (라이브 화이트보드, 도배 방지 상한만)
        case 'draw': {
          const now = Date.now()
          me.drawTimes = me.drawTimes.filter((t) => now - t < 1000)
          if (me.drawTimes.length >= 30) return // 초당 30묶음 상한
          me.drawTimes.push(now)
          const segs = (Array.isArray(msg.segs) ? msg.segs : [])
            .slice(0, 64)
            .filter(
              (s) =>
                Array.isArray(s) &&
                s.length === 5 &&
                s.every((v) => typeof v === 'number' && Number.isFinite(v)),
            )
          if (segs.length === 0) return
          toPeers(id, { t: 'draw', id, segs })
          break
        }
        case 'draw-clear': {
          toPeers(id, { t: 'draw-clear', id })
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
        // 화면 엿보기 (Phase 4): 요청/승인/거절/철회/시청 상태 + WebRTC 시그널.
        // 서버는 내용을 보지 않고 같은 방의 지정 상대에게만 전달한다.
        case 'peek-request':
        case 'peek-grant':
        case 'peek-deny':
        case 'peek-revoke':
        case 'peek-watch':
        case 'rtc': {
          const to = String(msg.to ?? '')
          if (!rooms.peersOf(id).includes(to)) return // 같은 방이 아니면 무시
          const target = clients.get(to)
          if (!target) return
          send(target.ws, {
            t: msg.t,
            from: id,
            name: me.name,
            watching: msg.watching,
            payload: msg.payload,
          })
          break
        }
      }
    })

    ws.on('close', () => {
      handleLeave(id)
      clients.delete(id)
    })
  })

  return {
    port,
    close() {
      clearInterval(sweeper)
      wss.close()
      for (const c of clients.values()) {
        try {
          c.ws.terminate()
        } catch {
          // 이미 종료됨
        }
      }
    },
  }
}
