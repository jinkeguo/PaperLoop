# Zotero compatibility / 兼容性

Browser 0.3.41 · Native plugin 0.5.7

## Runtime coverage

Browser 0.3.41 passed 196 isolated Edge UI/save checks, 19 command-line regression files and three real MV3 message-routing checks. Native plugin 0.5.7 remains unchanged; this update does not rerun publisher acceptance or the four-version native runtime matrix. See [0.3.41 review and validation](validation/v0.3.41.md).

Browser 0.3.40 passed 188 isolated Edge UI/save checks plus 15 existing watercolor checks. This theme/pet update leaves the native XPI and Translator engine unchanged; live CNKI and the four-version native runtime matrix were not rerun. See [0.3.40 validation](validation/v0.3.40.md).

Browser 0.3.39 passed 164 isolated Edge UI/save checks and a fresh real CNKI first-save/reload/edit run. This is a browser-only update: the native XPI below is byte-identical to 0.3.38's tested package. See [0.3.39 validation](validation/v0.3.39.md).

Windows x64 isolated libraries were used with official Zotero **7.0.32, 8.0.4, 9.0.6 and 10.0.3**. All four completed 25 checks using the same 0.5.7 XPI SHA256: `796449FEF2BBF62B23BBEE78EC1168B0A081D6ACA7CE30F203E8B93514E5E6B7`. Each exercises the packaged XPI through the local HTTP server: DOI-less Connector session saving, collection placement, canonical note identity, HTML snapshot storage and concurrent deduplication, three embedded images, native editor normalization, disjoint edit merging and repeated saves with a native editor open. Tests use generated content, not personal library data.

The 0.3.38 browser regression passed 155 UI and save checks, including 11 new draft/image-recovery cases. An isolated Edge/Zotero 9.0.6 run saved an actual CNKI journal article through the naturally displayed sidebar, reloaded the webpage, recovered the note and saved another edit. Repeat saves reused the same parent, note and readable SingleFile Snapshot. See [0.3.38 validation](validation/v0.3.38.md). The detailed publication-field comparison and a generated CNKI page with metadata arriving after 5.5 seconds were verified in the preceding [0.3.37 run](validation/v0.3.37.md), not rerun as part of this natural first-save test.

The user-provided encrypted link and two other links reached CNKI security verification in earlier isolated runs; those links are not counted as accepted articles. The real-page success uses a different, accessible CNKI journal article. Actual DOI-less or thesis CNKI pages were not accepted in these live-site runs; the DOI-less save coverage is controlled/native-runtime testing.

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
