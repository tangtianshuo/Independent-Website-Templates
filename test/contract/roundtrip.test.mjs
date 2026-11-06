import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
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
  for (const scenario of ['basic', 'media', 'rich']) {
    test(`${id} ${scenario} renders an actual CMS release accepted by the target Gateway`, { skip: !cmsRoot || !gatewayRoot ? 'Set CMS_CONTRACT_ROOT and GATEWAY_CONTRACT_ROOT for cross-repository verification' : false }, async () => {
      const templateRoot = new URL(`../../templates/${id}/${version}/`, import.meta.url).pathname;
      const raw = JSON.parse(await readFile(join(templateRoot, 'template.json'), 'utf8'));
      const projected = JSON.parse(execFileSync(process.execPath, ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', new URL('./cms-projection.cjs', import.meta.url).pathname], {
        cwd: cmsRoot, encoding: 'utf8', env: { ...process.env, TS_NODE_PROJECT: 'backend/tsconfig.json', TS_NODE_TRANSPILE_ONLY: '1', ROUNDTRIP_MANIFEST: JSON.stringify(raw), ROUNDTRIP_CASE:scenario },
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
      if (scenario === 'media') {
        assert.equal(shared.previewPage({kind:'preset-site',siteName:'CMS',...projected.draft}, '/')?.content.preset.demo.hero.image, 'https://cms.test/api/v4/media/hero/bin/image?cap=private-hero-capability');
      }
      if (scenario === 'rich') {
        const publicPage = shared.snapshotPage(shared.normalizeContractSnapshot(contract), '/pages/contact');
        const preview = shared.previewPage({ kind: 'preset-site', siteName: 'CMS', ...projected.draft }, '/pages/contact');
        assert.equal(publicPage.content.richBody[0].content[0].text, 'Mapped rich body');
        assert.equal(publicPage.content.richBody[1].type, 'bulletList');
        assert.equal(publicPage.content.richBody[2].type, 'horizontalRule');
        const requireStorefront = createRequire(join(templateRoot, 'storefront/package.json'));
        const { h } = requireStorefront('vue');
        const { renderToString } = requireStorefront('vue/server-renderer');
        const rich = await import(pathToFileURL(join(templateRoot, 'storefront/shared/rich-content.mjs')).href);
        const publicHtml = await renderToString(h('main', rich.renderRichNodes(publicPage.content.richBody, h)));
        const previewHtml = await renderToString(h('main', rich.renderRichNodes(preview.content.richBody, h)));
        assert.match(publicHtml, /<strong>Mapped rich body<\/strong>/);
        assert.match(publicHtml, /<ul><li><p><a href="\/"[^>]*><em>Default rich body<\/em><\/a><\/p><\/li><\/ul><hr>/);
        assert.match(publicHtml, /href="\/_assets\/media\/hero\/original.png"/);
        assert.match(previewHtml, /href="https:\/\/cms.test\/api\/v4\/media\/hero\/bin\/image\?cap=private-hero-capability"/);
        assert.ok(!publicHtml.includes('private-hero-capability'));
      }
      assert.deepEqual(result.pages, ['/', '/collections', '/products/product', '/pages/contact']);
      const runtime = await import(pathToFileURL(join(templateRoot,'storefront/server/utils/published.mjs')).href);
      const assetRuntime = await import(pathToFileURL(join(templateRoot,'storefront/server/utils/published-assets.mjs')).href);
      if (scenario === 'media') {
        const rawReference=structuredClone(contract);
        const hero=rawReference.pages.find(page=>page.path==='/');
        hero.layoutDocument.root[0].props.image={_id:'hero'};
        hero.content.layoutDocument.root[0].props.image={_id:'hero'};
        hero.content.sectionConfigs[0].data.image={_id:'hero'};
        assert.equal(shared.snapshotPage(shared.normalizeContractSnapshot(rawReference),'/')?.content.preset.demo.hero.image,'/_assets/media/hero/original.png');
        assert.equal(shared.previewPage(rawReference,'/'),null);
        await runContract({snapshot:rawReference,templateRoot});
        for (const mutate of [
          value=>{value.assets=[];},
          value=>{value.assets[0].mediaId='other';},
          value=>{value.assets[0].mimeType='text/plain';},
          value=>{value.assets.push({...value.assets[0],path:'media/duplicate.png'});},
          value=>{value.pages[0].layoutDocument.root[0].props.image={_id:''};},
          value=>{value.pages[0].layoutDocument.root[0].props.image={_id:'hero',unknown:true};},
          value=>{value.pages[0].layoutDocument.root[0].props.image=false;},
        ]) {
          const invalid=structuredClone(rawReference);mutate(invalid);
          assert.equal(shared.snapshotPage(shared.normalizeContractSnapshot(invalid),'/'),null);
        }
        const cleared=structuredClone(rawReference);cleared.pages[0].layoutDocument.root[0].props.image='';
        assert.equal(shared.snapshotPage(shared.normalizeContractSnapshot(cleared),'/')?.content.preset.demo.hero.image,'');
        const disabled=structuredClone(rawReference);disabled.pages[0].layoutDocument.root[0].enabled=false;disabled.pages[0].layoutDocument.root[0].props.image={_id:'missing-disabled'};
        assert.deepEqual(shared.snapshotPage(shared.normalizeContractSnapshot(disabled),'/')?.content.sections,['feature']);
        const corrupt=structuredClone(rawReference);corrupt.assets[0].contentBase64=Buffer.from('corrupted bytes').toString('base64');
        await assert.rejects(runContract({snapshot:corrupt,templateRoot}),/invalid published assets/);
      }
      const directory = await mkdtemp(join(tmpdir(), 'cms-roundtrip-'));
      try {
        const snapshotPath = join(directory, 'snapshot.json');
        await writeFile(snapshotPath, JSON.stringify(contract));
        for (const page of contract.pages) {
          const rendered = await runtime.readPublishedPage({ snapshotPath, workspaceId:'workspace',siteId:'site',path:page.path });
          assert.equal(rendered?.path, page.path);
          assert.deepEqual(rendered.content.sections, page.content.sections);
          assert.equal(rendered.content.operations.contactFormEnabled, false);
          if (scenario === 'media' && page.path === '/') assert.equal(rendered.content.preset.demo.hero.image, '/_assets/media/hero/original.png');
          assert.ok(!JSON.stringify(rendered).includes('private-hero-capability'));
          assert.ok(!JSON.stringify(rendered).includes('https://cms.test/api/v4/media/'));
        }
        if (scenario === 'media') {
          const corrupt=structuredClone(contract);corrupt.assets[0].contentBase64=Buffer.from('corrupted bytes').toString('base64');
          await writeFile(snapshotPath,JSON.stringify(corrupt));
          await assert.rejects(runtime.readPublishedPage({snapshotPath,workspaceId:'workspace',siteId:'site',path:'/'}),/invalid assets/);
          await writeFile(snapshotPath,JSON.stringify(contract));
        }
        assert.equal((await assetRuntime.readPublishedAsset({snapshotPath,path:'media/hero/original.png'})).bytes.toString(), 'published media');
        assert.equal(await runtime.readPublishedPage({snapshotPath,workspaceId:'wrong',siteId:'site',path:'/'}), null);
      } finally { await rm(directory, { recursive:true, force:true }); }
    });
  }
}
