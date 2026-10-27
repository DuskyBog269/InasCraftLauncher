// ============================================================
// Definição de todos os canais IPC usados no projeto.
// Manter centralizado evita erros de digitação nos strings.
// ============================================================

export const IPC = {
  // --- Perfil do jogador ---
  PROFILE_LOAD: 'profile:load',
  PROFILE_SAVE: 'profile:save',

  // --- Configurações ---
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_SYSTEM_RAM: 'settings:get-system-ram',
  SETTINGS_OPEN_GAME_FOLDER: 'settings:open-game-folder',
  SETTINGS_CHOOSE_FOLDER: 'settings:choose-folder',
  SETTINGS_CHOOSE_SKIN: 'settings:choose-skin',

  // --- Java ---
  JAVA_CHECK: 'java:check',
  JAVA_DOWNLOAD_PROGRESS: 'java:download-progress',

  // --- Instalação do Minecraft / pack ---
  INSTALL_START: 'install:start',
  INSTALL_PROGRESS: 'install:progress',
  INSTALL_COMPLETE: 'install:complete',
  INSTALL_ERROR: 'install:error',

  // --- Update do pack ---
  PACK_CHECK_UPDATE: 'pack:check-update',
  PACK_APPLY_UPDATE: 'pack:apply-update',
  PACK_UPDATE_PROGRESS: 'pack:update-progress',
  PACK_REPAIR: 'pack:repair',

  // --- Jogo ---
  GAME_LAUNCH: 'game:launch',
  GAME_EXIT: 'game:exit',
  GAME_CRASH: 'game:crash',
  GAME_LOG: 'game:log',

  // --- Rede / servidor ---
  SERVER_STATUS: 'server:status',
  NETWORK_OFFLINE: 'network:offline',

  // --- Auto-update do launcher ---
  UPDATER_STATUS: 'updater:status',
  UPDATER_INSTALL: 'updater:install',

  // --- Utilitários ---
  CLIPBOARD_WRITE: 'clipboard:write',
  SHELL_OPEN_PATH: 'shell:open-path',
  APP_VERSION: 'app:version'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
