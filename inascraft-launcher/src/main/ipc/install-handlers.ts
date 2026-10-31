import { ipcMain, BrowserWindow } from 'electron'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { IPC } from '../../shared/ipc-channels'
import { store, getInstallDir } from '../store'
import { resolveJava } from '../installer/java-manager'
import { isMinecraftInstalled, installMinecraft, isForgeInstalled, installForge } from '../installer/minecraft-installer'
import { fetchRemoteManifest, diffManifest, applyUpdate, verifyAndRepair } from '../installer/pack-updater'
import type { ProgressEvent } from '../../shared/types'

export function registerInstallHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC.INSTALL_START, async () => {
    const installDir = getInstallDir()

    const sendProgress = (progress: ProgressEvent) => {
      mainWindow.webContents.send(IPC.INSTALL_PROGRESS, progress)
    }

    try {
      // Java
      sendProgress({ stage: 'Verificando Java...', current: 0, total: 5 })
      const javaPath = await resolveJava(installDir, (d, t, s) => {
        mainWindow.webContents.send(IPC.JAVA_DOWNLOAD_PROGRESS, { downloaded: d, total: t, speed: s })
      })
      store.set('javaPath', javaPath)
      console.log('[Install] Java:', javaPath)

      // Minecraft
      sendProgress({ stage: 'Verificando Minecraft 1.20.1...', current: 1, total: 5 })
      if (!isMinecraftInstalled(installDir)) {
        await installMinecraft(installDir, javaPath, sendProgress)
      } else {
        console.log('[Install] Minecraft já instalado')
      }

      // Forge
      sendProgress({ stage: 'Verificando Forge...', current: 2, total: 5 })
      if (!isForgeInstalled(installDir)) {
        await installForge(installDir, javaPath, sendProgress)
      } else {
        console.log('[Install] Forge já instalado')
      }

      // Pack
      sendProgress({ stage: 'Verificando modpack...', current: 3, total: 5 })
      const manifest = await fetchRemoteManifest()

      if (manifest) {
        const installedVersion = store.get('installedVersion') as string | undefined
        const modsDir = join(installDir, 'mods')

        // Considerar instalado só se a versão bate E a pasta mods tem arquivos
        const modsExist = existsSync(modsDir) &&
          readdirSync(modsDir).filter(f => f.endsWith('.jar')).length > 0
        const isUpToDate = installedVersion === manifest.version && modsExist

        if (!isUpToDate) {
          mainWindow.webContents.send(IPC.PACK_CHECK_UPDATE, {
            hasUpdate: !!installedVersion,  // true = update, false = primeira instalação
            isFirstInstall: !installedVersion,
            manifest
          })
        } else {
          mainWindow.webContents.send(IPC.PACK_CHECK_UPDATE, {
            hasUpdate: false, manifest, filesToRepair: 0
          })
        }
      } else {
        mainWindow.webContents.send(IPC.NETWORK_OFFLINE, {
          version: store.get('installedVersion') ?? 'desconhecida'
        })
      }

      sendProgress({ stage: 'Pronto!', current: 5, total: 5 })
      mainWindow.webContents.send(IPC.INSTALL_COMPLETE, { javaPath })
      return { success: true, javaPath }

    } catch (err) {
      const error = err as Error
      console.error('[Install] Erro:', error)
      mainWindow.webContents.send(IPC.INSTALL_ERROR, { message: error.message })
      throw error
    }
  })

  ipcMain.handle(IPC.PACK_APPLY_UPDATE, async (_event, manifest) => {
    const installDir = getInstallDir()
    const sendProgress = (p: ProgressEvent) => mainWindow.webContents.send(IPC.PACK_UPDATE_PROGRESS, p)
    const { toDownload, toDelete } = diffManifest(installDir, manifest)
    await applyUpdate(installDir, toDownload, toDelete, sendProgress)
    store.set('installedVersion', manifest.version)
    return { success: true }
  })

  ipcMain.handle(IPC.PACK_REPAIR, async () => {
    const installDir = getInstallDir()
    const sendProgress = (p: ProgressEvent) => mainWindow.webContents.send(IPC.PACK_UPDATE_PROGRESS, p)
    const manifest = await fetchRemoteManifest()
    if (!manifest) throw new Error('Sem internet')
    await verifyAndRepair(installDir, manifest, sendProgress)
    return { success: true }
  })
}