# Contributing

欢迎提交可复现的问题和小范围 Pull Request。

## 上游 Zotero 官方仓库

- Zotero Connector 官方仓库：<https://github.com/zotero/zotero-connectors>
- Zotero 桌面端官方仓库：<https://github.com/zotero/zotero>

如果问题在未修改的官方 Zotero Connector 中也能复现，请先搜索官方仓库现有 Issue，并遵循其贡献规则。PaperLoop 侧栏、PaperLoop 本地端点、思考笔记、分类编排、缓存恢复和已有条目补 PDF 的问题，应在 PaperLoop 仓库报告。不要把 PaperLoop 专属修改直接推送到 Zotero 官方仓库。

## 报告问题

请使用 Bug 模板，并提供：论文 URL/DOI、网站、浏览器与 Zotero 版本、PaperLoop 两组件版本、所选 Library/Collection、最短复现步骤、侧栏完整错误和 Zotero 中实际对象数量。

请勿上传 Zotero 数据库、浏览器 profile、Cookie、密码、API Key 或未脱敏的私人笔记。

## 提交代码

1. 基于 `paperloop-0.3.10` 或后续 PaperLoop 分支创建功能分支；
2. 保持 Zotero Translator 为题录可信来源；
3. 新写入路径必须考虑重复点击、并发请求、缓存缺失与跨 Library；
4. 对行为变更补充自动化测试；
5. 运行 `npm test` 和相关专项测试；
6. 不提交 `build/`、`node_modules/`、ZIP/XPI 或本机数据。

贡献代码需与仓库 AGPLv3 许可证兼容。
