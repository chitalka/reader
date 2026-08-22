# Changelog

All notable public changes to Chitalka are documented in this file.

## [2.02.02] - 2026-08-22

### Changed

- EPUB pagination no longer blocks the reading footer: the current pages and reading percentage appear immediately, while the exact total and completion forecast continue calculating in the background.
- Background pagination now processes one chapter at a time to reduce layout stalls in Safari.
- Chapters already measured during reading are skipped by the background pagination queue.

### Fixed

- Fixed the footer remaining stuck in the page-counting state on large EPUB books.
- Fixed full-screen page and percentage indicators disappearing while exact pagination was still in progress.

## [2.02.01] - 2026-08-21

### Fixed

- Fixed EPUB page numbers remaining frozen while the book continued to turn in macOS and iOS Safari.
- Fixed page counts being recalculated during ordinary page turns and header/footer visibility changes. Measured EPUB sections now reuse cached pagination until the book geometry changes.

## [2.02] - 2026-08-21

### Added

- Added non-destructive page and spread previews to the reading progress bar, with chapter hierarchy, pointer dragging, keyboard confirmation, and cancellation.
- Added opt-in personal reading analytics with active-time tracking, session history, an activity calendar, reading speed in words and characters, and a completion forecast for the open book.
- Added analytics synchronization through the connected private Google Drive and Yandex Disk application folders without uploading book files.
- Added a dedicated settings screen with General, Analytics, Synchronization, and About sections.
- Added a full-screen status preference that can keep the current page, reading percentage, or nothing visible while the reading controls are hidden.

### Changed

- The header and footer now hide and return together without shifting the book; page numbers remain centered under one- and two-page layouts and move with the pages during navigation.
- The mobile remaining-time label now uses a compact formulation while preserving the complete estimate.
- Reading preferences and analytics controls use more generous spacing on desktop and mobile.
- EPUB pagination measures background chapters in small batches to finish exact page counts substantially faster in Safari.

### Fixed

- Fixed EPUB books remaining indefinitely in the page-counting state in macOS and iOS Safari.
- Fixed EPUB illustrations and captions splitting across pages; images now scale to fit the available page width and height while preserving proportions.
- Fixed hidden footer controls remaining interactive and ensured full-screen page indicators stay synchronized during buttons, keyboard navigation, rapid turns, and touch swipes.

## [2.01] - 2026-08-19

### Added

- Added a Spectrum-inspired component system with a restrained purple accent for reader controls, popovers, hover states, and keyboard focus.
- Added a book completion percentage alongside the page number and remaining reading time.
- Added public project information, author contact, license, and release version to reading settings.
- Added this public changelog and release tagging for both the reader and deployed demo repositories.

### Changed

- Redesigned the table of contents, bookmarks, quotes, reading settings, and quote editor as consistent desktop popovers that do not shift the book.
- Unified interface typography, control dimensions, borders, spacing, icons, and interaction states while preserving serif typography for book content.
- Moved the interface language selector into reading settings.
- Simplified quote creation by removing the duplicate preview of selected text and clarifying that notes are optional.
- Kept floating header controls visible and interactive after page turns.
- Restored page numbers to the bottom center and kept one- and two-page layouts centered.

### Fixed

- Fixed header controls losing hover and click behavior after page navigation.
- Fixed popovers overlapping or moving the reader viewport.
- Fixed regressions where the two-page layout could disappear after centering changes.
- Improved quote popover positioning using its measured height.

## [2] - 2026-08-18

- First public release of the local-first FB2 and EPUB reader.
- Included adaptive pagination, one- and two-page layouts, themes, reading-time estimates, bookmarks, highlighted quotes with optional notes, footnotes, and persistent reading positions.
- Included optional synchronization through private application folders in Google Drive and Yandex Disk.
- Published the installable PWA demo at <https://chitalka.github.io/demo/>.

[2.02.02]: https://github.com/chitalka/reader/releases/tag/v2.02.02
[2.02.01]: https://github.com/chitalka/reader/releases/tag/v2.02.01
[2.02]: https://github.com/chitalka/reader/releases/tag/v2.02
[2.01]: https://github.com/chitalka/reader/releases/tag/v2.01
