import { IPC } from '../../../shared/ipc-channels'
import type { IpcChannel } from '../../../shared/ipc-channels'

/**
 * Interface da API exposta pelo preload via contextBridge.
 * Tipada para uso seguro no renderer.
 */
interface ElectronAPI {
  invoke: (channel: IpcChannel, ...args: unknown[]) => Promise<unknown>
  send: (channel: IpcChannel, ...args: unknown[]) => void
  on: (channel: IpcChannel, callback: (...args: unknown[]) => void) => () => void
  once: (channel: IpcChannel, callback: (...args: unknown[]) => void) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

/**
 * Hook para acessar a API do Electron de forma tipada.
 * Lança erro se usado fora do contexto Electron.
 */
export function useElectron() {
  if (!window.electronAPI) {
    throw new Error('electronAPI não disponível — certifique-se de estar rodando no Electron')
  }

  const api = window.electronAPI

  return {
    /** Invocar canal IPC e aguardar resultado */
    invoke: <T = unknown>(channel: IpcChannel, ...args: unknown[]): Promise<T> =>
      api.invoke(channel, ...args) as Promise<T>,

    /** Enviar evento sem aguardar resposta */
    send: (channel: IpcChannel, ...args: unknown[]) => api.send(channel, ...args),

    /** Registrar listener de evento do processo principal */
    on: (channel: IpcChannel, callback: (...args: unknown[]) => void) =>
      api.on(channel, callback),

    /** Escutar um evento apenas uma vez */
    once: (channel: IpcChannel, callback: (...args: unknown[]) => void) =>
      api.once(channel, callback),

    /** Atalhos para canais comuns */
    IPC
  }
}
