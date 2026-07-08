import { contextBridge, ipcRenderer } from 'electron'

export interface CompanionBridge {
  onCursor(cb: (pos: { x: number; y: number }) => void): void
  onActiveWindow(cb: (rect: { x: number; y: number; w: number; h: number }) => void): void
  setInteractive(interactive: boolean): void
  setPollRate(active: boolean): void
  hideWindow(): void
  quitApp(): void
}

const bridge: CompanionBridge = {
  onCursor: (cb) => {
    ipcRenderer.on('cursor', (_e, pos) => cb(pos))
  },
  onActiveWindow: (cb) => {
    ipcRenderer.on('active-window', (_e, rect) => cb(rect))
  },
  setInteractive: (v) => ipcRenderer.send('set-interactive', v),
  setPollRate: (active) => ipcRenderer.send('set-poll-rate', active),
  hideWindow: () => ipcRenderer.send('hide-window'),
  quitApp: () => ipcRenderer.send('quit-app'),
}

contextBridge.exposeInMainWorld('companion', bridge)
