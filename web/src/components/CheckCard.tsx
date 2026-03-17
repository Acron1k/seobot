import type { Check } from '../types'

const STATUS_CONFIG = {
  pass: { icon: '✓', color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/20', bar: 'bg-green-400' },
  warn: { icon: '⚠', color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20', bar: 'bg-yellow-400' },
  fail: { icon: '✗', color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20', bar: 'bg-red-400' },
}

interface Props {
  check: Check
  weight: number
}

export function CheckCard({ check, weight }: Props) {
  const cfg = STATUS_CONFIG[check.status]
  const barWidth = check.status === 'pass' ? 100 : check.status === 'warn' ? 50 : 0

  return (
    <div className={`rounded-xl border p-4 ${cfg.bg}`}>
      <div className="flex items-start gap-3">
        <span className={`text-lg leading-none mt-0.5 ${cfg.color}`}>{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-medium text-sm text-gray-100">{check.name}</span>
            <span className="text-xs text-gray-500 shrink-0">вес {weight}</span>
          </div>
          <p className="text-xs text-gray-400 mb-2">{check.details}</p>
          <div className="h-1.5 rounded-full bg-gray-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${cfg.bar}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
