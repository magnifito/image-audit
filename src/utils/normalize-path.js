import path from 'node:path';

/**
 * Normalize an image path reference to a project-relative POSIX path.
 *
 * @param {string} rawPath - The path as found in source code
 * @param {string} sourceFileRelative - Project-relative POSIX path of the source file
 * @param {object} config - Resolved config
 * @returns {{ normalized: string | null, warning: string | null }}
 */
export function normalizePath(rawPath, sourceFileRelative, config) {
  const { assetsDir } = config;
  let normalized = rawPath;

  // Apply path aliases from config
  if (config.pathAliases) {
    for (const [alias, replacement] of Object.entries(config.pathAliases)) {
      if (normalized.startsWith(alias)) {
        normalized = replacement + normalized.slice(alias.length);
        break;
      }
    }
  }

  // Handle relative paths (e.g. ../assets/images/...)
  if (normalized.startsWith('../') || normalized.startsWith('./')) {
    normalized = path.normalize(path.join(path.dirname(sourceFileRelative), normalized));
  }

  // Ensure POSIX separators
  normalized = normalized.replace(/\\/g, '/');

  // Check if it resolves within the assets dir
  if (!normalized.startsWith(assetsDir + '/') && !normalized.startsWith(assetsDir)) {
    // Could be an external URL or unresolvable path
    if (!path.isAbsolute(rawPath) && rawPath.includes('/')) {
      const resolvedRelative = path
        .normalize(path.join(path.dirname(sourceFileRelative), rawPath))
        .replace(/\\/g, '/');
      if (resolvedRelative.startsWith(assetsDir)) {
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
