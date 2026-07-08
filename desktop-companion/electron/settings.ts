// 앱 설정 — userData/settings.json 에 저장. 트레이 메뉴/옷장에서 변경한다.

import { app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'

export type ActivityLevel = 'calm' | 'normal' | 'active'

export interface SofaSettings {
  enabled: boolean
  /** 정규화 좌표 (0~1, 화면 크기 독립) */
  x: number
  y: number
}

export interface LookSettings {
  // 색 (견본 인덱스)
  skin: number
  hair: number
  top: number
  bottom: number
  // 모양 (파츠 id — 파츠 팩 manifest의 id와 매칭)
  hairStyle: string
  eyesStyle: string
  mouthStyle: string
  topStyle: string
}

export interface AppSettings {
  /** 부팅 시 자동 시작 */
  autoStart: boolean
  /** 캐릭터 표시 배율 (작게 2x / 보통 3x) */
  scale: 2 | 3
  /** 활동성 프리셋 */
  activity: ActivityLevel
  /** 오버레이를 띄울 모니터 (Electron display id). null = 주 모니터 */
  displayId: number | null
  /** 1인용 소파 (홈 모드) */
  sofa: SofaSettings
  /** 캐릭터 색 커스터마이징 (옷장) */
  look: LookSettings
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoStart: false,
  scale: 2,
  activity: 'normal',
  displayId: null,
  sofa: { enabled: false, x: 0.72, y: 0.78 },
  look: {
    skin: 0,
    hair: 0,
    top: 0,
    bottom: 0,
    hairStyle: 'short',
    eyesStyle: 'normal',
    mouthStyle: 'smile',
    topStyle: 'tee',
  },
}

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json')

export function loadSettings(): AppSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      // 하위 호환: 예전 설정(scale 4, 삭제된 프리셋 값 등)은 기본값으로 강등
      scale: raw.scale === 3 ? 3 : 2,
      sofa: { ...DEFAULT_SETTINGS.sofa, ...(raw.sofa ?? {}) },
      look: { ...DEFAULT_SETTINGS.look, ...(raw.look ?? {}) },
    }
  } catch {
    return structuredClone(DEFAULT_SETTINGS)
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
