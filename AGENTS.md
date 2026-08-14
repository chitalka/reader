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
- Do not consider the release complete until both pushes and the live verification succeed.
