import 'dotenv/config'
import express from 'express'
import { createBot } from './bot/index.js'
import auditRouter from './routes/audit.js'

const app = express()
const PORT = process.env.PORT || 3310

app.use(express.json())

app.use('/api', auditRouter)

app.get('/health', (_req, res) => res.json({ ok: true }))

app.listen(PORT, () => {
  console.log(`API running on :${PORT}`)
})

// Запускаем TG-бот
if (process.env.BOT_TOKEN) {
  const bot = createBot()
  bot.start({
    onStart: () => console.log('Bot started'),
  })
  console.log('Telegram bot started')
} else {
  console.warn('BOT_TOKEN not set — bot disabled')
}
