# Chitalka

Chitalka is a fast, local-first browser reader for FB2 and EPUB books. Files selected by the reader are processed entirely in the browser and are never uploaded to a server.

[Open the live demo](https://chitalka.github.io/demo/)

## Features

- Opens FB2, FB2.ZIP, and reflowable EPUB 2/3 files without DRM.
- Reads UTF-8, UTF-16, and common single-byte FB2 encodings, including Windows-1251.
- Preserves EPUB chapters, images, internal links, and footnotes while keeping book content isolated from the application.
- Extracts hierarchical tables of contents from FB2 sections, EPUB 3 navigation documents, and EPUB 2 NCX files, with heading-based EPUB fallback navigation.
- Uses an adaptive one- or two-page layout with virtualized chapters for fast loading and resizing.
- Supports page buttons, keyboard navigation, touch swipes, and accelerated page turns from repeated input.
- Automatically hides the header while reading. Move the mouse to reveal it, or tap the reading area to toggle it on touch devices.
- Offers adjustable font size, light and dark themes, one- or two-page modes, footnote modes, and configurable page buttons.
- Saves settings globally and stores each reading position in `localStorage`, keyed by the selected file name and anchored to visible book content.
- Displays embedded covers and illustrations and estimates the remaining reading time.

The bundled edition of *Anna Karenina* opens automatically as the demo book. Use **Open book** or drag and drop another supported file anywhere onto the reader.

## Controls

| Input | Action |
| --- | --- |
| `Arrow Left` / `Page Up` | Previous page |
| `Arrow Right` / `Page Down` | Next page |
| `Home` / `End` | First / last page |
| `+` / `-` | Increase / decrease font size |
| Swipe left / right | Next / previous page |
| Tap the reading area | Show or hide the header |
| Move the mouse | Show the header and restart its inactivity timer |

The header hides after a page turn or five seconds without interaction. Opening the settings panel keeps it visible. Page buttons can be shown, hidden, or left in **Auto** mode, which hides them on smaller touch-oriented layouts.

## Format support and safety

FB2 files can be opened directly or from a ZIP archive. EPUB support is intended for reflowable EPUB 2 and EPUB 3 books. Fixed-layout EPUB, DRM, and encrypted book content are rejected with an explanatory error.

EPUB scripts and author styles are not executed. External resources are not loaded, archive paths are normalized, and internal links are resolved only within the opened book. User-selected files remain local; only the bundled demo book is fetched from the deployed application.

## Browser requirements

Use a recent version of Chrome, Firefox, Safari, or another browser with ES2022, Web Animations, `DOMParser`, `TextDecoder`, and `localStorage` support. Both desktop and touch layouts are supported.

## Local development

Node.js 22.22.2 or newer is required.

```bash
npm install
npm run dev
```

Vite prints the local development URL. The demo book loads automatically.

Run the automated tests and create a production build with:

```bash
npm test
npm run build
```

Preview the generated `dist/` directory locally with:

```bash
npm run preview
```

Continuous integration runs the test suite and production build on GitHub Actions.

## Project structure

```text
src/
├── book/            Shared book model and DOM chunking
├── epub/            EPUB archive parsing and safe DOM rendering
├── fb2/             FB2 loading, decoding, parsing, and rendering
├── reader/          Pagination and safe local persistence
├── app.ts           Application workflows and UI coordination
├── settings.ts      Reader settings and defaults
├── main.ts          Application entry point
└── style.css        Responsive UI and book typography

books/
├── Anna-Karenina.fb2      Bundled demo book
├── Anna-Karenina.fb2.zip  ZIP fixture for FB2 archive support
└── Anna-Karenina.epub     EPUB fixture for compatibility testing
```

The project uses TypeScript without a UI framework, [Vite](https://vite.dev/) for development and production builds, [fflate](https://github.com/101arrowz/fflate) for in-browser archive extraction, and [Vitest](https://vitest.dev/) with jsdom for tests.
