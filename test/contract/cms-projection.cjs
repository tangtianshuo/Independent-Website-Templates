// Run by the target CMS Node process with its own TypeScript registration.
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const requireCms = createRequire(process.cwd() + '/package.json');
const { normalizePublicManifest } = requireCms('./backend/src/presets/registry');
const { buildRelease } = requireCms('./backend/src/presets/releases');
const { rewriteContractMediaUrls } = requireCms('./backend/src/release-contract/snapshot');
const { projectReleaseSnapshot } = requireCms('./backend/src/release-contract/project');
const { createPageDraft, updatePageDraft, pageDraft } = requireCms('./backend/src/presets/pages');
const raw = JSON.parse(process.env.ROUNDTRIP_MANIFEST);
const preset = normalizePublicManifest(raw, { id: raw.id, version: raw.version });
const values = { home: { title:['Home'], slug:['home'], headline:['Published headline'] }, product: { title:['Product'], slug:['product'], price:[45] }, collection: { title:['Catalog'], slug:['catalog'], products:[{ tid:'product',eid:'product-entry' }] }, 'content-page': { title:['Contact'], slug:['contact'], summary:['Contact us'] }, 'site-settings': { title:['Settings'], slug:['settings'], brandName:['Published brand'], navigationPages:[{ tid:'content-page',eid:'content-page-entry' }] } };
const input = {
  site: { _id:'site', workspaceId:'workspace', createdAt:1, updatedAt:1, slot:'default', name:'Published brand', presetId:preset.id, presetVersion:preset.version, presetManifestSnapshot:JSON.stringify(preset), status:'ready', importError:'', includeDemo:false, demoSeeded:false, theme:{...preset.theme},
    models:preset.models.map(model=>({key:model.key,templateId:model.key,fields:model.fields.map(field=>({key:field.key,propId:field.key}))})),
    pages:preset.pages.map(page=>({...page,status:'draft',sections:raw.editor.pages.find(e=>e.pageKey===page.key).sections,sectionConfigs:raw.editor.pages.find(e=>e.pageKey===page.key).sections.map(type=>({type,enabled:true,data:{}})),seoTitle:page.title,seoDescription:'Published'})),
  },
  templates:preset.models.map(model=>({_id:model.key,props:model.fields.map(field=>({id:field.key,name:field.key,type:field.type,array:field.array,required:field.required}))})),
  entries:preset.models.map(model=>({_id: model.key+'-entry',workspaceId:'workspace',siteId:'site',templateId:model.key,meta:[{lng:'en',props:Object.entries(values[model.key]).map(([id,data])=>({id,data}))}]})),
  media:[],language:'en',mediaOrigin:'https://cms.test',currency:'USD',
};
if (process.env.ROUNDTRIP_CASE === 'routes') {
  const routes=[];
  for (const [key,path,next] of [['product','/products/product','/products/renamed-product'],['content','/pages/contact','/pages/renamed-contact']]) {
    const bound=input.entries.find(entry=>entry.templateId === (key==='product'?'product':'content-page'));
    // A concrete page owns its route while the immutable blueprint remains present.
    const created=createPageDraft(input.site, `concrete-${key}`, { ...pageDraft(input.site,key), blueprintKey:key, title:'Concrete',path,entryId:bound._id }, bound);
    const edited=updatePageDraft(created, `concrete-${key}`, { ...pageDraft(created,`concrete-${key}`),path:next }, bound);
    const changed=pageDraft(edited,`concrete-${key}`);
    const blueprintEdited=updatePageDraft(input.site,key,{...pageDraft(input.site,key),path,entryId:''});
    for (const rejected of [key === 'product' ? '/pages/wrong-type' : '/products/wrong-type', '/api/private', '/preview/private', '/products', '/products/nested/route']) {
      assert.throws(() => createPageDraft(input.site, `rejected-${key}`, { ...pageDraft(input.site,key),blueprintKey:key,path:rejected,entryId:bound._id },bound), /path/i);
      assert.throws(() => updatePageDraft(edited, `concrete-${key}`, { ...changed,path:rejected },bound), /path/i);
    }
    assert.throws(() => createPageDraft(created, `duplicate-${key}`, { ...pageDraft(created,`concrete-${key}`),path,blueprintKey:key,entryId:bound._id },bound), /conflict/i);
    routes.push({ key,created:pageDraft(created,`concrete-${key}`).path,updated:changed.path,blueprintUpdated:pageDraft(blueprintEdited,key).path,enabled:changed.enabled });
  }
  console.log(JSON.stringify(routes));
} else {
  const bytes=Buffer.from('published media');
  const asset={ path:'media/hero/original.png',mimeType:'image/png',checksum:'sha256:'+require('node:crypto').createHash('sha256').update(bytes).digest('hex'),contentBase64:bytes.toString('base64'),mediaId:'hero',sourcePath:'/api/v4/media/hero/bin/original' };
  if (process.env.ROUNDTRIP_CASE === 'media') {
    input.media=[{_id:'hero',workspaceId:'workspace',siteId:'site',mimetype:'image/png',type:'IMG',accessToken:'private-hero-capability'}];
    // The hero override is a real CMS media reference, independent of model heroImage.
    input.site.pages.find(page=>page.key==='home').sectionConfigs[0].data.image={_id:'hero'};
    const home=input.site.pages.find(page=>page.key==='home');
    home.layoutDocument={version:1,mode:'template',root:home.sectionConfigs.map((section,index)=>({id:'home-'+index,kind:'section',type:section.type,enabled:section.enabled,props:structuredClone(section.data),children:[]}))};
  }
  if (process.env.ROUNDTRIP_CASE === 'media') {
    for (const mutate of [
      value => { value.media=[]; },
      value => { value.media[0].siteId='wrong-site'; },
      value => { value.media[0].workspaceId='wrong-workspace'; },
      value => { value.media[0].mimetype='text/plain'; },
      value => { value.site.pages[0].layoutDocument.root[0].props.image={_id:'unknown'}; },
      value => { value.site.pages[0].layoutDocument.root[0].props.image={_id:''}; },
      value => { value.site.pages[0].layoutDocument.root[0].props.image={_id:'hero',unknown:true}; },
      value => { value.site.pages[0].layoutDocument.root[0].props.image=false; },
    ]) {
      const invalid=structuredClone(input); mutate(invalid);
      assert.throws(()=>buildRelease(invalid,{preserveMediaCapabilities:true}),/media/i);
      assert.throws(()=>buildRelease(invalid),/media/i);
    }
    const cleared=structuredClone(input);
    cleared.site.pages[0].layoutDocument.root[0].props.image='';
    assert.equal(buildRelease(cleared).pages[0].content.layoutDocument.root[0].props.image,'');
    const disabled=structuredClone(input);
    disabled.site.pages[0].layoutDocument.root[0].enabled=false;
    disabled.site.pages[0].layoutDocument.root[0].props.image={_id:'missing-disabled'};
    assert.equal(buildRelease(disabled).pages[0].content.layoutDocument.root[0].enabled,false);
    // A stored layout wins over stale section configs, including media props.
    input.site.pages[0].sectionConfigs[0].data.image={_id:'stale-config'};
  }
  if (process.env.ROUNDTRIP_CASE === 'rich') {
    input.media=[{_id:'hero',workspaceId:'workspace',siteId:'site',mimetype:'image/png',type:'IMG',accessToken:'private-hero-capability'}];
    const entry=input.entries.find(value=>value.templateId==='content-page');
    entry.meta[0].props.push({id:'body',data:[{nodes:[{type:'paragraph',content:[{type:'text',text:'Mapped rich body',marks:[{type:'bold'}]}]}]}]});
    entry.content=[{lng:'en',nodes:[{type:'bulletList',content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'Default rich body',marks:[{type:'italic'},{type:'link',attrs:{href:'/',target:'_self'}}]}]}]}]},{type:'horizontalRule'},{type:'paragraph',content:[{type:'text',text:'Media file',marks:[{type:'link',attrs:{href:'media:hero@*_@*_:media',target:'_blank'}}]}]}],plainText:''}];
  }
  if (process.env.ROUNDTRIP_CASE === 'rich') {
    const body=input.entries.find(value=>value.templateId==='content-page').content[0];
    body.nodes.push({type:'widget',attrs:{data:{props:[{id:'nested',data:[{nodes:[{type:'paragraph',content:[{type:'text',text:'Nested media file',marks:[{type:'link',attrs:{href:'media:hero@*_@*_:media',target:'_self'}}]}]}]}]}]}}});
    for (const mutate of [value=>{value.media=[];},value=>{value.media[0].siteId='foreign';},value=>{value.media[0].workspaceId='foreign';}]) {
      const invalid=structuredClone(input);mutate(invalid);
      assert.throws(()=>buildRelease(invalid),/media/i);
      assert.throws(()=>buildRelease(invalid,{preserveMediaCapabilities:true}),/media/i);
    }
  }
  const snapshot=JSON.parse(JSON.stringify(buildRelease(input)));
  const draft=JSON.parse(JSON.stringify(buildRelease(input,{preserveMediaCapabilities:true})));
  console.log(JSON.stringify({ ...projectReleaseSnapshot(rewriteContractMediaUrls(snapshot,[asset]),[asset]),draft }));
}
