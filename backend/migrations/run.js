import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.DATABASE_PATH || './seobot.db'

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
)`)

const applied = new Set(
  db.prepare('SELECT name FROM _migrations').all().map(r => r.name)
)

const files = readdirSync(__dirname)
  .filter(f => f.endsWith('.sql'))
  .sort()

for (const file of files) {
  if (applied.has(file)) continue
  console.log(`Applying migration: ${file}`)
  const sql = readFileSync(join(__dirname, file), 'utf8')
  db.exec(sql)
  db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file)
  console.log(`✓ ${file}`)
}

console.log('Migrations done.')
db.close()
