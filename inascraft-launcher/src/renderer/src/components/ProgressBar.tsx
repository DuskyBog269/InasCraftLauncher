import React from 'react'
import type { ProgressEvent } from '../../../shared/types'

interface Props {
  progress: ProgressEvent
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`
}

export function ProgressBar({ progress }: Props) {
  const { stage, current, total, speed, file } = progress
  const hasTotal = total > 0
  const pct = hasTotal ? Math.min(100, (current / total) * 100) : 0
  const isBytes = total > 1024 // heurística: se total > 1 KB, provavelmente são bytes

  return (
    <div style={styles.container}>
      {/* Estágio atual */}
      <div style={styles.stageRow}>
        <span style={styles.stage}>{stage}</span>
        {hasTotal && isBytes && (
          <span style={styles.meta}>
            {formatBytes(current)} / {formatBytes(total)}
            {speed ? ` · ${formatSpeed(speed)}` : ''}
          </span>
        )}
        {hasTotal && !isBytes && (
          <span style={styles.meta}>
            {current}/{total}
          </span>
        )}
      </div>

      {/* Nome do arquivo atual */}
      {file && (
        <div style={styles.fileName} title={file}>
          {file.split('/').pop()}
        </div>
      )}

      {/* Barra de progresso pixel art */}
      <div className={`mc-progress ${!hasTotal ? 'mc-progress--indeterminate' : ''}`}>
        <div
          className="mc-progress__fill"
          style={{ width: hasTotal ? `${pct}%` : undefined }}
        />
      </div>

      {/* Porcentagem */}
      {hasTotal && (
        <div style={styles.pct}>{pct.toFixed(0)}%</div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    width: '100%',
  },
  stageRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stage: {
    fontSize: 12,
    color: 'var(--color-text)',
  },
  meta: {
    fontSize: 11,
    color: 'var(--color-text-dim)',
  },
  fileName: {
    fontSize: 10,
    color: '#666',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  pct: {
    fontSize: 10,
    color: 'var(--color-text-dim)',
    textAlign: 'right',
  },
}
