# TODO

Low-priority findings from the September 2026 code audit.

- [ ] **AVIF check accepts HEIC.** `src/utils/inspect-image.js` treats any `ftyp` box with `mif1` as AVIF. HEIC files also list `mif1`. Check the major brand (`avif`/`avis`) first, and use `mif1` only with an AVIF-specific compatible brand.
- [ ] **`overuse` counts occurrences, not files.** `src/audits/overuse.js` counts every match, so an image used twice in the same file is flagged with the default threshold of `1`. The help text says "multiple source files". Count distinct `sourceFile` values, or change the docs.
- [ ] **Symlinked images are skipped.** `src/utils/find-files.js` keeps only `entry.isFile()`, which is false for symlinks. `broken` follows symlinks, so the audits disagree. Resolve symlinks with `fs.statSync` (and guard against loops).
- [ ] **Line numbers are O(n²).** `src/utils/scan-references.js` splits the whole prefix for every match. Precompute line-start offsets once per file and binary-search them.
- [ ] **JSON output has no warnings.** `src/reporters/json.js` does not include scan warnings. Add a `warnings` array to the JSON document.
- [ ] **`broken` text output prints the source file twice.** `src/reporters/text.js` prints the file as a heading, then again as `file:line`. Print only `:line` under the heading, or drop the heading.
- [ ] **Default alias `/assets/images/` points to `src/`.** In Astro, a root-absolute `/assets/images/` URL usually means `public/assets/images/`. Reconsider the default in `src/config.js`, or document the assumption.
- [ ] **EXIF rotation is ignored.** `src/audits/compat.js` reads width and height from sharp before rotation. For EXIF orientations 5–8, swap width and height (or use sharp's `autoOrient` metadata).

## Needs owner action

- [ ] **npm trusted publishing.** `.github/workflows/publish.yml` still uses the `NPM_TOKEN` secret. The job already has `id-token: write`. Configure a trusted publisher for `@puralex/image-audit` on npmjs.com, then remove `NODE_AUTH_TOKEN` and the secret.
