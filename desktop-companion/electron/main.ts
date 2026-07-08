import { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage } from 'electron'
import * as path from 'node:path'
import { startFullscreenWatcher, stopFullscreenWatcher } from './fullscreen-win'
import { loadSettings, saveSettings, type AppSettings } from './settings'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let cursorTimer: NodeJS.Timeout | null = null
let settings: AppSettings = { autoStart: false, scale: 2, activity: 'calm' }

function pushSettings() {
  if (!win || win.isDestroyed()) return
  win.webContents.send('settings', { scale: settings.scale, activity: settings.activity })
}

function applyAutoStart() {
  // 개발 모드(npm start)에서는 실행 파일이 electron이라 무의미하지만 무해함.
  // 패키징 빌드에서 실제로 동작한다.
  app.setLoginItemSettings({ openAtLogin: settings.autoStart })
}

function updateSettings(patch: Partial<AppSettings>) {
  settings = { ...settings, ...patch }
  saveSettings(settings)
  applyAutoStart()
  pushSettings()
  rebuildTrayMenu()
}

// 숨김 사유를 분리 관리: 사용자가 직접 숨긴 것과 전체화면 자동 숨김은 독립적
let manualHidden = false
let fullscreenHidden = false

function applyVisibility() {
  if (!win || win.isDestroyed()) return
  if (manualHidden || fullscreenHidden) {
    if (win.isVisible()) win.hide()
  } else {
    if (!win.isVisible()) win.showInactive()
  }
}

// 상호작용 모드 폴링 주기(Hz). 캐릭터가 커서를 따라다닐 때는 촘촘히,
// 유휴 상태에서는 느슨하게 돌려 CPU 예산(<1~2%)을 지킨다.
const POLL_ACTIVE_MS = 33 // ~30Hz
const POLL_IDLE_MS = 100 // 10Hz
let pollMs = POLL_IDLE_MS

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workArea

  win = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 클릭통과가 대원칙: 기본은 모든 마우스 이벤트를 아래 창으로 통과시키고,
  // 렌더러가 "커서가 캐릭터의 불투명 픽셀 위"라고 판단한 순간에만 수신 모드로 전환한다.
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })

  win.loadFile(path.join(__dirname, '../renderer/index.html'))
  win.once('ready-to-show', () => win?.showInactive())
  win.webContents.on('did-finish-load', pushSettings)

  // forward 옵션의 mousemove 전달은 플랫폼별 편차가 있어(특히 통과 모드 전환 직후),
  // 커서 좌표는 메인 프로세스 폴링으로 일원화해서 렌더러에 밀어준다.
  const poll = () => {
    if (!win || win.isDestroyed() || !win.isVisible()) return schedulePoll()
    const pt = screen.getCursorScreenPoint()
    const b = win.getBounds()
    win.webContents.send('cursor', { x: pt.x - b.x, y: pt.y - b.y })
    schedulePoll()
  }
  const schedulePoll = () => {
    cursorTimer = setTimeout(poll, pollMs)
  }
  schedulePoll()
}

function createTray() {
  // 임시 트레이 아이콘: 16x16 픽셀 하트를 비트맵으로 직접 생성 (에셋 파이프라인 전 단계)
  const size = 16
  const buf = Buffer.alloc(size * size * 4, 0)
  const heart = [
    '.....##..##.....',
    '....####****....',
    '...#########*...',
    '...#########*...',
    '....#######.....',
    '.....#####......',
    '......###.......',
    '.......#........',
  ]
  heart.forEach((row, hy) => {
    for (let x = 0; x < size; x++) {
      const c = row[x]
      if (c === '#' || c === '*') {
        const i = ((hy + 4) * size + x) * 4
        buf[i] = 90 // B
        buf[i + 1] = 90 // G
        buf[i + 2] = 235 // R
        buf[i + 3] = 255 // A
      }
    }
  })
  const icon = nativeImage.createFromBitmap(buf, { width: size, height: size })
  tray = new Tray(icon)
  tray.setToolTip('바탕화면 키우기')
  rebuildTrayMenu()
}

function rebuildTrayMenu() {
  if (!tray) return
  const scaleItem = (label: string, value: 2 | 3 | 4) => ({
    label,
    type: 'radio' as const,
    checked: settings.scale === value,
    click: () => updateSettings({ scale: value }),
  })
  const activityItem = (label: string, value: AppSettings['activity']) => ({
    label,
    type: 'radio' as const,
    checked: settings.activity === value,
    click: () => updateSettings({ activity: value }),
  })
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '캐릭터 보이기/숨기기',
        click: () => {
          manualHidden = !manualHidden
          applyVisibility()
        },
      },
      { type: 'separator' },
      {
        label: '캐릭터 크기',
        submenu: [scaleItem('작게', 2), scaleItem('보통', 3), scaleItem('크게', 4)],
      },
      {
        label: '활동성',
        submenu: [
          activityItem('차분함', 'calm'),
          activityItem('보통', 'normal'),
          activityItem('활발함', 'active'),
        ],
      },
      {
        label: '부팅 시 자동 시작',
        type: 'checkbox',
        checked: settings.autoStart,
        click: () => updateSettings({ autoStart: !settings.autoStart }),
      },
      { type: 'separator' },
      { label: '종료', click: () => app.quit() },
    ]),
  )
}

app.whenReady().then(() => {
  // macOS: 독에 표시되지 않는 상주형 앱
  app.dock?.hide()
  settings = loadSettings()
  applyAutoStart()
  createWindow()
  createTray()
  // 전체화면 앱(유튜브 전체화면, 게임 등) 감지 시 캐릭터 자동 숨김 — 방해하지 않음 원칙
  // + 활성 창 rect를 렌더러에 전달해 "창 쳐다보기" 행동 발동
  startFullscreenWatcher((info) => {
    fullscreenHidden = info.fullscreen
    applyVisibility()
    if (!info.fullscreen && info.rect && win && !win.isDestroyed()) {
      const b = win.getBounds()
      win.webContents.send('active-window', {
        x: info.rect.left - b.x,
        y: info.rect.top - b.y,
        w: info.rect.right - info.rect.left,
        h: info.rect.bottom - info.rect.top,
      })
    }
  })
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  if (cursorTimer) clearTimeout(cursorTimer)
  stopFullscreenWatcher()
})

ipcMain.on('set-interactive', (_e, interactive: boolean) => {
  win?.setIgnoreMouseEvents(!interactive, { forward: true })
})

ipcMain.on('set-poll-rate', (_e, active: boolean) => {
  pollMs = active ? POLL_ACTIVE_MS : POLL_IDLE_MS
})

ipcMain.on('hide-window', () => {
  manualHidden = true
  applyVisibility()
})
ipcMain.on('quit-app', () => app.quit())
