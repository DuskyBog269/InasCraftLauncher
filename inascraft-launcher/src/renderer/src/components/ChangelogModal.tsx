import React from 'react'
import type { PackManifest } from '../../../shared/types'

interface Props {
  manifest: PackManifest
  currentVersion?: string
  onUpdate: () => void
  onSkip: () => void
}

export function ChangelogModal({ manifest, currentVersion, onUpdate, onSkip }: Props) {
  const isFirstInstall = !currentVersion

  return (
    <div style={styles.overlay}>
      <div className="mc-panel screen-enter" style={styles.modal}>
        {/* Cabeçalho */}
        <div style={styles.header}>
          <span style={{ color: '#5a8a3c' }}>📦</span>
          <h2 style={styles.title}>
            {isFirstInstall
              ? `Instalar modpack v${manifest.version}`
              : `Atualização disponível: v${manifest.version}`}
          </h2>
        </div>

        {/* Versão */}
        {!isFirstInstall && currentVersion && (
          <p style={styles.versionLine}>
            <span style={{ color: '#888' }}>v{currentVersion}</span>
            {' → '}
            <span style={{ color: 'var(--color-grass)' }}>v{manifest.version}</span>
          </p>
        )}

        {/* Changelog */}
        <div style={styles.changelogBox}>
          <p style={styles.changelogLabel}>NOVIDADES</p>
          <div style={styles.changelogText}>
            {manifest.changelog
              ? manifest.changelog.split('\n').map((line, i) => (
                  <p key={i} style={{ margin: '2px 0', color: line.startsWith('-') ? '#ccc' : '#aaa' }}>
                    {line || <br />}
                  </p>
                ))
              : <p style={{ color: '#666' }}>Sem changelog disponível.</p>
            }
          </div>
        </div>

        {/* Informações do modpack */}
        <div style={styles.infoRow}>
          <span style={styles.infoTag}>MC {manifest.minecraft}</span>
          <span style={styles.infoTag}>{manifest.modloader} {manifest.modloaderVersion}</span>
          <span style={styles.infoTag}>{manifest.files.length} arquivos</span>
        </div>

        {/* Botões */}
        <div style={styles.buttons}>
          {!isFirstInstall && (
            <button className="mc-button" onClick={onSkip} style={{ flex: 1 }}>
              Jogar sem atualizar
            </button>
          )}
          <button
            className="mc-button mc-button--primary"
            onClick={onUpdate}
            style={{ flex: 2 }}
          >
            {isFirstInstall ? '📦 Instalar modpack' : '🔄 Atualizar e jogar'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  modal: {
    width: 460,
    maxWidth: '90%',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 14,
    color: 'var(--color-text)',
  },
  versionLine: {
    fontSize: 12,
  },
  changelogBox: {
    background: '#111',
    border: '1px solid #333',
    padding: 12,
    flex: 1,
    overflowY: 'auto',
    minHeight: 100,
    maxHeight: 200,
  },
  changelogLabel: {
    fontSize: 10,
    color: '#555',
    letterSpacing: 1,
    marginBottom: 8,
  },
  changelogText: {
    fontSize: 12,
    lineHeight: 1.6,
  },
  infoRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  infoTag: {
    background: '#333',
    color: '#aaa',
    fontSize: 10,
    padding: '2px 8px',
    border: '1px solid #444',
  },
  buttons: {
    display: 'flex',
    gap: 8,
  },
}
