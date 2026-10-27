#!/usr/bin/env ts-node
/**
 * InasCraft — Script CLI para construir o manifest.json do modpack.
 *
 * Uso:
 *   npm run build-pack
 *
 * Lê:
 *   - packfiles/          → pasta com os arquivos do modpack
 *   - tools/pack-config.json → configurações do pack (GitHub, versão MC, etc.)
 *   - tools/version.txt   → versão atual (ex: "1.0.0"), auto-incrementada
 *   - tools/CHANGELOG.txt → changelog da nova versão
 *
 * Gera:
 *   - dist-pack/manifest.json
 *   - dist-pack/files/... (cópia dos arquivos do pack)
 */

import { readdirSync, statSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'fs'
import { join, relative, dirname } from 'path'
import { createHash } from 'crypto'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PackConfig {
  githubUser: string
  githubRepo: string
  minecraft: string
  modloader: string
  modloaderVersion: string
}

interface ManifestFile {
  path: string
  url: string
  sha256: string
  protected: boolean
}

interface Manifest {
  version: string
  minecraft: string
  modloader: string
  modloaderVersion: string
  changelog: string
  javaVersion: number
  files: ManifestFile[]
  protectedPaths: string[]
}

// ─── Caminhos ─────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..')
const PACK_DIR = join(ROOT, 'packfiles')
const DIST_DIR = join(ROOT, 'dist-pack')
const FILES_DIR = join(DIST_DIR, 'files')
const CONFIG_PATH = join(__dirname, 'pack-config.json')
const VERSION_PATH = join(__dirname, 'version.txt')
const CHANGELOG_PATH = join(__dirname, 'CHANGELOG.txt')

// Arquivos/pastas que NUNCA são sobrescritos no cliente
const PROTECTED_PATHS = ['options.txt', 'config/', 'shaderpacks/']

// ─── Utilitários ──────────────────────────────────────────────────────────────

/** Calcular SHA-256 de um arquivo */
function sha256File(filePath: string): string {
  const data = readFileSync(filePath)
  return createHash('sha256').update(data).digest('hex')
}

/** Listar todos os arquivos de um diretório recursivamente */
function listFiles(dir: string): string[] {
  const results: string[] = []

  function walk(currentDir: string) {
    const entries = readdirSync(currentDir)
    for (const entry of entries) {
      const fullPath = join(currentDir, entry)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        walk(fullPath)
      } else {
        results.push(fullPath)
      }
    }
  }

  walk(dir)
  return results
}

/** Incrementar versão patch (1.0.0 → 1.0.1) */
function incrementVersion(version: string): string {
  const parts = version.trim().split('.')
  if (parts.length !== 3) return version
  const patch = parseInt(parts[2], 10) + 1
  return `${parts[0]}.${parts[1]}.${patch}`
}

/** Ler arquivo de texto ou retornar valor padrão */
function readTextFile(path: string, fallback = ''): string {
  if (!existsSync(path)) return fallback
  return readFileSync(path, 'utf8').trim()
}

