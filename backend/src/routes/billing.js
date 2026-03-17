import { Router } from 'express'
import https from 'https'
import {
  getOrCreateUser,
  getUserByDbId,
  getPaymentByYukassa,
  createPayment,
  updatePaymentStatus,
  activateSubscription,
  getUserTierStatus,
  TIER_PRICES,
} from '../db/index.js'

const router = Router()

const YUKASSA_API = 'https://api.yookassa.ru/v3'
const SHOP_ID = process.env.YUKASSA_SHOP_ID
const SECRET_KEY = process.env.YUKASSA_SECRET_KEY
const APP_URL = process.env.APP_URL || 'https://seo.mirobase.ru'

function yukassaRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64')
    const data = JSON.stringify(body)
    const options = {
      hostname: 'api.yookassa.ru',
      path: `/v3${path}`,
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Idempotence-Key': `${Date.now()}-${Math.random()}`,
        'Content-Length': Buffer.byteLength(data),
      },
    }
    const req = https.request(options, (res) => {
      let raw = ''
      res.on('data', (d) => { raw += d })
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) }
        catch { reject(new Error(`Invalid JSON: ${raw}`)) }
      })
    })
    req.on('error', reject)
    if (body) req.write(data)
    req.end()
  })
}

// GET /api/billing/status?tgId=...
router.get('/billing/status', (req, res) => {
  const { tgId } = req.query
  if (!tgId) return res.status(400).json({ error: 'tgId required' })

  const user = getOrCreateUser(parseInt(tgId), null)
  const status = getUserTierStatus(user)

  res.json({
    tier: status.tier,
    active: status.active,
    expiresAt: status.expiresAt,
    auditsUsed: user.audits_this_month,
    prices: TIER_PRICES,
  })
})

// POST /api/billing/pay
// { tgId, tier: 'pro'|'agency', months: 1|3|6|12 }
router.post('/billing/pay', async (req, res) => {
  if (!SHOP_ID || !SECRET_KEY) {
    return res.status(503).json({ error: 'ЮKassa not configured' })
  }

  const { tgId, tier, months = 1 } = req.body
  if (!tgId || !tier) return res.status(400).json({ error: 'tgId and tier required' })
  if (!['pro', 'agency'].includes(tier)) return res.status(400).json({ error: 'Invalid tier' })
  if (![1, 3, 6, 12].includes(parseInt(months))) return res.status(400).json({ error: 'Invalid months' })

  const m = parseInt(months)
  const basePrice = TIER_PRICES[tier]
  const discount = m >= 12 ? 0.1 : m >= 6 ? 0.05 : 0
  const totalAmount = Math.round(basePrice * m * (1 - discount))

  const user = getOrCreateUser(parseInt(tgId), null)

  try {
    const payment = await yukassaRequest('POST', '/payments', {
      amount: { value: `${totalAmount}.00`, currency: 'RUB' },
      confirmation: {
        type: 'redirect',
        return_url: `${APP_URL}/?paid=1`,
      },
      description: `SEO-аудитор: тариф «${tier === 'pro' ? 'Про' : 'Агентство'}» на ${m} мес.`,
      metadata: { user_id: String(user.id), tier, months: String(m) },
      capture: true,
    })

    createPayment({
      userId: user.id,
      yukassaPaymentId: payment.id,
      amount: totalAmount,
      tier,
      months: m,
    })

    res.json({ paymentId: payment.id, confirmationUrl: payment.confirmation.confirmation_url })
  } catch (err) {
    console.error('ЮKassa create payment error:', err)
    res.status(500).json({ error: 'Payment creation failed' })
  }
})

// POST /api/billing/webhook — ЮKassa callback
router.post('/billing/webhook', async (req, res) => {
  const event = req.body
  if (!event || !event.object) return res.status(400).json({ error: 'Invalid webhook' })

  const { id: yukassaId, status, metadata } = event.object

  if (status !== 'succeeded') {
    updatePaymentStatus(yukassaId, status)
    return res.json({ ok: true })
  }

  const existing = getPaymentByYukassa(yukassaId)
  if (!existing || existing.status === 'succeeded') {
    return res.json({ ok: true }) // идемпотентность
  }

  updatePaymentStatus(yukassaId, 'succeeded')

  const userId = parseInt(metadata?.user_id)
  const tier = metadata?.tier
  const months = parseInt(metadata?.months || '1')

  if (userId && tier) {
    activateSubscription(userId, tier, months)

    // Уведомить пользователя в TG
    if (process.env.BOT_TOKEN) {
      const user = getUserByDbId(userId)
      if (user?.tg_id) {
        const tierName = tier === 'pro' ? 'Про' : 'Агентство'
        await notifyTg(user.tg_id,
          `✅ *Подписка активирована!*\n\nТариф: *${tierName}* на *${months} мес.*\n` +
          `Доступно аудитов: ${tier === 'pro' ? '10' : '∞'}/мес\n\n` +
          `Спасибо за доверие! 🙏`
        )
      }
    }
  }

  res.json({ ok: true })
})

async function notifyTg(chatId, text) {
  const token = process.env.BOT_TOKEN
  if (!token) return
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  await new Promise((resolve) => {
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

export default router
