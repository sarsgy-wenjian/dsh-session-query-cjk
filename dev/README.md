# dev/ — 零配置与检索的复现工具（不随 npm 包发布）

这目录**不在 `package.json` 的 `files` 里**，npm 打包不会带上它。它是给维护者复现验收用的。

## 为什么需要它

DeepSeek Harness 把 `@deepseek-ai/dsh-session-*` 打进了 `app.asar`，裸 node 直接 `import` 插件会报
`ERR_MODULE_NOT_FOUND: @deepseek-ai/dsh-session`。所以验收要走两步：**先从 app.asar 把几个 host 包抽出来**，再在抽好的 `node_modules` 旁边跑探针。

## 一次性准备

```powershell
$node = '<DSH 安装目录>\resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
$asar = '<DSH 安装目录>\resources\app.asar'
$h    = '%USERPROFILE%\AppData\Local\Temp\cjk-harness'   # 别放 工作区目录，见下方"坑"

# 1) 抽出宿主依赖（缺哪个补哪个，见下）
& $node dev\asar-extract.mjs $asar $h 'node_modules/@deepseek-ai/cordis/' 'node_modules/@deepseek-ai/schemastery/' `
  'node_modules/@deepseek-ai/dsh-session/' 'node_modules/@deepseek-ai/dsh-session-query/' `
  'node_modules/@deepseek-ai/dsh-session-persistence/' 'node_modules/@deepseek-ai/dsh-util-crypto/' `
  'node_modules/@deepseek-ai/dsh-util-values/' 'node_modules/@deepseek-ai/dsh-error/' 'node_modules/@deepseek-ai/dsh-scope/'

# 2) 把本包放进去
Copy-Item -Recurse $PSScriptRoot\.. "$h\dsh\node_modules\dsh-session-query-cjk"

# 3) 把探针放到 $h\dsh\probe.mjs，然后在该目录跑
```

缺依赖时 node 会报 `Cannot find package '@deepseek-ai/xxx'`，照名再抽一次即可；`zod`、`@standard-schema/spec`、`@deepseek-ai/cosmokit`、`@deepseek-ai/dsh-typert-protocol` 这几个通常也会缺。

## 跑验收

```powershell
$node = '<DSH 安装目录>\resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
cd $h\dsh

# A. 干净 HOME + 零配置：应当自动建库、返回空页、无报错
& $node probe.mjs fresh --home "$env:TEMP\fh-fresh" --out "$env:TEMP\fresh.json"

# B. 默认路径 + 现役索引库：字级检索应当命中
& $node probe.mjs search --db "$env:USERPROFILE\.dsh\cache\session-query-cjk.db" `
    --query '林家,林,林晚秋' --home "$env:TEMP\fh-db" --out "$env:TEMP\search.json"
```

看 `fiberState`（2＝ACTIVE，3＝FAILED）、`serviceReady`、`dbExistsAfter`、`searches[].itemCount`；出错时 `error` 字段带完整栈。

`dev/evidence/README.md` 摘录了 2026-11-15 那轮的关键数字（原始 JSON 含真实会话原文，只留在作者本机，不进仓库）。

## 坑（踩过一次，别再踩）

- **别在 `E:` 工作区里落 SQLite**：沙箱下写入被静默丢弃——`CREATE TABLE` 不报错、`INSERT` 报 `no such table`、库文件停在 0 字节。HOME 与索引库都放 `%TEMP%`。
- **`--home` 只改 `USERPROFILE`／`HOME`**，用来验证"不写 `path` 时回落 `~/.dsh/cache/…`"；插件在构造时才读 `homedir()`，所以探针在 `import` 之后设置也有效。
- 探针用的是 **真实的 cordis Context**，不是假 ctx：`ctx.plugin(Engine, {})` → `await fiber` → `ctx.get('sessionQuery')`。
- `search` 模式给了一个**回放式 persistence 桩**（照抄库里已有的 `persisted_sessions` 行与原 revision），这样 reconcile 既不重读也不删除，能干净地验证"持久文档可被搜到"这条 SQL 分支（`selectedDocumentsSql` 的 `AND ? = 1`）。
