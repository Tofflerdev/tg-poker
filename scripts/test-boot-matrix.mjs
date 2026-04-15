import { spawnSync } from 'child_process';
const cases = [
  { env: { NODE_ENV: 'production', ALLOW_DEV_AUTH: 'true',  BOT_TOKEN: 'x' }, expectExit: 1, expectStderrIncludes: 'ALLOW_DEV_AUTH=true is set in production' },
  { env: { NODE_ENV: 'production', ALLOW_DEV_AUTH: 'false', BOT_TOKEN: ''   }, expectExit: 1, expectStderrIncludes: 'BOT_TOKEN is empty in production' },
  { env: { NODE_ENV: 'production', ALLOW_DEV_AUTH: 'false', BOT_TOKEN: '   '}, expectExit: 1, expectStderrIncludes: 'BOT_TOKEN is empty in production' },
  { env: { NODE_ENV: 'development', ALLOW_DEV_AUTH: 'true', BOT_TOKEN: ''   }, expectExit: 0, expectStderrIncludes: '' },
];
let failed = 0;
for (const c of cases) {
  const res = spawnSync(
    process.execPath,
    ['-e', "import('./dist/server/middleware/auth.js').then(m => { m.assertSafeBootOrExit(); console.log('OK'); })"],
    { env: { ...process.env, ...c.env }, encoding: 'utf8' }
  );
  const ok = (res.status === c.expectExit) && (!c.expectStderrIncludes || res.stderr.includes(c.expectStderrIncludes));
  console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(c.env), '=> exit', res.status, 'stderr:', res.stderr.trim());
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
