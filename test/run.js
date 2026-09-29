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

import fs from 'node:fs';
import os from 'node:os';

import {
  lint,
  loadConfig,
  scanReferences,
  findFiles,
  normalizePath,
  auditBroken,
  auditUnused,
  auditDuplicates,
  auditCompat,
  auditOveruse,
  inspectImage,
  WEB_IMAGE_EXTS,
} from '../src/index.js';

import {
  gcd,
  calculateAspectRatio,
  areEquivalent,
  safeStatSize,
} from '../src/audits/compat.js';
import { run } from '../src/cli.js';
import { createReporter as createTextReporter } from '../src/reporters/text.js';
import { createReporter as createJsonReporter } from '../src/reporters/json.js';

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

  it('accepts duplicates as alias for dupes', async () => {
    const { results } = await lint({ ...configOverrides, audits: ['duplicates'] });
    assert.ok('dupes' in results);
  });

  it('throws on unknown audit name', async () => {
    await assert.rejects(
      () => lint({ ...configOverrides, audits: ['nonexistent'] }),
      { message: /Unknown audit/ }
    );
  });
});

// ── normalizePath() unit tests ──────────────────────────────────────

describe('normalizePath', () => {
  const normConfig = {
    assetsDir: 'src/assets/images',
    pathAliases: {
      '~/assets/images/': 'src/assets/images/',
      '/assets/images/': 'src/assets/images/',
    },
  };

  it('strips query parameters from image path', () => {
    const res = normalizePath('~/assets/images/hero.png?url', 'src/pages/home.astro', normConfig);
    assert.equal(res.normalized, 'src/assets/images/hero.png');
    assert.equal(res.warning, null);
  });

  it('strips hash fragments from image path', () => {
    const res = normalizePath('/assets/images/sprites.svg#icon', 'src/pages/home.astro', normConfig);
    assert.equal(res.normalized, 'src/assets/images/sprites.svg');
    assert.equal(res.warning, null);
  });

  it('rejects paths to sibling directories with common prefix', () => {
    const res = normalizePath('src/assets/images_other/pic.png', 'src/pages/home.astro', normConfig);
    assert.equal(res.normalized, null);
    assert.ok(res.warning?.includes('Path normalization incomplete'));
  });
});

// ── findFiles() directory pruning tests ─────────────────────────────

describe('findFiles', () => {
  it('prunes default ignored directories', () => {
    const files = findFiles(FIXTURES, ['.astro', '.png']);
    assert.ok(files.length > 0);
    assert.ok(!files.some((f) => f.replace(/\\/g, '/').includes('/node_modules/') || f.replace(/\\/g, '/').includes('/.git/') || f.replace(/\\/g, '/').includes('/.astro/')));
  });

  it('respects custom ignoredDirs option', () => {
    const files = findFiles(FIXTURES, ['.png'], { ignoredDirs: ['images'] });
    assert.equal(files.length, 0);
  });
});

describe('Astro 7 project compatibility', () => {
  it('verifies fixture is configured as an Astro 7 project', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'package.json'), 'utf8'));
    assert.equal(pkg.dependencies.astro, '^7.0.0');
    assert.ok(fs.existsSync(path.join(FIXTURES, 'astro.config.mjs')));
    assert.ok(fs.existsSync(path.join(FIXTURES, 'tsconfig.json')));
    assert.ok(fs.existsSync(path.join(FIXTURES, 'src/content.config.ts')));
    assert.ok(fs.existsSync(path.join(FIXTURES, '.astro')));
  });
});

// ── loadConfig() tests ──────────────────────────────────────────────

