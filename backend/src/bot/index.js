import { Bot, InlineKeyboard } from 'grammy'
import { auditUrl } from '../analyzer/index.js'
import { generateRecommendations } from '../ai/recommendations.js'
import { getOrCreateUser, incrementAuditCount, saveAudit, getUserAudits } from '../db/index.js'

const LIMITS = { free: 1, pro: 10, agency: Infinity }

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
      `/help — помощь\n\n` +
      `*Как пользоваться:*\n` +
      `Просто отправьте URL сайта, например:\n` +
      `https://example.ru\n\n` +
      `Аудит занимает 15-30 секунд.`,
      { parse_mode: 'Markdown' }
    )
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
