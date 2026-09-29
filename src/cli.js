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
 * @param {{ exit?: Function, log?: Function, error?: Function, warn?: Function }} [io]
 */
export async function run(args, io = {}) {
  const exit = io.exit || process.exit;
  const log = io.log || console.log;
  const error = io.error || console.error;
  const warn = io.warn || console.warn;

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
    error(`Error: ${err.message}\n\n${HELP}`);
    exit(2);
    return;
  }

  const { values, positionals } = parsed;

  if (values.help) {
    log(HELP);
    return;
  }

  if (values.version) {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    log(pkg.version);
    return;
  }

  const VALID_REPORTERS = new Set(['text', 'json']);
  const reporterName = values.reporter;
  if (!VALID_REPORTERS.has(reporterName)) {
    error(`Invalid reporter: "${reporterName}". Valid options: text, json\n\n${HELP}`);
    exit(2);
    return;
  }

  const rawSubcommands = positionals.length > 0 ? positionals : ['all'];

  for (const cmd of rawSubcommands) {
    if (cmd !== 'all' && !VALID_AUDITS.has(cmd)) {
      error(`Unknown command: ${cmd}\n\n${HELP}`);
      exit(2);
      return;
    }
  }

  const audits = rawSubcommands.includes('all')
    ? ALL_AUDITS
    : Array.from(new Set(rawSubcommands.map((cmd) => (cmd === 'duplicates' ? 'dupes' : cmd))));

  // Run lint
  const { ok, results, warnings } = await lint({ audits, ...values });

  // Print scan warnings in verbose mode
  if (values.verbose && warnings.length > 0) {
    for (const w of warnings) {
      warn(`WARN: ${w}`);
    }
  }

  // Select reporter
  let reporter;
  if (reporterName === 'json') {
    const { createReporter } = await import('./reporters/json.js');
    reporter = createReporter({ write: io.write });
  } else {
    const { createReporter } = await import('./reporters/text.js');
    reporter = createReporter({
      noColor: values['no-color'],
      verbose: values.verbose,
      log,
    });
  }

  for (const [name, result] of Object.entries(results)) {
    reporter.report(name, result);
  }

  reporter.summary();
  exit(ok ? 0 : 1);
}
