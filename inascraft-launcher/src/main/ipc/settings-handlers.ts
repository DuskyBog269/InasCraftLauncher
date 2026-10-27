import { ipcMain, dialog, shell } from 'electron'
import os from 'os'
import { IPC } from '../../shared/ipc-channels'
import { store, getInstallDir, getRecommendedRam } from '../store'

export function registerSettingsHandlers(): void {
  /** Obter todas as configurações salvas */
  ipcMain.handle(IPC.SETTINGS_GET, async () => {
    return {
      installDir: getInstallDir(),
      ramMb: store.get('ramMb') ?? getRecommendedRam(),
      profile: store.get('profile'),
      installedVersion: store.get('installedVersion'),
      systemRamMb: Math.floor(os.totalmem() / 1024 / 1024),
      recommendedRamMb: getRecommendedRam()
    }
  })

  /** Salvar uma ou mais configurações */
  ipcMain.handle(IPC.SETTINGS_SET, async (_event, partial: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(partial)) {
      store.set(key, value)
    }
    return true
  })

  /** Obter RAM total do sistema (para o slider) */
  ipcMain.handle(IPC.SETTINGS_GET_SYSTEM_RAM, async () => {
    return {
      totalMb: Math.floor(os.totalmem() / 1024 / 1024),
      recommendedMb: getRecommendedRam()
    }
  })

  /** Abrir pasta do jogo no explorador de arquivos */
  ipcMain.handle(IPC.SETTINGS_OPEN_GAME_FOLDER, async () => {
    const dir = getInstallDir()
    await shell.openPath(dir)
  })

  /** Abrir diálogo para escolher pasta de instalação */
  ipcMain.handle(IPC.SETTINGS_CHOOSE_FOLDER, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Escolher pasta de instalação do InasCraft'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  /** Abrir diálogo para escolher skin (.png) */
  ipcMain.handle(IPC.SETTINGS_CHOOSE_SKIN, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Escolher skin (arquivo .png 64x64)',
      filters: [{ name: 'Imagem PNG', extensions: ['png'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