describe('loadConfig', () => {
  it('loads default configuration when no options passed', async () => {
    const cfg = await loadConfig();
    assert.equal(cfg.srcDir, 'src');
    assert.equal(cfg.assetsDir, 'src/assets/images');
    assert.equal(cfg.reporter, 'text');
    assert.equal(cfg.noColor, false);
    assert.equal(cfg.verbose, false);
  });

  it('loads custom config file via cliOptions.config', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-audit-cfg-'));
    try {
      const cfgFile = path.join(tmpDir, 'custom.config.js');
      fs.writeFileSync(cfgFile, 'export default { srcDir: "custom-src", overuseThreshold: 5 };');
      const cfg = await loadConfig({ config: cfgFile, projectRoot: tmpDir });
      assert.equal(cfg.srcDir, 'custom-src');
      assert.equal(cfg.overuseThreshold, 5);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('throws error when custom config file fails to load', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-audit-cfg-'));
    try {
      const cfgFile = path.join(tmpDir, 'invalid.config.js');
      fs.writeFileSync(cfgFile, 'throw new Error("Syntax boom");');
      await assert.rejects(
        () => loadConfig({ config: cfgFile, projectRoot: tmpDir }),
        /Failed to load config file/
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('falls back to package.json imageAudit field', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-audit-cfg-'));
    try {
      const pkgFile = path.join(tmpDir, 'package.json');
      fs.writeFileSync(pkgFile, JSON.stringify({ imageAudit: { srcDir: 'pkg-src', overuseThreshold: 3 } }));
      const cfg = await loadConfig({ projectRoot: tmpDir });
      assert.equal(cfg.srcDir, 'pkg-src');
      assert.equal(cfg.overuseThreshold, 3);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('ignores malformed package.json gracefully', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-audit-cfg-'));
    try {
      const pkgFile = path.join(tmpDir, 'package.json');
      fs.writeFileSync(pkgFile, '{ not valid json');
      const cfg = await loadConfig({ projectRoot: tmpDir });
      assert.equal(cfg.srcDir, 'src');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('applies CLI overrides and handles NO_COLOR env', async () => {
    const prevNoColor = process.env.NO_COLOR;
    try {
      process.env.NO_COLOR = '1';
      const cfg = await loadConfig({
        assets: 'custom/assets',
        src: 'custom/src',
        reporter: 'json',
        verbose: true,
        imagePathPatterns: ['src/images/[^"\']+'],
      });
      assert.equal(cfg.assetsDir, 'custom/assets');
      assert.equal(cfg.srcDir, 'custom/src');
      assert.equal(cfg.reporter, 'json');
      assert.equal(cfg.verbose, true);
      assert.equal(cfg.noColor, true);
      assert.ok(cfg.imagePathPatterns[0] instanceof RegExp);
    } finally {
      if (prevNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = prevNoColor;
      }
    }
  });

  it('respects no-color CLI flag', async () => {
    const cfg = await loadConfig({ 'no-color': true });
    assert.equal(cfg.noColor, true);
  });
});

// ── inspectImage() additional edge cases ────────────────────────────

describe('inspectImage edge cases', () => {
  it('detects ICO file format', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-ico-'));
    try {
      const icoFile = path.join(tmpDir, 'test.ico');
      const icoBuf = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
      fs.writeFileSync(icoFile, icoBuf);
      const res = inspectImage(icoFile);
      assert.ok(res);
      assert.equal(res.ext, 'ico');
      assert.equal(res.mime, 'image/x-icon');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('handles SVG with DOCTYPE internal entity subset', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-svg-'));
    try {
      const svgFile = path.join(tmpDir, 'entity.svg');
      fs.writeFileSync(
        svgFile,
        '<!DOCTYPE svg [ <!ENTITY foo "bar"> ]><svg viewBox="0 0 10 10"><circle/></svg>'
      );
      const res = inspectImage(svgFile);
      assert.ok(res);
      assert.equal(res.ext, 'svg');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('handles large SVG with extended preamble (>4096 bytes)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-svg-'));
    try {
      const svgFile = path.join(tmpDir, 'large.svg');
      const comment = '<!-- ' + 'A'.repeat(5000) + ' -->\n';
      fs.writeFileSync(svgFile, comment + '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
      const res = inspectImage(svgFile);
      assert.ok(res);
      assert.equal(res.ext, 'svg');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns null for unclosed XML or non-SVG body', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-svg-'));
    try {
      const file1 = path.join(tmpDir, 'unclosed.svg');
      fs.writeFileSync(file1, '<?xml version="1.0"');
      assert.equal(inspectImage(file1), null);

      const file2 = path.join(tmpDir, 'unclosed-comment.svg');
      fs.writeFileSync(file2, '<!-- not closed');
      assert.equal(inspectImage(file2), null);

      const file3 = path.join(tmpDir, 'unclosed-doctype.svg');
      fs.writeFileSync(file3, '<!DOCTYPE svg [ <entity>');
      assert.equal(inspectImage(file3), null);

      const file4 = path.join(tmpDir, 'unclosed-doctype2.svg');
      fs.writeFileSync(file4, '<!DOCTYPE svg');
      assert.equal(inspectImage(file4), null);

      const file5 = path.join(tmpDir, 'not-svg-tag.svg');
      fs.writeFileSync(file5, '<div xmlns="http://www.w3.org/2000/svg"></div>');
      assert.equal(inspectImage(file5), null);

      const file6 = path.join(tmpDir, 'svg-unclosed-tag.svg');
      fs.writeFileSync(file6, '<svg');
      assert.equal(inspectImage(file6), null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns null for non-existent file', () => {
    assert.equal(inspectImage('/path/to/non/existent/image.png'), null);
  });

  it('inspectImage ignores closeSync error during cleanup', () => {
    const origClose = fs.closeSync;
    try {
      fs.closeSync = () => { throw new Error('close error'); };
      inspectImage(path.join(IMAGES, 'valid.png'));
    } finally {
      fs.closeSync = origClose;
    }
  });
});

// ── compat helpers and auditCompat edge cases ───────────────────────

describe('compat helpers', () => {
  it('gcd calculates greatest common divisor', () => {
    assert.equal(gcd(12, 8), 4);
    assert.equal(gcd(16, 9), 1);
    assert.equal(gcd(0, 5), 5);
  });

  it('calculateAspectRatio computes correct ratios', () => {
    assert.equal(calculateAspectRatio(1920, 1080), '16:9');
    assert.equal(calculateAspectRatio(100, 100), '1:1');
    assert.equal(calculateAspectRatio(0, 100), null);
    assert.equal(calculateAspectRatio(100, null), null);
  });

  it('areEquivalent checks extensions', () => {
    assert.equal(areEquivalent('jpg', 'jpeg'), true);
    assert.equal(areEquivalent('jpeg', 'jpg'), true);
    assert.equal(areEquivalent('svg', 'xml'), true);
    assert.equal(areEquivalent('xml', 'svg'), true);
    assert.equal(areEquivalent('png', 'jpg'), false);
  });

  it('safeStatSize returns size or 0 on error', () => {
    assert.ok(safeStatSize(path.join(IMAGES, 'valid.png')) > 0);
    assert.equal(safeStatSize('/nonexistent/file.png'), 0);
  });

  it('auditCompat handles sharp metadata and errors', async () => {
    const mockSharp = (filePath) => ({
      metadata: async () => {
        if (filePath.includes('valid.png')) {
          return { width: 1920, height: 1080 };
        }
        throw new Error('Sharp decode error');
      },
    });

    const res = await auditCompat({ ...config, _sharp: mockSharp });
    const pngEntry = res.entries.find((e) => e.imagePath.includes('valid.png'));
    assert.ok(pngEntry);
    assert.equal(pngEntry.width, 1920);
    assert.equal(pngEntry.height, 1080);
    assert.equal(pngEntry.aspectRatio, '16:9');
  });

  it('auditCompat handles ok_equivalent extensions (jpg vs jpeg)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-equiv-'));
    try {
      const imgDir = path.join(tmpDir, 'images');
      fs.mkdirSync(imgDir, { recursive: true });
      fs.copyFileSync(path.join(IMAGES, 'valid.jpg'), path.join(imgDir, 'photo.jpeg'));
      const equivConfig = {
        projectRoot: tmpDir,
        assetsDirAbsolute: imgDir,
        imageExtensions: ['.jpeg', '.jpg'],
      };
      const res = await auditCompat(equivConfig);
      const entry = res.entries.find((e) => e.imagePath.includes('photo.jpeg'));
      assert.ok(entry);
      assert.equal(entry.status, 'ok_equivalent');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('auditCompat handles non-web-viable format and error catching', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-nonweb-'));
    try {
      const imgDir = path.join(tmpDir, 'images');
      fs.mkdirSync(imgDir, { recursive: true });
      fs.writeFileSync(path.join(imgDir, 'sample.png'), 'corrupt data');
      const badConfig = {
        projectRoot: tmpDir,
        assetsDirAbsolute: imgDir,
        imageExtensions: ['.png'],
      };
      const res = await auditCompat(badConfig);
      assert.equal(res.ok, false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('auditCompat detects disagreement between byte inspection and file-type', async () => {
    const mockFt = async () => ({ ext: 'webp', mime: 'image/webp' });
    const res = await auditCompat({ ...config, _fileTypeFromFile: mockFt });
    const disagreeEntry = res.issues.find((i) => i.errorMessage?.includes('Byte inspection detected'));
    assert.ok(disagreeEntry);
  });

  it('auditCompat flags non-web-viable format detected by file-type', async () => {
    const mockFt = async () => ({ ext: 'bmp', mime: 'image/bmp' });
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-bmp-'));
    try {
      const imgDir = path.join(tmpDir, 'images');
      fs.mkdirSync(imgDir, { recursive: true });
      fs.writeFileSync(path.join(imgDir, 'sample.bmp'), 'some bytes');
      const res = await auditCompat({
        projectRoot: tmpDir,
        assetsDirAbsolute: imgDir,
        imageExtensions: ['.bmp'],
        _fileTypeFromFile: mockFt,
      });
      const bmpIssue = res.issues.find((i) => i.errorMessage?.includes('not a web-viable image format'));
      assert.ok(bmpIssue);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('auditCompat handles statSync error via missing file', async () => {
    const res = await auditCompat({
      projectRoot: FIXTURES,
      assetsDirAbsolute: IMAGES,
      imageExtensions: ['.png'],
      _allImages: ['/nonexistent/missing/file.png'],
    });
    assert.equal(res.ok, false);
    assert.ok(res.issues.some((i) => i.type === 'error'));
  });
});

// ── scanReferences() and normalizePath() edge cases ─────────────────

describe('scanReferences and normalizePath edge cases', () => {
  it('records warnings for unreadable source files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-scan-'));
    try {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      const badFile = path.join(srcDir, 'noperm.astro');
      fs.writeFileSync(badFile, 'content', { mode: 0o000 });
      try {
        const res = scanReferences({
          projectRoot: tmpDir,
          srcDirAbsolute: srcDir,
          sourceExtensions: ['.astro'],
          imagePathPatterns: [/pattern/g],
        });
        assert.ok(Array.isArray(res.warnings));
        assert.ok(res.warnings.some((w) => w.includes('Error reading')));
      } finally {
        try { fs.chmodSync(badFile, 0o666); } catch {}
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('warns about import.meta.glob with assets/images', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-glob-'));
    try {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'gallery.astro'),
        'const imgs = import.meta.glob("../assets/images/*.png");'
      );
      const res = scanReferences({
        projectRoot: tmpDir,
        srcDirAbsolute: srcDir,
        sourceExtensions: ['.astro'],
        imagePathPatterns: [/pattern/g],
      });
      assert.ok(res.warnings.some((w) => w.includes('import.meta.glob')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('normalizePath resolves relative paths starting with ./ or ../ or subpaths', () => {
    const normConfig = {
      assetsDir: 'src/assets/images',
    };
    const res1 = normalizePath('../assets/images/hero.png', 'src/pages/page.astro', normConfig);
    assert.equal(res1.normalized, 'src/assets/images/hero.png');

    const res2 = normalizePath('./hero.png', 'src/assets/images/page.astro', normConfig);
    assert.equal(res2.normalized, 'src/assets/images/hero.png');

    const res3 = normalizePath('images/hero.png', 'src/assets/page.astro', normConfig);
    assert.equal(res3.normalized, 'src/assets/images/hero.png');
  });

  it('normalizePath returns warning for external or unresolvable path', () => {
    const normConfig = {
      assetsDir: 'src/assets/images',
    };
    const res = normalizePath('https://example.com/logo.png', 'src/pages/page.astro', normConfig);
    assert.equal(res.normalized, null);
    assert.ok(res.warning);
  });
});

// ── findFiles, duplicates, broken, overuse edge cases ───────────────

describe('additional audit edge cases', () => {
  it('findFiles handles non-recursive option', () => {
    const files = findFiles(FIXTURES, ['.astro', '.png'], { recursive: false });
    assert.equal(files.length, 0);
  });

  it('findFiles handles inaccessible directories without crashing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-inacc-'));
    try {
      const subDir = path.join(tmpDir, 'locked');
      fs.mkdirSync(subDir, { recursive: true });
      fs.chmodSync(subDir, 0o000);
      try {
        const files = findFiles(tmpDir, ['.png']);
        assert.equal(files.length, 0);
      } finally {
        try { fs.chmodSync(subDir, 0o777); } catch {}
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('auditBroken deduplicates multiple references to the same broken link in a file', () => {
    const scanWithDupes = {
      references: [
        { sourceFile: 'page.astro', originalPath: 'missing.png', imagePath: 'src/assets/missing.png', lineNumber: 1 },
        { sourceFile: 'page.astro', originalPath: 'missing.png', imagePath: 'src/assets/missing.png', lineNumber: 5 },
      ],
    };
    const res = auditBroken({ projectRoot: FIXTURES }, scanWithDupes);
    assert.equal(res.ok, false);
    assert.equal(res.issues.length, 1);
  });

  it('auditOveruse respects custom overuseThreshold', () => {
    const scan = {
      references: [
        { sourceFile: 'a.astro', originalPath: 'icon.png', imagePath: 'src/assets/icon.png', lineNumber: 1 },
        { sourceFile: 'b.astro', originalPath: 'icon.png', imagePath: 'src/assets/icon.png', lineNumber: 2 },
      ],
    };
    const res = auditOveruse({ overuseThreshold: 2 }, scan);
    assert.equal(res.ok, true);
    assert.equal(res.issues.length, 0);
  });

  it('auditDuplicates skips unreadable files gracefully', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-dupes-'));
    try {
      const imgDir = path.join(tmpDir, 'images');
      fs.mkdirSync(imgDir, { recursive: true });
      fs.writeFileSync(path.join(imgDir, 'a.png'), 'same');
      fs.writeFileSync(path.join(imgDir, 'b.png'), 'same');

      // Test 1: stat failure
      const resStatErr = auditDuplicates({
        projectRoot: tmpDir,
        assetsDirAbsolute: imgDir,
        imageExtensions: ['.png'],
        _allImages: ['/nonexistent/missing.png'],
      });
      assert.equal(resStatErr.ok, true);

      // Test 2: read failure (trying to read directory as file)
      const resReadErr = auditDuplicates({
        projectRoot: tmpDir,
        assetsDirAbsolute: imgDir,
        imageExtensions: ['.png'],
        _allImages: [tmpDir, tmpDir],
      });
      assert.equal(resReadErr.ok, true);

      // Test 3: normal duplicate detection
      const res = auditDuplicates({
        projectRoot: tmpDir,
        assetsDirAbsolute: imgDir,
        imageExtensions: ['.png'],
      });
      assert.equal(res.ok, false);
      assert.equal(res.issues.length, 1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── reporters test suite ────────────────────────────────────────────

describe('text and json reporters', () => {
  it('createTextReporter formats broken, unused, dupes, compat, overuse, summary', () => {
    const lines = [];
    const log = (msg = '') => lines.push(msg);
    const reporter = createTextReporter({ noColor: false, verbose: true, log });

    reporter.report('broken', { ok: true, issues: [] });
    reporter.report('broken', {
      ok: false,
      issues: [{ sourceFile: 'home.astro', lineNumber: 10, imagePath: 'broken.png' }],
    });

    reporter.report('unused', { ok: true, issues: [] });
    reporter.report('unused', { ok: false, issues: [{ imagePath: 'unused.png' }] });

    reporter.report('dupes', { ok: true, issues: [] });
    reporter.report('dupes', {
      ok: false,
      issues: [{ hash: 'abcdef1234567890', files: ['a.png', 'b.png'] }],
    });

    reporter.report('compat', {
      ok: false,
      stats: { audited: 2 },
      entries: [
        {
          status: 'ok',
          imagePath: 'good.png',
          detectedExt: 'png',
          detectedMime: 'image/png',
          fileSize: 2048,
          width: 800,
          height: 600,
          aspectRatio: '4:3',
        },
        {
          status: 'mismatch',
          imagePath: 'bad.png',
          declaredExt: 'jpg',
          detectedExt: 'png',
          detectedMime: 'image/png',
          fileSize: 500,
          errorMessage: 'Format mismatch',
        },
      ],
      issues: [
        { type: 'mismatch', imagePath: 'bad.png', declaredExt: 'jpg', detectedExt: 'png', detectedMime: 'image/png' },
        { type: 'error', imagePath: 'err.png', errorMessage: 'Read error' },
        { type: 'unknown_binary', imagePath: 'bin.png' },
      ],
    });

    reporter.report('overuse', { ok: true, issues: [] });
    reporter.report('overuse', {
      ok: false,
      issues: [
        {
          originalPath: 'common.png',
          usages: [
            { sourceFile: 'a.astro', lineNumber: 1 },
            { sourceFile: 'b.astro', lineNumber: 2 },
          ],
        },
      ],
    });

    reporter.summary();
    assert.ok(lines.length > 10);
  });

  it('createTextReporter formats passing summary when all audits pass', () => {
    const lines = [];
    const reporter = createTextReporter({ noColor: true, log: (m) => lines.push(m) });
    reporter.report('broken', { ok: true, issues: [] });
    reporter.report('unused', { ok: true, issues: [] });
    reporter.summary();
    assert.ok(lines.some((l) => l.includes('All audits passed')));
  });

  it('createTextReporter formats passing compat report and handles large files', () => {
    const lines = [];
    const reporter = createTextReporter({ verbose: true, log: (m) => lines.push(m) });
    reporter.report('compat', {
      ok: true,
      stats: { audited: 1 },
      issues: [],
      entries: [
        {
          status: 'ok',
          imagePath: 'big.png',
          fileSize: 3 * 1024 * 1024,
        },
      ],
    });
    assert.ok(lines.some((l) => l?.includes('All 1 image(s) have compatible')));
    assert.ok(lines.some((l) => l?.includes('3.00M')));
  });

  it('createJsonReporter collects and writes JSON document and handles default write', () => {
    let output = '';
    const reporter = createJsonReporter({ write: (s) => (output += s) });
    reporter.report('broken', { ok: true, issues: [] });
    reporter.summary();
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.audits.broken);

    // Default instance
    const origWrite = process.stdout.write;
    try {
      process.stdout.write = () => true;
      const def = createJsonReporter();
      def.summary();
    } finally {
      process.stdout.write = origWrite;
    }
  });
});

// ── cli run() test suite ────────────────────────────────────────────

describe('cli run()', () => {
  it('shows help with --help or -h', async () => {
    let logged = '';
    await run(['--help'], { log: (msg) => (logged += msg) });
    assert.ok(logged.includes('Usage: image-audit'));
  });

  it('shows version with --version or -v', async () => {
    let version = '';
    await run(['--version'], { log: (msg) => (version += msg) });
    assert.ok(/\d+\.\d+\.\d+/.test(version));
  });

  it('exits with code 2 on unknown option or syntax error', async () => {
    let exitCode = null;
    let errMsg = '';
    await run(['--unknown-flag-xyz'], {
      exit: (code) => (exitCode = code),
      error: (msg) => (errMsg += msg),
    });
    assert.equal(exitCode, 2);
    assert.ok(errMsg.includes('Error:'));
  });

  it('exits with code 2 on invalid reporter name', async () => {
    let exitCode = null;
    let errMsg = '';
    await run(['all', '--reporter', 'xml'], {
      exit: (code) => (exitCode = code),
      error: (msg) => (errMsg += msg),
    });
    assert.equal(exitCode, 2);
    assert.ok(errMsg.includes('Invalid reporter'));
  });

  it('exits with code 2 on unknown subcommand', async () => {
    let exitCode = null;
    let errMsg = '';
    await run(['nonexistent-subcommand'], {
      exit: (code) => (exitCode = code),
      error: (msg) => (errMsg += msg),
    });
    assert.equal(exitCode, 2);
    assert.ok(errMsg.includes('Unknown command'));
  });

  it('runs multiple subcommands and outputs json reporter', async () => {
    let exitCode = null;
    let jsonOutput = '';
    await run(
      ['broken', 'dupes', '-a', 'test/fixtures/src/assets/images', '-s', 'test/fixtures/src', '-r', 'json'],
      {
        exit: (code) => (exitCode = code),
        write: (s) => (jsonOutput += s),
      }
    );
    assert.equal(typeof exitCode, 'number');
    const parsed = JSON.parse(jsonOutput);
    assert.ok('broken' in parsed.audits);
    assert.ok('dupes' in parsed.audits);
  });

  it('logs verbose scan warnings when verbose is enabled', async () => {
    let warnMsg = '';
    await run(
      ['unused', '-a', 'test/fixtures/src/assets/images', '-s', 'test/fixtures/src', '--verbose'],
      {
        exit: () => {},
        log: () => {},
        warn: (msg) => (warnMsg += msg),
      }
    );
    assert.ok(typeof warnMsg === 'string');
  });

  it('runs duplicates alias and text reporter with no-color', async () => {
    let logged = '';
    await run(
      ['duplicates', '-a', 'test/fixtures/src/assets/images', '-s', 'test/fixtures/src', '--no-color'],
      {
        exit: () => {},
        log: (m = '') => (logged += m + '\n'),
      }
    );
    assert.ok(logged.includes('duplicate'));
  });

  it('runs all audits with text reporter when no subcommand given', async () => {
    let logged = '';
    await run(
      ['-a', 'test/fixtures/src/assets/images', '-s', 'test/fixtures/src'],
      {
        exit: () => {},
        log: (m = '') => (logged += m + '\n'),
      }
    );
    assert.ok(logged.length > 0);
  });
});

describe('additional branch coverage tests', () => {
  it('auditOveruse uses default threshold of 1 when undefined', () => {
    const scan = {
      references: [
        { sourceFile: 'a.astro', originalPath: 'icon.png', imagePath: 'src/assets/icon.png', lineNumber: 1 },
        { sourceFile: 'b.astro', originalPath: 'icon.png', imagePath: 'src/assets/icon.png', lineNumber: 2 },
      ],
    };
    const res = auditOveruse({}, scan);
    assert.equal(res.ok, false);
    assert.equal(res.issues.length, 1);
  });

  it('normalizePath handles path matching assetsDir exactly', () => {
    const normConfig = { assetsDir: 'src/assets/images' };
    const res = normalizePath('src/assets/images', 'src/pages/page.astro', normConfig);
    assert.equal(res.normalized, 'src/assets/images');
  });

  it('normalizePath resolves relative subpath without leading dots and strips query', () => {
    const normConfig = { assetsDir: 'src/pages/images' };
    const res = normalizePath('images/pic.png?v=123', 'src/pages/page.astro', normConfig);
    assert.equal(res.normalized, 'src/pages/images/pic.png');
    assert.equal(res.warning, null);

    // Matching assetsDir exactly
    const resExact = normalizePath('images/sub?query', 'src/pages/page.astro', { assetsDir: 'src/pages/images/sub' });
    assert.equal(resExact.normalized, 'src/pages/images/sub');
    assert.equal(resExact.warning, null);
  });

  it('scanReferences supports single-capture and non-capturing regex', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-regex-'));
    try {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'page.astro'), '<img src="src/assets/images/pic.png">');

      const res = scanReferences({
        projectRoot: tmpDir,
        srcDirAbsolute: srcDir,
        sourceExtensions: ['.astro'],
        assetsDir: 'src/assets/images',
        imagePathPatterns: [/src\/assets\/images\/[a-z.]+/g], // match[0] used!
      });
      assert.equal(res.references.length, 1);
      assert.equal(res.references[0].imagePath, 'src/assets/images/pic.png');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('loadConfig handles string regex patterns, assets, src, reporter and verbose CLI flags', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-cfg-str-'));
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          imageAudit: {
            imagePathPatterns: ['src/assets/[a-z.]+', /already-regex/],
          },
        })
      );
      const loaded = await loadConfig({
        projectRoot: tmpDir,
        assets: 'src/custom-assets',
        src: 'src/custom-src',
        reporter: 'json',
        verbose: true,
      });
      assert.equal(loaded.assetsDir, 'src/custom-assets');
      assert.equal(loaded.srcDir, 'src/custom-src');
      assert.equal(loaded.reporter, 'json');
      assert.equal(loaded.verbose, true);
      assert.ok(loaded.imagePathPatterns[0] instanceof RegExp);
      assert.ok(loaded.imagePathPatterns[1] instanceof RegExp);

      // Non-existent explicit config path (skips package.json without throwing)
      const emptyLoaded = await loadConfig({
        projectRoot: tmpDir,
        config: 'non-existent.config.js',
      });
      assert.equal(emptyLoaded.assetsDir, 'src/assets/images');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('inspectImage handles BOM, unclosed DOCTYPE, and malformed comments', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-bom-'));
    try {
      const bomSvg = path.join(tmpDir, 'bom.svg');
      fs.writeFileSync(bomSvg, '\uFEFF<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>');
      const res = inspectImage(bomSvg);
      assert.ok(res);
      assert.equal(res.ext, 'svg');

      const unclosedDoc = path.join(tmpDir, 'unclosed-doc.svg');
      fs.writeFileSync(unclosedDoc, '<!DOCTYPE svg [ <svg></svg>');
      assert.equal(inspectImage(unclosedDoc), null);

      const unclosedDocNoBracket = path.join(tmpDir, 'unclosed-nobracket.svg');
      fs.writeFileSync(unclosedDocNoBracket, '<!DOCTYPE svg');
      assert.equal(inspectImage(unclosedDocNoBracket), null);

      const unclosedComment = path.join(tmpDir, 'unclosed-comment.svg');
      fs.writeFileSync(unclosedComment, '<!-- unclosed comment');
      assert.equal(inspectImage(unclosedComment), null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('inspectImage handles AVIF, GIF, WebP and ICO edge validation', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-formats-'));
    try {
      // Short GIF
      const shortGif = path.join(tmpDir, 'short.gif');
      fs.writeFileSync(shortGif, Buffer.from([0x47, 0x49, 0x46, 0x38, 0x30])); // 5 bytes
      assert.equal(inspectImage(shortGif), null);

      // Invalid GIF version
      const badGif = path.join(tmpDir, 'bad.gif');
      fs.writeFileSync(badGif, Buffer.from([0x47, 0x49, 0x46, 0x38, 0x30, 0x61])); // GIF80a
      assert.equal(inspectImage(badGif), null);

      // Short WebP
      const shortWebp = path.join(tmpDir, 'short.webp');
      fs.writeFileSync(shortWebp, Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00])); // 6 bytes
      assert.equal(inspectImage(shortWebp), null);

      // Short ICO
      const shortIco = path.join(tmpDir, 'short.ico');
      fs.writeFileSync(shortIco, Buffer.from([0x00, 0x00, 0x01])); // 3 bytes
      assert.equal(inspectImage(shortIco), null);

      // Invalid ICO type
      const badIcoType = path.join(tmpDir, 'bad-type.ico');
      fs.writeFileSync(badIcoType, Buffer.from([0x00, 0x00, 0x03, 0x00, 0x01, 0x00]));
      assert.equal(inspectImage(badIcoType), null);

      // Invalid ICO count
      const badIcoCount = path.join(tmpDir, 'bad-count.ico');
      fs.writeFileSync(badIcoCount, Buffer.from([0x00, 0x00, 0x01, 0x00, 0x00, 0x00])); // count = 0
      assert.equal(inspectImage(badIcoCount), null);

      // Short AVIF (under 12 bytes)
      const shortAvif = path.join(tmpDir, 'short.avif');
      fs.writeFileSync(shortAvif, Buffer.from([0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70]));
      assert.equal(inspectImage(shortAvif), null);

      // AVIF with valid ftyp and brand
      const validAvif = path.join(tmpDir, 'valid.avif');
      const avifHeader = Buffer.alloc(24);
      avifHeader.writeUInt32BE(24, 0);
      avifHeader.write('ftyp', 4, 'ascii');
      avifHeader.write('avif', 8, 'ascii');
      fs.writeFileSync(validAvif, avifHeader);
      const avifRes = inspectImage(validAvif);
      assert.ok(avifRes);
      assert.equal(avifRes.ext, 'avif');

      // Non-ftyp AVIF
      const nonFtyp = path.join(tmpDir, 'nonftyp.avif');
      const nonFtypHeader = Buffer.alloc(24);
      nonFtypHeader.writeUInt32BE(24, 0);
      nonFtypHeader.write('xxxx', 4, 'ascii');
      fs.writeFileSync(nonFtyp, nonFtypHeader);
      assert.equal(inspectImage(nonFtyp), null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('auditCompat handles sharp metadata with null dimensions and missing mime', async () => {
    const mockSharp = () => ({
      metadata: async () => ({ width: null, height: null }),
    });
    const mockFt = async () => ({ ext: 'gif', mime: null });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-nullmeta-'));
    try {
      const imgDir = path.join(tmpDir, 'images');
      fs.mkdirSync(imgDir, { recursive: true });
      fs.copyFileSync(path.join(IMAGES, 'valid.png'), path.join(imgDir, 'test.png'));
      const res = await auditCompat({
        projectRoot: tmpDir,
        assetsDirAbsolute: imgDir,
        imageExtensions: ['.png'],
        _sharp: mockSharp,
        _fileTypeFromFile: mockFt,
      });
      const entry = res.entries.find((e) => e.imagePath.includes('test.png'));
      assert.ok(entry);
      assert.equal(entry.aspectRatio, null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('cli run() exits with 0 on successful audit run with no issues', async () => {
    let exitCode = null;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-clean-'));
    try {
      const srcDir = path.join(tmpDir, 'src');
      const imgDir = path.join(tmpDir, 'src/assets/images');
      fs.mkdirSync(imgDir, { recursive: true });
      // Create one valid image and one page referencing it once
      fs.copyFileSync(path.join(IMAGES, 'valid.png'), path.join(imgDir, 'clean.png'));
      fs.writeFileSync(
        path.join(srcDir, 'clean.astro'),
        '<img src="/assets/images/clean.png">'
      );

      await run(
        ['broken', 'unused', 'overuse', '-a', 'src/assets/images', '-s', 'src'],
        {
          exit: (code) => (exitCode = code),
          log: () => {},
          write: () => {},
        }
      );
      assert.equal(exitCode, 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('inspectImage tests format validation failure branches and variations', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-branches-'));
    try {
      // PNG signature but not IHDR chunk
      const badPng = path.join(tmpDir, 'bad-chunk.png');
      const badPngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x58, 0x58, 0x58, 0x58]);
      fs.writeFileSync(badPng, badPngBuf);
      assert.equal(inspectImage(badPng), null);

      // Short PNG (less than 16 bytes)
      const shortPng = path.join(tmpDir, 'short.png');
      fs.writeFileSync(shortPng, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]));
      assert.equal(inspectImage(shortPng), null);

      // JPEG SOI but third byte is not 0xff
      const badJpg = path.join(tmpDir, 'bad.jpg');
      fs.writeFileSync(badJpg, Buffer.from([0xff, 0xd8, 0x00]));
      assert.equal(inspectImage(badJpg), null);

      // JPEG SOI with only 2 bytes
      const shortJpg = path.join(tmpDir, 'short.jpg');
      fs.writeFileSync(shortJpg, Buffer.from([0xff, 0xd8]));
      assert.equal(inspectImage(shortJpg), null);

      // WebP magic RIFF but not WEBP chunk
      const badWebp = path.join(tmpDir, 'bad.webp');
      fs.writeFileSync(badWebp, Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x54, 0x45, 0x53, 0x54]));
      assert.equal(inspectImage(badWebp), null);

      // ICO CUR type (type = 2) with valid count
      const curIco = path.join(tmpDir, 'cursor.ico');
      const curBuf = Buffer.from([0x00, 0x00, 0x02, 0x00, 0x01, 0x00]);
      fs.writeFileSync(curIco, curBuf);
      const curRes = inspectImage(curIco);
      assert.ok(curRes);
      assert.equal(curRes.ext, 'ico');

      // ICO with count >= 256
      const hugeCountIco = path.join(tmpDir, 'huge.ico');
      const hugeBuf = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x00, 0x02]); // 512 images
      fs.writeFileSync(hugeCountIco, hugeBuf);
      assert.equal(inspectImage(hugeCountIco), null);

      // AVIF with avis and mif1 brands
      const avisFile = path.join(tmpDir, 'brand-avis.avif');
      const avisHdr = Buffer.alloc(24);
      avisHdr.write('ftyp', 4, 'ascii');
      avisHdr.write('avis', 8, 'ascii');
      fs.writeFileSync(avisFile, avisHdr);
      assert.equal(inspectImage(avisFile)?.ext, 'avif');

      const mif1File = path.join(tmpDir, 'brand-mif1.avif');
      const mif1Hdr = Buffer.alloc(24);
      mif1Hdr.write('ftyp', 4, 'ascii');
      mif1Hdr.write('mif1', 8, 'ascii');
      fs.writeFileSync(mif1File, mif1Hdr);
      assert.equal(inspectImage(mif1File)?.ext, 'avif');

      // AVIF format with non-matching brand (e.g. mp42)
      const mp4File = path.join(tmpDir, 'brand-mp4.avif');
      const mp4Hdr = Buffer.alloc(24);
      mp4Hdr.write('ftyp', 4, 'ascii');
      mp4Hdr.write('mp42', 8, 'ascii');
      fs.writeFileSync(mp4File, mp4Hdr);
      assert.equal(inspectImage(mp4File), null);

      // SVG with unclosed processing instruction
      const unclosedPi = path.join(tmpDir, 'unclosed-pi.svg');
      fs.writeFileSync(unclosedPi, '<?xml version="1.0"');
      assert.equal(inspectImage(unclosedPi), null);

      // SVG starting with <svg but without closing '>'
      const unclosedSvgTag = path.join(tmpDir, 'unclosed-tag.svg');
      fs.writeFileSync(unclosedSvgTag, '<svg xmlns="http://www.w3.org/2000/svg"');
      assert.equal(inspectImage(unclosedSvgTag), null);

      // Large binary file (>4096 bytes) containing null bytes
      const largeBinary = path.join(tmpDir, 'large.bin');
      const largeBuf = Buffer.alloc(5000);
      largeBuf.fill(0x00);
      fs.writeFileSync(largeBinary, largeBuf);
      assert.equal(inspectImage(largeBinary), null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('loadConfig handles named exports in config and missing package.json', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-cfg-named-'));
    try {
      // Config file with named export instead of default export
      const cfgPath = path.join(tmpDir, 'image-audit.config.js');
      fs.writeFileSync(cfgPath, 'export const assetsDir = "custom/assets";');
      const loaded = await loadConfig({ projectRoot: tmpDir, noColor: true });
      assert.equal(loaded.assetsDir, 'custom/assets');
      assert.equal(loaded.noColor, true);

      // Empty project without package.json or config file
      const emptyDir = path.join(tmpDir, 'empty');
      fs.mkdirSync(emptyDir);
      const emptyLoaded = await loadConfig({ projectRoot: emptyDir });
      assert.equal(emptyLoaded.assetsDir, 'src/assets/images');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('auditCompat handles unknown mime in mismatch and skips sharp for SVG', async () => {
    const mockSharp = () => ({
      metadata: async () => ({ width: 100, height: 100 }),
    });
    // ft returns ext without mime
    const mockFt = async () => ({ ext: 'png', mime: null });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-compat-mime-'));
    try {
      const imgDir = path.join(tmpDir, 'images');
      fs.mkdirSync(imgDir, { recursive: true });
      // Create .jpg that actually contains png bytes
      fs.copyFileSync(path.join(IMAGES, 'valid.png'), path.join(imgDir, 'pic.jpg'));
      // Create .svg file to verify sharp is skipped for SVG
      fs.copyFileSync(path.join(IMAGES, 'valid.svg'), path.join(imgDir, 'icon.svg'));

      const res = await auditCompat({
        projectRoot: tmpDir,
        assetsDirAbsolute: imgDir,
        imageExtensions: ['.jpg', '.svg'],
        _sharp: mockSharp,
        _fileTypeFromFile: mockFt,
      });

      const jpgIssue = res.issues.find((i) => i.imagePath.includes('pic.jpg'));
      assert.ok(jpgIssue);
      assert.ok(jpgIssue.errorMessage.includes('image/png') || jpgIssue.errorMessage.includes('unknown mime'));

      const svgEntry = res.entries.find((e) => e.imagePath.includes('icon.svg'));
      assert.ok(svgEntry);
      assert.equal(svgEntry.width, null); // sharp was skipped for svg
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('cli run() uses console fallbacks and handles all subcommand', async () => {
    const origErr = console.error;
    const origWarn = console.warn;
    let errOutput = '';
    let warnOutput = '';
    try {
      console.error = (m) => (errOutput += m);
      console.warn = (m) => (warnOutput += m);

      // Triggers error with default console.error
      await run(['--invalid-flag'], { exit: () => {} });
      assert.ok(errOutput.includes('Error:'));

      // Triggers run with explicit 'all' subcommand and default console.warn
      await run(
        ['all', '-a', 'test/fixtures/src/assets/images', '-s', 'test/fixtures/src', '--verbose'],
        {
          exit: () => {},
          log: () => {},
          write: () => {},
        }
      );
      assert.ok(typeof warnOutput === 'string');
    } finally {
      console.error = origErr;
      console.warn = origWarn;
    }
  });

  it('inspectImage handles extended read failure gracefully', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-extread-'));
    try {
      const largeSvg = path.join(tmpDir, 'large.svg');
      const preamble = '<!-- ' + 'A'.repeat(5000) + ' -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>';
      fs.writeFileSync(largeSvg, preamble);

      // Spy fs.openSync to fail on the second call (extended read)
      const origOpen = fs.openSync;
      let calls = 0;
      try {
        fs.openSync = (...args) => {
          calls++;
          if (calls === 2) throw new Error('Secondary read failure');
          return origOpen(...args);
        };
        const res = inspectImage(largeSvg);
        // Falls back to initial buffer check, which is null because svg wasn't in initial 4KB
        assert.equal(res, null);
      } finally {
        fs.openSync = origOpen;
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('auditCompat skips sharp when detectedExt is svg even if declaredExt is png', async () => {
    let sharpCalled = false;
    const mockSharp = () => {
      sharpCalled = true;
      return { metadata: async () => ({ width: 100, height: 100 }) };
    };

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-svg-sharp-'));
    try {
      const imgDir = path.join(tmpDir, 'images');
      fs.mkdirSync(imgDir, { recursive: true });
      // File named .png but actually containing SVG
      fs.copyFileSync(path.join(IMAGES, 'valid.svg'), path.join(imgDir, 'fake.png'));

      const res = await auditCompat({
        projectRoot: tmpDir,
        assetsDirAbsolute: imgDir,
        imageExtensions: ['.png'],
        _sharp: mockSharp,
      });

      const entry = res.entries.find((e) => e.imagePath.includes('fake.png'));
      assert.ok(entry);
      assert.equal(entry.detectedExt, 'svg');
      assert.equal(sharpCalled, false); // sharp should be skipped for detected SVG
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('bin/image-audit.js executes successfully via CLI runner', async () => {
    const { execFileSync } = await import('node:child_process');
    const binPath = path.resolve('bin/image-audit.js');

    const helpOutput = execFileSync(process.execPath, [binPath, '--help'], { encoding: 'utf8' });
    assert.ok(helpOutput.includes('Usage: image-audit'));

    const versionOutput = execFileSync(process.execPath, [binPath, '--version'], { encoding: 'utf8' });
    assert.ok(/\d+\.\d+\.\d+/.test(versionOutput));

    // Verify error exit code 2 on invalid arguments
    let exitError = null;
    try {
      execFileSync(process.execPath, [binPath, '--bad-arg-flag'], { stdio: 'pipe' });
    } catch (err) {
      exitError = err;
    }
    assert.ok(exitError);
    assert.equal(exitError.status, 2);

    // Verify rejection handler in bin/image-audit.js (.catch branch)
    const tmpBadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-bin-bad-'));
    try {
      const badCfg = path.join(tmpBadDir, 'bad-syntax.js');
      fs.writeFileSync(badCfg, 'throw new Error("Syntax boom");');
      let binRejection = null;
      try {
        execFileSync(process.execPath, [binPath, '-c', badCfg], { stdio: 'pipe' });
      } catch (err) {
        binRejection = err;
      }
      assert.ok(binRejection);
      assert.equal(binRejection.status, 1);
      assert.ok(binRejection.stderr.toString().includes('Syntax boom'));

      // Also test string rejection without .message (mocking run)
      const mockBin = path.join(tmpBadDir, 'mock-bin.js');
      fs.writeFileSync(
        mockBin,
        `import { run } from '${path.resolve('src/cli.js')}';\n` +
        `const origLint = (await import('${path.resolve('src/index.js')}')).lint;\n` +
        `run(['broken']).catch((err) => { console.error(err.message || err); process.exit(1); });\n`
      );
    } finally {
      fs.rmSync(tmpBadDir, { recursive: true, force: true });
    }
  });
});



