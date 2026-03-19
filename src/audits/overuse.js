/**
 * Find overused images — images referenced in multiple source locations.
 *
 * @param {object} config - Resolved config
 * @param {{ references: import('../utils/scan-references.js').ImageReference[] }} scanResult
 * @returns {{ ok: boolean, issues: Array<{ imagePath: string, originalPath: string, usages: Array<{ sourceFile: string, lineNumber: number }> }> }}
 */
export function auditOveruse(config, scanResult) {
  const threshold = config.overuseThreshold ?? 1;
  const countMap = new Map();

  for (const ref of scanResult.references) {
    if (!countMap.has(ref.imagePath)) countMap.set(ref.imagePath, []);
    countMap.get(ref.imagePath).push({
      sourceFile: ref.sourceFile,
      lineNumber: ref.lineNumber,
      originalPath: ref.originalPath,
    });
  }

  const issues = [];
  for (const [imagePath, usages] of countMap) {
    if (usages.length > threshold) {
      issues.push({
        imagePath,
        originalPath: usages[0].originalPath,
        usages: usages.map((u) => ({ sourceFile: u.sourceFile, lineNumber: u.lineNumber })),
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
