import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel } from '../shared/ipc-channels'

/**
 * API exposta ao renderer via contextBridge.
 * Toda comunicação entre renderer e main passa por aqui.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /** Invocar um canal IPC e aguardar resposta */
  invoke: (channel: IpcChannel, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),

  /** Enviar evento sem aguardar resposta */
  send: (channel: IpcChannel, ...args: unknown[]) => ipcRenderer.send(channel, ...args),

  /** Ouvir eventos enviados pelo processo principal */
  on: (channel: IpcChannel, callback: (...args: unknown[]) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args)
    ipcRenderer.on(channel, subscription)
    // Retornar função de cleanup
    return () => ipcRenderer.removeListener(channel, subscription)
  },

  /** Ouvir um evento apenas uma vez */
  once: (channel: IpcChannel, callback: (...args: unknown[]) => void) => {
    ipcRenderer.once(channel, (_event, ...args) => callback(...args))
  }
})
