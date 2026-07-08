import { contextBridge, ipcRenderer } from 'electron'

export interface CompanionBridge {
  onCursor(cb: (pos: { x: number; y: number }) => void): void
  setInteractive(interactive: boolean): void
  setPollRate(active: boolean): void
  hideWindow(): void
  quitApp(): void
}

const bridge: CompanionBridge = {
  onCursor: (cb) => {
    ipcRenderer.on('cursor', (_e, pos) => cb(pos))
  },
  setInteractive: (v) => ipcRenderer.send('set-interactive', v),
  setPollRate: (active) => ipcRenderer.send('set-poll-rate', active),
  hideWindow: () => ipcRenderer.send('hide-window'),
  quitApp: () => ipcRenderer.send('quit-app'),
}

contextBridge.exposeInMainWorld('companion', bridge)
