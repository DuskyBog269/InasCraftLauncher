import React, { useState, useEffect } from 'react'
import { useElectron } from '../hooks/useElectron'
import type { PlayerProfile, LauncherSettings } from '../../../shared/types'
import { NICK_VALIDATION, RAM_DEFAULTS } from '../../../shared/constants'
import { TitleBar } from '../components/TitleBar'

interface Props {
  profile: PlayerProfile
  settings: LauncherSettings
  onBack: () => void
  onSaved: () => void
  onProfileUpdated: (profile: PlayerProfile) => void
}

export function SettingsScreen({ profile, settings, onBack, onSaved, onProfileUpdated }: Props) {
  const { invoke, IPC } = useElectron()

  const [ramMb, setRamMb] = useState(settings.ramMb ?? 2048)
  const [installDir, setInstallDir] = useState(settings.installDir ?? '')
  const [nick, setNick] = useState(profile.nick)
  const [nickError, setNickError] = useState('')
  const [showUuidWarning, setShowUuidWarning] = useState(false)
  const [systemRam, setSystemRam] = useState(8192)
  const [recommendedRam, setRecommendedRam] = useState(2048)
  const [saving, setSaving] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [repairStatus, setRepairStatus] = useState('')
  const [skinPath, setSkinPath] = useState(profile.skinPath ?? '')
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    async function loadSystemInfo() {
      const ramInfo = await invoke<{ totalMb: number; recommendedMb: number }>(IPC.SETTINGS_GET_SYSTEM_RAM)
      setSystemRam(ramInfo.totalMb)
      setRecommendedRam(ramInfo.recommendedMb)
      const version = await invoke<string>(IPC.APP_VERSION)
      setAppVersion(version)
    }
    loadSystemInfo()
  }, [invoke, IPC])

  const maxRam = Math.floor(systemRam * 0.75 / RAM_DEFAULTS.STEP) * RAM_DEFAULTS.STEP
  const ramSteps = Math.floor((maxRam - RAM_DEFAULTS.MIN) / RAM_DEFAULTS.STEP)

  function validateNick(value: string): string {
    const trimmed = value.trim()
    if (trimmed.length < NICK_VALIDATION.MIN_LENGTH) return `Mínimo ${NICK_VALIDATION.MIN_LENGTH} caracteres`
    if (trimmed.length > NICK_VALIDATION.MAX_LENGTH) return `Máximo ${NICK_VALIDATION.MAX_LENGTH} caracteres`
    if (!NICK_VALIDATION.PATTERN.test(trimmed)) return NICK_VALIDATION.PATTERN_MESSAGE
    return ''
  }

  async function handleChooseFolder() {
    const chosen = await invoke<string | null>(IPC.SETTINGS_CHOOSE_FOLDER)
    if (chosen) setInstallDir(chosen)
  }

  async function handleChooseSkin() {
    const chosen = await invoke<string | null>(IPC.SETTINGS_CHOOSE_SKIN)
    if (chosen) setSkinPath(chosen)
  }

  function handleNickChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setNick(value)
    if (nickError) setNickError(validateNick(value))
  }

  function handleSaveNick() {
    const err = validateNick(nick)
    if (err) { setNickError(err); return }
    if (nick.trim() !== profile.nick) {
      setShowUuidWarning(true)
    }
  }

  async function confirmNickChange() {
    setSaving(true)
    try {
      const updated = await invoke<PlayerProfile>(IPC.PROFILE_SAVE, nick.trim())
      onProfileUpdated(updated)
      setShowUuidWarning(false)
    } catch (err) {
      setNickError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveSettings() {
    setSaving(true)
    try {
      await invoke(IPC.SETTINGS_SET, { ramMb, installDir })
      if (skinPath !== profile.skinPath) {
        await invoke(IPC.SETTINGS_SET, { 'profile.skinPath': skinPath })
      }
      onSaved()
    } catch (err) {
      console.error('Erro ao salvar:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleRepair() {
    setRepairing(true)
    setRepairStatus('Verificando arquivos...')
    try {
      await invoke(IPC.PACK_REPAIR)
      setRepairStatus('✓ Reparação concluída!')
    } catch (err) {
      setRepairStatus(`✗ Erro: ${(err as Error).message}`)
    } finally {
      setRepairing(false)
    }
  }

  async function handleOpenGameFolder() {
    await invoke(IPC.SETTINGS_OPEN_GAME_FOLDER)
  }

  return (
    <div style={styles.container} className="screen-enter">
      <TitleBar onOpenSettings={() => {}} showSettingsButton={false} />

      <div style={styles.header}>
        <button className="mc-button" onClick={onBack} style={{ fontSize: 12 }}>
          ← Voltar
        </button>
        <h2 style={styles.title}>⚙ CONFIGURAÇÕES</h2>
        <div style={{ width: 80 }} />
      </div>

      <div style={styles.content}>
        {/* ── Memória ──────────────────────────────────────── */}
        <section className="mc-panel" style={styles.section}>
          <h3 style={styles.sectionTitle}>MEMÓRIA RAM</h3>

          <div style={styles.ramDisplay}>
            <span style={styles.ramValue}>{(ramMb / 1024).toFixed(1)} GB</span>
            {ramMb === recommendedRam && (
              <span style={styles.recommendedBadge}>★ Recomendado</span>
            )}
          </div>

          <input
            type="range"
            min={RAM_DEFAULTS.MIN}
            max={maxRam}
            step={RAM_DEFAULTS.STEP}
            value={ramMb}
            onChange={(e) => setRamMb(Number(e.target.value))}
            style={styles.slider}
          />

          <div style={styles.ramRange}>
            <span>{(RAM_DEFAULTS.MIN / 1024).toFixed(1)} GB</span>
            <span>{(maxRam / 1024).toFixed(1)} GB disponível</span>
          </div>

          <p style={styles.hint}>
            Recomendado: {(recommendedRam / 1024).toFixed(1)} GB
            (metade da sua RAM de {(systemRam / 1024).toFixed(0)} GB)
          </p>

          {/* Marcadores visuais */}
          <div style={styles.ramMarkers}>
            {Array.from({ length: ramSteps + 1 }, (_, i) => {
              const val = RAM_DEFAULTS.MIN + i * RAM_DEFAULTS.STEP
              const pct = ((val - RAM_DEFAULTS.MIN) / (maxRam - RAM_DEFAULTS.MIN)) * 100
              return (
                <div
                  key={val}
                  style={{
                    position: 'absolute',
                    left: `${pct}%`,
                    transform: 'translateX(-50%)',
                    width: 2,
                    height: val === recommendedRam ? 8 : 4,
                    background: val === recommendedRam ? 'var(--color-gold)' : '#555',
                    top: 0
                  }}
                />
              )
            })}
          </div>
        </section>

        {/* ── Pasta de instalação ───────────────────────────── */}
        <section className="mc-panel" style={styles.section}>
          <h3 style={styles.sectionTitle}>PASTA DE INSTALAÇÃO</h3>

          <div style={styles.folderRow}>
            <input
              className="mc-input"
              value={installDir}
              onChange={(e) => setInstallDir(e.target.value)}
              style={{ flex: 1 }}
              readOnly
            />
            <button className="mc-button" onClick={handleChooseFolder} style={{ flexShrink: 0 }}>
              Procurar
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="mc-button" onClick={handleOpenGameFolder} style={styles.utilBtn}>
              📂 Abrir pasta
            </button>
            <button
              className="mc-button"
              onClick={handleRepair}
              disabled={repairing}
              style={styles.utilBtn}
            >
              🔧 Reparar instalação
            </button>
          </div>

          {repairStatus && (
            <p style={{ fontSize: 12, marginTop: 8, color: repairStatus.startsWith('✓') ? 'var(--color-grass)' : 'var(--color-red)' }}>
              {repairStatus}
            </p>
          )}
        </section>

        {/* ── Perfil ────────────────────────────────────────── */}
        <section className="mc-panel" style={styles.section}>
          <h3 style={styles.sectionTitle}>PERFIL</h3>

          <label style={styles.label}>NICKNAME</label>
          <div style={styles.folderRow}>
            <input
              className="mc-input"
              value={nick}
              onChange={handleNickChange}
              maxLength={NICK_VALIDATION.MAX_LENGTH}
              style={{ flex: 1, ...(nickError ? { borderColor: 'var(--color-red)' } : {}) }}
            />
            <button
              className="mc-button"
              onClick={handleSaveNick}
              disabled={saving || nick.trim() === profile.nick}
              style={{ flexShrink: 0 }}
            >
              Salvar
            </button>
          </div>
          {nickError && <p style={{ color: 'var(--color-red)', fontSize: 12, marginTop: 4 }}>⚠ {nickError}</p>}

          {/* Skin */}
          <div style={{ marginTop: 12 }}>
            <label style={styles.label}>SKIN (arquivo .png 64x64)</label>
            <div style={styles.folderRow}>
              <input
                className="mc-input"
                value={skinPath || 'Padrão (Steve)'}
                readOnly
                style={{ flex: 1 }}
              />
              <button className="mc-button" onClick={handleChooseSkin}>
                Escolher
              </button>
              {skinPath && (
                <button className="mc-button mc-button--danger" onClick={() => setSkinPath('')}>
                  Remover
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── Sobre ─────────────────────────────────────────── */}
        <section className="mc-panel" style={{ ...styles.section, fontSize: 11, color: '#666' }}>
          <strong style={{ color: '#888' }}>InasCraft Launcher</strong> v{appVersion || '?'} •
          Minecraft 1.20.1 Forge •{' '}
          <span style={{ color: '#444' }}>UUID: {profile.uuid}</span>
        </section>
      </div>

      {/* Salvar */}
      <div style={styles.saveBar}>
        <button className="mc-button" onClick={onBack}>
          Cancelar
        </button>
        <button
          className="mc-button mc-button--primary"
          onClick={handleSaveSettings}
          disabled={saving}
          style={{ minWidth: 160 }}
        >
          {saving ? 'Salvando...' : '✓ Salvar configurações'}
        </button>
      </div>

      {/* Modal de aviso de UUID */}
      {showUuidWarning && (
        <div style={styles.overlay}>
          <div className="mc-panel" style={styles.warningModal}>
            <h3 style={{ color: 'var(--color-amber)', marginBottom: 12 }}>⚠ Atenção!</h3>
            <p style={{ fontSize: 13, lineHeight: 1.6 }}>
              Trocar o nickname de <strong>{profile.nick}</strong> para{' '}
              <strong>{nick.trim()}</strong> irá{' '}
              <strong style={{ color: 'var(--color-red)' }}>alterar seu UUID</strong>.
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8, color: '#aaa' }}>
              Isso pode fazer você <strong>perder o inventário e progresso</strong> no servidor,
              pois o servidor identifica jogadores pelo UUID.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                className="mc-button"
                onClick={() => setShowUuidWarning(false)}
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
              <button
                className="mc-button mc-button--danger"
                onClick={confirmNickChange}
                disabled={saving}
                style={{ flex: 1 }}
              >
                Confirmar troca
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #333',
    flexShrink: 0,
  },
  title: {
    fontSize: 14,
    color: '#aaa',
    letterSpacing: 2,
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 2,
    color: '#888',
    marginBottom: 4,
  },
  ramDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  ramValue: {
    fontSize: 24,
    color: 'var(--color-grass)',
    fontFamily: 'var(--font-minecraft)',
  },
  recommendedBadge: {
    background: '#2a3d1a',
    color: 'var(--color-gold)',
    fontSize: 10,
    padding: '2px 8px',
    border: '1px solid #3d5c28',
  },
  slider: {
    width: '100%',
    accentColor: 'var(--color-grass)',
    cursor: 'pointer',
  },
  ramRange: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 10,
    color: '#555',
  },
  ramMarkers: {
    position: 'relative',
    height: 8,
    width: '100%',
  },
  hint: {
    fontSize: 11,
    color: '#555',
  },
  folderRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  utilBtn: {
    fontSize: 11,
    padding: '6px 12px',
  },
  label: {
    fontSize: 10,
    letterSpacing: 1,
    color: '#888',
  },
  saveBar: {
    display: 'flex',
    gap: 8,
    padding: '12px 16px',
    borderTop: '1px solid #333',
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  warningModal: {
    width: 400,
    maxWidth: '90%',
  },
}
