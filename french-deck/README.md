# French Deck

本地运行的法语单词学习工具。当前为**第一阶段**实现：录入 + 单词列表 + 词典自动识别。复习与统计功能将在下一阶段补齐。

## 目录结构

参见 `../.claude/plans/scope-windows-1-mutable-piglet.md`。

## 安装

```bash
cd french-deck
pnpm install      # 或 npm install / yarn
# 由于 better-sqlite3 是原生模块，安装后需要为 Electron 重建：
pnpm rebuild
```

> Windows 用户首次安装 `better-sqlite3` 需要 Build Tools (`npm i -g windows-build-tools` 或安装 Visual Studio 2022 的 C++ 桌面开发组件)。

## 词典文件 (可选但推荐)

放到 `resources/dict/` 下：

1. **Lexique383.tsv** —— 用于自动识别词性 / 阴阳性 / 原型
   下载：https://www.lexique.org/databases/Lexique383/Lexique383.tsv
2. **verbs-fr.xml** + **conjugation-fr.xml** —— 用于动词变位
   下载（Verbiste 数据，GPL 开源）：
   - https://perso.b2b2c.ca/~sarrazip/dev/verbiste-0.1.47.tar.gz
   - 解压后取 `data/verbs-fr.xml` 和 `data/conjugation-fr.xml`

如果不放置词典，应用仍可运行——录入页就需要你手动选词性/原型。Wiktionary 在线兜底自动启用。

## 启动

```bash
pnpm dev
```

数据库文件位于 `app.getPath('userData')`（Windows 通常为 `%APPDATA%/french-deck/french-deck.db`）。

## 已实现功能

- ✅ **录入**：surface → Lexique 自动识别 lemma/pos/gender；缺失时 Wiktionary 兜底；重音快捷输入。
- ✅ **复习 - 拼写模式**：显示中/英翻译，输入法语；名词需选 le/la；变音宽松比对。
- ✅ **复习 - 变位模式**：随机抽常见时态/人称，与 Verbiste 标准答案比对。
- ✅ **FSRS 调度**：每次复习按 Again/Hard/Good/Easy 自评，自动更新 due。
- ✅ **统计页**：今日待复习概览 / 30 天复习曲线 (SVG) / 错误率 Top 20。

## 数据位置

- SQLite: `%APPDATA%/french-deck/french-deck.db`（Windows）
- 词典: `resources/dict/`（用户自行放置）
