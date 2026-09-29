const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const NO_COLORS = Object.fromEntries(Object.keys(COLORS).map((k) => [k, '']));

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}M`;
}

/**
 * @param {{ noColor?: boolean, verbose?: boolean, log?: Function }} [options]
 */
export function createReporter({ noColor = false, verbose = false, log = console.log } = {}) {
  const c = noColor ? NO_COLORS : COLORS;
  const allResults = {};

  return {
    report(auditName, result) {
      allResults[auditName] = result;

      const formatters = {
        broken: () => reportBroken(c, result, log),
        unused: () => reportUnused(c, result, log),
        dupes: () => reportDupes(c, result, log),
        compat: () => reportCompat(c, result, verbose, log),
        overuse: () => reportOveruse(c, result, log),
      };

      const formatter = formatters[auditName];
      if (formatter) formatter();
    },

    summary() {
      const allOk = Object.values(allResults).every((r) => r.ok);
      if (allOk && Object.keys(allResults).length > 1) {
        log(`\n${c.bright}${c.green}All audits passed.${c.reset}`);
      }
    },
  };
}

function reportBroken(c, result, log) {
  if (result.issues.length === 0) {
    log(`${c.bright}${c.green}No broken image references found.${c.reset}`);
    return;
  }

  const grouped = groupBy(result.issues, 'sourceFile');
  const fileCount = Object.keys(grouped).length;
  log(
    `\n${c.bright}${c.red}Found ${result.issues.length} broken image link(s) in ${fileCount} file(s):${c.reset}`
  );

  for (const [sourceFile, links] of Object.entries(grouped)) {
    log(`\n  ${c.bright}${c.cyan}${sourceFile}${c.reset}`);
    for (const link of links) {
      log(`    ${c.cyan}${link.sourceFile}:${link.lineNumber}${c.reset}`);
      log(`      ${c.yellow}${link.imagePath}${c.reset}`);
    }
  }
}

function reportUnused(c, result, log) {
  if (result.issues.length === 0) {
    log(`${c.bright}${c.green}No unused images found.${c.reset}`);
    return;
  }

  log(
    `\n${c.bright}${c.yellow}Found ${result.issues.length} potentially unused image(s):${c.reset}`
  );
  for (const issue of result.issues) {
    log(`  ${c.magenta}${issue.imagePath}${c.reset}`);
  }
}

function reportDupes(c, result, log) {
  if (result.issues.length === 0) {
    log(`${c.bright}${c.green}No duplicate images found.${c.reset}`);
    return;
  }

  log(
    `\n${c.bright}${c.red}Found ${result.issues.length} set(s) of duplicate images:${c.reset}`
  );
  for (const issue of result.issues) {
    log(
      `\n  ${c.yellow}Duplicate set (Hash: ${issue.hash.substring(0, 12)}...):${c.reset}`
    );
    for (const file of issue.files) {
      log(`    - ${c.magenta}${file}${c.reset}`);
    }
  }
}

function reportCompat(c, result, verbose, log) {
  const { entries, stats } = result;

  if (verbose && entries) {
    log(`${c.bright}Image compatibility report (${stats.audited} checked):${c.reset}\n`);

    for (const entry of entries) {
      const statusTag = {
        ok: `${c.green}[OK]${c.reset}`,
        ok_equivalent: `${c.green}[OK~]${c.reset}`,
        mismatch: `${c.red}[MM!]${c.reset}`,
        unknown_binary: `${c.yellow}[BIN?]${c.reset}`,
        error: `${c.red}[ERR!]${c.reset}`,
      }[entry.status];

      const parts = [
        statusTag,
        entry.detectedExt || '?',
        entry.detectedMime || '?',
        formatSize(entry.fileSize),
      ];

      if (entry.width && entry.height) {
        parts.push(`${entry.width}x${entry.height}`);
        if (entry.aspectRatio) parts.push(entry.aspectRatio);
      }

      if (entry.errorMessage) parts.push(entry.errorMessage);

      log(`  ${c.cyan}${entry.imagePath}${c.reset} ${parts.join(' | ')}`);
    }
    log();
  }

  if (result.issues.length === 0) {
    log(
      `${c.bright}${c.green}All ${stats.audited} image(s) have compatible extensions and binary formats.${c.reset}`
    );
  } else {
    log(
      `\n${c.bright}${c.red}Found ${result.issues.length} image(s) with issues out of ${stats.audited} checked:${c.reset}`
    );
    for (const issue of result.issues) {
      const tag = issue.type === 'mismatch' ? '[MISMATCH]' : issue.type === 'error' ? '[ERROR]' : '[UNKNOWN]';
      const detail =
        issue.type === 'mismatch'
          ? `declared .${issue.declaredExt}, detected .${issue.detectedExt} (${issue.detectedMime})`
          : issue.errorMessage || 'Could not detect binary format';
      log(`  ${c.red}${tag}${c.reset} ${c.cyan}${issue.imagePath}${c.reset} — ${detail}`);
    }
  }
}

function reportOveruse(c, result, log) {
  if (result.issues.length === 0) {
    log(`${c.bright}${c.green}No overused images found.${c.reset}`);
    return;
  }

  log(
    `\n${c.bright}${c.yellow}Found ${result.issues.length} image(s) referenced multiple times:${c.reset}`
  );
  for (const issue of result.issues) {
    log(
      `\n  ${c.bright}${c.magenta}${issue.originalPath}${c.reset} — ${issue.usages.length} references:`
    );
    for (const usage of issue.usages) {
      log(`    ${c.cyan}${usage.sourceFile}:${usage.lineNumber}${c.reset}`);
    }
  }
}

function groupBy(items, key) {
  const groups = {};
  for (const item of items) {
    const k = item[key];
    if (!groups[k]) groups[k] = [];
    groups[k].push(item);
  }
  return groups;
}
