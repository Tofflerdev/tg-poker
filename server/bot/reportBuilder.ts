import type { OracleFinding } from './oracle.js';
import type { SessionStats } from './sessionStats.js';

/**
 * Pure builder for the Reviewer report scaffold. Fills the three focus sections
 * (Rules / Balance-gameplay / Stability) with objective data; the qualitative
 * pass is left to the reviewer (Claude) under "Reviewer notes".
 */
export interface ReportInput {
  file: string;
  handsChecked: number;
  findings: OracleFinding[];
  stats: SessionStats;
  generatedAt?: Date;
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return 'unknown';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((100 * n) / d)}%` : '—';
}

export function buildReportMarkdown(input: ReportInput): string {
  const { file, handsChecked, findings, stats } = input;
  const now = (input.generatedAt ?? new Date()).toISOString();
  const out: string[] = [];

  out.push(`# Playtest Session Report`);
  out.push('');
  out.push(`**Generated:** ${now}`);
  out.push(`**Session file:** \`${file}\``);
  out.push(`**Hands:** ${stats.handsTotal} · **Duration:** ${fmtDuration(stats.durationMs)} · **Players:** ${stats.humans} human / ${stats.bots} bot`);
  const tables = Object.entries(stats.handsByTable).map(([t, n]) => `${t} (${n})`).join(', ');
  out.push(`**Tables:** ${tables || '—'}`);
  out.push('');

  // ---- 1. Rules correctness ----
  out.push(`## 1. Rules correctness (oracle)`);
  out.push('');
  const rules = findings.filter((f) => f.check !== 'parse');
  if (rules.length === 0) {
    out.push(`✅ No invariant violations across ${handsChecked} checked hand(s).`);
  } else {
    const byCheck = new Map<string, OracleFinding[]>();
    rules.forEach((f) => byCheck.set(f.check, [...(byCheck.get(f.check) ?? []), f]));
    out.push(`⚠️ ${rules.length} finding(s) across ${handsChecked} hand(s):`);
    out.push('');
    for (const [check, list] of byCheck) {
      out.push(`### ${check} (${list.length})`);
      list.slice(0, 50).forEach((f) => out.push(`- hand \`${f.handId}\` (table \`${f.tableId}\`): ${f.message}`));
      if (list.length > 50) out.push(`- …and ${list.length - 50} more`);
      out.push('');
    }
  }
  out.push('');

  // ---- 2. Balance / gameplay ----
  out.push(`## 2. Balance / gameplay`);
  out.push('');
  out.push(`- Showdowns: ${stats.showdownHands} · Win-by-fold: ${stats.winByFoldHands} · Side-pot hands: ${stats.sidePotHands} · All-in hands: ${stats.allInHands}`);
  out.push(`- Average pot: ${stats.avgPot} · Biggest pot: ${stats.biggestPot}`);
  const a = stats.actionCounts;
  out.push(`- Actions — fold ${a.fold}, check ${a.check}, call ${a.call}, bet ${a.bet}, raise ${a.raise}, all-in ${a.allin}`);
  out.push('');
  out.push(`| Player | Type | Hands | VPIP | Won | Net | All-ins |`);
  out.push(`|---|---|---:|---:|---:|---:|---:|`);
  for (const p of stats.players) {
    out.push(`| \`${p.id}\` | ${p.isBot ? 'bot' : 'human'} | ${p.handsSeen} | ${pct(p.handsVoluntary, p.handsSeen)} | ${p.handsWon} | ${p.net >= 0 ? '+' : ''}${p.net} | ${p.allIns} |`);
  }
  out.push('');

  // ---- 3. Stability ----
  out.push(`## 3. Stability`);
  out.push('');
  const parseErrors = findings.filter((f) => f.check === 'parse');
  out.push(`- Malformed/parse errors in session log: ${parseErrors.length}`);
  parseErrors.slice(0, 20).forEach((f) => out.push(`  - ${f.message}`));
  out.push(`- Crashes / disconnects / turn-timer anomalies: _check server logs — not derivable from the session file_`);
  out.push('');

  // ---- Reviewer notes ----
  out.push(`## Reviewer notes (Claude)`);
  out.push('');
  out.push(`> _To be completed by the reviewer after reading the JSONL + engine code._`);
  out.push(`> Prioritise: (1) any rules-correctness finding above, (2) balance/gameplay outliers,`);
  out.push(`> (3) stability concerns. Tie each recommendation to a specific hand id or metric.`);
  out.push('');

  return out.join('\n');
}
