import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.astro',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.cache',
]);

/**
 * Recursively find files matching given extensions.
 * @param {string} startPath - Absolute path to start scanning
 * @param {string[]} extensions - e.g. ['.astro', '.mdx']
 * @param {{ recursive?: boolean, ignoredDirs?: Iterable<string> }} [options]
 * @returns {string[]} Array of absolute file paths
 */
export function findFiles(
  startPath,
  extensions,
  { recursive = true, ignoredDirs = DEFAULT_IGNORED_DIRS } = {}
) {
  const extSet = new Set(extensions.map((e) => e.toLowerCase()));
  const ignoreSet = ignoredDirs instanceof Set ? ignoredDirs : new Set(ignoredDirs);
  const results = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // Silently skip inaccessible directories
      }
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (recursive && !ignoreSet.has(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        if (extSet.has(path.extname(entry.name).toLowerCase())) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(startPath);
  return results;
}
