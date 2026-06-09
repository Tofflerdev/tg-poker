import fs from 'fs';
import { runOracle } from './oracle.js';

/**
 * CLI: replay a recorded session and print oracle findings.
 *
 *   node dist/server/bot/runOracle.js sessions/session-<ts>.jsonl
 *
 * Exit code 2 when any finding is reported (handy for scripting), 0 otherwise.
 */
const file = process.argv[2];
if (!file) {
  console.error('usage: node dist/server/bot/runOracle.js <session.jsonl>');
  process.exit(1);
}

const text = fs.readFileSync(file, 'utf8');
const report = runOracle(text);

console.log(`Oracle: ${report.handsChecked} hand(s) checked, ${report.findings.length} finding(s).`);
const byCheck = new Map<string, number>();
for (const f of report.findings) {
  byCheck.set(f.check, (byCheck.get(f.check) ?? 0) + 1);
  console.log(`  [${f.check}] hand ${f.handId} (table ${f.tableId}): ${f.message}`);
}
if (report.findings.length > 0) {
  console.log('Summary:', Object.fromEntries(byCheck));
}
process.exit(report.findings.length > 0 ? 2 : 0);
