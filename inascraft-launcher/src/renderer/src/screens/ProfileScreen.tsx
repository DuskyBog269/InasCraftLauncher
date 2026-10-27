import React, { useState } from 'react'
import { useElectron } from '../hooks/useElectron'
import type { PlayerProfile } from '../../../shared/types'
import { NICK_VALIDATION } from '../../../shared/constants'

interface Props {
  onProfileSaved: (profile: PlayerProfile) => void
}

export function ProfileScreen({ onProfileSaved }: Props) {
  const [nick, setNick] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const { invoke, IPC } = useElectron()

  function validateNick(value: string): string {
    const trimmed = value.trim()
    if (trimmed.length < NICK_VALIDATION.MIN_LENGTH) {
      return `Mínimo ${NICK_VALIDATION.MIN_LENGTH} caracteres`
    }
    if (trimmed.length > NICK_VALIDATION.MAX_LENGTH) {
      return `Máximo ${NICK_VALIDATION.MAX_LENGTH} caracteres`
    }
    if (!NICK_VALIDATION.PATTERN.test(trimmed)) {
      return NICK_VALIDATION.PATTERN_MESSAGE
    }
    return ''
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setNick(value)
    if (error) setError(validateNick(value))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const validationError = validateNick(nick)
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    try {
      const profile = await invoke<PlayerProfile>(IPC.PROFILE_SAVE, nick.trim())
      onProfileSaved(profile)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="screen-enter" style={styles.container}>
      {/* Barra de título customizada */}
      <div style={styles.titleBar}>
        <span style={styles.titleBarText}>InasCraft</span>
        <button style={styles.closeBtn} onClick={() => window.electronAPI.send('window:close' as never)}>✕</button>
      </div>

      <div style={styles.content}>
        {/* Logo / título */}
        <div style={styles.logoSection}>
          <h1 style={styles.logoText}>
            <span style={{ color: '#5a8a3c' }}>Inas</span>
            <span style={{ color: '#f0f0f0' }}>Craft</span>
          </h1>
          <p style={styles.subtitle}>Bem-vindo! Escolha seu nickname para começar.</p>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div className="mc-panel" style={styles.panel}>
            <label style={styles.label}>NICKNAME</label>
            <input
              className="mc-input"
              type="text"
              value={nick}
              onChange={handleChange}
              placeholder="Ex: Jogador123"
              maxLength={NICK_VALIDATION.MAX_LENGTH}
              autoFocus
              disabled={saving}
              style={error ? { borderColor: 'var(--color-red)' } : undefined}
            />

            {error && (
              <p style={styles.errorText}>⚠ {error}</p>
            )}

            <p style={styles.hint}>
              3–16 caracteres · letras, números e underscore (_)
            </p>

            {nick.trim().length >= 3 && !error && (
              <p style={{ ...styles.hint, color: 'var(--color-text-dim)', marginTop: 4 }}>
                UUID: <code style={{ fontSize: 10 }}>{nick.trim()}</code>
              </p>
            )}
          </div>

          <button
            type="submit"
            className="mc-button mc-button--primary"
            disabled={saving || nick.trim().length < 3}
            style={{ width: '100%', marginTop: 16 }}
          >
            {saving ? 'Salvando...' : '▶ ENTRAR'}
          </button>
        </form>

        <p style={styles.footer}>
          Você pode trocar seu nickname depois nas configurações.
        </p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100vw',
    height: '100vh',
    background: '#1a1a1a',
    display: 'flex',
    flexDirection: 'column',
  },
  titleBar: {
    height: 32,
    background: '#111',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    WebkitAppRegion: 'drag' as never,
    flexShrink: 0,
  },
  titleBarText: {
    color: '#5a8a3c',
    fontSize: 12,
    fontFamily: 'var(--font-minecraft)',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: 14,
    WebkitAppRegion: 'no-drag' as never,
    padding: '2px 6px',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 24,
  },
  logoSection: {
    textAlign: 'center',
  },
  logoText: {
    fontSize: 48,
    fontFamily: 'var(--font-minecraft)',
    textShadow: '3px 3px 0 rgba(0,0,0,0.8)',
    letterSpacing: 2,
  },
  subtitle: {
    color: '#aaa',
    marginTop: 8,
    fontSize: 14,
  },
  form: {
    width: '100%',
    maxWidth: 400,
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    color: '#aaa',
    fontSize: 11,
    letterSpacing: 1,
  },
  errorText: {
    color: 'var(--color-red)',
    fontSize: 12,
    marginTop: 4,
  },
  hint: {
    color: '#666',
    fontSize: 11,
    marginTop: 4,
  },
  footer: {
    color: '#555',
    fontSize: 11,
    textAlign: 'center',
  },
}
