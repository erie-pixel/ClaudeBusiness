// 앱 설정 — userData/settings.json 에 저장. 트레이 메뉴에서 변경한다.

import { app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'

export type ActivityLevel = 'calm' | 'normal' | 'active'

export interface AppSettings {
  /** 부팅 시 자동 시작 */
  autoStart: boolean
  /** 캐릭터 표시 배율 */
  scale: 2 | 3 | 4
  /** 활동성 프리셋 */
  activity: ActivityLevel
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoStart: false,
  scale: 2,
  activity: 'calm',
}

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json')

export function loadSettings(): AppSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))
    return { ...DEFAULT_SETTINGS, ...raw }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: AppSettings) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2))
  } catch {
    // 저장 실패는 치명적이지 않음 — 다음 실행에서 기본값으로 복구
  }
}
