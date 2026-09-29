# Changelog

## PaperLoop 0.3.35 / Zotero 0.5.5 — 2026-09-29

- 修复段落操作偶发无响应、按钮悬停变白，以及图片改名后下一次点击失效。
- Fixed missed paragraph actions, washed-out button hover colors, and clicks lost after renaming an image.

[中英文说明 / Release notes](docs/releases/v0.3.35.md)

## PaperLoop 0.3.34 / Zotero 0.5.5 — local build

- 水彩插画使用透明底，保留白色与浅色细节；插画区域增加主题色柔和渐变。
- Transparent watercolor artwork preserves white/pale details, with a soft theme-colored halo behind the illustration.

[中英文说明 / Release notes](docs/releases/v0.3.34.md)

## PaperLoop 0.3.33 / Zotero 0.5.5 — release candidate

七套插画主题、截图与本地图片、输入与同步修复、备份恢复、Zotero 7–10 兼容。发布文字待审核。

Seven illustrated themes, screenshot/local image input, editing and sync fixes, backup/recovery, and Zotero 7–10 compatibility. Release copy pending review.

[中英文发布草稿 / Bilingual release draft](docs/releases/v0.3.33.md)

## PaperLoop 0.3.32 / Zotero 0.5.4 — 2026-09-28 (local build)

- 修复空白提示文字覆盖“新的一段 / 删除本段”按钮。提示和按钮现在分别占位，窄面板和页面缩放时自动排布。
- Fixed empty-note help overlapping the paragraph buttons. Help and actions now reserve their own space across narrow panels and zoom levels.

## PaperLoop 0.3.31 / Zotero 0.5.4 — 2026-09-28 (local build)

- 新段落直接使用正文，不再自动添加空标题提示。
- 修复自动保存后光标跳走，无法在原位置继续输入的问题。
- 修复首次输入后空白笔记提示仍然显示。
- New paragraphs start as body text without a generated title prompt.
- Fixed caret loss after automatic saves.
- Fixed the empty-note prompt remaining visible after first input.

## PaperLoop 0.3.30 / Zotero 0.5.4 — 2026-09-28 (local build)

- 修复截图和本地图片保存后，尺寸、图片来源变成笔记正文的问题。
- 本地图片不再标注为来自当前网页。
- 空白笔记增加截图粘贴、本地图片导入和保存提示。
- Fixed generated image dimensions and source links appearing as note paragraphs after local image saves.
- Local screenshots no longer claim the current webpage as their source.
- Added screenshot, file import and save instructions to the empty-note prompt.

## PaperLoop 0.3.29 / Zotero 0.5.4 — 2026-09-28 (local build)

### 中文

- 修复先插图后无法输入，以及新段落默认文字残留。
- 支持粘贴截图、选择本地图片和拖入图片。
- 增加面板缩小、放大和适应窗口按钮。
- 自动保留本机备份，可恢复历史版本或载入 Zotero 中已保存的笔记。
- 改善知网等文献详情页的自动显示时机。
- 新增 Claude 风格的暖纸、雾松和墨蓝主题。

### English

- Fixed typing after image-first notes and placeholder text appearing in new paragraphs.
- Added screenshot paste, local image selection and drag-and-drop.
- Added smaller, larger and fit-to-window panel controls.
- Added local backup history and recovery from saved Zotero notes.
- Improved early display on literature detail pages, including CNKI.
- Added three Claude-inspired themes: Warm Paper, Sage and Ink.

[Usage and validation / 使用与验证](docs/releases/v0.3.29.md)

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
