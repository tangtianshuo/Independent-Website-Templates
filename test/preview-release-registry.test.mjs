import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
let appendPreviewRelease;
try { ({ appendPreviewRelease } = await import('../scripts/preview-release-registry.mjs')); } catch {}
const record = { id:'aeroframe', version:'1.0.4', manifestChecksum:`sha256:${'1'.repeat(64)}`, sourceCommit:'a'.repeat(40), bundleDigest:`sha256:${'2'.repeat(64)}`, artifactDigest:`sha256:${'3'.repeat(64)}`, bundlePath:'templates/aeroframe/1.0.4', adapterVersion:'1', protocolVersion:1, status:'available' };
test('checkout-relative immutable append is import-safe, idempotent and rejects conflict', async t => {
 assert.equal(typeof appendPreviewRelease, 'function');
 const registryRoot = await mkdtemp(join(tmpdir(),'preview-registry-')); t.after(()=>rm(registryRoot,{recursive:true,force:true}));
 execFileSync('git',['init',registryRoot],{stdio:'ignore'});
 assert.equal(await appendPreviewRelease({registryRoot,record}),'written');
 assert.match(execFileSync('git',['-C',registryRoot,'status','--porcelain','--untracked-files=all'],{encoding:'utf8'}),/preview\/index.json/);
 const path=join(registryRoot,'preview/index.json'); const before=await readFile(path,'utf8');
 assert.equal(await appendPreviewRelease({registryRoot,record:Object.fromEntries(Object.entries(record).reverse())}),'unchanged');
 await assert.rejects(appendPreviewRelease({registryRoot,record:{...record,bundleDigest:`sha256:${'b'.repeat(64)}`}}),/conflict/i);
 assert.equal(await readFile(path,'utf8'),before);
});
test('concurrent append retains both records', async t=>{
 assert.equal(typeof appendPreviewRelease,'function');
 const registryRoot=await mkdtemp(join(tmpdir(),'preview-concurrent-')); t.after(()=>rm(registryRoot,{recursive:true,force:true}));
 await Promise.all([appendPreviewRelease({registryRoot,record}),appendPreviewRelease({registryRoot,record:{...record,id:'fireguard',bundlePath:'templates/fireguard/1.0.4'}})]);
 assert.equal(JSON.parse(await readFile(join(registryRoot,'preview/index.json'),'utf8')).records.length,2);
});

test('image registry publisher is safe to import without release environment', async () => {
 const module = await import('../scripts/release-registry.mjs');
 assert.equal(typeof module.releaseRegistryFromEnvironment, 'function');
});
