# 构建与测试

## 上游基线

本分支基于 Zotero Connector 提交：

```text
48ad1fe09defb770f83a3268cf8ebe72ab9aba52
```

`upstream` 远端应指向 `https://github.com/zotero/zotero-connectors.git`。不要向上游远端直接推送 PaperLoop 发布分支。

## 浏览器扩展

构建依赖与 Zotero Connector 上游一致：Git、Node.js/npm、Bash、rsync 和顶层 Git submodule。

```bash
git submodule update --init
npm install
./build.sh -p b -v 0.3.11
```

构建结果位于 `build/browserExt`。在 Edge/Chrome 开发人员模式中加载该目录。

调试构建：

```bash
./build.sh -p b -v 0.3.11 -d
```

## Zotero Bridge

Bridge 不需要编译；XPI 是 `paperloop-zotero-bridge/` 下运行文件的 ZIP 容器。仓库提供 PowerShell 辅助脚本：

```powershell
.\scripts\build-paperloop-bridge.ps1
```

脚本会生成 `paperloop-release/PaperLoop-DOI-Bridge-0.1.19.xpi`，若目标已存在则停止，避免无提示覆盖。

## 测试

安装依赖后运行 Connector 测试：

```bash
npm test
```

Bridge 逻辑测试：

```bash
node paperloop-zotero-bridge/test-paperloop.mjs
```

0.3.11 发布前已通过：

- Connector 完整自动化：131/131；
- PDF/认证回退专项：16/16；
- 正式包独立 Chromium HTML→PDF 烟雾测试；
- 正式包、Edge 加载目录与构建目录 280 文件一致性检查。

真实网站验收仍需使用测试者自己的合法登录和全文权限。
