import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { Client as MinecraftClient } from 'minecraft-launcher-core'
import { PACK_CONFIG } from '../../shared/constants'
import type { ProgressEvent } from '../../shared/types'

export type InstallProgressCallback = (progress: ProgressEvent) => void

/**
 * Instalar Minecraft 1.20.1 + NeoForge usando minecraft-launcher-core.
 * Os arquivos do Minecraft são baixados diretamente dos servidores oficiais da Mojang.
 */
export async function installMinecraft(
  installDir: string,
  javaPath: string,
  onProgress: InstallProgressCallback
): Promise<void> {
  mkdirSync(installDir, { recursive: true })

  const launcher = new MinecraftClient()

  onProgress({
    stage: 'Verificando instalação do Minecraft',
    current: 0,
    total: 100
  })

  // Opções de lançamento — usamos isso só para download (authorization offline)
  const launchOptions = {
    clientPackage: undefined,
    authorization: {
      access_token: 'offline',
      client_token: 'offline',
      uuid: '00000000-0000-0000-0000-000000000000',
      name: 'Player',
      meta: { type: 'offline' as const, demo: false }
    },
    root: installDir,
    version: {
      number: PACK_CONFIG.MINECRAFT_VERSION,
      type: 'release'
    },
    memory: { max: '512M', min: '256M' },
    javaPath: javaPath,
    // Apenas baixar assets, não lançar
    forge: undefined
  }

  return new Promise((resolve, reject) => {
    // Evento de progresso de download
    launcher.on('download', (e) => {
      onProgress({
        stage: `Baixando ${e.name ?? 'arquivo'}`,
        current: e.current,
        total: e.total,
        file: e.name
      })
    })

    launcher.on('progress', (e) => {
      onProgress({
        stage: e.type ?? 'Instalando',
        current: e.task,
        total: e.total
      })
    })

    launcher.on('data', (data) => {
      console.log('[MC Install]', data)
    })

    launcher.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Instalação do Minecraft falhou com código ${code}`))
      }
    })

    launcher.on('error', (err) => {
      reject(err)
    })

    // Iniciar download/verificação dos arquivos
    launcher.launch(launchOptions).catch(reject)
  })
}

/**
 * Verificar se o Minecraft já está instalado.
 * Checa a existência da versão base.
 */
export function isMinecraftInstalled(installDir: string): boolean {
  const versionDir = join(installDir, 'versions', PACK_CONFIG.MINECRAFT_VERSION)
  const clientJar = join(versionDir, `${PACK_CONFIG.MINECRAFT_VERSION}.jar`)
  return existsSync(clientJar)
}

/**
 * Obter a string de versão do NeoForge para usar no launch.
 * Formato: "neoforge-{modloaderVersion}"
 */
export function getNeoForgeVersionString(): string {
  return `${PACK_CONFIG.MINECRAFT_VERSION}-neoforge-${PACK_CONFIG.MODLOADER_VERSION}`
}

/**
 * Verificar se o NeoForge está instalado.
 */
export function isNeoForgeInstalled(installDir: string): boolean {
  const versionString = getNeoForgeVersionString()
  const versionDir = join(installDir, 'versions', versionString)
  const versionJson = join(versionDir, `${versionString}.json`)
  return existsSync(versionJson)
}
