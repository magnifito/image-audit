import fs from 'node:fs';
import path from 'node:path';
import { findFiles } from './find-files.js';
import { normalizePath } from './normalize-path.js';

/**
 * @typedef {Object} ImageReference
 * @property {string} sourceFile   - Project-relative source file path
 * @property {string} imagePath    - Normalized project-relative image path
 * @property {string} originalPath - The raw path as found in source
 * @property {number} lineNumber   - 1-based line number
 */

/**
 * Scan source files for image path references.
 *
 * @param {object} config - Resolved config
 * @returns {{ references: ImageReference[], warnings: string[] }}
 */
export function scanReferences(config) {
  const { srcDirAbsolute, projectRoot, sourceExtensions, imagePathPatterns } = config;
  const sourceFiles = findFiles(srcDirAbsolute, sourceExtensions);
  const references = [];
  const warnings = [];

  for (const filePath of sourceFiles) {
    const sourceFileRelative = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      warnings.push(`Error reading ${sourceFileRelative}: ${err.message}`);
      continue;
    }

    // Warn about glob usage that may affect reference detection
    if (content.includes('import.meta.glob') && content.includes('assets/images')) {
      warnings.push(
        `${sourceFileRelative}: uses import.meta.glob targeting assets/images — reference detection may be incomplete`
      );
    }

    for (const pattern of imagePathPatterns) {
      // Clone regex to reset lastIndex per file
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;

      while ((match = regex.exec(content)) !== null) {
        const rawPath = match[2];
        const { normalized, warning } = normalizePath(rawPath, sourceFileRelative, config);

        if (warning) warnings.push(warning);
        if (!normalized) continue;

        const lineNumber = content.substring(0, match.index).split('\n').length;

        references.push({
          sourceFile: sourceFileRelative,
          imagePath: normalized,
          originalPath: rawPath,
          lineNumber,
        });
      }
    }
  }

  return { references, warnings };
}
