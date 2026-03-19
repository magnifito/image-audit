import fs from 'node:fs';
import path from 'node:path';

/**
 * Recursively find files matching given extensions.
 * @param {string} startPath - Absolute path to start scanning
 * @param {string[]} extensions - e.g. ['.astro', '.mdx']
 * @param {{ recursive?: boolean }} [options]
 * @returns {string[]} Array of absolute file paths
 */
export function findFiles(startPath, extensions, { recursive = true } = {}) {
  const extSet = new Set(extensions.map(e => e.toLowerCase()));
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
      if (entry.isDirectory() && recursive) {
        walk(fullPath);
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
