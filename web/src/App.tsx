import { useState } from 'react'
import { AuditForm } from './components/AuditForm'
import { ScoreCircle } from './components/ScoreCircle'
import { CheckCard } from './components/CheckCard'
import { runAudit } from './api'
import type { AuditResult } from './types'

const WEIGHTS: Record<string, number> = {
  title: 15,
  description: 12,
  h1: 12,
  viewport: 10,
  load_time: 10,
  images_alt: 8,
  og_tags: 7,
  h2: 6,
  canonical: 5,
  lang: 5,
  robots: 5,
  schema: 5,
}

export default function App() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AuditResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(url: string) {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await runAudit(url)
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }

  const passCount = result?.checks.filter(c => c.status === 'pass').length ?? 0
  const warnCount = result?.checks.filter(c => c.status === 'warn').length ?? 0
  const failCount = result?.checks.filter(c => c.status === 'fail').length ?? 0

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔍</span>
            <span className="font-bold text-lg text-white">SEO Аудитор</span>
            <span className="text-xs text-gray-500 hidden sm:block">by Mirobase</span>
          </div>
          <a
            href="https://t.me/mirobase"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 transition"
          >
            Telegram-бот →
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            AI SEO-аудит за 20 секунд
          </h1>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            Проверяем 12 SEO-факторов и даём рекомендации от AI — бесплатно.
          </p>
        </div>

        {/* Form */}
        <div className="mb-8">
          <AuditForm onSubmit={handleSubmit} loading={loading} />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-red-400 text-sm mb-8">
            <strong>Ошибка:</strong> {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-8">
            {/* Score overview */}
            <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <ScoreCircle score={result.score} />
                <div className="flex-1 text-center sm:text-left">
                  <p className="text-sm text-gray-500 mb-1 break-all">
                    <a href={result.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                      {result.url}
                    </a>
                  </p>
                  <p className="text-gray-300 text-sm mb-4">
                    Загрузка: <span className="text-white font-medium">{result.loadTime}мс</span>
                  </p>
                  <div className="flex items-center justify-center sm:justify-start gap-4 text-sm">
                    <span className="flex items-center gap-1.5 text-green-400">
                      <span className="text-base">✓</span> {passCount} прошли
                    </span>
                    <span className="flex items-center gap-1.5 text-yellow-400">
                      <span className="text-base">⚠</span> {warnCount} предупреждений
                    </span>
                    <span className="flex items-center gap-1.5 text-red-400">
                      <span className="text-base">✗</span> {failCount} ошибок
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Recommendations */}
            {result.recommendations && (
              <div className="rounded-2xl bg-blue-950/40 border border-blue-500/20 p-6">
                <h2 className="text-base font-semibold text-blue-300 mb-3 flex items-center gap-2">
                  <span>✨</span> AI-рекомендации
                </h2>
                <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {result.recommendations}
                </div>
              </div>
            )}

            {/* Checks grid */}
            <div>
              <h2 className="text-base font-semibold text-gray-300 mb-4">Детальные проверки</h2>
              {/* Failures first */}
              {failCount > 0 && (
                <div className="mb-6">
                  <h3 className="text-xs font-medium text-red-400 uppercase tracking-wider mb-3">
                    Критичные ошибки ({failCount})
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {result.checks
                      .filter(c => c.status === 'fail')
                      .map(c => <CheckCard key={c.id} check={c} weight={WEIGHTS[c.id] ?? 5} />)}
                  </div>
                </div>
              )}
              {warnCount > 0 && (
                <div className="mb-6">
                  <h3 className="text-xs font-medium text-yellow-400 uppercase tracking-wider mb-3">
                    Предупреждения ({warnCount})
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {result.checks
                      .filter(c => c.status === 'warn')
                      .map(c => <CheckCard key={c.id} check={c} weight={WEIGHTS[c.id] ?? 5} />)}
                  </div>
                </div>
              )}
              {passCount > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-green-400 uppercase tracking-wider mb-3">
                    Пройдено ({passCount})
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {result.checks
                      .filter(c => c.status === 'pass')
                      .map(c => <CheckCard key={c.id} check={c} weight={WEIGHTS[c.id] ?? 5} />)}
                  </div>
                </div>
              )}
            </div>

            {/* CTA */}
            <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6 text-center">
              <p className="text-gray-300 mb-2">Нужна помощь с улучшением SEO?</p>
              <p className="text-gray-500 text-sm mb-4">
                Веб-студия Mirobase — сайты, боты, CRM-интеграции
              </p>
              <a
                href="https://mirobase.ru"
                target="_blank"
                rel="noreferrer"
                className="inline-block rounded-xl bg-blue-600 hover:bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white transition"
              >
                mirobase.ru →
              </a>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <div className="text-center py-12 text-gray-600">
            <p className="text-4xl mb-4">📊</p>
            <p className="text-sm">Введите URL выше и нажмите «Запустить аудит»</p>
          </div>
        )}
      </main>
    </div>
  )
}
