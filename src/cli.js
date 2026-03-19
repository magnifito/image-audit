import { parseArgs } from 'node:util';
import { lint } from './index.js';

const VALID_AUDITS = new Set(['broken', 'unused', 'dupes', 'duplicates', 'compat', 'overuse']);
const ALL_AUDITS = ['broken', 'unused', 'dupes', 'compat', 'overuse'];

const HELP = `
Usage: image-audit <command> [options]

Commands:
  broken       Find broken image references in source files
  unused       Find unused images in assets directory
  dupes        Find duplicate images by content hash
  compat       Verify file extensions match binary format
  overuse      Find images referenced in multiple source files
  all          Run all audits

Options:
  -c, --config <path>   Config file path (default: image-audit.config.js)
  -a, --assets <dir>    Assets directory (default: src/assets/images)
  -s, --src <dir>       Source files root (default: src)
  -r, --reporter <name> Output format: text | json (default: text)
      --no-color        Disable colored output
      --verbose         Verbose output
  -h, --help            Show this help
  -v, --version         Show version
`.trim();

/**
 * @param {string[]} args - process.argv.slice(2)
 */
export async function run(args) {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        config: { type: 'string', short: 'c' },
        assets: { type: 'string', short: 'a' },
        src: { type: 'string', short: 's' },
        reporter: { type: 'string', short: 'r', default: 'text' },
        'no-color': { type: 'boolean', default: false },
        verbose: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    });
  } catch (err) {
    console.error(`Error: ${err.message}\n\n${HELP}`);
    process.exit(2);
  }

  const { values, positionals } = parsed;

  if (values.help) {
    console.log(HELP);
    return;
  }

  if (values.version) {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    console.log(pkg.version);
    return;
  }

  const subcommand = positionals[0] || 'all';

  if (subcommand !== 'all' && !VALID_AUDITS.has(subcommand)) {
    console.error(`Unknown command: ${subcommand}\n\n${HELP}`);
    process.exit(2);
  }

  const audits =
    subcommand === 'all'
      ? ALL_AUDITS
      : [subcommand === 'duplicates' ? 'dupes' : subcommand];

  // Run lint
  const { ok, results, warnings } = await lint({ audits, ...values });

  // Print scan warnings in verbose mode
  if (values.verbose && warnings.length > 0) {
    for (const w of warnings) {
      console.warn(`WARN: ${w}`);
    }
  }

  // Select reporter
  const reporterName = values.reporter || 'text';
  let reporter;
  if (reporterName === 'json') {
    const { createReporter } = await import('./reporters/json.js');
    reporter = createReporter();
  } else {
    const { createReporter } = await import('./reporters/text.js');
    reporter = createReporter({ noColor: values['no-color'], verbose: values.verbose });
  }

  for (const [name, result] of Object.entries(results)) {
    reporter.report(name, result);
  }

  reporter.summary();
  process.exit(ok ? 0 : 1);
}
