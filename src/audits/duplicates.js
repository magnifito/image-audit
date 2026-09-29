import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { findFiles } from '../utils/find-files.js';

/**
 * Find duplicate images by content hash (SHA-256).
 *
 * @param {object} config - Resolved config
 * @returns {{ ok: boolean, issues: Array<{ hash: string, files: string[] }> }}
 */
export function auditDuplicates(config) {
  const { assetsDirAbsolute, projectRoot, imageExtensions } = config;
  const allImages = config._allImages || findFiles(assetsDirAbsolute, imageExtensions);
  // Phase 1: Group by file size to avoid reading/hashing uniquely-sized files
  const sizeMap = new Map();
  for (const imagePath of allImages) {
    try {
      const size = fs.statSync(imagePath).size;
      if (!sizeMap.has(size)) sizeMap.set(size, []);
      sizeMap.get(size).push(imagePath);
    } catch {
      // Skip unreadable files
    }
  }

  // Phase 2: Only hash files that share the exact same byte size
  const hashMap = new Map();
  for (const files of sizeMap.values()) {
    if (files.length <= 1) continue;

    for (const imagePath of files) {
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
  }

  const issues = [];
  for (const [hash, files] of hashMap) {
    if (files.length > 1) {
      issues.push({ hash, files });
    }
  }

  return { ok: issues.length === 0, issues };
}
