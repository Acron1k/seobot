export type CheckStatus = 'pass' | 'warn' | 'fail'

export interface Check {
  id: string
  name: string
  status: CheckStatus
  value: string | number | boolean | null
  details: string
}

export interface AuditResult {
  auditId: number | null
  url: string
  score: number
  checks: Check[]
  loadTime: number
  recommendations: string
}
