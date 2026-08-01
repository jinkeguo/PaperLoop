<p align="right">
  <a href="./README.md"><img alt="English" src="https://img.shields.io/badge/README-English-1f6feb"></a>
  <a href="./README.zh-CN.md"><img alt="简体中文" src="https://img.shields.io/badge/README-简体中文-2da44e"></a>
</p>

# PaperLoop

**Keep reading. Capture the thought. Save the paper and the note to Zotero.**

PaperLoop is a research-reading extension **built by modifying Zotero Connector**. It retains Zotero Connector's page detection, translator, metadata, and attachment pipeline, while adding a persistent reading panel, local thought drafts, automatic article-page opening, and a coordinated save-to-Zotero workflow. The result is a continuous path from reading and drafting to a structured Zotero item and an editable child note.

> PaperLoop is an independent modified distribution. It is not an official Zotero product and is not endorsed by Zotero.

![PaperLoop beside a detected research paper](docs/assets/paperloop-interface.png)

## What PaperLoop adds

### Write while the paper stays visible

The PaperLoop panel stays beside the article while the page remains scrollable. You can record questions, interpretations, and writing ideas continuously instead of opening a modal window or switching to another application.

### Reduce capture to one coordinated action

Select the Zotero library and collection, write the thought, and save once. PaperLoop coordinates bibliographic capture, available attachments, collection placement, and thought notes, simplifying the Zotero Connector save workflow and folding thought synchronization into the same action.

### Protect unfinished thoughts in the browser

Unsynchronized text is stored locally by paper identity. Closing and reopening the page restores the draft. After synchronization, Zotero is the authoritative copy; DOI-based recovery can reconnect the browser to the Zotero item and PaperLoop note if browser-side association data is lost.

### Open automatically on recognized paper pages

When automatic opening is enabled, PaperLoop expands after Zotero's translator system recognizes a research-paper page. Navigating the same tab to another paper refreshes the panel, while separate tabs keep separate drafts. Automatic opening can be disabled, and the panel can be minimized or closed at any time.

## What comes from Zotero Connector

PaperLoop does not replace Zotero Connector's extraction engine and does not visually guess incomplete metadata.

| Component | Responsibility |
|---|---|
| **Zotero Connector foundation** | Detects supported publication pages through Zotero translators; extracts bibliographic metadata; discovers and saves supported attachments. |
| **PaperLoop browser workflow** | Provides the persistent reading panel, per-paper browser drafts, automatic opening, Zotero destination selection, one-click orchestration, and visible success or partial-failure feedback. |
| **PaperLoop DOI Bridge for Zotero 7** | Queries existing Zotero items by DOI, reuses items inside the selected library, assigns collections, updates one PaperLoop child note, restores associations, and supports verified PDF backfill. |

The browser extension is based on [zotero/zotero-connectors](https://github.com/zotero/zotero-connectors). Zotero desktop integration builds on the APIs and data model provided by [zotero/zotero](https://github.com/zotero/zotero).

## Reading-to-Zotero workflow

1. Open a paper page supported by a Zotero translator.
2. PaperLoop recognizes the page and opens the reading panel when automatic opening is enabled.
3. Write or revise the thought while continuing to read and scroll.
4. Choose the target Zotero library and collection.
5. Click once to save or reuse the paper and synchronize the thought as a Zotero child note.
6. Return later, continue writing, and synchronize the same note again.

Repeated clicks and network retries are idempotent. Within one Zotero library, an existing DOI is reused and the same item may be placed in several collections. Different Zotero libraries use independent items because an item key cannot span libraries.

## Current release

| Component | Version | Verified environment |
|---|---:|---|
| PaperLoop browser extension | `0.3.10` | Microsoft Edge / Chromium, Manifest V3 |
| PaperLoop DOI Bridge | `0.1.19` | Zotero 7.0.x |

Download both matching files from the [latest release](https://github.com/jinkeguo/PaperLoop/releases/latest), then follow [Installation and acceptance](docs/INSTALLATION.md).

## Reliability boundaries

- A supported Zotero translator is required; PaperLoop does not create a guessed item when the page is not recognized.
- PDF availability still depends on publisher login, institutional access, website rules, and the current browser session.
- Existing items without a PDF can be checked again; HTML login pages are rejected instead of being stored as PDFs.
- Zotero stores synchronized items, attachments, and notes. Browser storage protects drafts and recovery state, but is not a replacement for Zotero synchronization or backups.
- An agent or language-model API is not required for recognition, saving, deduplication, or note synchronization.
- This is an experimental release and currently uses developer-mode browser installation.

## Documentation

- [Installation and acceptance](docs/INSTALLATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Privacy and security boundaries](docs/PRIVACY.md)
- [Build and test](docs/BUILD_AND_TEST.md)
- [Contributing](CONTRIBUTING.md)

## License and attribution

PaperLoop is based on Zotero Connector upstream commit `48ad1fe09defb770f83a3268cf8ebe72ab9aba52` and is distributed under the GNU Affero General Public License v3. See [COPYING](COPYING) and [NOTICE.md](NOTICE.md).
