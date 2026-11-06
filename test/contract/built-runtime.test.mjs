import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, request } from 'node:http';
function sitemapRequest(base, host = 'shop.example.com') {
  return new Promise((resolve, reject) => { const req = request(base + '/sitemap.xml', { headers: { host } }, response => { const chunks=[];response.on('data', chunk=>chunks.push(chunk));response.on('end', ()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers:response.headers}))); });req.on('error',reject);req.end(); });
}
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { contractFixture } from '../contract-fixture.mjs';

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}
async function start(t, storefront, env) {
  const reserve = createServer(); const port = await listen(reserve);
  await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, ['.output/server/index.mjs'], { cwd:storefront, env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),NUXT_WORKSPACE_ID:'workspace',NUXT_SITE_ID:'site',NUXT_PUBLIC_PREVIEW_ADMIN_ORIGIN:'https://cms.example.com', ...env} });
  let logs = ''; child.stdout.on('data',data=>{logs+=data;});child.stderr.on('data',data=>{logs+=data;});
  t.after(async()=>{if(child.exitCode!==null)return;const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;});
  const base=`http://127.0.0.1:${port}`;
  for(let i=0;i<200;i++) { if(child.exitCode!==null)throw new Error(logs);try{if((await fetch(`${base}/healthz`)).ok)return base;}catch{}await new Promise(resolve=>setTimeout(resolve,25)); }
  throw new Error(`Runtime did not start: ${logs}`);
}
for (const [id,version,prefix] of [['aeroframe','1.0.4','aero'],['fireguard','1.0.1','fire']]) {
  test(`${id} built runtime reads artifacts and fails closed without control-plane fallback`, {skip:process.env.TEST_BUILT_CONTRACT !== '1' ? 'Set TEST_BUILT_CONTRACT=1 after building both new storefronts' : false,timeout:30000},async t=>{
    const templateRoot=new URL(`../../templates/${id}/${version}/`,import.meta.url).pathname;
    const manifest=JSON.parse(await readFile(join(templateRoot,'template.json'),'utf8'));
    const contract=contractFixture();contract.template={id,version};
    const preset={id,version,name:manifest.name,description:manifest.description,...manifest.presentation};
    const page=(path,view,sections)=>({path,pageKey:view,entryId:`${view}-entry`,content:{kind:'preset-page',view,preset,sections,seo:{title:`${view} title`,description:''},items:[]}});
    contract.pages=[page('/','home',['feature','hero']),page('/catalog','collection',['grid','heading']),page('/aircraft','product',['information','description','gallery']),page('/company','page',['story'])];
    contract.pages[0].content.sectionConfigs=[{type:'feature',enabled:true,data:{}},{type:'hero',enabled:true,data:{title:'Artifact-only headline',image:{_id:'hero'}}}];
    contract.pages[1].content.sectionConfigs=[{type:'grid',enabled:true,data:{columns:2}},{type:'heading',enabled:true,data:{title:'Artifact catalog'}}];
    contract.navigation=[{id:'catalog',label:'Catalog',href:'/catalog',children:[],enabled:true}];
    contract.redirects=[{from:'/old-catalog',to:'/catalog'}];
    const bytes=Buffer.from('immutable local media');const checksum=`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    contract.assets=[{path:'media/proof/original.txt',mimeType:'text/plain',checksum,contentBase64:bytes.toString('base64')},{path:'media/hero/original.png',mediaId:'hero',mimeType:'image/png',checksum,contentBase64:bytes.toString('base64')}];
    const directory=await mkdtemp(join(tmpdir(),'built-contract-'));t.after(()=>rm(directory,{recursive:true,force:true}));const snapshotPath=join(directory,'snapshot.json');await writeFile(snapshotPath,JSON.stringify(contract));
    let requests=0;const control=createServer((req,res)=>{requests++;res.writeHead(503).end();});const controlPort=await listen(control);t.after(()=>new Promise(resolve=>control.close(resolve)));
    const env={PUBLISHED_SNAPSHOT_PATH:snapshotPath,NUXT_PUBLISHED_SNAPSHOT_PATH:snapshotPath,NUXT_GATEWAY_URL:`http://127.0.0.1:${controlPort}`,NUXT_SITE_CREDENTIAL:'secret-control-credential'};
    const base=await start(t,join(templateRoot,'storefront'),env);
    for(const path of ['/','/catalog','/aircraft','/company']) {const response=await fetch(base+path);assert.equal(response.status,200,path);const html=await response.text();assert.ok(!html.includes('secret-control-credential'));if(path==='/'){assert.ok(html.includes('<h1>Artifact-only headline</h1>'));assert.ok(html.includes(`--${prefix}-hero-image:url(&#39;/_assets/media/hero/original.png&#39;)`));assert.ok(html.indexOf(`class="${prefix}-intro`) < html.indexOf(`class="${prefix}-hero"`));}if(path==='/catalog'){assert.ok(html.includes('<h1 data-section-type="heading">Artifact catalog</h1>'));assert.ok(html.includes(`class="${prefix}-product-grid ${prefix}-product-grid--catalog" style="--catalog-columns:2;"`));assert.ok(html.indexOf(`class="${prefix}-product-grid`) < html.indexOf('<h1 data-section-type="heading">Artifact catalog</h1>'));} }
    const sitemap=await sitemapRequest(base);assert.equal(sitemap.status,200);assert.match(sitemap.headers.get('content-type'),/application\/xml/);const xml=await sitemap.text();for(const path of ['/','/catalog','/aircraft','/company'])assert.ok(xml.includes(`<loc>https://shop.example.com${path}</loc>`));assert.ok(!xml.includes('/preview'));assert.ok(!xml.includes('/api/'));
    const invalidHost=await sitemapRequest(base,'bad@host');assert.equal(invalidHost.status,500);
    const redirect=await fetch(base+'/old-catalog',{redirect:'manual'});assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),'/catalog');
    const asset=await fetch(base+'/_assets/media/proof/original.txt');assert.equal(asset.status,200);assert.equal(await asset.text(),bytes.toString());assert.equal(asset.headers.get('etag'),checksum);
    const mediaAsset=await fetch(base+'/_assets/media/hero/original.png');assert.equal(mediaAsset.status,200);assert.equal(await mediaAsset.text(),bytes.toString());assert.equal(mediaAsset.headers.get('content-type'),'image/png');
    const preview=await fetch(base+'/preview');assert.equal(preview.status,200);assert.equal(preview.headers.get('cache-control'),'no-store');assert.equal(preview.headers.get('content-security-policy'),'frame-ancestors https://cms.example.com');const shell=await preview.text();assert.match(shell,/Waiting for a private CMS preview/);assert.ok(!shell.includes('Artifact-only headline'));
    const missing=await start(t,join(templateRoot,'storefront'),{...env,PUBLISHED_SNAPSHOT_PATH:'',NUXT_PUBLISHED_SNAPSHOT_PATH:''});assert.equal((await fetch(missing+'/api/published?path=/')).status,503);assert.equal((await sitemapRequest(missing)).status,503);
    await writeFile(snapshotPath,'invalid JSON');assert.equal((await sitemapRequest(base)).status,500);assert.equal((await fetch(base+'/api/published?path=/')).status,500);
    await rm(snapshotPath);assert.equal((await sitemapRequest(base)).status,500);assert.equal((await fetch(base+'/api/published?path=/')).status,500);
    assert.equal(requests,0,'public requests must never contact the control plane');
  });
}
