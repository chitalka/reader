# Changelog

All notable public changes to Chitalka are documented in this file.

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

[2.01]: https://github.com/chitalka/reader/releases/tag/v2.01
