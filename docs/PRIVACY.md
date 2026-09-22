# 隐私与安全边界

## 本地存储

浏览器扩展会保存侧栏位置/开关、自动打开设置、未同步草稿，以及条目恢复需要的最小关联信息。Zotero Bridge 把正式条目、附件和 PaperLoop 子笔记写入用户当前 Zotero 数据目录。

待保存图片暂存在浏览器本地 IndexedDB；确认保存后写为 Zotero 原生图片附件。主题照片随扩展打包，打开主题不会请求照片网站。图片来源地址作为附件信息保留。

## 网络

PaperLoop 没有自建云端、遥测或广告接口。网络请求来自：

- 用户正在访问的论文网站；
- Zotero Connector 原有 Translator/保存流程；
- 浏览器在用户权限下取得的 PDF/附件 URL；
- Zotero 上游原有功能可能使用的 Zotero 服务。

Bridge 自身只提供本机 Connector HTTP 端点，不需要 PaperLoop 云账号或 Zotero API Key。

## 不应收集或上传

- `zotero.sqlite` 或完整 Zotero profile；
- 浏览器 profile、Cookie、密码、机构代理凭据；
- Zotero API Key；
- 未经脱敏的私人阅读笔记；
- 含个人路径和账号信息的完整日志。

## 风险提示

当前是开发者模式测试版，尚未经过浏览器商店审核或第三方安全审计。请只从可信 Release 获取文件，核对 SHA-256，并在重要文库已有正常 Zotero 同步/备份的前提下测试。
