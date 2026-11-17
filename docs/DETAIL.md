# dsh-session-query-cjk

让 DeepSeek Harness 的中文会话搜索真正可用：**1 个字起就能搜**，口语说法与错别字读音也能搜到。

## 它解决什么

官方后端用 SQLite FTS5 的 `unicode61` 分词器，中文的连续汉字会被当成**一个 token**，所以正文里写过的内容基本搜不到。本包替换掉这层后端，补上三层能力：

| 能力 | 效果 |
|---|---|
| 字级索引 | 搜「林」也能命中，不必凑够三个字 |
| 口语别名扩展 | 说「香包」、原文写「香囊」，照样搜到 |
| 拼音模糊匹配 | 打错字但读音对（「林晚丘」→「林晚秋」），照样找得到 |

## 安装

**环境要求**：插件侧 Node ≥ 22.13（用内置 `node:sqlite`；推荐 24.x）；若用 npm 安装 DSH 命令行，`@deepseek-ai/dsh` 还要求 Node ≥ 24.9。装之前先 `node -v`——部分云主机默认 Node 是 22.x 基线版本。

装为 bundle 即可，补丁会自动禁用官方后端并启用本包，无需手工改配置：

```
plugin_manager install_bundle → dsh-session-query-cjk
```

也可从仓库以 git 地址安装（需本机有 git），或按 README 手工两步安装。

**零配置可用**：索引库默认落 `~/.dsh/cache/session-query-cjk.db`，首次搜索时自动建库；想用别名与拼音，把 `session-query-aliases.json` 放到 `~/.dsh/cache/` 即可。

## 主要配置

| 配置 | 默认 | 说明 |
|---|---|---|
| `path` | `~/.dsh/cache/session-query-cjk.db` | 索引库路径，可省略 |
| `openAt` | `first-search` | 建库时机：`startup`／`first-search`／`never` |
| `aliasFile` | `~/.dsh/cache/session-query-aliases.json` | 别名表，可省略 |
| `pinyinFile` | 包内自带拼音表 | 拼音表路径 |
| `vocabFile` | `~/.dsh/cache/session-query-vocab.json` | 语料拼音词表，可省略（`dev/build-vocab.mjs` 生成） |

## 已知限制

- **搜索入口由宿主决定**：DeepSeek Harness 0.2.2-rc.3 在侧边栏「会话／工作区」标题行右端有放大镜按钮（侧边栏展开时渲染），快捷键 Ctrl+K；界面最多合并显示 20 条（客户端的可见性过滤＋上限），要完整结果请用 Agent 侧工具或直接查索引库。
- 拼音层只在**别名表与语料词表**内做同音归一，不是全库拼音索引。
- 多音字只取 Unicode Unihan 主读音。
- 索引是检索时对齐的快照，不常驻监听会话写入。

## 升级提示

从 0.3.0／0.3.1 覆盖 `lib/index.js` 即可，索引库无需迁移（schema 未变，`user_version` 仍为 8）。

设计与实现细节见仓库 `docs/设计思路.md`，验收证据见 `docs/验收-零配置与搜索入口-20261115.md`。
