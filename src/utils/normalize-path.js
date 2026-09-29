import path from 'node:path';

/**
 * Convert a directory or file path to a clean project-relative POSIX path.
 * Accepts "./dir", "dir/", "dir\\sub" and absolute paths under projectRoot.
 *
 * @param {string} p
 * @param {string} [projectRoot]
 * @returns {string}
 */
function toProjectRelative(p, projectRoot) {
  let rel = p;
  if (projectRoot && path.isAbsolute(rel)) rel = path.relative(projectRoot, rel);
  rel = path.posix.normalize(rel.replace(/\\/g, '/'));
  return rel.length > 1 ? rel.replace(/\/+$/, '') : rel;
}

/**
 * Normalize an image path reference to a project-relative POSIX path.
 *
 * @param {string} rawPath - The path as found in source code
 * @param {string} sourceFileRelative - Project-relative POSIX path of the source file
 * @param {object} config - Resolved config
 * @returns {{ normalized: string | null, warning: string | null }}
 */
export function normalizePath(rawPath, sourceFileRelative, config) {
  const assetsDir = toProjectRelative(config.assetsDir, config.projectRoot);
  let normalized = rawPath;
  let aliased = false;

  // Apply path aliases from config
  if (config.pathAliases) {
    for (const [alias, replacement] of Object.entries(config.pathAliases)) {
      if (normalized.startsWith(alias)) {
        normalized = replacement + normalized.slice(alias.length);
        aliased = true;
        break;
      }
    }
  }

  if (aliased) {
    // Alias targets are project-relative, never relative to the source file
    normalized = toProjectRelative(normalized, config.projectRoot);
  } else if (normalized.startsWith('../') || normalized.startsWith('./')) {
    // Handle relative paths (e.g. ../assets/images/...)
    normalized = path.normalize(path.join(path.dirname(sourceFileRelative), normalized));
  }

  // Ensure POSIX separators
  normalized = normalized.replace(/\\/g, '/');

  // Strip query parameters and hash fragments (e.g. ?v=1, ?url, #icon)
  const queryOrHashIndex = normalized.search(/[?#]/);
  if (queryOrHashIndex !== -1) {
    normalized = normalized.slice(0, queryOrHashIndex);
  }

  const isWithinAssets = normalized === assetsDir || normalized.startsWith(`${assetsDir}/`);

  // Check if it resolves within the assets dir
  if (!isWithinAssets) {
    // Could be an external URL or unresolvable path
    if (!path.isAbsolute(rawPath) && rawPath.includes('/')) {
      let resolvedRelative = path
        .normalize(path.join(path.dirname(sourceFileRelative), rawPath))
        .replace(/\\/g, '/');
      const cleanIdx = resolvedRelative.search(/[?#]/);
      if (cleanIdx !== -1) resolvedRelative = resolvedRelative.slice(0, cleanIdx);

      if (resolvedRelative === assetsDir || resolvedRelative.startsWith(`${assetsDir}/`)) {
        return { normalized: resolvedRelative, warning: null };
      }
    }
    return {
      normalized: null,
      warning: `Path normalization incomplete for: ${rawPath} in ${sourceFileRelative}`,
    };
  }

  return { normalized, warning: null };
}
