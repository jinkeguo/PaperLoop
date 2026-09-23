# 安装与更新 / Installation and upgrade

## 中文

当前版本：浏览器扩展 **0.3.28**，Zotero 插件 **0.5.4**。已验证环境为 Microsoft Edge 和 Zotero 9.0.6。

### 首次安装

1. 从 [Release](https://github.com/jinkeguo/PaperLoop/releases/tag/v0.3.28) 下载完整分享包，或分别下载浏览器 ZIP 和 Zotero XPI。
2. 打开 Zotero 的插件管理器，点击齿轮，选择“从文件安装插件”，安装 `PaperLoop-for-Zotero-0.5.4.xpi`，然后重启。
3. 解压 `PaperLoop-Browser-Extension-0.3.28.zip`。如使用完整分享包，选择其中已解压的 `browser-extension` 文件夹。
4. 在 Edge 的 `edge://extensions` 或 Chrome 的 `chrome://extensions` 开启开发者模式，选择“加载解压缩的扩展”，打开直接包含 `manifest.json` 的文件夹。
5. 允许 PaperLoop 访问待用网页。若同时安装了官方 Zotero Connector，先停用其中一个，避免重复注入。

### 已有用户更新

1. 保存当前编辑内容。
2. 备份原浏览器扩展目录，再将新版文件覆盖到该目录，保留原扩展身份。
3. 在扩展管理页重新加载 PaperLoop，刷新已打开的网页。
4. 在 Zotero 中从文件安装新版 XPI，并重启 Zotero。

### 开始使用

打开文献页，写下笔记，右键收藏所需图片，选择 Zotero 文库与分类，然后点击保存。与段落关联的图片会出现在 Zotero 笔记右栏，未关联图片放在下方。同一张图可关联多个段落，仍复用同一个图片附件。

旧笔记在你再次保存时转换为两栏，不会批量改动。请保留布局表头“PaperLoop · 笔记”和“关联图片”，以便浏览器恢复段落与图片关系；正文、段落标题与图名可以编辑。其他设备没有 PaperLoop 插件时仍可阅读表格，显示比例可能不同。

图文保存出现“两端内容不一致”时，先保留当前草稿，再载入 Zotero 中的新内容。缺少 PDF 时，检查网站登录和全文权限。遇到问题可在 [Issues](https://github.com/jinkeguo/PaperLoop/issues) 提交网页链接、版本和提示文字。

## English

Current versions: browser extension **0.3.28**, Zotero plugin **0.5.4**. Checked with Microsoft Edge and Zotero 9.0.6.

### First installation

1. Download the complete share package, or the browser ZIP and Zotero XPI separately, from the [release](https://github.com/jinkeguo/PaperLoop/releases/tag/v0.3.28).
2. Open Zotero's Plugins manager, select “Install Plugin From File” from the gear menu, choose `PaperLoop-for-Zotero-0.5.4.xpi`, and restart Zotero.
3. Extract `PaperLoop-Browser-Extension-0.3.28.zip`. If using the complete share package, select its already extracted `browser-extension` folder.
4. Enable developer mode at `edge://extensions` or `chrome://extensions`, select “Load unpacked,” and choose the folder containing `manifest.json`.
5. Allow site access. If the official Zotero Connector is also installed, disable one of the two extensions to avoid duplicate injection.

### Upgrade

Save current edits, back up the existing browser extension directory, and replace its files with the new version. Keep the same directory, reload the extension, and refresh open webpages. Install the new XPI through Zotero's Plugins manager and restart Zotero.

### Use

Open a paper, write notes, collect images with a right-click, choose a Zotero library and collection, then save. Associated images appear beside their text in Zotero; unassociated images appear below. Reusing an image in several paragraphs does not duplicate the attachment file.

Existing notes switch to two columns when explicitly saved again, not in bulk. Keep the “PaperLoop · 笔记” and “关联图片” table headings so the browser can restore associations. Body text, paragraph titles, and image names remain editable. Devices without the plugin can still read the table, though column proportions may differ.

If the browser and Zotero copies differ, preserve the draft before loading the newer Zotero copy. Missing PDFs may require website login or full-text access. Report issues with the webpage URL, versions, and error message in [Issues](https://github.com/jinkeguo/PaperLoop/issues).
