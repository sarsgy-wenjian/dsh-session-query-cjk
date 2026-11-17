// Zero-config probe for dsh-session-query-cjk.
//
// Boots the plugin inside a real cordis Context with NO config at all
// (no `path`, no `aliasFile`) — exactly what a user gets right after
// installing the package — then calls the same service method the GUI search
// box and the agent tools call: ctx.sessionQuery.searchSessions(...).
//
// usage: node probe.mjs fresh   [--home DIR]
//        node probe.mjs search  --db SRC [--query Q] [--home DIR] [--vocab SRC]
//
// --home redirects USERPROFILE/HOME before the plugin resolves its default
// database path, so the probe can prove the "no path configured" fallback.
// --vocab stages a pinyin vocabulary file at the default vocab path
// (~/.dsh/cache/session-query-vocab.json), so zero-config pinyin expansion
// can be exercised against a corpus it was built from.
import { Context } from '@deepseek-ai/cordis'
import Engine from 'dsh-session-query-cjk'
import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const argv = process.argv.slice(2)
const mode = argv[0] ?? 'fresh'
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? fallback : argv[index + 1]
}
const fakeHome = flag('home')
if (fakeHome !== undefined) {
  // os.homedir() reads these on each call on Windows / POSIX respectively.
  process.env.USERPROFILE = fakeHome
  process.env.HOME = fakeHome
}
const sourceDb = flag('db')
const sourceVocab = flag('vocab')
const query = flag('query', '林家')
const defaultDb = join(homedir(), '.dsh', 'cache', 'session-query-cjk.db')
const defaultVocab = join(homedir(), '.dsh', 'cache', 'session-query-vocab.json')

const evidence = {
  mode,
  home: homedir(),
  defaultDb,
  dbExistedBefore: existsSync(defaultDb),
  configGiven: 'none',
}

if (sourceVocab !== undefined) {
  mkdirSync(dirname(defaultVocab), { recursive: true })
  copyFileSync(sourceVocab, defaultVocab)
  evidence.vocabStagedBytes = statSync(defaultVocab).size
}

// The only hard service dependency of the engine (`static inject = ['sessions']`).
const ctx = new Context()
ctx.provide('sessions', { list: () => [], get: () => undefined })

if (mode === 'search') {
  // Stage the corpus at the DEFAULT path — the file the plugin must pick up
  // with no `path` configured.
  if (sourceDb === undefined) throw new Error('search mode needs --db')
  mkdirSync(dirname(defaultDb), { recursive: true })
  copyFileSync(sourceDb, defaultDb)
  evidence.dbBytesStaged = statSync(defaultDb).size

  // Persistence stand-in that replays exactly the rows already indexed, so
  // reconciliation finds nothing to reload and nothing to delete. It exercises
  // the real "persisted documents are searchable" SQL branch.
  const db = new DatabaseSync(defaultDb, { readOnly: true })
  const rows = db.prepare(`SELECT id, version, created_at, cwd, parent_session, seed_length,
      delegation_depth, agent_preset, revision FROM persisted_sessions`).all()
  db.close()
  evidence.persistedSessionsListed = rows.length
  const snapshots = rows.map((row) => ({
    revision: row.revision,
    header: {
      version: row.version,
      id: row.id,
      createdAt: row.created_at,
      ...(row.cwd === null ? {} : { cwd: row.cwd }),
      ...(row.parent_session === null ? {} : { parentSession: row.parent_session }),
      isSeeded: row.seed_length !== null,
      ...(row.delegation_depth === null ? {} : { delegationDepth: row.delegation_depth }),
      ...(row.agent_preset === null ? {} : { agentPreset: row.agent_preset }),
    },
  }))
  ctx.provide('sessionPersistence', {
    list: async () => snapshots,
    open: async () => { throw new Error('probe: cold read must not be needed') },
  })
}

const fiber = ctx.plugin(Engine, {})
const queries = query.split(',')
let page
let failure = null
const results = []
try {
  await fiber
  evidence.fiberState = fiber.state
  const service = ctx.get('sessionQuery')
  evidence.serviceReady = service !== undefined
  for (const one of queries) {
    const started = Date.now()
    const hitPage = await service.searchSessions({
      query: one,
      eventFilters: [
        { kind: 'type', values: ['user/message', 'assistant/message'] },
        { kind: 'surface', values: ['current'] },
      ],
      limit: 5,
    }, {})
    results.push({
      query: one,
      searchMs: Date.now() - started,
      itemCount: hitPage.items.length,
      hasMore: hitPage.hasMore ?? false,
      items: hitPage.items.map((hit) => ({
        sessionId: hit.header.id,
        cwd: hit.header.cwd ?? null,
        persisted: hit.persisted,
        bestMatchSessionId: hit.bestMatch.sessionId,
        type: hit.bestMatch.type,
        surface: hit.bestMatch.surface,
        snippet: String(hit.bestMatch.snippet).replace(/\u0001/g, '|').slice(0, 140),
      })),
    })
    page = hitPage
  }
} catch (error) {
  failure = String(error?.stack ?? error)
}
evidence.error = failure
evidence.searches = results

evidence.dbExistsAfter = existsSync(defaultDb)
if (evidence.dbExistsAfter) {
  evidence.dbBytes = statSync(defaultDb).size
  const db = new DatabaseSync(defaultDb, { readOnly: true })
  try {
    evidence.applicationId = db.prepare('PRAGMA application_id').get().application_id
    evidence.userVersion = db.prepare('PRAGMA user_version').get().user_version
    evidence.persistedDocsDdl = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'persisted_docs'").get()?.sql ?? null
    evidence.tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all().map((r) => r.name)
    try {
      evidence.persistedSessionCount = db.prepare('SELECT COUNT(*) AS n FROM persisted_sessions').get().n
      evidence.persistedDocCount = db.prepare('SELECT COUNT(*) AS n FROM persisted_docs').get().n
    } catch { /* a fresh DB keeps no rows */ }
  } finally {
    db.close()
  }
}

const text = JSON.stringify(evidence, null, 2)
const outFile = flag('out')
if (outFile !== undefined) writeFileSync(outFile, text)
console.log(text)
process.exit(failure === null && page !== undefined ? 0 : 1)
