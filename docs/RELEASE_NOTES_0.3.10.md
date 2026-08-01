# PaperLoop 0.3.10 / Bridge 0.1.19

发布日期：2026-08-01

## Release assets

- `PaperLoop-Browser-Extension-0.3.10.zip`
- `PaperLoop-DOI-Bridge-0.1.19.xpi`
- `PaperLoop-0.3.10-friend-test.zip`（包含中文安装说明、验收清单、反馈模板和校验值）

## 重点变化

- 将网页阅读、持续思考、Zotero 分类选择和可靠收藏串成一个侧栏流程；
- DOI 已存在时更新同一条目/笔记，不因重复点击产生重复对象；
- 支持同一文库多 Collection 和跨 Library 独立条目；
- 清除浏览器缓存后可从 Zotero 恢复关联；
- 已有条目缺 PDF 时可补录；
- 修复 ScienceDirect 等真实出版商返回 HTML 登录壳导致 PDF 补充失败的问题；
- PDF 回退始终保留原论文标签页的分区 Cookie，且只接收 MIME、响应头和 magic bytes 验证通过的 PDF。

## 测试重点

朋友测试请优先验证：

1. 新论文题录完整性；
2. 笔记首次写入与再次更新；
3. 重复点击；
4. 同 Library 多分类；
5. 跨 Library；
6. 浏览器缓存清理后的恢复；
7. 已有条目 PDF 补录；
8. ScienceDirect、CNKI、万方等真实登录页面。

## 已知限制

- 开发者模式安装，尚无商店签名；
- 当前没有自动更新通道；
- PDF 受账号、机构权限和站点风控约束；
- PaperLoop 不会在 Translator 未识别时生成猜测条目。
