// Disposable local PostgreSQL fixture runner; never reads application DB credentials.
import { mkdtempSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const directory = mkdtempSync(join(tmpdir(), 'ims-report-pg-'));
const bin = process.env.POSTGRES_BIN ?? '/usr/lib/postgresql/12/bin';
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
};
run(join(bin, 'initdb'), ['-D', directory, '-A', 'trust', '--no-locale', '-E', 'UTF8']);
let started = false;
try {
  run(join(bin, 'pg_ctl'), [
    '-D',
    directory,
    '-l',
    join(directory, 'server.log'),
    '-o',
    `-p 55439 -k ${directory} -h 127.0.0.1`,
    'start',
  ]);
  started = true;
  run('npm', ['test', '--', 'tests/reports.test.ts'], {
    env: {
      ...process.env,
      TEST_REPORT_DATABASE_URL: `postgresql://${userInfo().username}@127.0.0.1:55439/postgres`,
    },
  });
} finally {
  if (started) run(join(bin, 'pg_ctl'), ['-D', directory, '-m', 'fast', 'stop']);
}
