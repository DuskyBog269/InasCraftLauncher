import React, { useState, useEffect, useCallback } from 'react'
import { useElectron } from '../hooks/useElectron'
import type { PlayerProfile, LauncherSettings, ProgressEvent, PackManifest } from '../../../shared/types'
import { ProgressBar } from '../components/ProgressBar'
import { ServerStatus } from '../components/ServerStatus'
import { ChangelogModal } from '../components/ChangelogModal'
import { CrashModal } from '../components/CrashModal'
import { UpdateBanner } from '../components/UpdateBanner'
import { TitleBar } from '../components/TitleBar'

interface Props {
  profile: PlayerProfile
  settings: LauncherSettings
  onOpenSettings: () => void
}

type LaunchState =
  | 'idle'
  | 'checking'
  | 'update-available'
  | 'updating'
  | 'installing'
  | 'launching'
  | 'running'
  | 'error'

const SPLASH_TEXTS = [
  'Cuidado com os Creepers!',
  'Não cave direto para baixo!',
  'Durma à noite para evitar monstros.',
  'Construa uma cama o quanto antes!',
  'Cobblestone é seu melhor amigo.',
  'Nunca troque diamantes por maçãs.',
  'O Herobrine não é real. Ou é?',
  'Crafting table primeiro!',
  'Fogo é uma boa ferramenta e um péssimo vizinho.',
  'Bienvenidos, welkom, bienvenue!',
  'Porcos podem voar com selas e cogumelos!',
  'Explora, constrói, sobrevive!',
]

