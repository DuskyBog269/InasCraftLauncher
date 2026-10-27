import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { registerAllIpcHandlers } from './ipc/index'
import { IPC } from '../shared/ipc-channels'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 800,
    minHeight: 550,
    show: false,
    frame: false, // frame personalizado (pixel art)
    resizable: true,
    icon: join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    },
    backgroundColor: '#1a1a1a'
  })

  // Não mostrar até estar pronto (evita flash branco)
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Abrir links externos no browser padrão
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Carregar app — dev usa Vite dev server, produção usa arquivo local
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send(IPC.UPDATER_STATUS, { status: 'available', info })
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send(IPC.UPDATER_STATUS, {
      status: 'downloading',
      percent: progress.percent
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send(IPC.UPDATER_STATUS, { status: 'ready', info })
  })

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Erro:', err)
    mainWindow?.webContents.send(IPC.UPDATER_STATUS, { status: 'error', error: err.message })
  })

  // Verificar updates após 3s (deixar a UI carregar primeiro)
  if (!is.dev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.warn('[AutoUpdater] Não foi possível verificar update:', err.message)
      })
    }, 3000)
  }
}

app.whenReady().then(() => {
  // Configurar app user model id no Windows
  electronApp.setAppUserModelId('com.inascraft.launcher')

  // Otimizações padrão do electron-toolkit
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  registerAllIpcHandlers(mainWindow!)
  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Exportar referência à janela para uso em outros módulos
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
