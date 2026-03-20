export { loadConfig } from './config.js';
export { scanReferences } from './utils/scan-references.js';
export { findFiles } from './utils/find-files.js';
export { normalizePath } from './utils/normalize-path.js';
export { inspectImage, WEB_IMAGE_EXTS } from './utils/inspect-image.js';
export { auditBroken } from './audits/broken.js';
export { auditUnused } from './audits/unused.js';
export { auditDuplicates } from './audits/duplicates.js';
export { auditCompat } from './audits/compat.js';
export { auditOveruse } from './audits/overuse.js';

import { loadConfig } from './config.js';
import { scanReferences } from './utils/scan-references.js';
import { auditBroken } from './audits/broken.js';
import { auditUnused } from './audits/unused.js';
import { auditDuplicates } from './audits/duplicates.js';
import { auditCompat } from './audits/compat.js';
import { auditOveruse } from './audits/overuse.js';

const ALL_AUDITS = ['broken', 'unused', 'dupes', 'compat', 'overuse'];

const NEEDS_SCAN = new Set(['broken', 'unused', 'overuse']);

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
 * @returns {Promise<{ ok: boolean, results: Record<string, object>, warnings: string[] }>}
 */
export async function lint(options = {}) {
  const { audits = ALL_AUDITS, ...configOverrides } = options;

  const config = await loadConfig(configOverrides);

  const needsScan = audits.some((a) => NEEDS_SCAN.has(a));
  const scanResult = needsScan ? scanReferences(config) : null;

  const results = {};
  for (const name of audits) {
    const fn = AUDIT_FNS[name];
    if (!fn) throw new Error(`Unknown audit: "${name}"`);
    results[name] = NEEDS_SCAN.has(name)
      ? await fn(config, scanResult)
      : await fn(config);
  }

  const ok = Object.values(results).every((r) => r.ok);
  return { ok, results, warnings: scanResult?.warnings ?? [] };
}
