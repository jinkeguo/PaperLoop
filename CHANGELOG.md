# Changelog

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
