import { useState } from 'react'

interface Props {
  onSubmit: (url: string) => void
  loading: boolean
}

export function AuditForm({ onSubmit, loading }: Props) {
  const [url, setUrl] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://example.com"
          disabled={loading}
          className="flex-1 rounded-xl bg-gray-800 border border-gray-700 px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 transition"
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed px-6 py-3 font-semibold text-sm text-white transition whitespace-nowrap"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Анализирую...
            </span>
          ) : (
            'Запустить аудит'
          )}
        </button>
      </div>
      {loading && (
        <p className="mt-3 text-xs text-gray-500 text-center">
          Puppeteer анализирует страницу — займёт ~20 секунд
        </p>
      )}
    </form>
  )
}
