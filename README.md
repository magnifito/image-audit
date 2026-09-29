# @puralex/image-audit

Lint and audit image references in web projects — find broken links, unused images, duplicates, format mismatches, and overused assets.

## Install

```sh
npm install @puralex/image-audit
```

## CLI

```sh
npx image-audit <command> [options]
```

### Commands

| Command   | Description                                    |
| --------- | ---------------------------------------------- |
| `broken`  | Find broken image references in source files   |
| `unused`  | Find unused images in assets directory         |
| `dupes`   | Find duplicate images by content hash          |
| `compat`  | Verify file extensions match binary format     |
| `overuse` | Find images referenced in multiple source files|
| `all`     | Run all audits (default)                       |

### Options

```
-c, --config <path>   Config file path (default: image-audit.config.js)
-a, --assets <dir>    Assets directory (default: src/assets/images)
-s, --src <dir>       Source files root (default: src)
-r, --reporter <name> Output format: text | json (default: text)
    --no-color        Disable colored output
    --verbose         Verbose output
-h, --help            Show this help
-v, --version         Show version
```

### Examples

```sh
# Run all audits
image-audit

# Run specific audits
image-audit broken unused

# JSON output for CI
image-audit all --reporter json

# Custom paths
image-audit --src pages --assets src/images
```

If your images live somewhere other than `src/assets/images`, also set `pathAliases` in the config file (see [Configuration](#configuration)). The default aliases map `~/assets/images/` and `/assets/images/` to `src/assets/images/`. References that resolve outside the assets directory are skipped with a scan warning. The CLI prints the warning count; run with `--verbose` to see each one.

### Exit codes

| Code | Meaning                                                                   |
| ---- | ------------------------------------------------------------------------- |
| `0`  | All selected audits passed                                                |
| `1`  | At least one audit found issues                                           |
| `2`  | Usage or runtime error (bad flag, bad config, missing directory, crash)   |

### Errors

These stop the run with exit code `2`:

- `Config file not found: <path>` — the file given with `--config` does not exist.
- `Source directory not found: <path>` — `srcDir` does not exist (checked for `broken`, `unused`, `overuse`).
- `Assets directory not found: <path>` — `assetsDir` does not exist (checked for `unused`, `dupes`, `compat`).
- `Invalid reporter: "<name>"` — the reporter is not `text` or `json`.

## Programmatic API

```js
import { lint } from '@puralex/image-audit';

const { ok, results, warnings } = await lint({
  projectRoot: './my-project',
  audits: ['broken', 'unused'],
});

if (!ok) {
  console.error('Image audit failed:', results);
  process.exitCode = 1;
}
```

`lint()` also returns the resolved `config`. It rejects with an `Error` for the cases listed under [Errors](#errors).

### Individual audits

```js
import { loadConfig, scanReferences, auditBroken, auditUnused } from '@puralex/image-audit';

const config = await loadConfig({ projectRoot: '.' });
const scan = scanReferences(config);

const broken = auditBroken(config, scan);
const unused = auditUnused(config, scan);
```

### Available exports

| Function           | Needs scan | Async | Description                          |
| ------------------ | ---------- | ----- | ------------------------------------ |
| `lint(options?)`   | -          | yes   | Run selected audits, returns results |
| `auditBroken`      | yes        | no    | Broken image references              |
| `auditUnused`      | yes        | no    | Unreferenced image files             |
| `auditDuplicates`  | no         | no    | Duplicate images by content hash     |
| `auditCompat`      | no         | yes   | Extension vs binary format mismatch  |
| `auditOveruse`     | yes        | no    | Images referenced too many times     |
| `loadConfig`       | -          | yes   | Load and merge config                |
| `scanReferences`   | -          | no    | Scan source files for image refs     |
| `findFiles`        | -          | no    | Find files by extension              |
| `normalizePath`    | -          | no    | Resolve image path aliases           |

## Configuration

Create `image-audit.config.js` in your project root:

```js
export default {
  srcDir: 'src',
  assetsDir: 'src/assets/images',
  sourceExtensions: ['.astro', '.mdx'],
  imageExtensions: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif'],
  imagePathPatterns: [/(['"`])((~\/assets\/images\/|\/assets\/images\/)[^'"`]+)\1/g],
  pathAliases: {
    '~/assets/images/': 'src/assets/images/',
    '/assets/images/': 'src/assets/images/',
  },
  overuseThreshold: 1,
  reporter: 'text', // 'text' | 'json'; --reporter overrides it
  noColor: false, // also set by --no-color or a non-empty NO_COLOR env var
  verbose: false,
};
```

Priority: defaults < config file < CLI flags.

Or in `package.json`:

```json
{
  "imageAudit": {
    "srcDir": "src",
    "assetsDir": "public/images",
    "pathAliases": {
      "/images/": "public/images/"
    },
    "imagePathPatterns": ["(['\"`])(/images/[^'\"`]+)\\1"]
  }
}
```

## Optional: sharp

Install [sharp](https://sharp.pixelplumbing.com/) for image dimension and aspect ratio detection in the `compat` audit:

```sh
npm install sharp
```

## Development

```sh
npm test          # generate fixtures and run the test suite
npm run lint      # Biome: lint + format check (same as CI)
npm run format    # Biome: apply formatting and safe fixes
```

## License

MIT
