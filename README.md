# Chitalka

Chitalka is a fast, local-first browser reader for FB2 and EPUB books. Files selected by the reader are processed entirely in the browser and are never uploaded to a server.

[English Telegram channel](https://t.me/chitalka_reader)

[Open the live demo](https://chitalka.github.io/demo/)

## Features

- Opens FB2, FB2.ZIP, and reflowable EPUB 2/3 files without DRM.
- Reads UTF-8, UTF-16, and common single-byte FB2 encodings, including Windows-1251.
- Preserves EPUB chapters, images, internal links, and footnotes while keeping book content isolated from the application.
- Extracts hierarchical tables of contents from FB2 sections, EPUB 3 navigation documents, and EPUB 2 NCX files, with heading-based EPUB fallback navigation.
- Uses an adaptive one- or two-page layout with virtualized chapters for fast loading and resizing.
- Supports page buttons, keyboard navigation, touch swipes, and accelerated page turns from repeated input.
- Previews pages and spreads from the progress bar without moving the active reading position until the preview is confirmed.
- Keeps compact floating controls visible and interactive without shifting the book layout.
- Offers adjustable font size, light and dark themes, one- or two-page modes, footnote modes, configurable page buttons, and a choice of the status that remains visible in full-screen reading.
- Saves books, settings, reading positions, bookmarks, and highlighted quotes locally in IndexedDB. Books are identified by the SHA-256 hash of their original bytes, so renaming a file does not lose its state.
- Supports optional, local-first synchronization through the private application folders in Google Drive and Yandex Disk. Both providers can be connected at the same time.
- Offers optional personal reading analytics with active-time sessions, reading speed, an activity calendar, and completion forecasts; analytics remains local unless private-folder synchronization is connected.
- Adds bookmarks at the current reading position and persistent highlighted quotes in six colors, with an optional note for either type.
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
The floating header remains available after page turns. Page buttons can be shown, hidden, or left in **Auto** mode, which hides them on smaller touch-oriented layouts.

## Format support and safety

FB2 files can be opened directly or from a ZIP archive. EPUB support is intended for reflowable EPUB 2 and EPUB 3 books. Fixed-layout EPUB, DRM, and encrypted book content are rejected with an explanatory error.

EPUB scripts and author styles are not executed. External resources are not loaded, archive paths are normalized, and internal links are resolved only within the opened book. User-selected files remain local; only the bundled demo book is fetched from the deployed application.

## Browser requirements

Use a recent version of Chrome, Firefox, Safari, or another browser with ES2022, Web Animations, `DOMParser`, `TextDecoder`, Web Crypto, IndexedDB, and `localStorage` support. Both desktop and touch layouts are supported.

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

## Optional cloud synchronization

Synchronization has no Chitalka server. The reader requests the smallest available application-folder permission, stores immutable JSON snapshots in the user's Google Drive or Yandex Disk, and merges them locally. Settings are merged field by field; positions, bookmarks, quotes, edits, and deletions use deterministic logical revisions so offline devices converge without relying on their wall clocks.

Cloud authorization is optional. Access tokens are kept only in memory and are never written to IndexedDB or `localStorage`, so a provider must be reconnected after a reload or token expiry. Snapshot contents are not encrypted: the cloud provider can read book metadata, positions, notes, and quote text.

Copy the example configuration before running or building the app:

```bash
cp .env.example .env.local
```

Set one or both public application IDs in `.env.local`. Never add an OAuth client secret: this static browser application uses the Google token model and Yandex authorization code flow with PKCE.

The repository's `.env.production` contains only the public client IDs used by the deployed demo. Its Yandex application is registered exclusively for the production callback, so local Yandex authorization requires a separate development application and a local override in `.env.local`.

### Google Drive

1. Create a **Web application** OAuth client, enable the Google Drive API, and configure the consent screen.
2. Add the site origin to **Authorized JavaScript origins**. For the default development server use `http://localhost:5173`; for the demo use `https://chitalka.github.io`.
3. Put the client ID in `VITE_GOOGLE_CLIENT_ID`.

Chitalka requests only `https://www.googleapis.com/auth/drive.appdata`, a non-sensitive scope for data hidden in the app's private Drive folder. See Google's official guides for [browser OAuth setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), the [token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), and the [application data folder](https://developers.google.com/workspace/drive/api/guides/appdata).

### Yandex Disk

1. Create a Yandex OAuth application for user authorization and grant it only the application-folder Disk permission (`cloud_api:disk.app_folder`). Use separate OAuth applications for development and production.
2. Configure the matching **Redirect URI** exactly:
   - development: `http://localhost:5173/oauth/yandex-callback.html`
   - demo: `https://chitalka.github.io/demo/oauth/yandex-callback.html`
3. Put the application ID in `VITE_YANDEX_CLIENT_ID`.

The callback exchanges the authorization code with PKCE, without a client secret. See the official Yandex guides for [registering an application](https://yandex.com/dev/id/doc/en/register-auth), [authorization code and PKCE](https://yandex.com/dev/id/doc/en/codes/code-url), and the [Disk REST API](https://yandex.com/dev/disk/rest/).

## Project structure

```text
src/
├── book/            Shared book model and DOM chunking
├── epub/            EPUB archive parsing and safe DOM rendering
├── fb2/             FB2 loading, decoding, parsing, and rendering
├── reader/          Pagination, IndexedDB state, bookmarks, and quotes
├── sync/            Provider-neutral sync engine and cloud adapters
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

## Releases and license

Release history is documented in [CHANGELOG.md](./CHANGELOG.md). Chitalka is maintained by [Oleg Mokhov](https://t.me/olegmokhov) and distributed under the [MIT License](./LICENSE).

Each public release also includes illustrated Release Notes in [the Russian Telegram channel](https://t.me/chitalka_reader_ru) and [the English Telegram channel](https://t.me/chitalka_reader). Release images and captions are stored under `release-assets/<version>/`.

Telegram publication uses `scripts/publish-telegram-release.mjs`. Copy `.env.release.example` to the ignored `.env.release.local`, add a newly issued bot token, and run a dry check before publishing:

```bash
node scripts/publish-telegram-release.mjs \
  --channel @chitalka_reader_ru \
  --caption release-assets/2.01/telegram-ru.txt \
  --image release-assets/2.01/chitalka-2.01.png \
  --dry-run
```
