# 构建与测试 / Build and test

## 当前源码 / Current source

- `browser-extension/`: loadable browser extension 0.3.41.
- `zotero-plugin/`: Zotero plugin 0.5.7.
- Original `src/`, `lib/`, `paperloop-zotero-bridge/`, `build.sh` and `gulpfile.js` retain the historical 0.3.11 upstream build baseline. The current release packages the supplied runtime source directly; it does not recompile or replace the Translator engine.

## 打包 / Package

Requires PowerShell 7 / .NET and Node.js for regression checks.

```powershell
node scripts/test-paperloop-release.cjs
./scripts/build-paperloop-release.ps1 -OutputDirectory paperloop-release/verified-0341-final
./scripts/audit-paperloop-release.ps1 -PackageDirectory paperloop-release/verified-0341-final
```

Packages are created once, with fixed ZIP entry timestamps, at:

- `paperloop-release/verified-0341-final/PaperLoop-Browser-Extension-0.3.41.zip`
- `paperloop-release/verified-0341-final/PaperLoop-for-Zotero-0.5.7.xpi`

The builder excludes test files and local scripts. The audit compares every archive entry against its source. Existing output files are not overwritten; use another output subdirectory for a new build.

## 回归 / Regression checks

```powershell
node scripts/test-paperloop-release.cjs
node scripts/test-paperloop-browser.cjs
node scripts/test-paperloop-frame-routing.cjs
./scripts/test-paperloop-native.ps1 -Package paperloop-release/verified-0341-final/PaperLoop-for-Zotero-0.5.7.xpi
```

- Node regression runner: eleven browser test files, six native plugin test files and two test-result/launcher checks. The launcher checks require PowerShell 7 (`pwsh`).
- Translator fallback integration: 9 cases using the production fallback/save glue and in-memory transport/library doubles, including no-DOI metadata, prior standard-save sessions, existing-item reuse, failed saves, and detection of an older native plugin.
- Native session identity validation: 8 cases covering missing sessions, unrelated keys, deleted/non-regular items, wrong libraries, and DOI mismatch.
- Headless Edge notebook suite: 196 checks, including library isolation, saved-image backup retention, offline backups, initial draft protection, image recovery, snapshot save ordering, thumbnails, synchronization, concurrent edits, image associations, editing, themes, pets, layout, drag/resize, URL migration and late save results. This suite uses test-only Zotero objects. Set `PAPERLOOP_RECOVERY_ONLY=1` for the 11 recovery/save-order checks, `PAPERLOOP_ISOLATION_ONLY=1` for the nine library/backup checks or `PAPERLOOP_SAVE_RELIABILITY_ONLY=1` for the eight new save-reliability checks.
- Real MV3 frame-routing suite: three checks with a dedicated Edge extension/profile, the production message listener and production save routing. Reproduces the broadcast race and verifies main-frame/subframe routing without accessing publishers or Zotero.
- Theme-specific suite: 15 checks for transparent watercolor backgrounds and isolated light/dark gradients. See [0.3.35 validation](validation/v0.3.35.md).
- Native runtime matrix: official Windows x64 Zotero 7.0.32, 8.0.4, 9.0.6 and 10.0.3; real HTTP dispatch, Connector sessions, notes, three images and repeated saves. The unchanged 0.5.7 XPI reuses the hash-matched matrix from 0.3.38, not a new four-host run. See [compatibility coverage](COMPATIBILITY.md).

The Edge runner defaults to the Windows Edge installation path and uses a new temporary browser profile. The Zotero runner defaults to `C:/Program Files/Zotero/zotero.exe`; override with `-ZoteroPath` if needed. It creates a uniquely named test profile/data directory and a separate TEMP/TMP inside ignored `paperloop-release/`, disables unrelated automatic Word/LibreOffice installation, and the test add-on refuses to run against a personal data directory. PowerShell 7.4+ is needed for the child-process environment override. Pass the exact audited XPI using `-Package`; the default is the top-level build output, not a historical candidate. `launch.json` and `report.json` record the package SHA256. Only a completed report with boolean `ok: true` and a matching SHA256 passes. Missing reports, failed reports, mismatched packages and timeout return failure. The default reporting timeout is 180 seconds; override using `-ReportTimeoutSeconds` for slower first-run initialization.

## 验证范围 / Scope

Named ScienceDirect/CNKI/Wanfang fallback scenarios are controlled fixtures. Separately, the final native XPI and browser 0.3.39 saved one actual CNKI journal article, its PaperLoop note and a real SingleFile Snapshot in an isolated Zotero 9.0.6 library. Actual sidebar pointer/keyboard saves, webpage reloading and further editing passed, and repeat saving reused all three identities. Detailed publication-field comparisons belong to the preceding 0.3.37 run. Three other CNKI links reached security verification in earlier runs rather than article acceptance. Real-page and controlled-page results are recorded separately; controlled success alone cannot satisfy live acceptance. See [0.3.39 validation](validation/v0.3.39.md). Site access, publisher responses, and downloaded translator versions can change independently. No personal Zotero library, cookies, or private notes are included in the source or release assets.

The supplied `translate/`, `utilities/`, `offscreen/` code and extraction helpers remain unchanged. This update changes browser save routing, bounded waits, draft migration and backup recovery, not translator definitions, native plugin code or the compiler.

## Historical baseline

Upstream Zotero Connector commit: `48ad1fe09defb770f83a3268cf8ebe72ab9aba52`. Earlier 0.3.11 release verification included 131 Connector tests; this is historical evidence, not a claim that the old `npm test` suite was rerun for 0.3.35.
