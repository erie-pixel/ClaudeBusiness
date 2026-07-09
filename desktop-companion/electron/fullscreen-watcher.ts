// 플랫폼 디스패처 — main.ts는 이 모듈만 알면 되고 OS 분기는 여기서 끝난다.
// Windows/macOS 각 구현은 자기 플랫폼이 아니면 내부에서 즉시 반환하므로
// 둘 다 호출해도 안전하다 (linux 등 미지원 OS에서는 둘 다 조용히 no-op).

import { startFullscreenWatcher as winStart, stopFullscreenWatcher as winStop } from './fullscreen-win'
import { startFullscreenWatcher as macStart, stopFullscreenWatcher as macStop } from './fullscreen-mac'
import type { ForegroundInfo } from './watcher-types'

export type { ForegroundInfo }

export function startFullscreenWatcher(onChange: (info: ForegroundInfo) => void): void {
  winStart(onChange)
  macStart(onChange)
}

export function stopFullscreenWatcher(): void {
  winStop()
  macStop()
}
