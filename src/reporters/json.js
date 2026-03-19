/**
 * JSON reporter — buffers all results and emits a single JSON document at the end.
 */
export function createReporter() {
  const results = {};

  return {
    report(auditName, result) {
      results[auditName] = result;
    },

    summary() {
      const allOk = Object.values(results).every((r) => r.ok);
      process.stdout.write(JSON.stringify({ ok: allOk, audits: results }, null, 2) + '\n');
    },
  };
}
