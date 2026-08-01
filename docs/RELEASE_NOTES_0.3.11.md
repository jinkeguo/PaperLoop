# PaperLoop 0.3.11 / Bridge 0.1.19

Release date: 2026-08-01

## Release assets

- `PaperLoop-Browser-Extension-0.3.11.zip`
- `PaperLoop-DOI-Bridge-0.1.19.xpi`
- `PaperLoop-0.3.11-friend-test.zip`

## What changed

- Added an `EN` / `中` control to the reading-panel title bar.
- Switching languages updates the complete interface immediately, including detection, Zotero destination, thought, save, recovery, PDF, and error messages.
- The selected language survives page changes, browser restarts, and in-place extension upgrades.
- Language switching does not alter the active paper, thought draft, Zotero destination, panel position, or save state.
- Closing the panel now flushes the last confirmed browser draft immediately.

## Verification

- Complete Zotero Connector regression suite: 131/131 passed.
- Dedicated PaperLoop sidebar suite: 10/10 passed, including a real click on the language button and state-preservation assertions.
- The formal Manifest V3 package is built without debug fixtures.

## Known limits

- The browser extension is still installed in developer mode and has no automatic update channel.
- Metadata and attachment capture require a supported Zotero translator.
- PDF access remains subject to publisher login, institutional access, and site controls.
- PaperLoop does not create guessed, incomplete items on unrecognized pages.
