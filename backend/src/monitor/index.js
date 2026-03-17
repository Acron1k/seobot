import https from 'https'
import { auditUrl } from '../analyzer/index.js'
import { getActiveMonitoredUrls, updateMonitorResult } from '../db/index.js'

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // каждый час

export function startMonitor() {
  console.log('Monitor started (interval: 1h)')
  runMonitorCycle()
  setInterval(runMonitorCycle, CHECK_INTERVAL_MS)
}

async function runMonitorCycle() {
  const urls = getActiveMonitoredUrls()
  if (!urls.length) return

  console.log(`Monitor: checking ${urls.length} URL(s)`)

  for (const monitor of urls) {
    try {
      const result = await auditUrl(monitor.url)
      const newScore = result.score
      const prevScore = monitor.last_score

      updateMonitorResult(monitor.id, newScore)

      if (prevScore !== null && prevScore !== undefined) {
        const drop = prevScore - newScore
        if (drop >= monitor.alert_threshold) {
          await sendAlert(monitor, prevScore, newScore, drop)
        }
      }
    } catch (err) {
      console.error(`Monitor error for ${monitor.url}:`, err.message)
    }
  }
}

async function sendAlert(monitor, prevScore, newScore, drop) {
  const token = process.env.BOT_TOKEN
  if (!token || !monitor.tg_id) return

  const text =
    `⚠️ *SEO-мониторинг: деградация обнаружена!*\n\n` +
    `🌐 ${monitor.url}\n\n` +
    `📉 Оценка упала с *${prevScore}* до *${newScore}* (−${drop} баллов)\n\n` +
    `Запустите новый аудит для подробного анализа.`

  await sendTgMessage(monitor.tg_id, text)
}

function sendTgMessage(chatId, text) {
  const token = process.env.BOT_TOKEN
  if (!token) return Promise.resolve()
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, resolve)
    req.on('error', () => {})
    req.write(body)
    req.end()
  })
}
