import fs from 'node:fs';
import path from 'node:path';
import { fileTypeFromFile } from 'file-type';
import { findFiles } from '../utils/find-files.js';
import { inspectImage, WEB_IMAGE_EXTS } from '../utils/inspect-image.js';

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

function calculateAspectRatio(width, height) {
  if (!width || !height) return null;
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function areEquivalent(ext1, ext2) {
  if ((ext1 === 'jpg' && ext2 === 'jpeg') || (ext1 === 'jpeg' && ext2 === 'jpg')) return true;
  // SVG is XML-based — file-type detects SVGs as application/xml
  if ((ext1 === 'svg' && ext2 === 'xml') || (ext1 === 'xml' && ext2 === 'svg')) return true;
  return false;
}

function safeStatSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

/**
 * Verify image file extensions match their actual binary format.
 *
 * Detection pipeline:
 *   1. inspectImage() — magic bytes + structural validation for web formats
 *   2. fileTypeFromFile() — file-type library as secondary cross-check
 *   3. sharp (optional) — image dimensions and aspect ratio
 *
 * @param {object} config - Resolved config
 * @returns {Promise<{ ok: boolean, issues: Array<object>, entries: Array<object>, stats: { audited: number } }>}
 */
export async function auditCompat(config) {
  const { assetsDirAbsolute, projectRoot, imageExtensions } = config;
  const allImages = findFiles(assetsDirAbsolute, imageExtensions);
  const issues = [];
  const entries = [];
  let audited = 0;

  // Try to load sharp — it's an optional peer dependency
  let sharp = null;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    // sharp not installed — dimensions/aspect ratio unavailable
  }

  for (const imagePath of allImages) {
    audited++;
    const rel = path.relative(projectRoot, imagePath).replace(/\\/g, '/');
    const declaredExt = path.extname(imagePath).toLowerCase().substring(1);

    try {
      const stats = fs.statSync(imagePath);

      // 1. Primary: our own byte-level inspection
      const inspection = inspectImage(imagePath);

      // 2. Secondary: file-type library cross-check (skip for SVG — it can't detect text formats)
      const ftResult = inspection?.format !== 'svg'
        ? await fileTypeFromFile(imagePath)
        : null;

      // Determine the detected format — prefer our inspection, fall back to file-type
      const detectedExt = inspection?.ext ?? ftResult?.ext ?? null;
      const detectedMime = inspection?.mime ?? ftResult?.mime ?? null;

      // 3. Dimensions via sharp (skip SVG — sharp can't read them)
      let width = null;
      let height = null;
      let aspectRatio = null;

      if (sharp && detectedExt !== 'svg' && declaredExt !== 'svg') {
        try {
          const meta = await sharp(imagePath).metadata();
          width = meta.width ?? null;
          height = meta.height ?? null;
          if (width && height) aspectRatio = calculateAspectRatio(width, height);
        } catch {
          // Corrupt or unsupported format
        }
      }

      const entry = {
        imagePath: rel,
        declaredExt,
        detectedExt,
        detectedMime,
        width,
        height,
        aspectRatio,
        fileSize: stats.size,
        status: 'ok',
        errorMessage: null,
      };

      // Cross-check: if both our inspector and file-type detected something,
      // flag when they disagree (possible corruption or polyglot file)
      if (inspection && ftResult && inspection.ext !== ftResult.ext && !areEquivalent(inspection.ext, ftResult.ext)) {
        entry.status = 'mismatch';
        entry.errorMessage = `Byte inspection detected ${inspection.ext} but file-type detected ${ftResult.ext}`;
        issues.push({ ...entry, type: 'mismatch' });
      }
      // Nothing detected — unrecognized file
      else if (!detectedExt) {
        entry.status = 'unknown_binary';
        issues.push({ ...entry, type: 'unknown_binary' });
      }
      // Detected format doesn't match declared extension
      else if (detectedExt !== declaredExt && !areEquivalent(declaredExt, detectedExt)) {
        entry.status = 'mismatch';
        issues.push({ ...entry, type: 'mismatch' });
      }
      // Equivalent extensions (jpg/jpeg)
      else if (detectedExt !== declaredExt && areEquivalent(declaredExt, detectedExt)) {
        entry.status = 'ok_equivalent';
      }
      // Detected format is not web-viable
      else if (!WEB_IMAGE_EXTS.has(detectedExt)) {
        entry.status = 'mismatch';
        entry.errorMessage = `${detectedExt} is not a web-viable image format`;
        issues.push({ ...entry, type: 'mismatch' });
      }

      entries.push(entry);
    } catch (err) {
      const fileSize = safeStatSize(imagePath);
      const entry = {
        imagePath: rel,
        declaredExt,
        detectedExt: null,
        detectedMime: null,
        width: null,
        height: null,
        aspectRatio: null,
        fileSize,
        status: 'error',
        errorMessage: err.message,
      };
      issues.push({ ...entry, type: 'error' });
      entries.push(entry);
    }
  }

  return { ok: issues.length === 0, issues, entries, stats: { audited } };
}
