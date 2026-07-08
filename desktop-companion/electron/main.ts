import { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage } from 'electron'
import * as path from 'node:path'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let cursorTimer: NodeJS.Timeout | null = null

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
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '캐릭터 보이기/숨기기',
        click: () => {
          if (!win) return
          win.isVisible() ? win.hide() : win.showInactive()
        },
      },
      { type: 'separator' },
      { label: '종료', click: () => app.quit() },
    ]),
  )
}

app.whenReady().then(() => {
  // macOS: 독에 표시되지 않는 상주형 앱
  app.dock?.hide()
  createWindow()
  createTray()
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  if (cursorTimer) clearTimeout(cursorTimer)
})

ipcMain.on('set-interactive', (_e, interactive: boolean) => {
  win?.setIgnoreMouseEvents(!interactive, { forward: true })
})

ipcMain.on('set-poll-rate', (_e, active: boolean) => {
  pollMs = active ? POLL_ACTIVE_MS : POLL_IDLE_MS
})

ipcMain.on('hide-window', () => win?.hide())
ipcMain.on('quit-app', () => app.quit())
