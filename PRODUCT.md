# Chitalka

## Product

Chitalka is a local-first web reader for opening and reading FB2 and EPUB books in the browser. Book files and private reading data remain on the user's device; the core reading experience does not require an account or an external service.

## Users and jobs

- Readers who want a quiet, focused reading experience on desktop and touch devices.
- Readers who need one- and two-page layouts, reading preferences, bookmarks, quotes, and optional synchronization.
- Readers who may opt in to private reading analytics while retaining transparent control over collection and deletion.

## Product commitments

- Privacy by default: analytics is opt-in and stored locally without an account or external analytics service.
- Reading first: navigation and page turning must remain responsive and must not be affected by analytics collection.
- Stable reading context: overlays, previews, settings, and controls must not unexpectedly shift the book.
- Explicit control: users can disable analytics and clear analytics data independently.
- Continuity across devices: when optional cloud synchronization is connected, private analytics is synchronized alongside the other reader state through the providers' private application folders.
- Accessible interaction: important actions support pointer, touch, and keyboard use with visible focus.
- International interface: Russian and English UI are supported.

## Current direction

- Replace the growing settings popup with a dedicated settings screen.
- Move existing reading preferences into that screen without removing current scenarios.
- Add an analytics section controlled by the setting «Вести персональную аналитику чтения».
- When enabled, analytics should distinguish active reading from loading, background time, and inactivity; retain history until the user explicitly clears it; and show calendar activity, aggregate trends, and chronological sessions labeled with their books.
- Derive reading speed in words and characters per minute from active sessions and use a robust recent-speed estimate to forecast completion of the currently open book.

## Evidence

- `README.md` describes the local-first reader and supported reading scenarios.
- The current reader interface is the source of truth for established interaction patterns.
