import assert from 'node:assert/strict';
import test from 'node:test';
import { contractFixture } from './contract-fixture.mjs';
for (const [id,version] of [['aeroframe','1.0.4'],['fireguard','1.0.1']]) {
 const { renderRichNodes }=await import(`../templates/${id}/${version}/storefront/shared/rich-content.mjs`);
 const { snapshotPage, normalizeContractSnapshot,previewPage }=await import(`../templates/${id}/${version}/storefront/shared/snapshot.mjs`);
 test(`${id} renders safe actual rich DOM nodes for public and preview via the same projection`,()=>{
  const nodes=[{type:'bulletList',content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'Safe <script>',marks:[{type:'bold'},{type:'link',attrs:{href:'/',target:'_blank'}}]}]}]}]},{type:'horizontalRule'}];
  const h=(tag,attrs,children)=>({tag,attrs,children});
  const result=renderRichNodes(nodes,h);assert.equal(result[0].tag,'ul');assert.equal(result[0].children[0].tag,'li');assert.equal(result[1].tag,'hr');
  const snapshot=contractFixture();snapshot.template={id,version};snapshot.pages[0].content.preset.id=id;snapshot.pages[0].content.preset.version=version;
  snapshot.pages[0].content.view='page';snapshot.pages[0].content.sections=['story'];snapshot.pages[0].content.sectionConfigs=[{type:'story',enabled:true,data:{body:{nodes}}}];
  const publicPage=snapshotPage(normalizeContractSnapshot(snapshot),'/');const preview=previewPage(snapshot,'/');
  assert.deepEqual(publicPage.content.richBody,preview.content.richBody);assert.deepEqual(publicPage.content.richBody,nodes);
  assert.equal(renderRichNodes([{type:'text',text:'literal',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}],h),null);
  const asset=structuredClone(snapshot);
  asset.assets=[{path:'media/owned/original.png',checksum:`sha256:${'1'.repeat(64)}`,mimeType:'image/png',mediaId:'owned'}];
  const assetLink=asset.pages[0].content.sectionConfigs[0].data.body.nodes[0].content[0].content[0].content[0].marks[1];
  assetLink.attrs.href='/_assets/media/owned/original.png';
  assert.ok(previewPage(asset,'/'), 'an exact declared asset is a valid rich link');
  assert.ok(snapshotPage(normalizeContractSnapshot(asset),'/'));
  for (const href of ['/_assets/media/missing/original.png','/_assets/media/foreign/original.png','/_assets/media/owned/other.png','/ordinary-missing-route']) {
   const invalid=structuredClone(asset);invalid.pages[0].content.sectionConfigs[0].data.body.nodes[0].content[0].content[0].content[0].marks[1].attrs.href=href;
   assert.equal(previewPage(invalid,'/'),null,href);
   assert.equal(snapshotPage(normalizeContractSnapshot(invalid),'/'),null,href);
  }
  const missingAsset=structuredClone(asset);missingAsset.assets=[];
  assert.equal(previewPage(missingAsset,'/'),null,'an asset URL without its exact declaration is rejected');
  assert.equal(snapshotPage(normalizeContractSnapshot(missingAsset),'/'),null);
  const bad=structuredClone(snapshot);bad.pages[0].content.sectionConfigs[0].data.body.nodes[0].content[0].content[0].content[0].marks[1].attrs.href='/missing';assert.equal(previewPage(bad,'/'),null);
 });
}
