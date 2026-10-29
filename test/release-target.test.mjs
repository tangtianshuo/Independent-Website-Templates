import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('release metadata selects an explicit independent template and rejects version drift', () => {
  const directory = mkdtempSync(join(tmpdir(), 'template-target-'));
  try {
    writeFileSync(join(directory, 'release-target.json'), JSON.stringify({ id: 'fireguard', version: '1.0.0' }));
    const script = resolve('.github/scripts/release.py');
    const run = (ref, event = 'push') => spawnSync('python3', [script], { cwd: directory,
      encoding: 'utf8', env: { ...process.env, GITHUB_REF: ref, GITHUB_EVENT_NAME: event, GITHUB_OUTPUT: '' } });
    const release = run('refs/heads/release/v1.0.0');
    assert.equal(release.status, 0, release.stderr);
    assert.match(release.stdout, /^template_id=fireguard$/m);
    assert.match(release.stdout, /^version=1.0.0$/m);
    assert.match(release.stdout, /^publish=true$/m);
    const master = run('refs/heads/master');
    assert.equal(master.status, 0, master.stderr);
    assert.match(master.stdout, /^publish=false$/m);
    assert.match(master.stdout, /^template_id=fireguard$/m);
    assert.match(run('refs/heads/release/v1.0.0', 'workflow_dispatch').stdout, /^publish=false$/m);
    assert.notEqual(run('refs/heads/release/v1.0.1').status, 0);
    assert.notEqual(run('refs/tags/aeroframe-v1.0.0').status, 0, 'legacy AeroFrame tags cannot publish FireGuard');
    for (const id of ['../aeroframe', 'UPPERCASE', 'fireguard;echo']) {
      writeFileSync(join(directory, 'release-target.json'), JSON.stringify({ id, version: '1.0.0' }));
      assert.notEqual(run('refs/heads/release/v1.0.0').status, 0);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
