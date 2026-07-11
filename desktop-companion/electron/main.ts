import { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, globalShortcut, session, desktopCapturer } from 'electron'
import * as path from 'node:path'
import * as os from 'node:os'
import { startFullscreenWatcher, stopFullscreenWatcher } from './fullscreen-watcher'
import { loadSettings, saveSettings, type AppSettings } from './settings'
import { loadAlbum, saveAlbum } from './album-store'
import { loadTodos, saveTodos } from './todo-store'
import { startRelay, type RelayHandle } from '../server/relay.mjs'

// "방 만들기" 시 앱에 내장된 relay 서버 — 별도 cmd/서버 실행이 필요 없다
let relay: RelayHandle | null = null
const RELAY_PORT = 8787

function lanAddresses(): string[] {
  const out: string[] = []
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address)
    }
  }
  return out
}

let win: BrowserWindow | null = null
let tray: Tray | null = null
let cursorTimer: NodeJS.Timeout | null = null
let settings: AppSettings = {
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
  playerName: '친구',
  serverUrl: 'ws://127.0.0.1:8787',
  hourlyChime: false,
  onboarded: false,
}

function pushSettings() {
  if (!win || win.isDestroyed()) return
  win.webContents.send('settings', {
    scale: settings.scale,
    activity: settings.activity,
    sofa: settings.sofa,
    look: settings.look,
    playerName: settings.playerName,
    serverUrl: settings.serverUrl,
    hourlyChime: settings.hourlyChime,
    onboarded: settings.onboarded,
  })
}

function currentDisplay() {
  const displays = screen.getAllDisplays()
  return displays.find((d) => d.id === settings.displayId) ?? screen.getPrimaryDisplay()
}

function moveToDisplay(id: number) {
  const display = screen.getAllDisplays().find((d) => d.id === id)
  if (!display || !win || win.isDestroyed()) return
  const wa = display.workArea
  win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height })
  updateSettings({ displayId: id })
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
  const workArea = currentDisplay().workArea

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
  win.webContents.on('did-finish-load', () => {
    pushSettings()
    // 수집 앨범(함께한 날들)·할일 목록 — 저장된 내용을 렌더러에 전달 (없으면 null)
    win?.webContents.send('album', loadAlbum())
    win?.webContents.send('todos', loadTodos())
  })
  // 안전망: transparent 창은 환경에 따라 ready-to-show가 오지 않을 수 있다
  // (그러면 캐릭터가 영영 표시되지 않음) — 1.5초 후에도 안 보이면 강제 표시
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible() && !manualHidden && !fullscreenHidden) {
      win.showInactive()
    }
  }, 1500)

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
  const scaleItem = (label: string, value: 2 | 3) => ({
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
        submenu: [scaleItem('작게', 2), scaleItem('보통', 3)],
      },
      {
        label: '활동성',
        submenu: [
          activityItem('아주 차분함', 'calm'),
          activityItem('보통', 'normal'),
          activityItem('활발함', 'active'),
        ],
      },
      {
        label: '모니터 이동',
        visible: screen.getAllDisplays().length > 1,
        submenu: screen.getAllDisplays().map((d, i) => ({
          label: `모니터 ${i + 1} (${d.size.width}x${d.size.height})${d.id === currentDisplay().id ? ' ✓' : ''}`,
          click: () => moveToDisplay(d.id),
        })),
      },
      {
        label: '정각 알림 (매시 정각에 시각 표시)',
        type: 'checkbox',
        checked: settings.hourlyChime,
        click: () => updateSettings({ hourlyChime: !settings.hourlyChime }),
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
  // 화면 엿보기(Phase 4): 렌더러의 getDisplayMedia 요청에 주 화면을 공급.
  // 실제 공유는 상대의 명시적 승인 후에만 시작된다 (renderer의 승인 패널).
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => callback({ video: sources[0] }))
        .catch(() => callback({}))
    },
    { useSystemPicker: false },
  )
  // 채팅 전역 단축키 (방에 있을 때 렌더러가 입력창을 연다)
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    win?.webContents.send('open-chat')
  })
  // 전체화면 앱(유튜브 전체화면, 게임 등) 감지 시 캐릭터 자동 숨김 — 방해하지 않음 원칙
  // + 활성 창 rect를 렌더러에 전달해 "창 쳐다보기" 행동 발동
  let lastRectKey = ''
  startFullscreenWatcher((info) => {
    fullscreenHidden = info.fullscreen
    applyVisibility()
    if (!win || win.isDestroyed()) return
    // 키보드/방치 정보는 매 폴 전달 (렌더러가 리액션에 사용)
    win.webContents.send('user-input', { typing: info.typing, idleSec: info.idleSec })
    // 활성 창 rect는 바뀌었을 때만 전달 (watch 재발동 방지)
    if (!info.fullscreen && info.rect) {
      const key = `${info.rect.left},${info.rect.top},${info.rect.right},${info.rect.bottom}`
      if (key !== lastRectKey) {
        lastRectKey = key
        const b = win.getBounds()
        win.webContents.send('active-window', {
          x: info.rect.left - b.x,
          y: info.rect.top - b.y,
          w: info.rect.right - info.rect.left,
          h: info.rect.bottom - info.rect.top,
        })
      }
    }
  })

  // 모니터 구성이 바뀌면 메뉴 갱신 + 사라진 모니터에 있었다면 주 모니터로 복귀
  const onDisplayChange = () => {
    if (win && !win.isDestroyed()) {
      const wa = currentDisplay().workArea
      win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height })
    }
    rebuildTrayMenu()
  }
  screen.on('display-added', onDisplayChange)
  screen.on('display-removed', onDisplayChange)
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  if (cursorTimer) clearTimeout(cursorTimer)
  stopFullscreenWatcher()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  relay?.close()
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

ipcMain.on('save-sofa', (_e, sofa: AppSettings['sofa']) => {
  updateSettings({ sofa })
})

ipcMain.on('save-look', (_e, look: AppSettings['look']) => {
  updateSettings({ look })
})

ipcMain.on('save-album', (_e, data: unknown) => {
  saveAlbum(data)
})

ipcMain.on('save-todos', (_e, data: unknown) => {
  saveTodos(data)
})

ipcMain.on('save-onboarded', () => {
  updateSettings({ onboarded: true })
})

ipcMain.on('save-mp', (_e, mp: { playerName: string; serverUrl: string }) => {
  updateSettings({
    playerName: String(mp.playerName ?? '친구').slice(0, 20),
    serverUrl: String(mp.serverUrl ?? ''),
  })
})

// 방 만들기 → 내장 relay를 (아직 없으면) 띄우고 접속 정보를 돌려준다
ipcMain.handle('ensure-relay', async () => {
  if (!relay) {
    try {
      relay = startRelay({ port: RELAY_PORT })
    } catch (err) {
      // 포트 사용 중(별도 npm run server 실행 등)이면 그 서버를 그대로 쓴다
      const msg = String(err)
      if (!msg.includes('EADDRINUSE')) return { ok: false, error: msg }
    }
  }
  return { ok: true, port: RELAY_PORT, ips: lanAddresses() }
})
ipcMain.on('quit-app', () => app.quit())
