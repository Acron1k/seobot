import { Router } from 'express'
import { auditUrl } from '../analyzer/index.js'
import { generateRecommendations } from '../ai/recommendations.js'
import { getOrCreateUser, incrementAuditCount, saveAudit, getUserAudits, getAudit } from '../db/index.js'
import { generatePdfReport } from '../pdf/report.js'

const router = Router()

const LIMITS = { free: 1, pro: 10, agency: Infinity }

// POST /api/audit — запустить аудит (веб-версия)
router.post('/audit', async (req, res) => {
  const { url, tgId, username } = req.body
  if (!url) return res.status(400).json({ error: 'url required' })

  let parsedUrl
  try {
    parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`).toString()
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }

  // Если передан tgId — проверяем лимит
  let user = null
  if (tgId) {
    user = getOrCreateUser(tgId, username)
    const limit = LIMITS[user.tier]
    if (user.audits_this_month >= limit) {
      return res.status(429).json({ error: 'Audit limit reached', tier: user.tier, limit })
    }
  }

  try {
    const result = await auditUrl(parsedUrl)
    const recommendations = await generateRecommendations(parsedUrl, result.score, result.checks)

    let auditId = null
    if (user) {
      incrementAuditCount(user.id)
      auditId = saveAudit({
        userId: user.id,
        url: parsedUrl,
        score: result.score,
        resultJson: result,
        aiRecommendations: recommendations,
      })
    }

    res.json({ auditId, url: parsedUrl, score: result.score, checks: result.checks, loadTime: result.loadTime, recommendations })
  } catch (err) {
    console.error('Audit error:', err)
    res.status(500).json({ error: 'Audit failed', message: err.message })
  }
})

// GET /api/audits?tgId=... — история аудитов
router.get('/audits', (req, res) => {
  const { tgId } = req.query
  if (!tgId) return res.status(400).json({ error: 'tgId required' })
  const user = getOrCreateUser(parseInt(tgId), null)
  res.json(getUserAudits(user.id))
})

// GET /api/audit/:id — конкретный аудит
router.get('/audit/:id', (req, res) => {
  const audit = getAudit(parseInt(req.params.id))
  if (!audit) return res.status(404).json({ error: 'Not found' })
  res.json({ ...audit, result_json: JSON.parse(audit.result_json) })
})

// GET /api/audit/:id/pdf?brandName=...&brandColor=... — white-label PDF отчёт
router.get('/audit/:id/pdf', async (req, res) => {
  const audit = getAudit(parseInt(req.params.id))
  if (!audit) return res.status(404).json({ error: 'Not found' })

  const { brandName, brandColor } = req.query
  const result = JSON.parse(audit.result_json)

  try {
    const pdf = await generatePdfReport({
      url: audit.url,
      score: audit.score,
      checks: result.checks,
      recommendations: audit.ai_recommendations,
      brandName: brandName || undefined,
      brandColor: brandColor || undefined,
    })

    const filename = `seo-report-${audit.id}.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(pdf)
  } catch (err) {
    console.error('PDF generation error:', err)
    res.status(500).json({ error: 'PDF generation failed' })
  }
})

export default router
