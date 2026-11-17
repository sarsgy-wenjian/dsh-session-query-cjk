// dev/build-vocab.mjs — 从 session-query-cjk.db 生成拼音词表（私有，不随包分发）
//
// 思路：把索引库里"真实出现过的中文词"按归一拼音键聚组、按文档频排序，
// 生成 session-query-vocab.json，供插件的拼音模糊层把纯拼音输入展开成汉字。
// 词表从使用者本机的索引库生成，包内不携带任何语料。
//
// usage:
//   node build-vocab.mjs [--db PATH] [--out PATH] [--types a,b] [--min-count N]
//                        [--max-len N] [--cap N] [--top N] [--limit-docs N] [--quiet]
//
// 默认值：db=~/.dsh/cache/session-query-cjk.db
//         out=~/.dsh/cache/session-query-vocab.json
//         types=user/message,assistant/message（人类语言层；tool/* 噪音大，默认排除）
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let PINYIN_FILE;
try {
	// 与探针同目录运行时（dev 脚本被拷到基座），走包解析。
	PINYIN_FILE = join(dirname(require.resolve("dsh-session-query-cjk/package.json")), "lib", "pinyin-data.json");
} catch {
	// 在仓库 dev/ 下直接运行时，走自身相对路径。
	PINYIN_FILE = fileURLToPath(new URL("../lib/pinyin-data.json", import.meta.url));
}

// ---- 以下与 lib/index.js 的拼音工具保持同步（改动任何一边都要改另一边） ----
function normSyl(s) {
  let t = s;
  if (t.startsWith("zh")) t = "z" + t.slice(2);
  else if (t.startsWith("ch")) t = "c" + t.slice(2);
  else if (t.startsWith("sh")) t = "s" + t.slice(2);
  if (t.startsWith("n")) t = "l" + t.slice(1);
  t = t.replace(/ang$/u, "an").replace(/eng$/u, "en").replace(/ing$/u, "in").replace(/ong$/u, "on");
  return t.replace(/ü/gu, "u");
}
function pinyinKeyOf(text, table) {
  const parts = [];
  for (const ch of text) {
    const py = table[ch];
    if (!py) return "";
    parts.push(normSyl(py.split("|")[0]));
  }
  return parts.join("|");
}
// ---- 同步段结束 ----

const CJK_RUN = /[\u3400-\u4dbf\u4e00-\u9fff]+/gu;
const PURE_LATIN_KEYS = /^[a-z]+(\|[a-z]+)*$/u;

function argvFlag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}
function argvHas(name) {
  return process.argv.includes(`--${name}`);
}

const dbPath = resolve(argvFlag("db", join(homedir(), ".dsh", "cache", "session-query-cjk.db")));
const outPath = resolve(argvFlag("out", join(homedir(), ".dsh", "cache", "session-query-vocab.json")));
const types = String(argvFlag("types", "user/message,assistant/message")).split(",").map((s) => s.trim()).filter(Boolean);
const minCount = Number(argvFlag("min-count", 2));
const maxLen = Number(argvFlag("max-len", 6));
const cap = Number(argvFlag("cap", 3000000));
const top = Number(argvFlag("top", 8));
const limitDocs = argvHas("limit-docs") ? Number(argvFlag("limit-docs", "0")) : 0;
const quiet = argvHas("quiet");
const log = (...args) => { if (!quiet) console.error(...args); };

const table = JSON.parse(readFileSync(PINYIN_FILE, "utf8"));
const counts = new Map();
const charFreq = new Map();

log(`db: ${dbPath}`);
const db = new DatabaseSync(dbPath, { readOnly: true });
const placeholders = types.map(() => "?").join(",");
const stmt = db.prepare(`SELECT text FROM persisted_docs WHERE type IN (${placeholders})`);

let docs = 0;
let chars = 0;
let prunes = 0;
const started = Date.now();
for (const row of stmt.iterate(...types)) {
  const text = String(row.text ?? "").replaceAll("\u0001", "");
  if (!text) continue;
  chars += text.length;
  const seen = new Set();
  for (const run of text.match(CJK_RUN) ?? []) {
    for (const ch of run) charFreq.set(ch, (charFreq.get(ch) ?? 0) + 1);
    if (run.length < 2) continue;
    const upper = Math.min(maxLen, run.length);
    for (let len = 2; len <= upper; len++) {
      for (let i = 0; i + len <= run.length; i++) {
        seen.add(run.slice(i, i + len));
      }
    }
  }
  for (const ng of seen) counts.set(ng, (counts.get(ng) ?? 0) + 1);
  docs += 1;
  if (counts.size > cap) {
    for (const [k, v] of counts) if (v === 1) counts.delete(k);
    prunes += 1;
  }
  if (limitDocs > 0 && docs >= limitDocs) break;
}
db.close();

const groups = new Map();
for (const [ng, count] of counts) {
  if (count < minCount) continue;
  const key = pinyinKeyOf(ng, table);
  if (!key) continue;
  const arr = groups.get(key);
  if (arr) arr.push([ng, count]);
  else groups.set(key, [[ng, count]]);
}
for (const [ch, freq] of charFreq) {
  if (freq < minCount) continue;
  const py = table[ch];
  if (!py) continue;
  const key = normSyl(py.split("|")[0]);
  const arr = groups.get(key);
  if (arr) arr.push([ch, freq]);
  else groups.set(key, [[ch, freq]]);
}

const out = {
  _meta: {
    generatedAt: new Date().toISOString(),
    sourceDb: dbPath,
    types,
    minCount,
    maxLen,
    top,
    docsScanned: docs,
    charsScanned: chars,
    prunePasses: prunes,
  },
};
let keys = 0;
let words = 0;
for (const [key, arr] of groups) {
  arr.sort((a, b) => b[1] - a[1]);
  const clean = [];
  for (const [word] of arr) {
    if (!clean.includes(word)) clean.push(word);
    if (clean.length >= top) break;
  }
  if (clean.length === 0) continue;
  out[key] = clean;
  keys += 1;
  words += clean.length;
}
out._meta.pinyinKeys = keys;
out._meta.words = words;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out));
const seconds = ((Date.now() - started) / 1000).toFixed(1);
log(`out: ${outPath}`);
log(`done: ${keys} pinyin keys / ${words} words, ${docs} docs / ${chars} chars in ${seconds}s`);
