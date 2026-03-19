import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULTS = {
  projectRoot: process.cwd(),
  srcDir: 'src',
  assetsDir: 'src/assets/images',
  sourceExtensions: ['.astro', '.mdx'],
  imageExtensions: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif'],
  imagePathPatterns: [/(['"`])((~\/assets\/images\/|\/assets\/images\/)[^'"`]+)\1/g],
  pathAliases: {
    '~/assets/images/': 'src/assets/images/',
    '/assets/images/': 'src/assets/images/',
  },
  overuseThreshold: 1,
  reporter: 'text',
  noColor: false,
  verbose: false,
};

/**
 * Load and merge config from defaults, config file, and CLI options.
 * Priority: defaults < config file < CLI options
 *
 * @param {object} [cliOptions]
 * @returns {Promise<object>} Resolved, frozen config
 */
export async function loadConfig(cliOptions = {}) {
  const projectRoot = path.resolve(cliOptions.projectRoot || process.cwd());

  // 1. Try config file
  let fileConfig = {};
  const configPath = cliOptions.config
    ? path.resolve(projectRoot, cliOptions.config)
    : path.join(projectRoot, 'image-audit.config.js');

  if (fs.existsSync(configPath)) {
    try {
      const mod = await import(pathToFileURL(configPath).href);
      fileConfig = mod.default || mod;
    } catch (err) {
      throw new Error(`Failed to load config file ${configPath}: ${err.message}`);
    }
  } else if (!cliOptions.config) {
    // 2. Fall back to package.json#imageAudit
    const pkgPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        fileConfig = pkg.imageAudit || {};
      } catch {
        // Ignore malformed package.json
      }
    }
  }

  // 3. Merge
  const merged = { ...DEFAULTS, ...fileConfig };
  merged.projectRoot = projectRoot;

  // CLI overrides
  if (cliOptions.assets) merged.assetsDir = cliOptions.assets;
  if (cliOptions.src) merged.srcDir = cliOptions.src;
  if (cliOptions.reporter) merged.reporter = cliOptions.reporter;
  if (cliOptions.noColor || cliOptions['no-color']) merged.noColor = true;
  if (cliOptions.verbose) merged.verbose = true;

  // Respect NO_COLOR env convention
  if (process.env.NO_COLOR !== undefined) merged.noColor = true;

  // Resolve absolute paths
  merged.srcDirAbsolute = path.resolve(merged.projectRoot, merged.srcDir);
  merged.assetsDirAbsolute = path.resolve(merged.projectRoot, merged.assetsDir);

  // Ensure imagePathPatterns are RegExp instances (config file may provide strings)
  merged.imagePathPatterns = merged.imagePathPatterns.map((p) =>
    p instanceof RegExp ? p : new RegExp(p, 'g')
  );

  return Object.freeze(merged);
}
