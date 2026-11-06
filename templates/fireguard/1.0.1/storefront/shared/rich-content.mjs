const object = value => value && typeof value === 'object' && !Array.isArray(value);
const tags = { paragraph:'p', bulletList:'ul', orderedList:'ol', listItem:'li', codeBlock:'pre', hardBreak:'br', horizontalRule:'hr' };
const markTags = { bold:'strong', italic:'em', underline:'u', strike:'s', inlineCode:'code' };
export function safeRichHref(value, paths) {
  if (typeof value !== 'string' || /[\\\x00-\x20\x7f]/.test(value)) return false;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return true;
  if (value.startsWith('#')) return true;
  return value.startsWith('/') && !value.startsWith('//') && (!paths || paths.has(value.split(/[?#]/)[0]));
}
export function richNodes(value, paths, depth = 0) {
  const nodes = typeof value === 'string' ? value ? [{type:'paragraph',content:[{type:'text',text:value}]}] : [] : Array.isArray(value) ? value : value?.nodes;
  if (!Array.isArray(nodes) || nodes.length > 10000 || depth > 32) return null;
  const result=[];
  for (const node of nodes) {
    if (!object(node) || Object.keys(node).some(key=>!['type','content','attrs','marks','text'].includes(key)) || !['text','heading','widget',...Object.keys(tags)].includes(node.type)) return null;
    const copy={type:node.type};
    if (node.type === 'text') { if (typeof node.text !== 'string') return null;copy.text=node.text; }
    if (node.type === 'heading') { if (!Number.isInteger(node.attrs?.level) || node.attrs.level<1 || node.attrs.level>6) return null;copy.attrs={level:node.attrs.level}; }
    if (node.type === 'widget') {
      if (!object(node.attrs?.data) || !Array.isArray(node.attrs.data.props)) return null;
      // Widget values are data, never executable HTML. Display their declared textual/rich values in order.
      const values = data => Array.isArray(data) ? data.flatMap(item=> typeof item === 'string' ? [{type:'paragraph',content:[{type:'text',text:item}]}] : object(item) && item.nodes ? item.nodes : object(item) && item.props ? item.props.flatMap(prop=>values(prop.data)) : []) : object(data) && Array.isArray(data.props) ? data.props.flatMap(prop=>values(prop.data)) : object(data) && Array.isArray(data.items) ? data.items.flatMap(item=>item.props.flatMap(prop=>values(prop.data))) : [];
      const children=richNodes(values(node.attrs.data),paths,depth+1);if(!children)return null;copy.content=children;
    } else if (node.content !== undefined) { const children=richNodes(node.content,paths,depth+1);if(!children)return null;copy.content=children; }
    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks)) return null;copy.marks=[];
      for (const mark of node.marks) {
        if (!object(mark)) return null;
        if (mark.type === 'link') { if(!safeRichHref(mark.attrs?.href,paths))return null;copy.marks.push({type:'link',attrs:{href:mark.attrs.href,target:mark.attrs.target === '_blank' ? '_blank' : '_self'}}); }
        else if(Object.hasOwn(markTags,mark.type))copy.marks.push({type:mark.type});else return null;
      }
    }
    result.push(copy);
  }
  return result;
}
export function renderRichNodes(value, h) {
  const nodes=richNodes(value);if(!nodes)return null;
  const render=node=>{
    let result=node.type === 'text' ? node.text : h(node.type === 'heading' ? `h${node.attrs.level}` : node.type === 'widget' ? 'div' : tags[node.type], node.type === 'widget' ? {class:'rich-widget'} : {}, (node.content || []).map(render));
    for(const mark of node.marks || []) result=mark.type==='link' ? h('a',{href:mark.attrs.href,target:mark.attrs.target,rel:mark.attrs.target==='_blank'?'noopener noreferrer':undefined},[result]) : h(markTags[mark.type],{},[result]);
    return result;
  };
  return nodes.map(render);
}
