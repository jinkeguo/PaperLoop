[English](README.md) | [简体中文](README.zh-CN.md)

# PaperLoop

继续阅读，随手记录，把论文、文字和图片一起保存到 Zotero。

PaperLoop 在 Zotero Connector 的题录与附件采集功能上加入阅读笔记。右键收藏网页图片，边读边写，再将图文一起保存为 Zotero 子笔记。

## 界面预览

浏览器实际界面截图，使用独立演示内容。

| 浅色主题 | 深色主题 | 图片收藏 |
| --- | --- | --- |
| ![PaperLoop 浅色主题阅读笔记](docs/assets/paperloop-0.3.35-light.png) | ![PaperLoop 深色主题阅读笔记](docs/assets/paperloop-0.3.35-dark.png) | ![PaperLoop 多图收藏界面](docs/assets/paperloop-0.3.35-gallery.png) |

## 本次更新

浏览器扩展 **0.3.35** · Zotero 插件 **0.5.5**

- 支持 Zotero 7–10，提供奶牛猫、柴犬等七套插画主题。
- 支持粘贴截图、本地图片、面板大小调整和本机备份恢复。
- 修复段落操作、首次输入、按钮颜色和图片改名问题。
- 文字与图片同步到同一篇 Zotero 笔记，保留两栏排版。

[完整更新说明 / Release notes](docs/releases/v0.3.35.md)

## 下载与安装

1. 下载[完整分享包](https://github.com/jinkeguo/PaperLoop/releases/download/v0.3.35/PaperLoop-0.3.35-Share.zip)，或者分别下载[浏览器扩展 0.3.35](https://github.com/jinkeguo/PaperLoop/releases/download/v0.3.35/PaperLoop-Browser-Extension-0.3.35.zip)和 [Zotero 插件 0.5.5](https://github.com/jinkeguo/PaperLoop/releases/download/v0.3.35/PaperLoop-for-Zotero-0.5.5.xpi)。
2. 在 Zotero 插件管理器中从文件安装 XPI，重启 Zotero。
3. 解压浏览器 ZIP，进入 Edge/Chrome 扩展管理页，开启开发者模式，加载包含 `manifest.json` 的文件夹。

已有 PaperLoop？保留原浏览器扩展目录，用新版文件覆盖后重新加载扩展，并刷新网页。Zotero 插件若不是 0.5.5，请一并更新。

[安装与更新指南](docs/INSTALLATION.md) · [最新发布](https://github.com/jinkeguo/PaperLoop/releases/latest)

## 源码与开发

- [`browser-extension/`](browser-extension)：当前可直接加载的浏览器代码和本地素材，版本 0.3.35。
- [`zotero-plugin/`](zotero-plugin)：当前 Zotero 插件源码，版本 0.5.5。
- [构建与测试](docs/BUILD_AND_TEST.md)：本次版本的打包方法与回归检查。
- 原有 `src/`、`lib/`、`paperloop-zotero-bridge/` 和上游构建脚本作为 0.3.11 历史开发基线保留，不是当前版本的发布入口。

## 文档

- [更新记录](CHANGELOG.md)
- [致谢](docs/CREDITS.md)
- [隐私说明](docs/PRIVACY.md)
- [原架构说明](docs/ARCHITECTURE.md)
- [参与贡献](CONTRIBUTING.md)
- [早期 0.3.11 工作流演示](https://github.com/jinkeguo/PaperLoop/releases/download/v0.3.11/PaperLoop-0.3.11-demo.mp4)

## 关于

PaperLoop 基于 [Zotero Connector](https://github.com/zotero/zotero-connectors) 独立维护，并非 Zotero 官方产品。提供的 Translator 和提取流程保持不变；网页采集与全文获取取决于站点支持和访问权限。

Edge 回归检查见[构建与测试](docs/BUILD_AND_TEST.md)，Zotero 7–10 实测版本与范围见[兼容性记录](docs/COMPATIBILITY.md)。

代码按 AGPLv3 发布，详见 [COPYING](COPYING) 和 [NOTICE.md](NOTICE.md)。主题图片的来源及独立许可见 [SOURCES.md](browser-extension/images/paperloop-themes/SOURCES.md)。
