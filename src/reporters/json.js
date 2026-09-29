/**
 * JSON reporter — buffers all results and emits a single JSON document at the end.
 */
export function createReporter({ write = (s) => process.stdout.write(s) } = {}) {
  const results = {};

  return {
    report(auditName, result) {
      results[auditName] = result;
    },

    summary() {
      const allOk = Object.values(results).every((r) => r.ok);
      write(JSON.stringify({ ok: allOk, audits: results }, null, 2) + '\n');
    },
  };
}
