import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { runContract } from '../../contracts/runner.mjs';

const cmsRoot = process.env.CMS_CONTRACT_ROOT;
const gatewayRoot = process.env.GATEWAY_CONTRACT_ROOT;
for (const [id, version] of [['aeroframe', '1.0.4'], ['fireguard', '1.0.1']]) {
  test(`${id} renders an actual CMS release accepted by the target Gateway`, { skip: !cmsRoot || !gatewayRoot ? 'Set CMS_CONTRACT_ROOT and GATEWAY_CONTRACT_ROOT for cross-repository verification' : false }, async () => {
    const templateRoot = new URL(`../../templates/${id}/${version}/`, import.meta.url).pathname;
    const raw = JSON.parse(await readFile(join(templateRoot, 'template.json'), 'utf8'));
    // Read-only source imports run with the CMS's own TypeScript configuration.
    const source = `const { normalizePublicManifest } = require('./backend/src/presets/registry');
const { buildRelease } = require('./backend/src/presets/releases');
const { projectReleaseSnapshot } = require('./backend/src/release-contract/project');
const raw = JSON.parse(process.env.ROUNDTRIP_MANIFEST);
const preset = normalizePublicManifest(raw, { id: raw.id, version: raw.version });
const values = { home: { title:['Home'], slug:['home'], headline:['Published headline'] }, product: { title:['Product'], slug:['product'], price:[45] }, collection: { title:['Catalog'], slug:['catalog'], products:[{ tid:'product',eid:'product-entry' }] }, 'content-page': { title:['Contact'], slug:['contact'], summary:['Contact us'] }, 'site-settings': { title:['Settings'], slug:['settings'], brandName:['Published brand'], navigationPages:[{ tid:'content-page',eid:'content-page-entry' }] } };
const input = { site: { _id:'site', workspaceId:'workspace', createdAt:1, updatedAt:1, slot:'default', name:'Published brand', presetId:preset.id, presetVersion:preset.version, presetManifestSnapshot:JSON.stringify(preset), status:'ready', importError:'', includeDemo:false, demoSeeded:false, theme:{...preset.theme}, models:preset.models.map(model=>({key:model.key,templateId:model.key,fields:model.fields.map(field=>({key:field.key,propId:field.key}))})), pages:preset.pages.map(page=>({...page,status:'draft',sections:raw.editor.pages.find(e=>e.pageKey===page.key).sections,sectionConfigs:raw.editor.pages.find(e=>e.pageKey===page.key).sections.map(type=>({type,enabled:true,data:Object.fromEntries(Object.entries(raw.editor.sections.find(s=>s.type===type).props).filter(([key,s])=>s.required).map(([key,s])=>[key,'Published section']))})),seoTitle:page.title,seoDescription:'Published'})) }, templates:preset.models.map(model=>({_id:model.key,props:model.fields.map(field=>({id:field.key,name:field.key,type:field.type,array:field.array,required:field.required}))})), entries:preset.models.map(model=>({_id: model.key+'-entry',templateId:model.key,meta:[{lng:'en',props:Object.entries(values[model.key]).map(([id,data])=>({id,data}))}]})), media:[],language:'en',mediaOrigin:'https://cms.test',currency:'USD' };
const snapshot = JSON.parse(JSON.stringify(buildRelease(input)));
const bytes = Buffer.from('published media');
const asset = { path:'media/hero/original.txt', mimeType:'text/plain', checksum:'sha256:'+require('node:crypto').createHash('sha256').update(bytes).digest('hex'), contentBase64:bytes.toString('base64'), mediaId:'hero', sourcePath:'/api/v4/media/hero/bin/original' };
console.log(JSON.stringify({ ...projectReleaseSnapshot(snapshot, [asset]), draft: snapshot }));`;
    const projected = JSON.parse(execFileSync(process.execPath, ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', '-e', source], {
      cwd: cmsRoot, encoding: 'utf8', env: { ...process.env, TS_NODE_PROJECT: 'backend/tsconfig.json', TS_NODE_TRANSPILE_ONLY: '1', ROUNDTRIP_MANIFEST: JSON.stringify(raw) },
    }));
    const gateway = await import(pathToFileURL(join(gatewayRoot, 'packages/contracts/src/release.ts')).href);
    const contract = gateway.validateContractSnapshotV1(projected.snapshot);
    const bytes = Buffer.from(gateway.canonicalJson(contract));
    const validated = gateway.validateReleaseInput({ siteId:'site', releaseId:'roundtrip', checksum:`sha256:${createHash('sha256').update(bytes).digest('hex')}`, metadata:{templateId:id,templateVersion:version,manifestChecksum:`sha256:${'1'.repeat(64)}`,imageDigest:`sha256:${'2'.repeat(64)}`},snapshot:bytes.toString('base64') }, [id]);
    assert.equal(validated.metadata.templateVersion, version);
    assert.equal(projected.checksum, `sha256:${createHash('sha256').update(bytes).digest('hex')}`);
    const result = await runContract({ snapshot:contract, templateRoot });
    const shared = await import(pathToFileURL(join(templateRoot,'storefront/shared/snapshot.mjs')).href);
    assert.equal(shared.previewPage(contract, '/')?.content.preset.demo.hero.title, 'Published headline');
    assert.equal(shared.previewPage({kind:'preset-site',siteName:'CMS',...projected.draft}, '/')?.content.preset.demo.hero.title, 'Published headline');
    assert.deepEqual(result.pages, ['/', '/collections', '/products/product', '/pages/contact']);
    const runtime = await import(pathToFileURL(join(templateRoot,'storefront/server/utils/published.mjs')).href);
    const assetRuntime = await import(pathToFileURL(join(templateRoot,'storefront/server/utils/published-assets.mjs')).href);
    const directory = await mkdtemp(join(tmpdir(), 'cms-roundtrip-'));
    try {
      const snapshotPath = join(directory, 'snapshot.json');
      await writeFile(snapshotPath, JSON.stringify(contract));
      for (const page of contract.pages) {
        const rendered = await runtime.readPublishedPage({ snapshotPath, workspaceId:'workspace',siteId:'site',path:page.path });
        assert.equal(rendered?.path, page.path);
        assert.deepEqual(rendered.content.sections, page.content.sections);
        assert.equal(rendered.content.operations.contactFormEnabled, false);
      }
      assert.equal((await assetRuntime.readPublishedAsset({snapshotPath,path:'media/hero/original.txt'})).bytes.toString(), 'published media');
      assert.equal(await runtime.readPublishedPage({snapshotPath,workspaceId:'wrong',siteId:'site',path:'/'}), null);
    } finally { await rm(directory, { recursive:true, force:true }); }
  });
}
