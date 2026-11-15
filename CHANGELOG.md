# Changelog

本包版本号跟随 `package.json`。破坏性变更会单独标注。

## 0.3.1 — 2026-11-15

**修复（真 bug：不写配置时插件起不来）**

- `path` 的 schema 由 `z.string().required()` 改为 `.default("")`。此前不写 `path` 时 cordis 在构造前就抛
  `ValidationError: invalid config: $.path missing required value`，`resolveConfig()` 里回落到
  `~/.dsh/cache/session-query-cjk.db` 的逻辑根本没机会执行。
- `openAt` 的 schema 默认值由 `startup` 改为 `first-search`，与 `resolveConfig()` 对齐。
  此前默认值改在构造函数里，而 schema 仍填 `startup`，那行改动是死代码。

**新增**

- `aliasFile` 不写时回落到约定路径 `~/.dsh/cache/session-query-aliases.json`（文件不存在＝不扩展）。
  于是**零配置安装也能用别名与拼音**，只需把别名表丢进这个路径，不必改 `cordis.patch.yml`。

**文档**

- 新增 [`docs/设计思路.md`](docs/设计思路.md)、[`docs/验收-零配置与搜索入口-20261115.md`](docs/验收-零配置与搜索入口-20261115.md)、`dev/`（探针与 asar 抽取工具）。
- 更正 README：搜索入口的真实位置（侧边栏放大镜按钮／Ctrl+K）与「结果条数由客户端决定、上限 20」的机制；
  实测表注明别名／拼音依赖别名表；配置项整段可省略。

**仓库整理**

- 本机备份（`*.bak`）与含真实会话原文的原始探针输出不再进仓库。
- 上游 TypeScript 原码移入 `docs/upstream/src/`（**不是本包的构建源**，发布代码是 `lib/index.js`）。

## 0.3.0 — 2026-11-15

- 字级索引：`unicode61` ＋ CJK 字间插入 `\u0001`，1 个字起即可检索（旧 trigram 方案下 1—2 字恒为 0）。
- 别名扩展：口语说法 → 正式名，查询侧追加，最多 6 个候选。
- 拼音模糊：声母韵母归一后在别名表内做同音匹配。
- README 按真实索引数据重写。

## 0.2.x 及更早

内部试验版本，基于 `@deepseek-ai/dsh-session-query-sqlite@0.2.2-rc.3` 改写，未对外发布。
