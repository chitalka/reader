# Repository workflow

## Development tasks

- Ask clarifying questions before starting a requested change.
- Once the requirements are clear, save the task locally as `TODO/CH-<id>-YYYY-MM-DD.md`, using the next sequential ID.
- Keep `TODO/` local and ignored by Git. Start implementation only after the task file has been created.

## Releases

- Treat a release request as one coordinated operation for both repositories.
- Run the reader tests and production build before publishing.
- Commit and push the reader repository first.
- Build the demo from that exact committed reader revision.
- Replace the contents of `chitalka/demo` with the generated `dist/` output, preserving the demo repository's `.git` directory.
- Commit and push the demo repository to its `gh-pages` branch.
- Verify the live GitHub Pages URL loads the generated HTML, JavaScript, and CSS from the `/demo/` path.
- Create a public GitHub Release from the matching `CHANGELOG.md` section and tag the release in both repositories.
- Generate a new release image featuring the Chitalka mascot and visual details based on the actual release changelog. Store it under `release-assets/<version>/` and attach the same image to both Telegram posts.
- Publish concise Release Notes in Russian to `@chitalka_reader_ru` and in English to `@chitalka_reader` after the GitHub Release and live demo are ready.
- Read `TELEGRAM_BOT_TOKEN` only from `.env.release.local` or a protected CI secret. Never print, commit, or place the token in a command argument, changelog, release note, or task file.
- Verify both Telegram posts and record their public links.
- Do not consider the release complete until both repository pushes, both tags, the GitHub Release, live verification, and both Telegram posts succeed.
