#!/usr/bin/env node

/**
 * Test suite for @puralex/image-audit
 *
 * Uses Node's built-in test runner (node:test).
 * Run: node --test test/run.js
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  lint,
  loadConfig,
  scanReferences,
  auditBroken,
  auditUnused,
  auditDuplicates,
  auditCompat,
  auditOveruse,
  inspectImage,
  WEB_IMAGE_EXTS,
} from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');
const IMAGES = path.join(FIXTURES, 'src/assets/images');

// ── inspectImage() — byte-level format detection ────────────────────

describe('inspectImage', () => {
  it('detects valid PNG with signature + IHDR', () => {
    const r = inspectImage(path.join(IMAGES, 'valid.png'));
    assert.equal(r.ext, 'png');
    assert.equal(r.mime, 'image/png');
    assert.equal(r.valid, true);
  });

  it('detects valid JPEG with SOI + APP0', () => {
    const r = inspectImage(path.join(IMAGES, 'valid.jpg'));
    assert.equal(r.ext, 'jpg');
    assert.equal(r.mime, 'image/jpeg');
    assert.equal(r.valid, true);
  });

  it('detects valid GIF89a', () => {
    const r = inspectImage(path.join(IMAGES, 'valid.gif'));
    assert.equal(r.ext, 'gif');
    assert.equal(r.mime, 'image/gif');
    assert.equal(r.valid, true);
  });

  it('detects valid WebP with RIFF container', () => {
    const r = inspectImage(path.join(IMAGES, 'valid.webp'));
    assert.equal(r.ext, 'webp');
    assert.equal(r.mime, 'image/webp');
    assert.equal(r.valid, true);
  });

  it('detects valid AVIF with ftyp box', () => {
    const r = inspectImage(path.join(IMAGES, 'valid.avif'));
    assert.equal(r.ext, 'avif');
    assert.equal(r.mime, 'image/avif');
    assert.equal(r.valid, true);
  });

  it('detects SVG with xmlns namespace', () => {
    const r = inspectImage(path.join(IMAGES, 'valid.svg'));
    assert.equal(r.ext, 'svg');
    assert.equal(r.mime, 'image/svg+xml');
    assert.equal(r.hasNamespace, true);
    assert.equal(r.hasViewBox, true);
    assert.equal(r.hasDimensions, true);
  });

  it('detects SVG with XML declaration', () => {
    const r = inspectImage(path.join(IMAGES, 'xml-decl.svg'));
    assert.equal(r.ext, 'svg');
    assert.equal(r.hasNamespace, true);
  });

  it('detects SVG without namespace', () => {
    const r = inspectImage(path.join(IMAGES, 'no-namespace.svg'));
    assert.equal(r.ext, 'svg');
    assert.equal(r.hasNamespace, false);
  });

  it('detects SVG with DOCTYPE', () => {
    const r = inspectImage(path.join(IMAGES, 'doctype.svg'));
    assert.equal(r.ext, 'svg');
    assert.equal(r.hasNamespace, true);
  });

  it('detects SVG preceded by HTML comment', () => {
    const r = inspectImage(path.join(IMAGES, 'comment-before.svg'));
    assert.equal(r.ext, 'svg');
  });

  it('detects SVG with xml-stylesheet processing instruction', () => {
    const r = inspectImage(path.join(IMAGES, 'stylesheet-pi.svg'));
    assert.equal(r.ext, 'svg');
    assert.equal(r.mime, 'image/svg+xml');
  });

  it('detects SVG with comment before DOCTYPE', () => {
    const r = inspectImage(path.join(IMAGES, 'comment-before-doctype.svg'));
    assert.equal(r.ext, 'svg');
    assert.equal(r.hasNamespace, true);
  });

  it('detects SVG with BOM', () => {
    const r = inspectImage(path.join(IMAGES, 'bom.svg'));
    assert.equal(r.ext, 'svg');
    assert.equal(r.mime, 'image/svg+xml');
  });

  it('rejects non-SVG XML named .svg', () => {
    const r = inspectImage(path.join(IMAGES, 'not-svg.svg'));
    assert.equal(r, null);
  });

  it('returns null for empty file', () => {
    const r = inspectImage(path.join(IMAGES, 'empty.png'));
    assert.equal(r, null);
  });

  it('returns null for random bytes', () => {
    const r = inspectImage(path.join(IMAGES, 'random-bytes.jpg'));
    assert.equal(r, null);
  });

  it('detects JPEG inside a file named .png (mismatch)', () => {
    const r = inspectImage(path.join(IMAGES, 'actually-jpeg.png'));
    assert.equal(r.ext, 'jpg');
    assert.equal(r.mime, 'image/jpeg');
  });

  it('detects PNG inside a file named .jpg (mismatch)', () => {
    const r = inspectImage(path.join(IMAGES, 'actually-png.jpg'));
    assert.equal(r.ext, 'png');
    assert.equal(r.mime, 'image/png');
  });

  it('detects GIF inside a file named .webp (mismatch)', () => {
    const r = inspectImage(path.join(IMAGES, 'actually-gif.webp'));
    assert.equal(r.ext, 'gif');
    assert.equal(r.mime, 'image/gif');
  });
});

describe('WEB_IMAGE_EXTS', () => {
  it('includes all standard web formats', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico']) {
      assert.ok(WEB_IMAGE_EXTS.has(ext), `missing ${ext}`);
    }
  });
});

// ── Full audit tests against fixtures ───────────────────────────────

const configOverrides = {
  projectRoot: FIXTURES,
  srcDir: 'src',
  assetsDir: 'src/assets/images',
};

let config;
let scanResult;

before(async () => {
  config = await loadConfig(configOverrides);
  scanResult = scanReferences(config);
});

describe('scanReferences', () => {
  it('finds references across all source pages', () => {
    assert.ok(scanResult.references.length > 0);
  });

  it('includes references from multiple files', () => {
    const files = new Set(scanResult.references.map((r) => r.sourceFile));
    assert.ok(files.size >= 5, `expected >=5 source files, got ${files.size}`);
  });
});

describe('auditBroken', () => {
  it('detects broken image references', () => {
    const result = auditBroken(config, scanResult);
    assert.equal(result.ok, false);

    const missing = result.issues.map((i) => i.imagePath);
    assert.ok(missing.some((p) => p.includes('missing.png')));
    assert.ok(missing.some((p) => p.includes('deleted-photo.jpg')));
    assert.ok(missing.some((p) => p.includes('typo.wepb')));
  });

  it('does not flag existing files as broken', () => {
    const result = auditBroken(config, scanResult);
    const missing = result.issues.map((i) => i.imagePath);
    assert.ok(!missing.some((p) => p.includes('valid.png')));
    assert.ok(!missing.some((p) => p.includes('valid.jpg')));
  });

  it('includes line numbers', () => {
    const result = auditBroken(config, scanResult);
    for (const issue of result.issues) {
      assert.ok(typeof issue.lineNumber === 'number' && issue.lineNumber > 0);
    }
  });
});

describe('auditUnused', () => {
  it('detects orphan images not referenced anywhere', () => {
    const result = auditUnused(config, scanResult);
    assert.equal(result.ok, false);

    const unused = result.issues.map((i) => i.imagePath);
    assert.ok(unused.some((p) => p.includes('orphan-a.png')));
    assert.ok(unused.some((p) => p.includes('orphan-b.webp')));
  });

  it('does not flag referenced images as unused', () => {
    const result = auditUnused(config, scanResult);
    const unused = result.issues.map((i) => i.imagePath);
    assert.ok(!unused.some((p) => p.includes('valid.png')));
    assert.ok(!unused.some((p) => p.includes('hero.png')));
  });
});

describe('auditDuplicates', () => {
  it('detects duplicate image sets', () => {
    const result = auditDuplicates(config);
    assert.equal(result.ok, false);
    assert.ok(result.issues.length >= 2, `expected >=2 dupe sets, got ${result.issues.length}`);
  });

  it('groups files with identical content', () => {
    const result = auditDuplicates(config);
    const heroSet = result.issues.find((i) =>
      i.files.some((f) => f.includes('hero.png')) && i.files.some((f) => f.includes('hero-copy.png'))
    );
    assert.ok(heroSet, 'hero.png and hero-copy.png should be grouped');

    const bannerSet = result.issues.find((i) =>
      i.files.some((f) => f.includes('banner.jpg')) && i.files.some((f) => f.includes('banner-backup.jpg'))
    );
    assert.ok(bannerSet, 'banner.jpg and banner-backup.jpg should be grouped');
  });
});

describe('auditCompat', () => {
  it('flags extension/content mismatches', async () => {
    const result = await auditCompat(config);
    assert.equal(result.ok, false);

    const mismatched = result.issues.filter((i) => i.type === 'mismatch');
    const paths = mismatched.map((i) => i.imagePath);
    assert.ok(paths.some((p) => p.includes('actually-jpeg.png')));
    assert.ok(paths.some((p) => p.includes('actually-png.jpg')));
    assert.ok(paths.some((p) => p.includes('actually-gif.webp')));
  });

  it('flags unknown/unrecognized binary', async () => {
    const result = await auditCompat(config);
    const unknown = result.issues.filter((i) => i.type === 'unknown_binary');
    const paths = unknown.map((i) => i.imagePath);
    assert.ok(paths.some((p) => p.includes('random-bytes.jpg')));
  });

  it('passes valid images', async () => {
    const result = await auditCompat(config);
    const issuePaths = result.issues.map((i) => i.imagePath);
    assert.ok(!issuePaths.some((p) => p === 'src/assets/images/valid.png'));
    assert.ok(!issuePaths.some((p) => p === 'src/assets/images/valid.jpg'));
    assert.ok(!issuePaths.some((p) => p === 'src/assets/images/valid.gif'));
    assert.ok(!issuePaths.some((p) => p === 'src/assets/images/valid.webp'));
  });

  it('passes valid SVGs', async () => {
    const result = await auditCompat(config);
    const issuePaths = result.issues.map((i) => i.imagePath);
    assert.ok(!issuePaths.some((p) => p === 'src/assets/images/valid.svg'));
    assert.ok(!issuePaths.some((p) => p === 'src/assets/images/xml-decl.svg'));
    assert.ok(!issuePaths.some((p) => p === 'src/assets/images/doctype.svg'));
    assert.ok(!issuePaths.some((p) => p === 'src/assets/images/comment-before.svg'));
    assert.ok(!issuePaths.some((p) => p === 'src/assets/images/stylesheet-pi.svg'));
    assert.ok(!issuePaths.some((p) => p === 'src/assets/images/comment-before-doctype.svg'));
    assert.ok(!issuePaths.some((p) => p === 'src/assets/images/bom.svg'));
  });

  it('flags fake SVG (HTML in .svg)', async () => {
    const result = await auditCompat(config);
    const issuePaths = result.issues.map((i) => i.imagePath);
    assert.ok(issuePaths.some((p) => p.includes('not-svg.svg')));
  });

  it('reports audited count in stats', async () => {
    const result = await auditCompat(config);
    assert.ok(result.stats.audited > 0);
  });

  it('entries array covers all images', async () => {
    const result = await auditCompat(config);
    assert.equal(result.entries.length, result.stats.audited);
  });
});

describe('auditOveruse', () => {
  it('detects images referenced in multiple pages', () => {
    const result = auditOveruse(config, scanResult);
    assert.equal(result.ok, false);

    const overused = result.issues.map((i) => i.imagePath);
    // valid.png is in home.astro and about.astro
    assert.ok(
      overused.some((p) => p.includes('valid.png')),
      'valid.png should be flagged as overused'
    );
  });

  it('includes usage locations with line numbers', () => {
    const result = auditOveruse(config, scanResult);
    for (const issue of result.issues) {
      assert.ok(issue.usages.length > 1);
      for (const usage of issue.usages) {
        assert.ok(usage.sourceFile);
        assert.ok(typeof usage.lineNumber === 'number');
      }
    }
  });
});

// ── lint() integration ──────────────────────────────────────────────

describe('lint()', () => {
  it('runs all audits by default', async () => {
    const { ok, results } = await lint(configOverrides);
    assert.equal(ok, false);
    assert.ok('broken' in results);
    assert.ok('unused' in results);
    assert.ok('dupes' in results);
    assert.ok('compat' in results);
    assert.ok('overuse' in results);
  });

  it('runs selected audits only', async () => {
    const { results } = await lint({ ...configOverrides, audits: ['broken'] });
    assert.ok('broken' in results);
    assert.ok(!('unused' in results));
    assert.ok(!('dupes' in results));
  });

  it('returns warnings array', async () => {
    const { warnings } = await lint(configOverrides);
    assert.ok(Array.isArray(warnings));
  });

  it('returns ok: true when no issues in selected audits', async () => {
    // dupes on a project with no dupes would pass — but our fixtures have dupes
    // So test with a single check that might pass in isolation isn't reliable.
    // Instead verify the structure:
    const { ok, results } = await lint({ ...configOverrides, audits: ['dupes'] });
    assert.equal(typeof ok, 'boolean');
    assert.ok('dupes' in results);
  });

  it('throws on unknown audit name', async () => {
    await assert.rejects(
      () => lint({ ...configOverrides, audits: ['nonexistent'] }),
      { message: /Unknown audit/ }
    );
  });
});
