import path from 'node:path';
import { findFiles } from '../utils/find-files.js';

/**
 * Find unused images — files on disk that are not referenced in any source file.
 *
 * @param {object} config - Resolved config
 * @param {{ references: import('../utils/scan-references.js').ImageReference[] }} scanResult
 * @returns {{ ok: boolean, issues: Array<{ imagePath: string }> }}
 */
export function auditUnused(config, scanResult) {
  const { assetsDirAbsolute, projectRoot, imageExtensions } = config;

  const referencedPaths = new Set(scanResult.references.map((r) => r.imagePath));

  const allDiskImages = findFiles(assetsDirAbsolute, imageExtensions).map((p) =>
    path.relative(projectRoot, p).replace(/\\/g, '/')
  );

  const issues = allDiskImages
    .filter((diskImage) => !referencedPaths.has(diskImage))
    .map((imagePath) => ({ imagePath }));

  return { ok: issues.length === 0, issues };
}
