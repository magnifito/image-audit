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

const VALID_REPORTERS = new Set(['text', 'json']);

/**
 * Exit codes: 0 = no issues, 1 = issues found, 2 = usage or runtime error.
 *
 * @param {string[]} args - process.argv.slice(2)
 * @param {{ exit?: Function, log?: Function, error?: Function, warn?: Function, write?: Function }} [io]
 */
export async function run(args, io = {}) {
  // Set exitCode instead of calling process.exit() so piped stdout is fully flushed
  const exit =
    io.exit ||
    ((code) => {
      process.exitCode = code;
    });
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
        // No default: an unset flag must not override the config file
        reporter: { type: 'string', short: 'r' },
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

  if (values.reporter !== undefined && !VALID_REPORTERS.has(values.reporter)) {
    error(`Invalid reporter: "${values.reporter}". Valid options: text, json\n\n${HELP}`);
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

  let lintResult;
  try {
    lintResult = await lint({ audits, ...values });
  } catch (err) {
    // Runtime errors (bad config, missing directory) must not look like "issues found"
    error(`Error: ${err.message}`);
    exit(2);
    return;
  }
  const { ok, results, warnings, config } = lintResult;

  // Scan warnings: full list in verbose mode, a hint otherwise
  if (warnings.length > 0) {
    if (config.verbose) {
      for (const w of warnings) {
        warn(`WARN: ${w}`);
      }
    } else {
      warn(`${warnings.length} scan warning(s) — rerun with --verbose to see them.`);
    }
  }

  // Select reporter from the resolved config (CLI flags > config file > defaults)
  let reporter;
  if (config.reporter === 'json') {
    const { createReporter } = await import('./reporters/json.js');
    reporter = createReporter({ write: io.write });
  } else {
    const { createReporter } = await import('./reporters/text.js');
    reporter = createReporter({
      noColor: config.noColor,
      verbose: config.verbose,
      log,
    });
  }

  for (const [name, result] of Object.entries(results)) {
    reporter.report(name, result);
  }

  reporter.summary();
  exit(ok ? 0 : 1);
}
