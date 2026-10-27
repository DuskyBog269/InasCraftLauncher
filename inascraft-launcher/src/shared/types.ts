// ============================================================
// Tipos compartilhados entre o processo principal e o renderer
// ============================================================

/** Perfil do jogador salvo localmente */
export interface PlayerProfile {
  nick: string
  uuid: string
  skinPath?: string // caminho absoluto para skin.png local (opcional)
}

/** Configurações do launcher salvas pelo usuário */
export interface LauncherSettings {
  installDir: string
  ramMb: number // memória em MB alocada para o jogo
  profile?: PlayerProfile
  installedVersion?: string // versão do pack atualmente instalada
  javaPath?: string // caminho para o executável java gerenciado
}

/** Um arquivo do manifest do modpack */
export interface ManifestFile {
  path: string // caminho relativo dentro da pasta do pack (ex: "mods/sodium.jar")
  url: string // URL de download
  sha256: string // hash SHA-256 em hex minúsculo
  protected: boolean // se true, nunca sobrescrever em updates
}

/** Formato completo do manifest.json publicado no GitHub Releases */
export interface PackManifest {
  version: string // versão do pack (ex: "1.0.0")
  minecraft: string // versão do MC (ex: "1.20.1")
  modloader: 'neoforge' | 'forge' | 'fabric' | 'quilt'
  modloaderVersion: string
  changelog: string // texto do changelog desta versão
  javaVersion: number // major version (ex: 17)
  files: ManifestFile[]
  protectedPaths: string[] // padrões de path que nunca são sobrescritos
  serverIp?: string // IP opcional para o botão "Entrar no servidor"
  serverPort?: number
}

/** Progresso de download ou instalação */
export interface ProgressEvent {
  stage: string // ex: "Baixando mods", "Instalando NeoForge"
  current: number // bytes ou itens processados
  total: number // total de bytes ou itens
  speed?: number // bytes/segundo (opcional)
  file?: string // nome do arquivo atual (opcional)
}

/** Estado do servidor Minecraft */
export interface ServerStatus {
  online: boolean
  players?: number
  maxPlayers?: number
  motd?: string
}

/** Status do update do launcher */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'not-available'
  | 'error'

/** Status da inicialização do jogo */
export type GameStatus = 'idle' | 'launching' | 'running' | 'crashed' | 'closed'
