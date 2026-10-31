import { existsSync, mkdirSync, unlinkSync, createWriteStream, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { createHash } from 'crypto'
import https from 'https'
import { pipeline } from 'stream/promises'
import { IncomingMessage } from 'http'
import type { PackManifest, ManifestFile, ProgressEvent } from '../../shared/types'
import { GITHUB_CONFIG, DOWNLOAD_CONFIG } from '../../shared/constants'

export type PackProgressCallback = (progress: ProgressEvent) => void

/**
 * Calcular SHA-256 de um arquivo local.
 * Retorna string hex minúsculo.
 */
export function computeFileSha256(filePath: string): string {
  const data = readFileSync(filePath)
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Buscar o manifest.json remoto com timeout configurável.
 * Retorna null se offline ou manifest inacessível.
 */
export async function fetchRemoteManifest(): Promise<PackManifest | null> {
  try {
    const manifest = await fetchJsonWithTimeout<PackManifest>(
      GITHUB_CONFIG.MANIFEST_URL,
      DOWNLOAD_CONFIG.MANIFEST_TIMEOUT_MS
    )
    return manifest
  } catch (err) {
    console.warn('[PackUpdater] Não foi possível buscar manifest remoto:', (err as Error).message)
    return null
  }
}

/**
 * Comparar o manifest remoto com os arquivos instalados.
 * Retorna listas de arquivos para baixar e deletar.
 */
export function diffManifest(
  installDir: string,
  remote: PackManifest
): { toDownload: ManifestFile[]; toDelete: string[] } {
  const toDownload: ManifestFile[] = []
  const toDelete: string[] = []

  // Verificar quais arquivos precisam ser baixados
  for (const file of remote.files) {
    if (file.protected) continue // nunca atualizar arquivos marcados como protegidos

    // Obter caminho sanitizado para verificar existência local
    const sanitizedPath = sanitizeFilePath(file.path)
    const localPath = join(installDir, sanitizedPath)

    // Verificar proteção por path global
    if (isProtected(file.path, remote.protectedPaths)) continue

    // Se não existe local, baixar
    if (!existsSync(localPath)) {
      toDownload.push(file)
    }
    // Nota: sem validação de hash para simplificar
  }

  // Verificar arquivos locais que foram removidos do manifest (apenas em mods/)
  const modsDir = join(installDir, 'mods')
  if (existsSync(modsDir)) {
    const remoteModPaths = new Set(
      remote.files.filter((f) => f.path.startsWith('mods/')).map((f) => sanitizeFilePath(f.path))
    )

    const localMods = listFilesRecursive(modsDir, installDir)
    for (const localMod of localMods) {
      if (!remoteModPaths.has(localMod)) {
        toDelete.push(localMod) // mod removido do pack
      }
    }
  }

  return { toDownload, toDelete }
}

/**
 * Aplicar o update: baixar arquivos novos/alterados e deletar removidos.
 */
export async function applyUpdate(
  installDir: string,
  files: ManifestFile[],
  filesToDelete: string[],
  onProgress: PackProgressCallback
): Promise<void> {
  // Deletar arquivos removidos do pack
  for (const relativePath of filesToDelete) {
    const fullPath = join(installDir, relativePath)
    if (existsSync(fullPath)) {
      unlinkSync(fullPath)
      console.log('[PackUpdater] Deletado:', relativePath)
    }
  }

  if (files.length === 0) {
    onProgress({ stage: 'Pack atualizado', current: 1, total: 1 })
    return
  }

  let completed = 0
  const total = files.length
  const errors: string[] = []

  // Download paralela com limite de concorrência
  const semaphore = new Semaphore(DOWNLOAD_CONFIG.PARALLEL_DOWNLOADS)

  await Promise.all(
    files.map(async (file) => {
      await semaphore.acquire()
      try {
        // Sanitizar caminho completo preservando o diretório
        const sanitizedRelativePath = sanitizeFilePath(file.path)
        const destPath = join(installDir, sanitizedRelativePath)
        mkdirSync(dirname(destPath), { recursive: true })

        // Download com retry
        let success = false
        let lastError: Error | null = null

        for (let attempt = 1; attempt <= DOWNLOAD_CONFIG.MAX_RETRIES; attempt++) {
          try {
            await downloadFileWithProgress(file.url, destPath, (downloaded, fileTotal, speed) => {
              onProgress({
                stage: `Baixando ${file.path.split('/').pop()}`,
                current: completed,
                total,
                file: file.path,
                speed
              })
              void downloaded; void fileTotal
            })
            success = true
            break
          } catch (err) {
            lastError = err as Error
            console.warn(`[PackUpdater] Tentativa ${attempt} falhou para ${file.path}:`, lastError.message)
            if (attempt < DOWNLOAD_CONFIG.MAX_RETRIES) {
              await sleep(DOWNLOAD_CONFIG.RETRY_DELAYS_MS[attempt - 1])
            }
          }
        }

        if (!success) {
          errors.push(`${file.path}: ${lastError?.message}`)
        }

        completed++
        onProgress({
          stage: `Arquivos baixados: ${completed}/${total}`,
          current: completed,
          total,
          file: file.path
        })
      } finally {
        semaphore.release()
      }
    })
  )

  if (errors.length > 0) {
    throw new Error(`Falha ao baixar ${errors.length} arquivo(s):\n${errors.join('\n')}`)
  }
}

/**
 * Verificar integridade de todos os arquivos do manifest local.
 * Útil para "Reparar instalação".
 */
export async function verifyAndRepair(
  installDir: string,
  manifest: PackManifest,
  onProgress: PackProgressCallback
): Promise<void> {
  const { toDownload } = diffManifest(installDir, manifest)
  await applyUpdate(installDir, toDownload, [], onProgress)
}

// ─── Utilitários internos ─────────────────────────────────────────────────────

/**
 * Sanitizar nome de arquivo para evitar problemas com o Forge.
 * O Forge usa o último segmento após um separador como versão do módulo.
 * Padrões problemáticos:
 *   "Easy.Paper.1.0.0.-.1.20.1.jar"  → versão seria ".1.20.1" (inválida)
 *   "Dungeon.Crawl-1.20.1-2.3.15.jar" → ok, versão seria "2.3.15" (válida)
 * Regra: substituir pontos entre letras por hífens (palavra.palavra → palavra-palavra)
 */
export function sanitizeFileName(fileName: string): string {
  const extIndex = fileName.lastIndexOf('.jar')
  let name = extIndex > 0 ? fileName.substring(0, extIndex) : fileName
  const ext = extIndex > 0 ? '.jar' : ''

  // Substituir espaços por hífens
  name = name.replace(/\s+/g, '-')

  // Substituir pontos entre letras (ou letra-número) por hífens
  // Isso cobre: "Easy.Paper" → "Easy-Paper", "Tinkers.Reforged" → "Tinkers-Reforged"
  // "Easy.Paper.1.0.0" → "Easy-Paper-1.0.0"
  // Mas preserva: "1.20.1", "4.3.15" (número.número)
  name = name.replace(/([A-Za-z])\.([A-Za-z])/g, '$1-$2')   // letra.letra → letra-hífen-letra
  name = name.replace(/([A-Za-z])\.(\d)/g, '$1-$2')          // letra.número → letra-hífen-número

  // Remover caracteres especiais, mas manter pontos (para versões como 1.0.0, 1.20.1) e hífens
  name = name.replace(/[^A-Za-z0-9.\-]/g, '')

  // Limpar sequências inválidas como ".-" ou "-."
  name = name.replace(/\.-/g, '-').replace(/-\./g, '-')

  // Colapsar hífens repetidos
  name = name.replace(/-+/g, '-')

  // Se o nome começar ou terminar com hífen, remover
  name = name.replace(/^-+|-+$/g, '')

  return name + ext
}

/**
 * Sanitizar caminho completo (diretório + nome do arquivo).
 * Preserva o diretório e sanitiza só o nome do arquivo.
 * Ex: "mods/Easy Paper 1.0.0 - 1.20.1.jar" -> "mods/EasyPaper-1.0.0-1.20.1.jar"
 */
export function sanitizeFilePath(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/')
  const lastBackslash = filePath.lastIndexOf('\\')
  const separatorIndex = Math.max(lastSlash, lastBackslash)

  if (separatorIndex === -1) {
    // Sem diretório, só sanitizar o nome
    return sanitizeFileName(filePath)
  }

  const dir = filePath.substring(0, separatorIndex + 1)
  const fileName = filePath.substring(separatorIndex + 1)
  return dir + sanitizeFileName(fileName)
}

function isProtected(filePath: string, protectedPaths: string[] | undefined): boolean {
  if (!protectedPaths || protectedPaths.length === 0) return false
  return protectedPaths.some((p) => filePath === p || filePath.startsWith(p))
}

function listFilesRecursive(dir: string, rootDir: string): string[] {
  const { readdirSync, statSync } = require('fs')
  const results: string[] = []

  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const full = join(dir, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        results.push(...listFilesRecursive(full, rootDir))
      } else {
        // Converter para path relativo usando /
        const relative = full.replace(rootDir + '/', '').replace(rootDir + '\\', '')
        results.push(relative.replace(/\\/g, '/'))
      }
    }
  } catch { /* ignorar erros de leitura */ }

  return results
}

