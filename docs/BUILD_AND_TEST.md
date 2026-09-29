# 构建与测试 / Build and test

## 当前源码 / Current source

- `browser-extension/`: loadable browser extension 0.3.35.
- `zotero-plugin/`: Zotero plugin 0.5.5.
- Original `src/`, `lib/`, `paperloop-zotero-bridge/`, `build.sh` and `gulpfile.js` retain the historical 0.3.11 upstream build baseline. The current release packages the supplied runtime source directly; it does not recompile or replace the Translator engine.

## 打包 / Package

Requires PowerShell 7 / .NET and Node.js for regression checks.

```powershell
node scripts/test-paperloop-release.cjs
./scripts/build-paperloop-release.ps1 -OutputDirectory paperloop-release/verified-0335
./scripts/audit-paperloop-release.ps1 -PackageDirectory paperloop-release/verified-0335
```

Packages are created once, with fixed ZIP entry timestamps, at:

- `paperloop-release/verified-0335/PaperLoop-Browser-Extension-0.3.35.zip`
- `paperloop-release/verified-0335/PaperLoop-for-Zotero-0.5.5.xpi`

The builder excludes test files and local scripts. The audit compares every archive entry against its source. Existing output files are not overwritten; use another output subdirectory for a new build.

## 回归 / Regression checks

```powershell
node scripts/test-paperloop-release.cjs
node scripts/test-paperloop-browser.cjs
./scripts/test-paperloop-native.ps1
```

- Node regression runner: eight browser test files and five native plugin test files.
- Translator fallback integration: 9 cases using the production fallback/save glue and in-memory transport/library doubles, including no-DOI metadata, prior standard-save sessions, existing-item reuse, failed saves, and detection of an older native plugin.
- Native session identity validation: 8 cases covering missing sessions, unrelated keys, deleted/non-regular items, wrong libraries, and DOI mismatch.
- Headless Edge notebook suite: 144 checks, including multiple-image thumbnail recovery, two-way synchronization, concurrent edits, offline drafts, image associations, editing, themes, layout, drag/resize and round trips. This suite uses test-only Zotero objects.
- Theme-specific suite: 15 checks for transparent watercolor backgrounds and isolated light/dark gradients. See [0.3.35 validation](validation/v0.3.35.md).
- Native runtime matrix: official Windows x64 Zotero 7.0.32, 8.0.4, 9.0.6 and 10.0.3; real HTTP dispatch, Connector sessions, notes, three images and repeated saves. See [compatibility coverage](COMPATIBILITY.md).

The Edge runner defaults to the Windows Edge installation path and uses a new temporary browser profile. The Zotero runner defaults to `C:/Program Files/Zotero/zotero.exe`; override with `-ZoteroPath` if needed. It creates a uniquely named test profile/data directory inside ignored `paperloop-release/`, and the test add-on refuses to run against a personal data directory. A first run may initialize bundled translators for longer than the launcher's 55-second reporting window; inspect the printed test directory for `report.json`. Only a report with `ok: true` confirms completion.

## 验证范围 / Scope

The new regressions verify the fallback-to-save integration; named site scenarios are controlled fixtures, not live website acceptance tests. Site access, publisher responses, and downloaded translator versions can change independently. No personal Zotero library, cookies, or private notes are included in the source or release assets.

The supplied `translate/`, `utilities/`, `offscreen/` code and extraction helpers remain unchanged. This release changes image input, editor placeholders, local backup/recovery, panel sizing, early display and themes, not translator definitions or the compiler.

## Historical baseline

Upstream Zotero Connector commit: `48ad1fe09defb770f83a3268cf8ebe72ab9aba52`. Earlier 0.3.11 release verification included 131 Connector tests; this is historical evidence, not a claim that the old `npm test` suite was rerun for 0.3.35.
