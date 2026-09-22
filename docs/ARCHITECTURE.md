# 架构

当前发布入口为 `browser-extension/` 与 `zotero-plugin/`。以下保留原有工作流说明；新增图文笔记使用 `/connector/paperloop/notebook`，无 DOI 的回退题录通过原生 Connector 保存会话确定条目身份，不按标题猜测。图片存为原生附件，表格用于笔记两栏展示。

## 设计原则

1. Zotero 是条目、附件和笔记的唯一可信来源；
2. Zotero Translator 负责站点识别与完整题录；
3. PaperLoop 负责阅读交互、分类选择、幂等编排和思考同步；
4. Agent/API 可以是写作辅助，但不进入可靠收藏的必经链路；
5. 不直接读写 `zotero.sqlite`。

## 组件

### 浏览器扩展

- 注入论文页侧栏；
- 维护按文献 URL/DOI 隔离的本地草稿；
- 调用 Translator 检测与保存会话；
- 查询 Zotero Library/Collection；
- 与 Bridge 协调 DOI 去重、条目状态、笔记更新和 PDF 补录；
- 下载受控全文时保留原标签页的认证上下文，并验证 MIME 与 PDF 文件头。

### Zotero DOI Bridge

注册本机 `/connector/paperloop/*` 端点，提供：

- DOI 查询与目标 Library 内去重；
- 既有条目加入 Collection；
- PaperLoop 子笔记创建、更新和状态回读；
- 条目/笔记搜索；
- 已有条目 PDF 状态检查与受控导入；
- eventID、内容和并发层面的幂等。

### 数据权威与恢复

- Zotero 主条目、附件、子笔记：权威数据；
- 浏览器草稿：未同步内容的临时副本；
- 浏览器关联丢失：按 DOI 查询 Zotero 恢复；
- Zotero 和浏览器两端同时修改：保留本地草稿并提示冲突，由用户选择是否加载 Zotero 版本。

## Collection 与 Library

- 一个 Zotero 条目可以同时属于同一 Library 内的多个 Collection；
- 一个 itemKey 不能跨 Library；
- 因此同一 DOI 在不同 Library 中分别查询、复用或创建独立条目。

## 失败策略

- Bridge 不可用：停止依赖 Bridge 的写入，不伪装为已成功；
- Translator 未识别：禁用收藏，不用视觉字段拼凑条目；
- 笔记成功、PDF 失败：明确报告部分成功，笔记不回滚；
- HTML 登录壳：拒绝作为 PDF，有限次认证回退后给出可诊断错误；
- 重复点击/网络重试：共享 in-flight 操作并复用既有对象。