function downloadFileWithProgress(
  url: string,
  destPath: string,
  onProgress?: (downloaded: number, total: number, speed: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doDownload = (currentUrl: string, redirects = 0) => {
      if (redirects > 5) { reject(new Error('Muitos redirecionamentos')); return }

      https.get(currentUrl, (res: IncomingMessage) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doDownload(res.headers.location, redirects + 1)
          return
        }
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
          if (elapsed > 0.3 && onProgress) {
            const speed = (downloaded - lastBytes) / elapsed
            onProgress(downloaded, total, speed)
            lastTime = now
            lastBytes = downloaded
          }
        })

        pipeline(res as NodeJS.ReadableStream, fileStream).then(() => {
          onProgress?.(total, total, 0)
          resolve()
        }).catch(reject)
      }).on('error', reject)
    }

    doDownload(url)
  })
}

function fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout ao buscar manifest')), timeoutMs)

    https.get(url, { headers: { 'User-Agent': 'InasCraft-Launcher/1.0' } }, (res) => {
      clearTimeout(timer)

      // Seguir redirecionamento (GitHub Releases usa redirect)
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchJsonWithTimeout<T>(res.headers.location, timeoutMs).then(resolve).catch(reject)
        return
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }

      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(e) }
      })
    }).on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

/** Semáforo simples para limitar downloads paralelos */
class Semaphore {
  private count: number
  private queue: Array<() => void> = []

  constructor(count: number) {
    this.count = count
  }

  acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (this.count > 0) {
        this.count--
        resolve()
      } else {
        this.queue.push(resolve)
      }
    })
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!
      next()
    } else {
      this.count++
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