/** Copiar arquivo mantendo estrutura de diretórios */
function copyFile(src: string, destDir: string, relativePath: string) {
  const dest = join(destDir, relativePath)
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(src, dest)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('\n🎮 InasCraft — build-pack\n')

  // ── Ler configurações ──────────────────────────────────────────────────────
  if (!existsSync(CONFIG_PATH)) {
    console.error('❌ tools/pack-config.json não encontrado!')
    console.log('   Crie o arquivo com base no template (veja README).')
    process.exit(1)
  }

  const config: PackConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))

  if (config.githubUser === 'YOUR_USER' || config.githubRepo === 'YOUR_REPO') {
    console.warn('⚠  Atenção: githubUser/githubRepo não configurados em pack-config.json')
    console.warn('   Os URLs no manifest.json estarão incorretos!\n')
  }

  // ── Gerenciar versão ───────────────────────────────────────────────────────
  const currentVersion = readTextFile(VERSION_PATH, '0.0.0')
  const newVersion = incrementVersion(currentVersion)

  console.log(`📌 Versão: ${currentVersion} → ${newVersion}`)

  // ── Ler changelog ──────────────────────────────────────────────────────────
  const changelog = readTextFile(CHANGELOG_PATH, '- Atualização do modpack')
  console.log(`📝 Changelog: ${changelog.split('\n').length} linha(s)`)

  // ── Verificar pasta do pack ────────────────────────────────────────────────
  if (!existsSync(PACK_DIR)) {
    console.error(`❌ Pasta do pack não encontrada: ${PACK_DIR}`)
    console.log('   Coloque os arquivos do modpack em packfiles/')
    process.exit(1)
  }

  const packFiles = listFiles(PACK_DIR)
  if (packFiles.length === 0) {
    console.error('❌ Nenhum arquivo encontrado em packfiles/')
    process.exit(1)
  }

  console.log(`📦 Processando ${packFiles.length} arquivos...\n`)

  // ── Calcular hashes e montar lista de arquivos ─────────────────────────────
  const manifestFiles: ManifestFile[] = []
  const baseUrl = `https://github.com/${config.githubUser}/${config.githubRepo}/releases/download/v${newVersion}`

  let processed = 0
  for (const filePath of packFiles) {
    const relativePath = relative(PACK_DIR, filePath).replace(/\\/g, '/')
    const hash = sha256File(filePath)

    // URL de download no GitHub Releases
    // Arquivos são colocados no dist-pack/files/ e uploadados na release
    const fileName = relativePath.replace(/\//g, '_') // ex: mods_sodium.jar (flat)
    const url = `${baseUrl}/${fileName}`

    manifestFiles.push({
      path: relativePath,
      url,
      sha256: hash,
      protected: false // arquivos em mods/ nunca são protegidos
    })

    processed++
    if (processed % 10 === 0 || processed === packFiles.length) {
      process.stdout.write(`\r   ${processed}/${packFiles.length} processados...`)
    }
  }

  console.log('\n')

  // ── Montar manifest ────────────────────────────────────────────────────────
  const manifest: Manifest = {
    version: newVersion,
    minecraft: config.minecraft,
    modloader: config.modloader,
    modloaderVersion: config.modloaderVersion,
    changelog,
    javaVersion: 17,
    files: manifestFiles,
    protectedPaths: PROTECTED_PATHS
  }

  // ── Criar diretório de saída ───────────────────────────────────────────────
  mkdirSync(DIST_DIR, { recursive: true })
  mkdirSync(FILES_DIR, { recursive: true })

  // ── Salvar manifest.json ───────────────────────────────────────────────────
  const manifestPath = join(DIST_DIR, 'manifest.json')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  console.log(`✅ manifest.json gerado: ${manifestPath}`)

  // ── Copiar arquivos do pack para dist-pack/files/ ─────────────────────────
  // Os arquivos são "aplanados" (flat) no nome para facilitar upload no GitHub Releases
  // ex: packfiles/mods/sodium.jar → dist-pack/files/mods_sodium.jar
  for (const file of manifestFiles) {
    const srcPath = join(PACK_DIR, file.path)
    const destName = file.path.replace(/\//g, '_')
    const destPath = join(FILES_DIR, destName)
    copyFileSync(srcPath, destPath)
  }

  console.log(`✅ ${manifestFiles.length} arquivos copiados para dist-pack/files/`)

  // ── Atualizar version.txt ──────────────────────────────────────────────────
  writeFileSync(VERSION_PATH, newVersion, 'utf8')
  console.log(`✅ version.txt atualizado para ${newVersion}`)

  // ── Resumo final ──────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60))
  console.log(`🎉 Pack construído com sucesso!`)
  console.log(`   Versão:   ${newVersion}`)
  console.log(`   Arquivos: ${manifestFiles.length}`)
  console.log(`   Saída:    ${DIST_DIR}`)
  console.log('\n📤 Próximos passos:')
  console.log('   1. Faça commit das alterações')
  console.log(`   2. Crie uma release no GitHub com a tag v${newVersion}`)
  console.log('   3. Faça upload de dist-pack/manifest.json na release')
  console.log('   4. Faça upload de todos os arquivos em dist-pack/files/ na release')
  console.log('   5. Publique a release — o launcher detectará automaticamente!')
  console.log('   (veja o README para instruções detalhadas)\n')
}

main()
