# Changelog

All notable changes to `@puralex/image-audit` are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). While the version is below 1.0.0, a minor bump can contain breaking changes.

## [Unreleased]

## [0.3.1] — 2026-09-29

### Fixed

- The `image-audit` command is installed again. npm 11 dropped the `bin` entry written as `./bin/image-audit.js` during publish; the path is now `bin/image-audit.js` and the script is executable.

## [0.3.0] — 2026-09-29

Tagged on GitHub but never published to npm (the publish failed). Use 0.3.1, which contains all of these changes.


### Breaking

- Node.js 20 or newer is now required (was 18.3).
- `lint()` and the CLI now fail with an error when a required directory does not exist. Before, a missing `srcDir` or `assetsDir` found zero files and reported "All audits passed".
- An explicit `--config` / `config` path that does not exist is now an error. Before, it silently fell back to defaults.
- The CLI exits with code `2` on runtime errors (bad config, missing directory). Before, it used `1`, the same code as "issues found".
- An invalid `reporter` in the config file is now an error.
- The text reporter now writes all audit results to stdout. Before, issue lists went to stderr and "no issues" lines went to stdout.

### Added

- The CLI accepts several commands in one run, for example `image-audit broken unused`.
- The CLI checks the `--reporter` value and exits with code `2` on an unknown one.
- `findFiles()` skips `node_modules`, `.git`, `dist`, `build`, `.astro`, `.next`, `.nuxt`, `.svelte-kit` and `.cache` by default. Pass `ignoredDirs` to change the list.
- `lint()` returns the resolved `config`.
- Without `--verbose`, the CLI prints the number of scan warnings and how to see them.
- `compat` mismatch issues carry an `errorMessage` with the declared and detected formats.
- `package.json` `exports` now points TypeScript at `types/index.d.ts`.
- Biome for linting and formatting (`npm run lint`, `npm run format`). CI and the publish workflow run it.
- The publish workflow runs lint and tests before `npm publish`.
- `npm run test:coverage`.

### Changed

- `dupes` hashes only files that share a byte size with another file, so it reads far fewer files.
- `file-type` updated from 20 to 21.

### Fixed

- `broken` now reports references whose letter case differs from the file on disk (`hero.png` vs `Hero.png`). These pass on macOS and Windows but break on Linux.
- `assetsDir` written as `./src/assets/images`, `src/assets/images/`, or an absolute path no longer drops every reference.
- Alias targets with a `./` prefix now resolve from the project root, not from the source file.
- Query strings and hash fragments (`?url`, `#icon`) are stripped from references before the path check.
- A folder whose name only starts with the assets folder name (for example `src/assets/images_other`) no longer counts as inside the assets folder.
- A custom `imagePathPatterns` RegExp without the `g` flag, or one that can match an empty string, no longer hangs.
- Custom patterns without a second capture group now work.
- `compat` no longer flags animated PNGs (`png` vs `apng`) or CUR files (`ico` vs `cur`) as mismatches.
- `compat` no longer leaks a file handle when reading an SVG fails.
- The CLI now reads `reporter`, `noColor` and `verbose` from the config file, and honors the `NO_COLOR` env var.
- The `compat` text output now shows the specific reason for a mismatch.
- Large JSON output is no longer cut short when piped (the CLI sets `process.exitCode` instead of calling `process.exit()`).
- `lint({ audits: ['duplicates'] })` now works like `'dupes'`.
- An unhandled error in the CLI now prints the message instead of a stack trace from an unhandled promise rejection.

## [0.2.0] — 2026-03-20

### Added

- `inspectImage()` and `WEB_IMAGE_EXTS` are exported for programmatic use.
- Test suite using `node:test`, covering all audits and SVG edge cases. CI runs it.

### Changed

- CI and publish workflows run on Node.js 22 and 24.

### Fixed

- SVG detection works on files with processing instructions (`<?xml-stylesheet?>`), a comment before the DOCTYPE, a BOM, or a long preamble (up to 64 KB is read).
- `.svg` files that `file-type` detects as `application/xml` are no longer flagged as mismatches.

## [0.1.0] — 2026-03-19

First release.

### Added

- CLI `image-audit` with the audits `broken`, `unused`, `dupes`, `compat`, `overuse` and `all`.
- Text and JSON reporters.
- Programmatic API: `lint()`, `loadConfig()`, `scanReferences()`, `findFiles()`, `normalizePath()`, and one function per audit.
- Config from `image-audit.config.js` or `package.json#imageAudit`.
- Optional `sharp` peer dependency for image dimensions in `compat`.
- TypeScript types.
- README, CI workflow, and npm publish workflow.

[Unreleased]: https://github.com/magnifito/image-audit/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/magnifito/image-audit/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/magnifito/image-audit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/magnifito/image-audit/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/magnifito/image-audit/releases/tag/v0.1.0
