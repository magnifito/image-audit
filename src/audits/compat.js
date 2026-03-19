import fs from 'node:fs';
import path from 'node:path';
import { fileTypeFromFile } from 'file-type';
import { findFiles } from '../utils/find-files.js';

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

function calculateAspectRatio(width, height) {
  if (!width || !height) return null;
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function areEquivalent(ext1, ext2) {
  return (ext1 === 'jpg' && ext2 === 'jpeg') || (ext1 === 'jpeg' && ext2 === 'jpg');
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
 * Uses file-type for magic-byte detection and optionally sharp for dimensions.
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
      const ftResult = await fileTypeFromFile(imagePath);
      let width = null;
      let height = null;
      let aspectRatio = null;

      if (sharp && declaredExt !== 'svg') {
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
        detectedExt: ftResult?.ext ?? null,
        detectedMime: ftResult?.mime ?? null,
        width,
        height,
        aspectRatio,
        fileSize: stats.size,
        status: 'ok',
        errorMessage: null,
      };

      if (!ftResult) {
        entry.status = 'unknown_binary';
        issues.push({ ...entry, type: 'unknown_binary' });
      } else if (ftResult.ext !== declaredExt && !areEquivalent(declaredExt, ftResult.ext)) {
        entry.status = 'mismatch';
        issues.push({ ...entry, type: 'mismatch' });
      } else if (ftResult.ext !== declaredExt && areEquivalent(declaredExt, ftResult.ext)) {
        entry.status = 'ok_equivalent';
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
