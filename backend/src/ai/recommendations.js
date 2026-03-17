import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Генерирует AI-рекомендации на основе результатов SEO-аудита.
 * @param {string} url
 * @param {number} score
 * @param {Array} checks
 * @returns {Promise<string>}
 */
export async function generateRecommendations(url, score, checks) {
  const problems = checks
    .filter(c => c.status !== 'pass')
    .map(c => `- [${c.status === 'fail' ? 'КРИТИЧНО' : 'ПРЕДУПРЕЖДЕНИЕ'}] ${c.name}: ${c.details}`)
    .join('\n')

  if (!problems) {
    return 'Отличная работа! Все проверки прошли успешно. Продолжайте следить за качеством контента и обновляйте сайт регулярно.'
  }

  const prompt = `Ты — SEO-эксперт. Проведён технический аудит сайта ${url}.
Общая оценка: ${score}/100.

Найденные проблемы:
${problems}

Дай краткие, конкретные рекомендации по исправлению каждой проблемы.
Пиши на русском языке. Используй простые слова — клиент не технарь.
Для каждой проблемы: что исправить и зачем это важно.
Формат: маркированный список. Не более 400 слов.`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  return message.content[0]?.type === 'text' ? message.content[0].text : ''
}
