import { Bot, InlineKeyboard } from 'grammy'
import { auditUrl } from '../analyzer/index.js'
import { generateRecommendations } from '../ai/recommendations.js'
import {
  getOrCreateUser, incrementAuditCount, saveAudit, getUserAudits,
  getUserTierStatus, addMonitoredUrl, removeMonitoredUrl, getUserMonitoredUrls,
  TIER_LIMITS,
} from '../db/index.js'

const LIMITS = TIER_LIMITS

export function createBot() {
  const bot = new Bot(process.env.BOT_TOKEN)

  bot.command('start', async (ctx) => {
    const user = getOrCreateUser(ctx.from.id, ctx.from.username)
    await ctx.reply(
      `👋 Привет! Я анализирую SEO вашего сайта с помощью AI.\n\n` +
      `Просто отправьте ссылку — получите подробный отчёт с оценкой и рекомендациями.\n\n` +
      `🆓 Бесплатно: 1 аудит в месяц\n` +
      `💎 Про: 10 аудитов + мониторинг — 990₽/мес\n\n` +
      `*Использовано в этом месяце:* ${user.audits_this_month}/${LIMITS[user.tier]} аудитов`,
      { parse_mode: 'Markdown' }
    )
  })

  bot.command('history', async (ctx) => {
    const user = getOrCreateUser(ctx.from.id, ctx.from.username)
    const audits = getUserAudits(user.id)
    if (!audits.length) {
      return ctx.reply('Вы ещё не делали аудитов. Отправьте ссылку на сайт!')
    }
    const lines = audits.map((a, i) =>
      `${i + 1}. ${scoreEmoji(a.score)} *${a.score}/100* — ${a.url}\n   _${formatDate(a.created_at)}_`
    ).join('\n\n')
    await ctx.reply(`📋 *Последние аудиты:*\n\n${lines}`, { parse_mode: 'Markdown' })
  })

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `*Команды:*\n` +
      `/start — начало работы\n` +
      `/history — история аудитов\n` +
      `/subscribe — оформить подписку\n` +
      `/monitor — управление мониторингом\n` +
      `/help — помощь\n\n` +
      `*Как пользоваться:*\n` +
      `Просто отправьте URL сайта, например:\n` +
      `https://example.ru\n\n` +
      `Аудит занимает 15-30 секунд.`,
      { parse_mode: 'Markdown' }
    )
  })

  bot.command('subscribe', async (ctx) => {
    const user = getOrCreateUser(ctx.from.id, ctx.from.username)
    const status = getUserTierStatus(user)

    if (status.active && status.tier !== 'free') {
      const tierName = status.tier === 'pro' ? 'Про' : 'Агентство'
      const exp = new Date(status.expiresAt).toLocaleDateString('ru-RU')
      return ctx.reply(
        `✅ *Подписка активна*\n\nТариф: *${tierName}*\nДействует до: *${exp}*`,
        { parse_mode: 'Markdown' }
      )
    }

    const keyboard = new InlineKeyboard()
      .text('💎 Про — 990₽/мес', 'buy_pro_1')
      .row()
      .text('🏢 Агентство — 4990₽/мес', 'buy_agency_1')

    await ctx.reply(
      `*Тарифы SEO-аудитора:*\n\n` +
      `🆓 *Бесплатный* — 1 аудит/мес\n` +
      `💎 *Про* — 10 аудитов/мес + мониторинг — *990₽/мес*\n` +
      `🏢 *Агентство* — безлимит + PDF отчёты — *4990₽/мес*`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    )
  })

  bot.command('monitor', async (ctx) => {
    const user = getOrCreateUser(ctx.from.id, ctx.from.username)
    const status = getUserTierStatus(user)

    if (status.tier === 'free') {
      return ctx.reply(
        `⚠️ Мониторинг доступен с тарифа *Про* (990₽/мес).\n\nНапишите /subscribe для оформления.`,
        { parse_mode: 'Markdown' }
      )
    }

    const monitored = getUserMonitoredUrls(user.id)
    const args = ctx.message.text.split(' ').slice(1)

    if (args[0] === 'add' && args[1]) {
      const url = args[1].startsWith('http') ? args[1] : `https://${args[1]}`
      addMonitoredUrl(user.id, url)
      return ctx.reply(`✅ Добавлен в мониторинг:\n${url}`)
    }

    if (args[0] === 'remove' && args[1]) {
      const url = args[1].startsWith('http') ? args[1] : `https://${args[1]}`
      removeMonitoredUrl(user.id, url)
      return ctx.reply(`✅ Удалён из мониторинга:\n${url}`)
    }

    if (!monitored.length) {
      return ctx.reply(
        `📡 *Мониторинг*\n\nСписок пуст.\n\n` +
        `Добавьте URL командой:\n` +
        `/monitor add https://ваш-сайт.ru`,
        { parse_mode: 'Markdown' }
      )
    }

    const list = monitored.map((m, i) =>
      `${i + 1}. ${m.url}\n   Последняя оценка: ${m.last_score ?? '—'} | Порог: −${m.alert_threshold}`
    ).join('\n\n')

    await ctx.reply(
      `📡 *Мониторинг* (${monitored.length} URL):\n\n${list}\n\n` +
      `Добавить: /monitor add https://site.ru\n` +
      `Удалить: /monitor remove https://site.ru`,
      { parse_mode: 'Markdown' }
    )
  })

  // Callback: купить подписку
  bot.callbackQuery(/^buy_(pro|agency)_(\d+)$/, async (ctx) => {
    const tier = ctx.match[1]
    const months = parseInt(ctx.match[2])

    if (!process.env.YUKASSA_SHOP_ID) {
      await ctx.answerCallbackQuery('Оплата временно недоступна')
      return ctx.reply('Для оформления подписки напишите: @mirobase')
    }

    const baseUrl = process.env.APP_URL || 'https://seo.mirobase.ru'
    const payUrl = `${baseUrl}/api/billing/pay`

    try {
      const resp = await fetchJson(payUrl, 'POST', {
        tgId: ctx.from.id,
        tier,
        months,
      })
      if (resp.confirmationUrl) {
        await ctx.answerCallbackQuery()
        await ctx.reply(
          `💳 *Переходите к оплате:*\n${resp.confirmationUrl}`,
          { parse_mode: 'Markdown' }
        )
      } else {
        await ctx.answerCallbackQuery('Ошибка создания платежа')
      }
    } catch {
      await ctx.answerCallbackQuery('Ошибка, попробуйте позже')
    }
  })

  // Обработка URL
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim()

    // Парсим URL
    let url
    try {
      const raw = text.startsWith('http') ? text : `https://${text}`
      url = new URL(raw).toString()
    } catch {
      return ctx.reply('Пришлите корректный URL, например: https://example.ru')
    }

    const user = getOrCreateUser(ctx.from.id, ctx.from.username)
    const limit = LIMITS[user.tier]

    if (user.audits_this_month >= limit) {
      return ctx.reply(
        `❌ *Лимит исчерпан*\n\n` +
        `На тарифе ${user.tier === 'free' ? 'Бесплатный' : 'Про'} доступно ${limit} аудитов в месяц.\n\n` +
        `Для увеличения лимита напишите: @mirobase`,
        { parse_mode: 'Markdown' }
      )
    }

    const statusMsg = await ctx.reply(`🔍 Анализирую ${url}...\n\nЭто займёт ~20 секунд.`)

    try {
      const result = await auditUrl(url)

      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        `🤖 Генерирую AI-рекомендации...`
      )

      const recommendations = await generateRecommendations(url, result.score, result.checks)

      incrementAuditCount(user.id)
      const auditId = saveAudit({
        userId: user.id,
        url,
        score: result.score,
        resultJson: result,
        aiRecommendations: recommendations,
      })

      const report = formatReport(url, result, recommendations)

      await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id)
      await ctx.reply(report, {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard()
          .text('📋 Подробный отчёт', `detail_${auditId}`)
      })

    } catch (err) {
      console.error('Audit error:', err)
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        `❌ Не удалось проанализировать сайт.\n\nВозможные причины:\n• Сайт недоступен\n• Слишком долго отвечает\n• Заблокировал ботов\n\nПопробуйте другой URL.`
      )
    }
  })

  // Подробный отчёт по кнопке
  bot.callbackQuery(/^detail_(\d+)$/, async (ctx) => {
    const auditId = parseInt(ctx.match[1])
    const { getAudit } = await import('../db/index.js')
    const audit = getAudit(auditId)

    if (!audit) return ctx.answerCallbackQuery('Аудит не найден')

    const result = JSON.parse(audit.result_json)
    const checks = result.checks.map(c =>
      `${statusIcon(c.status)} *${c.name}*: ${c.details}`
    ).join('\n')

    await ctx.reply(
      `📊 *Детальный отчёт*\n` +
      `URL: ${audit.url}\n` +
      `Оценка: ${scoreEmoji(audit.score)} *${audit.score}/100*\n\n` +
      `${checks}`,
      { parse_mode: 'Markdown' }
    )
    await ctx.answerCallbackQuery()
  })

  return bot
}

function formatReport(url, result, recommendations) {
  const failCount = result.checks.filter(c => c.status === 'fail').length
  const warnCount = result.checks.filter(c => c.status === 'warn').length
  const passCount = result.checks.filter(c => c.status === 'pass').length

  const emoji = scoreEmoji(result.score)
  const grade = result.score >= 80 ? 'Хорошо' : result.score >= 60 ? 'Удовлетворительно' : result.score >= 40 ? 'Плохо' : 'Критично'

  return (
    `${emoji} *SEO-аудит: ${result.score}/100 — ${grade}*\n` +
    `🌐 ${url}\n\n` +
    `✅ Пройдено: ${passCount}  ⚠️ Предупреждений: ${warnCount}  ❌ Ошибок: ${failCount}\n` +
    `⏱ Скорость загрузки: ${result.loadTime}мс\n\n` +
    `*💡 Рекомендации AI:*\n${recommendations}`
  )
}

function scoreEmoji(score) {
  if (score >= 80) return '🟢'
  if (score >= 60) return '🟡'
  if (score >= 40) return '🟠'
  return '🔴'
}

function statusIcon(status) {
  return status === 'pass' ? '✅' : status === 'warn' ? '⚠️' : '❌'
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

async function fetchJson(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}
