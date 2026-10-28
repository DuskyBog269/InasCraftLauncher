import { existsSync, mkdirSync, createWriteStream, unlinkSync } from 'fs'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import https from 'https'
import { IncomingMessage } from 'http'
import { PACK_CONFIG } from '../../shared/constants'
import type { ProgressEvent } from '../../shared/types'

export type InstallProgressCallback = (progress: ProgressEvent) => void

/** URL do client.jar 1.20.1 da Mojang */
const MC_CLIENT_URL = 'https://launcher.mojang.com/v1/objects/8f3bf2c3b53d3eb83d995e39d2d9e3c5e3aa6469/client.jar'

/**
 * Instalar Minecraft 1.20.1 básico (client.jar + versão.json).
 */
export async function installMinecraft(
  installDir: string,
  _javaPath: string,
  onProgress: InstallProgressCallback
): Promise<void> {
  mkdirSync(installDir, { recursive: true })

  const versionDir = join(installDir, 'versions', PACK_CONFIG.MINECRAFT_VERSION)
  const clientJarPath = join(versionDir, `${PACK_CONFIG.MINECRAFT_VERSION}.jar`)
  const versionJsonPath = join(versionDir, `${PACK_CONFIG.MINECRAFT_VERSION}.json`)

  // Se já existe, pular
  if (existsSync(clientJarPath)) {
    console.log('[MC] Já instalado, pulando')
    return
  }

  mkdirSync(versionDir, { recursive: true })

  // Baixar client.jar
  onProgress({ stage: 'Baixando Minecraft client.jar...', current: 0, total: 100 })

  await downloadFile(MC_CLIENT_URL, clientJarPath, (downloaded, total) => {
    onProgress({
      stage: 'Baixando Minecraft...',
      current: downloaded,
      total,
      file: 'client.jar'
    })
  })

  // Criar versão.json
  const versionJson = {
    id: PACK_CONFIG.MINECRAFT_VERSION,
    releaseTime: new Date().toISOString(),
    time: new Date().toISOString(),
    type: 'release',
    mainClass: 'net.minecraft.client.main.Main',
    inheritsFrom: undefined,
    arguments: {
      game: [],
      jvm: []
    },
    libraries: [],
    minimumLauncherVersion: 21
  }

  require('fs').writeFileSync(versionJsonPath, JSON.stringify(versionJson, null, 2))
  console.log('[MC] Instalado em', clientJarPath)
}

/** Verificar se o Minecraft já está instalado */
export function isMinecraftInstalled(installDir: string): boolean {
  const clientJar = join(installDir, 'versions', PACK_CONFIG.MINECRAFT_VERSION, `${PACK_CONFIG.MINECRAFT_VERSION}.jar`)
  return existsSync(clientJar)
}

/** String de versão NeoForge */
export function getNeoForgeVersionString(): string {
  return `${PACK_CONFIG.MINECRAFT_VERSION}-neoforge-${PACK_CONFIG.MODLOADER_VERSION}`
}

/** Verificar se NeoForge está instalado */
export function isNeoForgeInstalled(installDir: string): boolean {
  const versionString = getNeoForgeVersionString()
  const versionJson = join(installDir, 'versions', versionString, `${versionString}.json`)
  return existsSync(versionJson)
}

function downloadFile(url: string, destPath: string, onProgress?: (downloaded: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'InasCraft-Launcher/1.0' } }, (res: IncomingMessage) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      const total = parseInt(res.headers['content-length'] ?? '0', 10)
      let downloaded = 0
      let lastTime = Date.now()
      let lastBytes = 0

      const fileStream = createWriteStream(destPath)
      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        const now = Date.now()
        const elapsed = (now - lastTime) / 1000
        if (elapsed >= 0.5 && onProgress) {
          onProgress(downloaded, total)
          lastTime = now
          lastBytes = downloaded
        }
      })

      pipeline(res as NodeJS.ReadableStream, fileStream)
        .then(() => { onProgress?.(total, total); resolve() })
        .catch(reject)
    }).on('error', reject)
  })
}