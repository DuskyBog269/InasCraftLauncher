// ============================================================
// Constantes globais do projeto
// ============================================================

/** Configuração do modpack */
export const PACK_CONFIG = {
  MINECRAFT_VERSION: '1.20.1',
  MODLOADER: 'fabric' as const,
  MODLOADER_VERSION: '0.16.9', // Fabric para MC 1.20.1
  JAVA_VERSION: 17
}

/** Configuração do GitHub — preencher antes de publicar */
export const GITHUB_CONFIG = {
  USER: 'DuskyBog269',
  REPO: 'InasCraftLauncher',
  /** URL base para o manifest.json na última release */
  get MANIFEST_URL() {
    return `https://github.com/${this.USER}/${this.REPO}/releases/latest/download/manifest.json`
  }
}

/** Configuração do servidor de jogo (preencher quando disponível) */
export const SERVER_CONFIG = {
  IP: 'YOUR_SERVER_IP',
  PORT: 25565
}

/** Validação de nickname */
export const NICK_VALIDATION = {
  MIN_LENGTH: 3,
  MAX_LENGTH: 16,
  PATTERN: /^[a-zA-Z0-9_]+$/,
  PATTERN_MESSAGE: 'Apenas letras, números e underscore (_)'
}

/** Configurações padrão de memória (em MB) */
export const RAM_DEFAULTS = {
  MIN: 1024,
  RECOMMENDED_FRACTION: 0.5, // metade da RAM do sistema
  MAX_CAP: 8192, // nunca mais que 8 GB por padrão
  STEP: 256
}

/** Timeouts e retries para downloads */
export const DOWNLOAD_CONFIG = {
  MANIFEST_TIMEOUT_MS: 5000,
  DOWNLOAD_TIMEOUT_MS: 60000,
  MAX_RETRIES: 3,
  PARALLEL_DOWNLOADS: 4,
  RETRY_DELAYS_MS: [2000, 4000, 8000]
}

/** Namespace UUID v3 para geração de UUID offline (igual ao Minecraft) */
export const MINECRAFT_OFFLINE_UUID_NAMESPACE = '00000000-0000-0000-0000-000000000000'

/** Prefixo usado pelo Minecraft para gerar UUID offline */
export const OFFLINE_PLAYER_PREFIX = 'OfflinePlayer:'
