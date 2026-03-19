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
image-audit --src pages --assets public/images
```

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
};
```

Or in `package.json`:

```json
{
  "imageAudit": {
    "srcDir": "src",
    "assetsDir": "public/images"
  }
}
```

## Optional: sharp

Install [sharp](https://sharp.pixelplumbing.com/) for image dimension and aspect ratio detection in the `compat` audit:

```sh
npm install sharp
```

## License

MIT
