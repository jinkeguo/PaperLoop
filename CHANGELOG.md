# Changelog

## PaperLoop 0.3.28 / Zotero 0.5.4 — 2026-09-23

### 中文

- 修复普通编辑后误报“两端内容不一致”。
- 已关联笔记自动双向同步，不同段落的修改自动合并。
- 修复多张图片在重新打开文献后不显示缩略图。

### English

- Fixed false conflicts after ordinary note edits.
- Linked notes sync both ways and automatically merge changes to different paragraphs.
- Fixed missing thumbnails when reopening papers with multiple saved images.

[Downloads and release notes / 下载与更新说明](docs/releases/v0.3.28.md)

## PaperLoop 0.3.27 / Zotero 0.5.4 — 2026-09-22

### 中文

- 图文一起保存：右键收藏网页图片，支持多图管理，文字和图片一次保存到 Zotero。
- Zotero 笔记两栏排版：左侧文字、右侧对应图片，方便对照阅读。
- 界面与主题更新：加入奶牛猫、柴犬等摄影主题，支持明暗切换和手写风格名称，面板可拖动、调整大小。
- 适配 Zotero 9：改进笔记同步、图片保存和面板显示，修复未填写思考时无法保存笔记的问题。
- 修复回退保存：修复切换备用 Translator 后，部分文献无法继续保存图文笔记的问题。

### English

- Save text and images together: collect webpage images with a right-click and save them with your notes to Zotero in one action.
- Two-column Zotero notes: read text on the left and associated images on the right.
- Refreshed interface and photographic themes, with light/dark modes, a handwritten-style name, and a draggable, resizable panel.
- Zotero 9 support: improved note synchronization, image saving, and panel display; fixed note creation when the thought field is empty.
- Fixed cases where switching to a backup translator prevented further text-and-image note saving.

[Downloads and release notes / 下载与更新说明](docs/releases/v0.3.27.md)

## PaperLoop Connector 0.3.11 / DOI Bridge 0.1.19 — 2026-08-01

- Added an `EN` / `中` title-bar control that switches the complete reading panel between English and Simplified Chinese.
- Persisted the interface language across papers, tabs, browser restarts, and in-place extension upgrades.
- Kept the active paper, thought draft, Zotero destination, panel position, and save state unchanged while switching languages.
- Localized detection, destination selection, recovery, save, PDF backfill, and error feedback instead of translating only static buttons.
- Made closing the panel flush the last confirmed draft immediately and strengthened draft-restoration coverage.
- Passed the complete Connector regression suite: 131/131 tests.

## PaperLoop Connector 0.3.10 / DOI Bridge 0.1.19 — 2026-08-01

- 增加论文页常驻侧栏、拖动、关闭和 `PL` 最小化标签；
- 使用 Zotero Translator 完成题录与附件保存；
- 增加 Library/Collection 选择，避免官方保存进度窗重复要求分类；
- DOI 已存在时复用主条目并追加/更新同一 PaperLoop 子笔记；
- 支持同一文库多分类与跨 Library 独立条目；
- 浏览器缓存缺失后可从 Zotero 恢复关联，Zotero 笔记是权威版本；
- 已有条目缺 PDF 时可补录，已有可用 PDF 时跳过重复下载；
- 修复出版商 PDF 首次返回 HTTP 200 HTML 登录壳时的认证回退，并保留原论文标签页的分区 Cookie 上下文；
- 增加 HTML/MIME/PDF magic-byte 校验，拒绝伪 PDF；
- 扩充并发、幂等、分类、笔记同步、PDF 和真实浏览器回归测试。
