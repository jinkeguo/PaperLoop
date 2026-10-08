# 安装与更新 / Installation and upgrade

## 中文

当前版本：浏览器扩展 **0.3.41**，Zotero 插件 **0.5.7**。浏览器使用 Microsoft Edge 验证；Zotero 7–10 的实测版本见 [兼容性记录](COMPATIBILITY.md)。

主题与宠物：点击顶部主题名切换配色。在设置里选择“缩小后 → 浏览器宠物”，再点击标题栏的“−”，即可变成奶牛猫或柴犬。拖动宠物改变位置，单击或按 Enter 恢复笔记。可单独指定宠物，或改回“简洁书签”。系统启用“减少动态效果”时，宠物保持静止。宠物只在网页内显示，不会出现在 Windows 桌面或浏览器设置页。

已安装 Zotero 插件 0.5.7 的用户，本次只需更新浏览器扩展。

### 首次安装

1. 从 [Release](https://github.com/jinkeguo/PaperLoop/releases/latest) 下载完整分享包，或使用本包中的浏览器扩展和 Zotero XPI。
2. 打开 Zotero 的插件管理器，点击齿轮，选择“从文件安装插件”，安装 `PaperLoop-for-Zotero-0.5.7.xpi`，然后重启。
3. 解压 `PaperLoop-Browser-Extension-0.3.41.zip`。如使用完整分享包，选择其中已解压的 `browser-extension` 文件夹。
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

不同段落的修改会自动合并；同一处被两端同时修改时，会保留备份，再由你选择保留哪一版。缺少 PDF 时，检查网站登录和全文权限。遇到问题可在 [Issues](https://github.com/jinkeguo/PaperLoop/issues) 提交网页链接、版本和提示文字。

## English

Current versions: browser extension **0.3.41**, Zotero plugin **0.5.7**. Browser checks use Microsoft Edge; see [compatibility coverage](COMPATIBILITY.md) for tested Zotero 7–10 versions.

Themes and pets: click the theme name to change colors. In settings, select “When minimized → Browser pet”, then click the header's “−”. Drag the cat or Shiba to move it; click or press Enter to reopen your notes. Choose a pet independently or switch back to the bookmark ribbon. Pets stay still when the system requests reduced motion. They appear inside webpages, not on the Windows desktop or browser settings pages.

If Zotero plugin 0.5.7 is already installed, only update the browser extension for this release.

### First installation

1. Download the complete share package from the [latest release](https://github.com/jinkeguo/PaperLoop/releases/latest), or use the browser extension and Zotero XPI included in this package.
2. Open Zotero's Plugins manager, select “Install Plugin From File” from the gear menu, choose `PaperLoop-for-Zotero-0.5.7.xpi`, and restart Zotero.
3. Extract `PaperLoop-Browser-Extension-0.3.41.zip`. If using the complete share package, select its already extracted `browser-extension` folder.
4. Enable developer mode at `edge://extensions` or `chrome://extensions`, select “Load unpacked,” and choose the folder containing `manifest.json`.
5. Allow site access. If the official Zotero Connector is also installed, disable one of the two extensions to avoid duplicate injection.

### Upgrade

Save current edits, back up the existing browser extension directory, and replace its files with the new version. Keep the same directory, reload the extension, and refresh open webpages. Install the new XPI through Zotero's Plugins manager and restart Zotero.

### Use

Open a paper, write notes, collect images with a right-click, choose a Zotero library and collection, then save. Associated images appear beside their text in Zotero; unassociated images appear below. Reusing an image in several paragraphs does not duplicate the attachment file.

Existing notes switch to two columns when explicitly saved again, not in bulk. Keep the “PaperLoop · 笔记” and “关联图片” table headings so the browser can restore associations. Body text, paragraph titles, and image names remain editable. Devices without the plugin can still read the table, though column proportions may differ.

Edits to different paragraphs merge automatically. If both sides change the same content, both versions are backed up before you choose which to keep. Missing PDFs may require website login or full-text access. Report issues with the webpage URL, versions, and error message in [Issues](https://github.com/jinkeguo/PaperLoop/issues).
