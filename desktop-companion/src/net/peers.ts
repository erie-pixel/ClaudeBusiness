// 원격 캐릭터 상태 저장 + 보간 — 순수 로직 (DOM 비의존, vitest 대상).
// 서버가 중계한 "행동 intent"(정규화 좌표·포즈)를 받아 내 화면 크기로
// 되살리고, 픽셀 위치는 부드럽게 따라가도록 보간한다.

import type { Look } from '../engine/sprite'
import type { Pose } from '../engine/character'
import type { NetPeerInfo, NetState, PresenceMode } from './client'

export interface Peer {
  id: string
  name: string
  look: Look | null
  /** 화면 픽셀 위치 (보간된 현재값) */
  x: number
  y: number
  /** 목표 정규화 좌표 */
  nx: number
  ny: number
  pose: Pose
  facing: 1 | -1
  /** 첫 상태 수신 전에는 그리지 않는다 */
  hasState: boolean
  /** 상태 메시지 (SNS 한 줄 — 이름표 아래 표시) */
  status: string
  /** 프레즌스 (이름표 옆 점 색) */
  presence: PresenceMode
  /** 방(집)에 들어가 있음 — 바탕화면 대신 방 패널에 표시 */
  inRoom: boolean
}

const LERP_RATE = 10 // 초당 목표 접근 비율 계수

export class PeerStore {
  peers = new Map<string, Peer>()

  reset() {
    this.peers.clear()
  }

  upsert(info: NetPeerInfo) {
    const prev = this.peers.get(info.id)
    const peer: Peer = prev ?? {
      id: info.id,
      name: info.name,
      look: info.look,
      x: 0,
      y: 0,
      nx: 0.5,
      ny: 0.7,
      pose: 'idle',
      facing: 1,
      hasState: false,
      status: '',
      presence: 'online',
      inRoom: false,
    }
    peer.name = info.name
    peer.look = info.look
    peer.status = info.status ?? ''
    peer.presence = info.presence ?? 'online'
    if (info.state) this.applyState(peer, info.state, true)
    this.peers.set(info.id, peer)
  }

  remove(id: string) {
    this.peers.delete(id)
  }

  rename(id: string, name: string) {
    const peer = this.peers.get(id)
    if (peer) peer.name = name
  }

  setStatus(id: string, status: string) {
    const peer = this.peers.get(id)
    if (peer) peer.status = status
  }

  setPresence(id: string, presence: PresenceMode) {
    const peer = this.peers.get(id)
    if (peer) peer.presence = presence
  }

  updateState(id: string, state: NetState) {
    const peer = this.peers.get(id)
    if (peer) this.applyState(peer, state, !peer.hasState)
  }

  private applyState(peer: Peer, state: NetState, snap: boolean) {
    peer.nx = state.nx
    peer.ny = state.ny
    peer.pose = state.pose
    peer.facing = state.facing
    peer.inRoom = state.inRoom === true
    if (snap) {
      peer.x = Number.NaN // tick에서 화면 크기로 스냅
    }
    peer.hasState = true
  }

  /** 매 프레임 호출 — 목표 좌표(내 화면 픽셀)로 부드럽게 이동 */
  tick(dt: number, width: number, height: number) {
    for (const peer of this.peers.values()) {
      if (!peer.hasState) continue
      const tx = peer.nx * width
      const ty = peer.ny * height
      if (Number.isNaN(peer.x)) {
        peer.x = tx
        peer.y = ty
        continue
      }
      const k = Math.min(1, dt * LERP_RATE)
      peer.x += (tx - peer.x) * k
      peer.y += (ty - peer.y) * k
    }
  }

  /** 주어진 지점에서 radius 안에 있는 피어 (근접 상호작용/클릭 판정) */
  near(x: number, y: number, radius: number): Peer | null {
    for (const peer of this.peers.values()) {
      if (!peer.hasState || peer.inRoom) continue // 방에 들어간 친구는 바탕화면에 없다
      if (Math.hypot(peer.x - x, peer.y - y) <= radius) return peer
    }
    return null
  }
}
