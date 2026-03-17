import PDFDocument from 'pdfkit'

const STATUS_ICONS = { pass: '✓', warn: '!', fail: '✗' }
const STATUS_COLORS = { pass: '#22c55e', warn: '#f59e0b', fail: '#ef4444' }

/**
 * Генерирует PDF-отчёт по SEO-аудиту.
 * @param {object} params
 * @param {string} params.url
 * @param {number} params.score
 * @param {Array}  params.checks
 * @param {string} params.recommendations
 * @param {string} [params.brandName]  — для white-label
 * @param {string} [params.brandColor] — hex цвет бренда, default '#6366f1'
 * @returns {Buffer}
 */
export async function generatePdfReport({ url, score, checks, recommendations, brandName, brandColor }) {
  const brand = brandName || 'Mirobase SEO'
  const color = brandColor || '#6366f1'
  const date = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // --- Header ---
    doc.rect(0, 0, doc.page.width, 80).fill(color)
    doc.fillColor('white').fontSize(22).font('Helvetica-Bold')
      .text(brand, 50, 25)
    doc.fontSize(11).font('Helvetica')
      .text('SEO-аудит сайта', 50, 52)
    doc.fillColor('#333333')

    // --- URL + Дата ---
    doc.moveDown(3)
    doc.fontSize(10).fillColor('#666666')
      .text(`Сайт: ${url}`, { continued: true })
      .text(`    Дата: ${date}`, { align: 'right' })
    doc.moveDown(0.5)
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#e5e7eb').stroke()

    // --- Score ---
    doc.moveDown(1)
    const grade = score >= 80 ? 'Хорошо' : score >= 60 ? 'Удовлетворительно' : score >= 40 ? 'Плохо' : 'Критично'
    const scoreColor = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444'
    doc.fontSize(14).fillColor('#111827').font('Helvetica-Bold').text('Общая оценка')
    doc.fontSize(48).fillColor(scoreColor).font('Helvetica-Bold').text(`${score}`, { continued: true })
    doc.fontSize(18).fillColor('#6b7280').font('Helvetica').text(' / 100')
    doc.fontSize(14).fillColor('#4b5563').font('Helvetica').text(grade)
    doc.moveDown(0.5)

    // Статистика
    const fail = checks.filter(c => c.status === 'fail').length
    const warn = checks.filter(c => c.status === 'warn').length
    const pass = checks.filter(c => c.status === 'pass').length
    doc.fontSize(11).fillColor('#111827').font('Helvetica')
    doc.text(`✓ Пройдено: ${pass}   ! Предупреждений: ${warn}   ✗ Ошибок: ${fail}`)
    doc.moveDown(1)
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#e5e7eb').stroke()

    // --- Проверки ---
    doc.moveDown(1)
    doc.fontSize(14).fillColor('#111827').font('Helvetica-Bold').text('Результаты проверок')
    doc.moveDown(0.5)

    const sorted = [...checks].sort((a, b) => {
      const order = { fail: 0, warn: 1, pass: 2 }
      return order[a.status] - order[b.status]
    })

    for (const check of sorted) {
      if (doc.y > doc.page.height - 120) doc.addPage()
      const icon = STATUS_ICONS[check.status]
      const clr = STATUS_COLORS[check.status]
      doc.fontSize(10).fillColor(clr).font('Helvetica-Bold')
        .text(`[${icon}] `, { continued: true })
      doc.fillColor('#111827').font('Helvetica-Bold').text(check.name, { continued: true })
      doc.font('Helvetica').fillColor('#4b5563').text(`  — ${check.details}`)
      doc.moveDown(0.3)
    }

    // --- AI-рекомендации ---
    doc.moveDown(1)
    if (doc.y > doc.page.height - 200) doc.addPage()
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#e5e7eb').stroke()
    doc.moveDown(1)
    doc.fontSize(14).fillColor('#111827').font('Helvetica-Bold').text('AI-рекомендации')
    doc.moveDown(0.5)
    doc.fontSize(10).fillColor('#374151').font('Helvetica').text(recommendations, {
      width: doc.page.width - 100,
      lineGap: 4,
    })

    // --- Footer ---
    doc.moveDown(2)
    doc.fontSize(9).fillColor('#9ca3af').font('Helvetica')
      .text(`Отчёт создан ${brand} · ${date}`, { align: 'center' })

    doc.end()
  })
}
