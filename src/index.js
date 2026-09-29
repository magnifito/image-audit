export { auditBroken } from './audits/broken.js';
export { auditCompat } from './audits/compat.js';
export { auditDuplicates } from './audits/duplicates.js';
export { auditOveruse } from './audits/overuse.js';
export { auditUnused } from './audits/unused.js';
export { loadConfig } from './config.js';
export { findFiles } from './utils/find-files.js';
export { inspectImage, WEB_IMAGE_EXTS } from './utils/inspect-image.js';
export { normalizePath } from './utils/normalize-path.js';
export { scanReferences } from './utils/scan-references.js';

import fs from 'node:fs';
import { auditBroken } from './audits/broken.js';
import { auditCompat } from './audits/compat.js';
import { auditDuplicates } from './audits/duplicates.js';
import { auditOveruse } from './audits/overuse.js';
import { auditUnused } from './audits/unused.js';
import { loadConfig } from './config.js';
import { scanReferences } from './utils/scan-references.js';

const ALL_AUDITS = ['broken', 'unused', 'dupes', 'compat', 'overuse'];

const NEEDS_SCAN = new Set(['broken', 'unused', 'overuse']);

const NEEDS_ASSETS = new Set(['unused', 'dupes', 'compat']);

const AUDIT_FNS = {
  broken: auditBroken,
  unused: auditUnused,
  dupes: auditDuplicates,
  compat: auditCompat,
  overuse: auditOveruse,
};

/**
 * Run image audits programmatically.
 *
 * @param {object} [options] - Config overrides + audit selection.
 * @param {string[]} [options.audits] - Which audits to run (default: all).
 * @returns {Promise<{ ok: boolean, results: Record<string, object>, warnings: string[], config: object }>}
 * @throws {Error} When the config file is missing or invalid, or a required directory does not exist.
 */
export async function lint(options = {}) {
  const { audits = ALL_AUDITS, ...configOverrides } = options;

  const config = await loadConfig(configOverrides);

  const normalizedAudits = audits.map((a) => (a === 'duplicates' ? 'dupes' : a));

  // A missing directory would yield zero files and a false "all passed"
  if (normalizedAudits.some((a) => NEEDS_SCAN.has(a))) {
    assertDirectory(config.srcDirAbsolute, 'Source');
  }
  if (normalizedAudits.some((a) => NEEDS_ASSETS.has(a))) {
    assertDirectory(config.assetsDirAbsolute, 'Assets');
  }

  const needsScan = normalizedAudits.some((a) => NEEDS_SCAN.has(a));
  const scanResult = needsScan ? scanReferences(config) : null;

  const results = {};
  for (const name of normalizedAudits) {
    const fn = AUDIT_FNS[name];
    if (!fn) throw new Error(`Unknown audit: "${name}"`);
    results[name] = NEEDS_SCAN.has(name) ? await fn(config, scanResult) : await fn(config);
  }

  const ok = Object.values(results).every((r) => r.ok);
  return { ok, results, warnings: scanResult?.warnings ?? [], config };
}

function assertDirectory(dir, label) {
  let isDir = false;
  try {
    isDir = fs.statSync(dir).isDirectory();
  } catch {
    // Missing or unreadable — reported below
  }
  if (!isDir) throw new Error(`${label} directory not found: ${dir}`);
}
