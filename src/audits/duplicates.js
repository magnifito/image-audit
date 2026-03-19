import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { findFiles } from '../utils/find-files.js';

/**
 * Find duplicate images by content hash (SHA-256).
 *
 * @param {object} config - Resolved config
 * @returns {{ ok: boolean, issues: Array<{ hash: string, files: string[] }> }}
 */
export function auditDuplicates(config) {
  const { assetsDirAbsolute, projectRoot, imageExtensions } = config;
  const allImages = findFiles(assetsDirAbsolute, imageExtensions);
  const hashMap = new Map();

  for (const imagePath of allImages) {
    try {
      const buffer = fs.readFileSync(imagePath);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      const rel = path.relative(projectRoot, imagePath).replace(/\\/g, '/');

      if (!hashMap.has(hash)) hashMap.set(hash, []);
      hashMap.get(hash).push(rel);
    } catch {
      // Skip unreadable files
    }
  }

  const issues = [];
  for (const [hash, files] of hashMap) {
    if (files.length > 1) {
      issues.push({ hash, files });
    }
  }

  return { ok: issues.length === 0, issues };
}
