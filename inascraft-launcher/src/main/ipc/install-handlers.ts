import { ipcMain, BrowserWindow } from 'electron'
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

        // Sempre rodar o diff para detectar arquivos faltando,
        // independente da versão salva no store
        const { toDownload, toDelete } = diffManifest(installDir, manifest)
        const versionChanged = installedVersion !== manifest.version
        const hasFileDiff = toDownload.length > 0 || toDelete.length > 0

        console.log(`[Install] Pack: versão local=${installedVersion}, remota=${manifest.version}, faltando=${toDownload.length}, deletar=${toDelete.length}`)

        if (versionChanged || hasFileDiff) {
          mainWindow.webContents.send(IPC.PACK_CHECK_UPDATE, {
            hasUpdate: !!installedVersion,
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
    if (!manifest) throw new Error('Sem conexão com a internet para verificar os arquivos')

    // 1. Verificar Java
    sendProgress({ stage: 'Verificando Java 17...', current: 0, total: 4 })
    const javaPath = await resolveJava(installDir, (d, t, s) => {
      sendProgress({ stage: 'Baixando Java 17...', current: d, total: t, speed: s })
    })
    store.set('javaPath', javaPath)

    // 2. Verificar Minecraft (client.jar, libraries e assets)
    sendProgress({ stage: 'Verificando arquivos do Minecraft...', current: 1, total: 4 })
    await installMinecraft(installDir, javaPath, sendProgress)

    // 3. Verificar Forge
    sendProgress({ stage: 'Verificando Forge...', current: 2, total: 4 })
    if (!isForgeInstalled(installDir)) {
      await installForge(installDir, javaPath, sendProgress)
    }

    // 4. Verificar e reparar mods do manifest (inclui validação de ZIP/JAR e limpeza de órfãos)
    const { downloaded, deleted } = await verifyAndRepair(installDir, manifest, sendProgress)
    store.set('installedVersion', manifest.version)

    return { success: true, downloaded, deleted }
  })
}