import { BrowserWindow } from 'electron'
import { registerProfileHandlers } from './profile-handlers'
import { registerSettingsHandlers } from './settings-handlers'
import { registerInstallHandlers } from './install-handlers'
import { registerGameHandlers } from './game-handlers'
import { registerUtilHandlers } from './util-handlers'

/**
 * Registra todos os handlers IPC.
 * Chamado uma vez na inicialização do app.
 */
export function registerAllIpcHandlers(mainWindow: BrowserWindow): void {
  registerProfileHandlers()
  registerSettingsHandlers()
  registerInstallHandlers(mainWindow)
  registerGameHandlers(mainWindow)
  registerUtilHandlers(mainWindow)
}
