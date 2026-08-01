# 安装与验收

## 环境

- Windows；
- Zotero `7.0.x`；
- Microsoft Edge 或 Google Chrome；
- 安装者能够开启浏览器开发人员模式。

## 1. 安装 Zotero Bridge

1. 启动 Zotero 7；
2. 打开 `工具 → 插件`；
3. 点击齿轮 → `Install Plugin From File…`；
4. 选择 Release 中的 `PaperLoop-DOI-Bridge-0.1.19.xpi`；
5. 确认插件列表显示 0.1.19 且启用。

## 2. 安装浏览器扩展

1. 暂时禁用官方 Zotero Connector，避免两个 Connector 同时注入页面；
2. 解压 `PaperLoop-Browser-Extension-0.3.10.zip`；
3. Edge 打开 `edge://extensions`，Chrome 打开 `chrome://extensions`；
4. 开启开发人员模式，点击“加载解压缩的扩展”；
5. 选择直接包含 `manifest.json` 的解压目录；
6. 将网站访问权限设为“在所有网站上”，或明确允许待测试站点。

## 3. 首次验收

1. 打开一篇具体论文详情页；
2. 点击 PaperLoop 工具栏图标显示侧栏；
3. 选择 Zotero Library/Collection；
4. 输入思考并一键收藏；
5. 在 Zotero 核对主条目、分类、PaperLoop 子笔记和可用附件；
6. 修改思考并再次同步，确认更新的是原子笔记；
7. 再次收藏同一 DOI，确认不产生重复主条目；
8. 改选同一 Library 的另一 Collection，确认同一主条目属于两个分类；
9. 如测试跨 Library，确认目标 Library 中使用独立条目。

## 4. 更新

当前版本不提供自动在线更新：

- 浏览器扩展：用新文件替换解压目录后，在扩展管理页点“重新加载”；
- Zotero Bridge：从 Zotero 插件管理器选择新版 XPI 安装；
- 更新前保留 Zotero 正常同步/备份；不要用复制浏览器 profile 的方式升级。

## 5. 常见问题

- 点击无反应：检查扩展网站访问权限、是否已重新加载，以及官方 Connector 是否仍同时启用；
- 页面未识别：说明当前页面没有可用 Zotero Translator，不应强行生成残缺条目；
- 有题录无 PDF：分别检查全文权限、登录、机构代理和站点风控；
- HTML 被报告为 PDF：0.3.10 应拒绝该响应并继续寻找真实 PDF；请附完整错误和 URL 报告回归；
- 跨 Library 没复用原 itemKey：这是 Zotero 数据模型的正常行为。
