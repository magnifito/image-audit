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
  const dirCache = new Map();

  for (const ref of scanResult.references) {
    // De-duplicate by sourceFile + originalPath
    const key = `${ref.sourceFile}::${ref.originalPath}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const absolutePath = path.resolve(projectRoot, ref.imagePath);
    if (!existsExactCase(projectRoot, absolutePath, dirCache)) {
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

/**
 * Check that a path exists with the exact letter case of every segment below root.
 * macOS and Windows file systems ignore case, so fs.existsSync() alone would
 * pass "hero.png" for "Hero.png" — a link that breaks on a Linux deploy.
 *
 * @param {string} root - Absolute directory the check starts from
 * @param {string} absolutePath
 * @param {Map<string, Set<string> | null>} dirCache - Directory listings, reused across calls
 * @returns {boolean}
 */
function existsExactCase(root, absolutePath, dirCache) {
  if (!fs.existsSync(absolutePath)) return false;

  const rel = path.relative(root, absolutePath);
  // Outside the project root there is no known base to compare against
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return true;

  let dir = root;
  for (const segment of rel.split(path.sep)) {
    if (!dirCache.has(dir)) {
      let names = null;
      try {
        names = new Set(fs.readdirSync(dir));
      } catch {
        // Unreadable directory — cannot verify case
      }
      dirCache.set(dir, names);
    }
    const names = dirCache.get(dir);
    if (names && !names.has(segment)) return false;
    dir = path.join(dir, segment);
  }
  return true;
}
