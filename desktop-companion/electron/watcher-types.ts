// Windows/macOS 워처가 공통으로 주고받는 형태 (electron/fullscreen-win.ts, fullscreen-mac.ts)

export interface ForegroundInfo {
  fullscreen: boolean
  rect: { left: number; top: number; right: number; bottom: number } | null
  typing: boolean
  idleSec: number
}
