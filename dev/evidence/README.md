# 验收证据摘要（2026-11-15）

原始探针输出是 JSON，里面带真实会话原文与本机路径，**只留在作者本机、不进仓库**。这里只留可核对的数字。

## A. 干净 HOME ＋ 零配置（`probe.mjs fresh`）

| 项 | 值 |
|---|---|
| `configGiven` | `none`（不写 path／aliasFile） |
| `fiberState` | 2（ACTIVE；修复前是 3 = FAILED） |
| `serviceReady` | true |
| `dbExistedBefore` → `dbExistsAfter` | false → **true**（自动建库） |
| 库文件大小 | 4,096 B（空库） |
| `application_id` / `user_version` | `1146308689` / `8` |
| `persisted_docs` 分词器 | `tokenize = 'unicode61'` |
| 表 | `persisted_docs`（含 fts5 影子表）、`persisted_sessions`、`search_state` |
| 搜索 | 306 ms，返回空页，`error: null` |

修复前同一条命令直接抛：`ValidationError: invalid config: $.path missing required value`。

## B. 默认路径 ＋ 现役索引库（`probe.mjs search`，`configGiven: none`）

语料：88 个会话／19,035 篇文档／92,250,112 B（作者本机真实索引库，复制进假 HOME 的默认路径）。查询 `limit=5`：

| 查询 | 命中 | 备注 |
|---|---|---|
| 林家 | 5 | 双字 |
| 林 | 5 | **单字命中**——字级索引的直接证据 |
| 林晚秋 | 5 | 三字 |
| 册子 | 5 | 口语词原样命中 |
| 香包 | 0 | 未配别名表 → 不扩展（设计如此） |
| 林晚丘 | 0 | 拼音层只覆盖别名表内的词 → 不配则不生效（设计如此） |
| abcdef999 | 0 | 不存在字符串 |

每条命中满足：`bestMatch.sessionId === header.id`、`surface === 'current'`、`type ∈ {user/message, assistant/message}`——即 `dsh-api-session-controller` `list.ts` L269–281 的准入条件。

## C. 零配置 ＋ 别名表放约定路径

在假 HOME 里放 `<HOME>/.dsh/cache/session-query-aliases.json`，内容只有 `{"香包":["香囊"],"林晚秋":["林晚秋"]}`，**仍然不写任何 config**：

| 查询 | 命中 | 改前 |
|---|---|---|
| 香包 | **5** | 0 |
| 林晚丘 | **5**（与"林晚秋"结果一致） | 0 |
| 林晚秋（对照） | 5 | 5 |

## 复现

步骤见 [`../README.md`](../README.md)；插件侧结论见 [`../../docs/验收-零配置与搜索入口-20261115.md`](../../docs/验收-零配置与搜索入口-20261115.md)。
