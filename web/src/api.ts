import type { AuditResult } from './types'

export async function runAudit(url: string): Promise<AuditResult> {
  const res = await fetch('/api/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `Ошибка ${res.status}`)
  }
  return res.json() as Promise<AuditResult>
}
