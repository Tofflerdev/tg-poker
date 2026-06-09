import fs from 'fs';
import path from 'path';
import { parseSession, checkHand } from './oracle.js';
import { computeStats } from './sessionStats.js';
import { buildReportMarkdown } from './reportBuilder.js';

/**
 * CLI: turn a recorded session into a Reviewer report scaffold.
 *
 *   node dist/server/bot/generateReport.js sessions/session-<ts>.jsonl [reports/]
 *
 * Writes reports/report-<ts>.md with objective Rules / Balance / Stability
 * sections pre-filled; Claude completes the qualitative "Reviewer notes" pass.
 */
const file = process.argv[2];
const outDir = process.argv[3] ?? 'reports';
if (!file) {
  console.error('usage: node dist/server/bot/generateReport.js <session.jsonl> [outDir]');
  process.exit(1);
}

const text = fs.readFileSync(file, 'utf8');
const parsed = parseSession(text);
const findings = [...parsed.findings];
for (const { hand } of parsed.hands) findings.push(...checkHand(hand));
const stats = computeStats(parsed);

const md = buildReportMarkdown({ file, handsChecked: parsed.hands.length, findings, stats });

fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outPath = path.join(outDir, `report-${stamp}.md`);
fs.writeFileSync(outPath, md, 'utf8');

console.log(`Report written to ${outPath}`);
console.log(`  ${stats.handsTotal} hands · ${findings.filter((f) => f.check !== 'parse').length} rules finding(s) · ${stats.humans}H/${stats.bots}B`);
