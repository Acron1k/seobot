import Database from 'better-sqlite3'

const dbPath = process.env.DATABASE_PATH || './seobot.db'

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// --- Users ---

export function getOrCreateUser(tgId, username) {
  let user = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(tgId)
  if (!user) {
    db.prepare('INSERT INTO users (tg_id, username) VALUES (?, ?)').run(tgId, username ?? null)
    user = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(tgId)
  }
  // Сброс счётчика если новый месяц
  const currentMonth = new Date().toISOString().slice(0, 7)
  if (user.last_audit_reset !== currentMonth) {
    db.prepare('UPDATE users SET audits_this_month = 0, last_audit_reset = ? WHERE id = ?')
      .run(currentMonth, user.id)
    user.audits_this_month = 0
  }
  return user
}

export function incrementAuditCount(userId) {
  db.prepare('UPDATE users SET audits_this_month = audits_this_month + 1 WHERE id = ?').run(userId)
}

// --- Audits ---

export function saveAudit({ userId, url, score, resultJson, aiRecommendations }) {
  const result = db.prepare(`
    INSERT INTO audits (user_id, url, score, result_json, ai_recommendations)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, url, score, JSON.stringify(resultJson), aiRecommendations)
  return result.lastInsertRowid
}

export function getUserAudits(userId, limit = 10) {
  return db.prepare(`
    SELECT id, url, score, created_at FROM audits
    WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(userId, limit)
}

export function getAudit(id) {
  return db.prepare('SELECT * FROM audits WHERE id = ?').get(id)
}

// --- Billing ---

const TIER_LIMITS = { free: 1, pro: 10, agency: Infinity }
const TIER_PRICES = { pro: 990, agency: 4990 }

export function getUserTierStatus(user) {
  const now = new Date()
  if (user.subscription_expires_at && new Date(user.subscription_expires_at) > now) {
    return { active: true, tier: user.tier, expiresAt: user.subscription_expires_at }
  }
  if (user.trial_ends_at && new Date(user.trial_ends_at) > now) {
    return { active: true, tier: 'trial', expiresAt: user.trial_ends_at }
  }
  // Подписка истекла — сбрасываем на free
  if (user.tier !== 'free') {
    db.prepare('UPDATE users SET tier = ? WHERE id = ?').run('free', user.id)
    user.tier = 'free'
  }
  return { active: false, tier: 'free', expiresAt: null }
}

export function createPayment({ userId, yukassaPaymentId, amount, tier, months }) {
  return db.prepare(`
    INSERT INTO payments (user_id, yukassa_payment_id, amount, tier, months)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, yukassaPaymentId, amount, tier, months).lastInsertRowid
}

export function updatePaymentStatus(yukassaPaymentId, status) {
  db.prepare('UPDATE payments SET status = ?, updated_at = datetime(\'now\') WHERE yukassa_payment_id = ?')
    .run(status, yukassaPaymentId)
}

export function getPaymentByYukassa(yukassaPaymentId) {
  return db.prepare('SELECT * FROM payments WHERE yukassa_payment_id = ?').get(yukassaPaymentId)
}

export function activateSubscription(userId, tier, months) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
  const base = user.subscription_expires_at && new Date(user.subscription_expires_at) > new Date()
    ? new Date(user.subscription_expires_at)
    : new Date()
  base.setMonth(base.getMonth() + months)
  const expiresAt = base.toISOString().replace('T', ' ').slice(0, 19)
  db.prepare('UPDATE users SET tier = ?, subscription_expires_at = ? WHERE id = ?')
    .run(tier, expiresAt, userId)
}

export function getUserByDbId(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id)
}

export function getUserByTgId(tgId) {
  return db.prepare('SELECT * FROM users WHERE tg_id = ?').get(tgId)
}

export { TIER_LIMITS, TIER_PRICES }

// --- Monitor ---

export function addMonitoredUrl(userId, url, alertThreshold = 10) {
  // Проверяем дубликат
  const existing = db.prepare('SELECT id FROM monitored_urls WHERE user_id = ? AND url = ? AND active = 1').get(userId, url)
  if (existing) return existing.id
  return db.prepare(`
    INSERT INTO monitored_urls (user_id, url, alert_threshold) VALUES (?, ?, ?)
  `).run(userId, url, alertThreshold).lastInsertRowid
}

export function removeMonitoredUrl(userId, url) {
  db.prepare('UPDATE monitored_urls SET active = 0 WHERE user_id = ? AND url = ?').run(userId, url)
}

export function getUserMonitoredUrls(userId) {
  return db.prepare('SELECT * FROM monitored_urls WHERE user_id = ? AND active = 1').all(userId)
}

export function getActiveMonitoredUrls() {
  return db.prepare(`
    SELECT m.*, u.tg_id FROM monitored_urls m
    JOIN users u ON u.id = m.user_id
    WHERE m.active = 1
  `).all()
}

export function updateMonitorResult(id, score) {
  db.prepare('UPDATE monitored_urls SET last_score = ?, last_checked_at = datetime(\'now\') WHERE id = ?')
    .run(score, id)
}

export default db
