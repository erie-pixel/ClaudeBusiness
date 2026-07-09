// relay 서버와의 WebSocket 연결 — 프로토콜은 server/index.mjs와 1:1 대응.
// 좌표는 항상 정규화(0~1)로 주고받는다 (해상도 독립, 기획서 §2.3).

import type { Look } from '../engine/sprite'
import type { Pose } from '../engine/character'

export interface NetPeerInfo {
  id: string
  name: string
  look: Look | null
  state: NetState | null
}

export interface NetState {
  nx: number
  ny: number
  pose: Pose
  facing: 1 | -1
}

export interface NetCallbacks {
  onJoined(room: string, self: string, peers: NetPeerInfo[]): void
  onPeerJoin(peer: NetPeerInfo): void
  onPeerLeave(id: string): void
  onPeerState(id: string, state: NetState): void
  onPeerRename(id: string, name: string): void
  onChat(id: string, name: string, text: string): void
  onEmote(id: string, sym: string): void
  /** 화면 엿보기 시그널 (요청/승인/거절/철회/시청 상태/WebRTC) */
  onPeek(type: PeekSignalType, from: string, name: string, watching?: boolean, payload?: unknown): void
  onError(code: string): void
  onClose(): void
}

export type PeekSignalType =
  | 'peek-request'
  | 'peek-grant'
  | 'peek-deny'
  | 'peek-revoke'
  | 'peek-watch'
  | 'rtc'

const PEEK_TYPES: ReadonlySet<string> = new Set([
  'peek-request',
  'peek-grant',
  'peek-deny',
  'peek-revoke',
  'peek-watch',
  'rtc',
])

export class NetClient {
  private ws: WebSocket | null = null
  private cb: NetCallbacks

  constructor(cb: NetCallbacks) {
    this.cb = cb
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /** 접속 후 방 생성 또는 참여. room이 null이면 생성 */
  connectAnd(url: string, room: string | null, name: string, look: Look) {
    this.disconnect()
    const ws = new WebSocket(url)
    this.ws = ws
    ws.onopen = () => {
      if (room) this.send({ t: 'join', room, name, look })
      else this.send({ t: 'create', name, look })
    }
    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(String(ev.data))
      } catch {
        return
      }
      switch (msg.t) {
        case 'joined':
          this.cb.onJoined(msg.room as string, msg.self as string, msg.peers as NetPeerInfo[])
          break
        case 'peer-join':
          this.cb.onPeerJoin(msg.peer as NetPeerInfo)
          break
        case 'peer-leave':
          this.cb.onPeerLeave(msg.id as string)
          break
        case 'state': {
          const { id, nx, ny, pose, facing } = msg as unknown as NetState & { id: string }
          this.cb.onPeerState(id, { nx, ny, pose, facing })
          break
        }
        case 'peer-rename':
          this.cb.onPeerRename(msg.id as string, msg.name as string)
          break
        case 'chat':
          this.cb.onChat(msg.id as string, msg.name as string, msg.text as string)
          break
        case 'emote':
          this.cb.onEmote(msg.id as string, msg.sym as string)
          break
        case 'peek-request':
        case 'peek-grant':
        case 'peek-deny':
        case 'peek-revoke':
        case 'peek-watch':
        case 'rtc':
          if (PEEK_TYPES.has(msg.t as string)) {
            this.cb.onPeek(
              msg.t as PeekSignalType,
              msg.from as string,
              (msg.name as string) ?? '?',
              msg.watching as boolean | undefined,
              msg.payload,
            )
          }
          break
        case 'error':
          this.cb.onError(msg.code as string)
          break
      }
    }
    ws.onerror = () => {
      // onclose가 뒤따라오므로 여기서는 조용히
    }
    ws.onclose = () => {
      if (this.ws === ws) {
        this.ws = null
        this.cb.onClose()
      }
    }
  }

  sendState(state: NetState) {
    this.send({ t: 'state', ...state })
  }

  sendChat(text: string) {
    this.send({ t: 'chat', text })
  }

  sendEmote(sym: string) {
    this.send({ t: 'emote', sym })
  }

  sendRename(name: string) {
    this.send({ t: 'rename', name })
  }

  sendPeek(type: PeekSignalType, to: string, extra?: { watching?: boolean; payload?: unknown }) {
    this.send({ t: type, to, ...extra })
  }

  disconnect() {
    const ws = this.ws
    this.ws = null // onclose 콜백 억제
    if (ws) {
      try {
        ws.close()
      } catch {
        // 이미 닫힘
      }
    }
  }

  private send(obj: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj))
  }
}
