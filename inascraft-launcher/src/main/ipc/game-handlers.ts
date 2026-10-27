import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { store, getInstallDir } from '../store'
import { launchGame } from '../game/game-launcher'
import type { PlayerProfile } from '../../shared/types'

let gameRunning = false

export function registerGameHandlers(mainWindow: BrowserWindow): void {
  /**
   * Lançar o jogo.
   * Minimiza o launcher enquanto o jogo roda.
   * Restaura e emite eventos de exit/crash ao fechar.
   */
  ipcMain.handle(IPC.GAME_LAUNCH, async () => {
    if (gameRunning) {
      throw new Error('O jogo já está rodando')
    }

    const profile = store.get('profile') as PlayerProfile | undefined
    if (!profile) {
      throw new Error('Nenhum perfil configurado. Configure um nickname primeiro.')
    }

    const installDir = getInstallDir()
    const javaPath = store.get('javaPath') as string | undefined

    if (!javaPath) {
      throw new Error('Java não encontrado. Execute a instalação primeiro.')
    }

    const ramMb = (store.get('ramMb') as number | undefined) ?? 2048

    gameRunning = true

    // Minimizar launcher enquanto o jogo roda
    mainWindow.minimize()

    try {
      await launchGame(
        installDir,
        javaPath,
        profile,
        ramMb,
        (event, data) => {
          switch (event) {
            case 'start':
              mainWindow.webContents.send(IPC.GAME_EXIT, { status: 'running' })
              break

            case 'exit':
              gameRunning = false
              mainWindow.restore()
              mainWindow.focus()
              mainWindow.webContents.send(IPC.GAME_EXIT, { status: 'closed', code: 0 })
              break

            case 'crash':
              gameRunning = false
              mainWindow.restore()
              mainWindow.focus()
              mainWindow.webContents.send(IPC.GAME_CRASH, data)
              break
          }
        },
        (line: string) => {
          // Transmitir logs ao renderer (últimas linhas para o modal de crash)
          mainWindow.webContents.send(IPC.GAME_LOG, line)
        }
      )
    } catch (err) {
      gameRunning = false
      mainWindow.restore()
      mainWindow.focus()
      throw err
    }

    return { success: true }
  })
}
