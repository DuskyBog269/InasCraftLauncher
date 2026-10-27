import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { store, getInstallDir } from '../store'
import { resolveJava } from '../installer/java-manager'
import { isMinecraftInstalled, installMinecraft } from '../installer/minecraft-installer'
import { checkNeoForgeInstalled, installNeoForge } from '../installer/neoforge-installer'
import { fetchRemoteManifest, diffManifest, applyUpdate, verifyAndRepair } from '../installer/pack-updater'
import type { ProgressEvent } from '../../shared/types'

export function registerInstallHandlers(mainWindow: BrowserWindow): void {
  /**
   * Iniciar o processo de instalação/atualização completo.
   * Etapas: Java → Minecraft → NeoForge → Pack
   */
  ipcMain.handle(IPC.INSTALL_START, async () => {
    const installDir = getInstallDir()

    const sendProgress = (progress: ProgressEvent) => {
      mainWindow.webContents.send(IPC.INSTALL_PROGRESS, progress)
    }

    try {
      // ── Etapa 1: Java ────────────────────────────────────────────────────────
      sendProgress({ stage: 'Verificando Java...', current: 0, total: 4 })

      const javaPath = await resolveJava(installDir, (downloaded, total, speed) => {
        mainWindow.webContents.send(IPC.JAVA_DOWNLOAD_PROGRESS, { downloaded, total, speed })
      })

      store.set('javaPath', javaPath)
      console.log('[Install] Java resolvido:', javaPath)

      // ── Etapa 2: Minecraft ───────────────────────────────────────────────────
      sendProgress({ stage: 'Verificando Minecraft 1.20.1...', current: 1, total: 4 })

      if (!isMinecraftInstalled(installDir)) {
        await installMinecraft(installDir, javaPath, sendProgress)
      } else {
        console.log('[Install] Minecraft já instalado, pulando')
      }

      // ── Etapa 3: NeoForge ────────────────────────────────────────────────────
      sendProgress({ stage: 'Verificando NeoForge...', current: 2, total: 4 })

      if (!checkNeoForgeInstalled(installDir)) {
        await installNeoForge(installDir, javaPath, sendProgress)
      } else {
        console.log('[Install] NeoForge já instalado, pulando')
      }

      // ── Etapa 4: Pack (mods, configs, etc.) ──────────────────────────────────
      sendProgress({ stage: 'Verificando modpack...', current: 3, total: 4 })

      const manifest = await fetchRemoteManifest()

      if (manifest) {
        const installedVersion = store.get('installedVersion') as string | undefined
        const isFirstInstall = !installedVersion

        if (isFirstInstall || installedVersion !== manifest.version) {
          // Retornar info de update para o renderer mostrar changelog
          mainWindow.webContents.send(IPC.PACK_CHECK_UPDATE, {
            hasUpdate: true,
            manifest,
            isFirstInstall
          })
        } else {
          // Verificar integridade mesmo sem nova versão
          const { toDownload } = diffManifest(installDir, manifest)
          if (toDownload.length > 0) {
            mainWindow.webContents.send(IPC.PACK_CHECK_UPDATE, {
              hasUpdate: false,
              manifest,
              filesToRepair: toDownload.length
            })
          }
        }
      } else {
        // Offline — pular verificação do pack
        mainWindow.webContents.send(IPC.NETWORK_OFFLINE, {
          version: store.get('installedVersion') ?? 'desconhecida'
        })
      }

      sendProgress({ stage: 'Pronto!', current: 4, total: 4 })
      mainWindow.webContents.send(IPC.INSTALL_COMPLETE, { javaPath })

      return { success: true, javaPath }
    } catch (err) {
      const error = err as Error
      console.error('[Install] Erro:', error)
      mainWindow.webContents.send(IPC.INSTALL_ERROR, { message: error.message })
      throw error
    }
  })

  /**
   * Aplicar update do pack após confirmação do usuário.
   */
  ipcMain.handle(IPC.PACK_APPLY_UPDATE, async (_event, manifest) => {
    const installDir = getInstallDir()

    const sendProgress = (progress: ProgressEvent) => {
      mainWindow.webContents.send(IPC.PACK_UPDATE_PROGRESS, progress)
    }

    const { toDownload, toDelete } = diffManifest(installDir, manifest)
    await applyUpdate(installDir, toDownload, toDelete, sendProgress)

    store.set('installedVersion', manifest.version)
    return { success: true }
  })

  /**
   * Reparar instalação: re-verificar e baixar todos os arquivos corrompidos/faltando.
   */
  ipcMain.handle(IPC.PACK_REPAIR, async () => {
    const installDir = getInstallDir()

    const sendProgress = (progress: ProgressEvent) => {
      mainWindow.webContents.send(IPC.PACK_UPDATE_PROGRESS, progress)
    }

    const manifest = await fetchRemoteManifest()
    if (!manifest) {
      throw new Error('Sem conexão com a internet para reparar a instalação')
    }

    await verifyAndRepair(installDir, manifest, sendProgress)
    return { success: true }
  })
}