export function MainScreen({ profile, settings, onOpenSettings }: Props) {
  const { invoke, on, IPC } = useElectron()

  const [launchState, setLaunchState] = useState<LaunchState>('idle')
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [isOffline, setIsOffline] = useState(false)
  const [installedVersion, setInstalledVersion] = useState<string | undefined>(settings.installedVersion)
  const [pendingManifest, setPendingManifest] = useState<PackManifest | null>(null)
  const [showChangelog, setShowChangelog] = useState(false)
  const [crashData, setCrashData] = useState<{ log: string; logPath: string } | null>(null)
  const [launcherUpdateInfo, setLauncherUpdateInfo] = useState<{ status: string; info?: { version: string } } | null>(null)
  const [splashText] = useState(() => SPLASH_TEXTS[Math.floor(Math.random() * SPLASH_TEXTS.length)])

  // Registrar listeners de eventos do processo principal
  useEffect(() => {
    const cleanups: Array<() => void> = []

    cleanups.push(on(IPC.INSTALL_PROGRESS, (event) => {
      setProgress(event as ProgressEvent)
    }))

    cleanups.push(on(IPC.JAVA_DOWNLOAD_PROGRESS, (data) => {
      const { downloaded, total } = data as { downloaded: number; total: number }
      setProgress({
        stage: 'Baixando Java 17...',
        current: downloaded,
        total,
        file: 'Temurin JRE 17'
      })
    }))

    cleanups.push(on(IPC.INSTALL_COMPLETE, () => {
      setProgress(null)
      setStatusMessage('Instalação concluída!')
    }))

    cleanups.push(on(IPC.INSTALL_ERROR, (data) => {
      const { message } = data as { message: string }
      setLaunchState('error')
      setStatusMessage(`Erro: ${message}`)
    }))

    cleanups.push(on(IPC.PACK_CHECK_UPDATE, (data) => {
      const updateData = data as { hasUpdate: boolean; manifest: PackManifest; isFirstInstall?: boolean }
      if (updateData.hasUpdate || updateData.isFirstInstall) {
        setPendingManifest(updateData.manifest)
        setShowChangelog(true)
        setLaunchState('update-available')
      }
    }))

    cleanups.push(on(IPC.PACK_UPDATE_PROGRESS, (event) => {
      setProgress(event as ProgressEvent)
    }))

    cleanups.push(on(IPC.NETWORK_OFFLINE, (data) => {
      const { version } = data as { version: string }
      setIsOffline(true)
      setInstalledVersion(version)
    }))

    cleanups.push(on(IPC.GAME_EXIT, (data) => {
      const { status } = data as { status: string }
      if (status === 'closed') {
        setLaunchState('idle')
        setStatusMessage('')
      }
    }))

    cleanups.push(on(IPC.GAME_CRASH, (data) => {
      const crashInfo = data as { log: string; logPath: string }
      setCrashData(crashInfo)
      setLaunchState('idle')
    }))

    cleanups.push(on(IPC.UPDATER_STATUS, (data) => {
      const update = data as { status: string; info?: { version: string } }
      setLauncherUpdateInfo(update)
    }))

    return () => cleanups.forEach((cleanup) => cleanup())
  }, [on, IPC])

  const handlePlay = useCallback(async () => {
    if (launchState !== 'idle') return

    setLaunchState('checking')
    setStatusMessage('Verificando instalação...')
    setProgress(null)

    try {
      setLaunchState('installing')
      await invoke(IPC.INSTALL_START)

      // Se chegou aqui sem abrir modal de changelog, pode lançar
      if (launchState !== 'update-available') {
        setLaunchState('launching')
        setStatusMessage('Iniciando Minecraft...')
        await invoke(IPC.GAME_LAUNCH)
        setLaunchState('running')
        setStatusMessage('Jogando...')
      }
    } catch (err) {
      setLaunchState('error')
      setStatusMessage(`Erro ao iniciar: ${(err as Error).message}`)
    }
  }, [launchState, invoke, IPC])

  const handleApplyUpdate = async () => {
    if (!pendingManifest) return
    setShowChangelog(false)
    setLaunchState('updating')
    setStatusMessage('Atualizando modpack...')

    try {
      await invoke(IPC.PACK_APPLY_UPDATE, pendingManifest)
      setInstalledVersion(pendingManifest.version)
      setPendingManifest(null)
      setLaunchState('launching')
      setStatusMessage('Iniciando Minecraft...')
      await invoke(IPC.GAME_LAUNCH)
      setLaunchState('running')
    } catch (err) {
      setLaunchState('error')
      setStatusMessage(`Erro ao atualizar: ${(err as Error).message}`)
    }
  }

  const handleSkipUpdate = async () => {
    setShowChangelog(false)
    setPendingManifest(null)
    setLaunchState('launching')
    setStatusMessage('Iniciando Minecraft...')

    try {
      await invoke(IPC.GAME_LAUNCH)
      setLaunchState('running')
    } catch (err) {
      setLaunchState('error')
      setStatusMessage(`Erro ao iniciar: ${(err as Error).message}`)
    }
  }

  const isPlayDisabled = launchState !== 'idle' && launchState !== 'error'

  const getPlayButtonText = () => {
    switch (launchState) {
      case 'checking': return '⏳ Verificando...'
      case 'installing': return '📦 Instalando...'
      case 'updating': return '🔄 Atualizando...'
      case 'launching': return '🚀 Iniciando...'
      case 'running': return '🎮 Jogando...'
      case 'error': return '▶ TENTAR NOVAMENTE'
      default: return '▶ JOGAR'
    }
  }

  return (
    <div style={styles.container}>
      {/* Barra de título customizada */}
      <TitleBar onOpenSettings={onOpenSettings} />

      {/* Banner offline */}
      {isOffline && (
        <div style={styles.offlineBanner}>
          ⚠ Sem conexão — usando versão instalada ({installedVersion ?? '?'})
        </div>
      )}

      {/* Banner de update do launcher */}
      {launcherUpdateInfo && (launcherUpdateInfo.status === 'available' || launcherUpdateInfo.status === 'ready') && (
        <UpdateBanner status={launcherUpdateInfo} />
      )}

      {/* Conteúdo principal */}
      <div style={styles.content}>
        {/* Header com logo e perfil */}
        <div style={styles.header}>
          <div style={styles.logoArea}>
            <h1 style={styles.logoText}>
              <span style={{ color: '#5a8a3c' }}>Inas</span>
              <span style={{ color: '#f0f0f0' }}>Craft</span>
            </h1>
            <p style={styles.splashText}>{splashText}</p>
          </div>

          <div style={styles.profileBadge}>
            <div style={styles.avatar}>👤</div>
            <div>
              <div style={styles.nickName}>{profile.nick}</div>
              <div style={styles.versionTag}>
                {installedVersion ? `v${installedVersion}` : 'Não instalado'}
              </div>
            </div>
          </div>
        </div>

        {/* Botão JOGAR */}
        <div style={styles.playSection}>
          <button
            className="mc-button mc-button--primary"
            onClick={handlePlay}
            disabled={isPlayDisabled}
            style={styles.playButton}
          >
            {getPlayButtonText()}
          </button>

          {/* Barra de progresso */}
          {progress && (
            <div style={styles.progressSection}>
              <ProgressBar progress={progress} />
            </div>
          )}

          {/* Mensagem de status */}
          {statusMessage && !progress && (
            <p style={{
              ...styles.statusText,
              color: launchState === 'error' ? 'var(--color-red)' : 'var(--color-text-dim)'
            }}>
              {statusMessage}
            </p>
          )}
        </div>

        {/* Footer com status do servidor */}
        <div style={styles.footer}>
          <ServerStatus />
          <p style={styles.footerVersion}>
            InasCraft Launcher • MC 1.20.1 NeoForge
          </p>
        </div>
      </div>

      {/* Modal de changelog/update */}
      {showChangelog && pendingManifest && (
        <ChangelogModal
          manifest={pendingManifest}
          currentVersion={installedVersion}
          onUpdate={handleApplyUpdate}
          onSkip={handleSkipUpdate}
        />
      )}

      {/* Modal de crash */}
      {crashData && (
        <CrashModal
          log={crashData.log}
          logPath={crashData.logPath}
          onClose={() => setCrashData(null)}
        />
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100vw',
    height: '100vh',
    background: 'var(--color-bg)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  offlineBanner: {
    background: '#3d2a00',
    color: 'var(--color-amber)',
    padding: '6px 16px',
    fontSize: 12,
    textAlign: 'center',
    borderBottom: '1px solid #6a4800',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 32px',
    gap: 24,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  logoArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  logoText: {
    fontSize: 40,
    fontFamily: 'var(--font-minecraft)',
    textShadow: '3px 3px 0 rgba(0,0,0,0.8)',
    letterSpacing: 2,
    lineHeight: 1,
  },
  splashText: {
    color: 'var(--color-gold)',
    fontSize: 11,
    transform: 'rotate(-2deg)',
    transformOrigin: 'left center',
    textShadow: '1px 1px 0 rgba(0,0,0,0.8)',
    marginLeft: 8,
  },
  profileBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--color-panel)',
    padding: '8px 12px',
    border: '1px solid var(--color-border)',
  },
  avatar: {
    fontSize: 24,
  },
  nickName: {
    color: 'var(--color-text)',
    fontSize: 14,
    fontFamily: 'var(--font-minecraft)',
  },
  versionTag: {
    color: 'var(--color-text-dim)',
    fontSize: 10,
    marginTop: 2,
  },
  playSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  playButton: {
    minWidth: 280,
    padding: '16px 48px',
    fontSize: 22,
    letterSpacing: 2,
  },
  progressSection: {
    width: '100%',
    maxWidth: 500,
  },
  statusText: {
    fontSize: 12,
    textAlign: 'center',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  footerVersion: {
    color: '#444',
    fontSize: 10,
  },
}
