import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
const cmsRoot=process.env.CMS_CONTRACT_ROOT;
for(const [id,version] of [['aeroframe','1.0.4'],['fireguard','1.0.1']]) {
  test(`${id} creates and updates actual CMS product and content draft routes`,{skip:!cmsRoot?'Set CMS_CONTRACT_ROOT for CMS draft API verification':false},async()=>{
    const raw=JSON.parse(await readFile(new URL(`../../templates/${id}/${version}/template.json`,import.meta.url),'utf8'));
    const routes=JSON.parse(execFileSync(process.execPath,['-r','ts-node/register','-r','tsconfig-paths/register',new URL('./cms-projection.cjs',import.meta.url).pathname],{cwd:cmsRoot,encoding:'utf8',env:{...process.env,TS_NODE_PROJECT:'backend/tsconfig.json',TS_NODE_TRANSPILE_ONLY:'1',ROUNDTRIP_CASE:'routes',ROUNDTRIP_MANIFEST:JSON.stringify(raw)}}));
    assert.deepEqual(routes,[{key:'product',created:'/products/product',updated:'/products/renamed-product',blueprintUpdated:'/products/product',enabled:true},{key:'content',created:'/pages/contact',updated:'/pages/renamed-contact',blueprintUpdated:'/pages/contact',enabled:true}]);
  });
}
