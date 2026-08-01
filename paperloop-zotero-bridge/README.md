# PaperLoop DOI Bridge 0.1.19

PaperLoop 在 Zotero 7 中使用的本地桥接插件。浏览器端继续使用 Zotero Translator 获取可信题录；Bridge 负责在目标 Library 内按 DOI 去重、管理 Collection、写入/更新 PaperLoop 子笔记，以及给既有条目补充已验证的 PDF。

## 行为

- DOI 未找到：由浏览器 Connector 正常创建完整主条目和允许保存的附件；
- DOI 找到：复用目标 Library 内的规范条目，不重复创建主条目；
- 同一条目可加入同一 Library 内的多个 Collection，不移除原分类；
- 跨 Library 时分别查询或创建独立条目，不复用另一 Library 的 itemKey；
- 思考内容变化时更新同一条 PaperLoop 子笔记；内容相同或请求重试时复用已有笔记；
- eventID、相同内容和并发请求共享幂等控制，失败后锁可释放；
- 既有条目没有可用本地 PDF 时允许补录；已有 PDF 时跳过重复导入；
- 浏览器可只读查询条目和 PaperLoop 笔记状态，用于缓存丢失后的恢复。

## 安装

从 PaperLoop GitHub Release 下载 `PaperLoop-DOI-Bridge-0.1.19.xpi`，在 Zotero 7 中打开 `工具 → 插件 → 齿轮 → Install Plugin From File…` 完成安装。

完整步骤见仓库的 `docs/INSTALLATION.md`。

## 构建

Bridge 不需要编译，运行文件是：

- `bootstrap.js`
- `manifest.json`
- `paperloop.js`
- `README.md`

在仓库根目录运行：

```powershell
.\scripts\build-paperloop-bridge.ps1
```

## 测试

```bash
node paperloop-zotero-bridge/test-paperloop.mjs
```

测试覆盖 DOI 去重、子笔记幂等、并发、分类、跨 Library、状态回读和 PDF 导入逻辑。

## 安全边界

Bridge 只注册本机 Zotero Connector HTTP 端点，不访问 PaperLoop 云端，不需要 Zotero API Key，也不直接读写 `zotero.sqlite`。
