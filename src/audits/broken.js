import fs from 'node:fs';
import path from 'node:path';

/**
 * Find broken image references — paths referenced in source that don't exist on disk.
 *
 * @param {object} config - Resolved config
 * @param {{ references: import('../utils/scan-references.js').ImageReference[] }} scanResult
 * @returns {{ ok: boolean, issues: Array<{ sourceFile: string, imagePath: string, resolved: string, lineNumber: number }> }}
 */
export function auditBroken(config, scanResult) {
  const { projectRoot } = config;
  const seen = new Set();
  const issues = [];

  for (const ref of scanResult.references) {
    // De-duplicate by sourceFile + originalPath
    const key = `${ref.sourceFile}::${ref.originalPath}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const absolutePath = path.resolve(projectRoot, ref.imagePath);
    if (!fs.existsSync(absolutePath)) {
      issues.push({
        sourceFile: ref.sourceFile,
        imagePath: ref.originalPath,
        resolved: ref.imagePath,
        lineNumber: ref.lineNumber,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
