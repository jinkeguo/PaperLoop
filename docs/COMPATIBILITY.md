# Zotero compatibility / 兼容性

Browser 0.3.33 · Native plugin 0.5.5

## Runtime coverage

Windows x64 isolated libraries were used with official Zotero **7.0.32, 8.0.4, 9.0.6 and 10.0.3**. Each exercises the packaged XPI through the local HTTP server: DOI-less Connector session saving, collection placement, canonical note identity, three embedded images, native editor normalization, disjoint edit merging and repeated saves with a native editor open. Tests use generated content, not personal library data.

This is not a claim that every patch release, operating system or publisher website was tested. Browser UI tests run in a separate Edge profile with test-only Zotero objects. Named ScienceDirect/CNKI/Wanfang fallback cases are controlled integration fixtures, not live-site acceptance tests.

## Compatibility work

- Zotero 10: explicit `Zotero-Allowed-Request` transport header; existing Connector save-target resolution remains the authority. No deprecated singular collection selection API is called by the native plugin.
- Zotero 7: coordinate pending editor saves and disable retiring editor instances before external writes so they cannot restore stale HTML. Divergent drafts in several native editor windows are preserved for the user to reconcile.
- Zotero 7's Firefox 115: structural CSS selectors replace `:has()` for native two-column notes. No editable ProseMirror DOM attributes are added.
- Startup and shutdown test doubles cover major versions 7–10, missing capabilities, listener cleanup fallback and re-enabling.

不同段落修改会自动合并；同一段内容被两端同时改动时，保留双方版本并提示选择，不擅自覆盖。Zotero 7 若同时打开多个内容不同的笔记窗口，请先保留并确认这些修改。

## Official references

- [Zotero 7 plugin development](https://www.zotero.org/support/dev/zotero_7_for_developers)
- [Zotero 8 platform changes](https://www.zotero.org/support/dev/zotero_8_for_developers)
- [Zotero 9 changes](https://www.zotero.org/support/dev/zotero_9_for_developers)
- [Zotero 10 APIs and local-server security](https://www.zotero.org/support/dev/zotero_10_for_developers)

The supplied translator definitions, extraction engine and compiler are unchanged. Installation remains manual via XPI and an unpacked browser extension; the placeholder native update URL does not provide automatic updates.
