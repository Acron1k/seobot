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

export default db
