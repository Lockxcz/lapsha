import {load} from 'cheerio';
export const SOURCES={elitalco:'https://newelitalco.kz/upload/ai-sitemap.json',alcomag:'https://alcomag.kz/sitemap.xml'};
const hosts=new Set(['alcomag.kz','newelitalco.kz','elitclub.kz']);
export function safeURL(value,base='https://newelitalco.kz/'){
 const fixed=String(value||'').replace(/^https:\/\/https:\/\//i,'https://');
 const u=new URL(fixed,base);
 if(u.protocol!=='https:'||u.port||u.username||u.password||!hosts.has(u.hostname))throw Error('Unapproved source URL');
 return u.href;
}
export async function download(url,{timeout=6000,max=2500000,fetcher=fetch}={}){
 let target=safeURL(url);const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
 try{
  for(let n=0;n<4;n++){
   const response=await fetcher(target,{signal:controller.signal,redirect:'manual',headers:{'User-Agent':'LAPSHA-Guide-Catalog/1.0'}});
   if([301,302,303,307,308].includes(response.status)){target=safeURL(response.headers.get('location'),target);continue;}
   if(!response.ok)throw Error(`Source HTTP ${response.status}`);
   if(Number(response.headers.get('content-length'))>max)throw Error('Source too large');
   const reader=response.body.getReader();const parts=[];let size=0;
   while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('Source too large');}parts.push(Buffer.from(value));}
   return {bytes:Buffer.concat(parts),type:response.headers.get('content-type')||'',url:target};
  }
  throw Error('Too many redirects');
 }finally{clearTimeout(timer);}
}
const stop=new Set('the years year yers old yo y o anos whisky whiskey виски вино wine rum ром gin джин vodka водка cognac коньяк ликер liqueur liquor bitter биттер текила tequila лет год года выдержка бутылка п у'.split(' '));
export function tokens(value){
 let s=String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ё/g,'е');
 s=s.replace(/\bin (?:gift )?box\b/gi,' ').replace(/в (?:подарочной )?коробке/gi,' ');
 s=s.replace(/v\.?s\.?o\.?p\.?/g,'vsop').replace(/x\.o\./g,'xo').replace(/v\.s\./g,'vs');
 s=s.replace(/\d+(?:[.,]\d+)?\s*%/g,' ').replace(/\d+(?:[.,]\d+)?\s*(?:ml|мл|литра?|л|l)\b/gi,' ').replace(/\b0[.,]\d+\b/g,' ');
 return [...new Set(s.replace(/[’'`]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').split(/\s+/).filter(x=>x&&!stop.has(x)))].sort();
}
export function signature(value){return tokens(value).join(' ');}
export function ambiguousName(value){return /\s\/\s|\([^)]*\/[^)]*\)/.test(value)||tokens(value).length===0||['choya','martini','macallan'].includes(signature(value));}
function slugName(url){
 let s=decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).at(-1)||'').replace(/_\d+$/,'');
 // Supplier slugs end in strength and bottle volume; age digits elsewhere stay intact.
 s=s.replace(/-\d{2,3}(?:-\d)?-(?:0\d{1,3}|1|15|175|2|3|5|6)l$/,'').replace(/-(?:0\d{1,3}|1|15|175|2|3|5|6)l$/,'');
 return s.replace(/-/g,' ');
}
export function parseIndex(source,text){
 const rows=source==='elitalco'?JSON.parse(text.replace(/^\uFEFF/,'' )).entries.filter(r=>r.type==='product').map(r=>r.loc||r.url):[...text.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]).filter(u=>new URL(u).pathname.split('/').filter(Boolean).length>=4);
 return [...new Set(rows)].flatMap(url=>{try{return [{url:safeURL(url),source,name:slugName(url)}];}catch{return [];}});
}
export function shortlist(item,entries){
 const name=item.name_en?.trim()||item.name;
 if(ambiguousName(item.name))return [];
 const q=tokens(name),letters=q.filter(x=>!/^\d+$/.test(x));
 return entries.map(e=>{const t=tokens(e.name),overlap=q.filter(x=>t.includes(x)).length;const words=letters.filter(x=>t.includes(x)).length;return {...e,score:overlap/q.length-(t.length-overlap)*.025,words};})
 .filter(e=>e.words===letters.length&&e.score>=.60)
 .sort((a,b)=>b.score-a.score||a.url.localeCompare(b.url)).slice(0,6);
}
export function exactMatch(item,product){
 if(ambiguousName(item.name)||/безалкогол|non[ -]?alcohol|alcohol[ -]?free|(?:^|[^\d])0(?:[.,]0)?\s*%/i.test(product.name))return false;
 return [item.name,item.name_en].filter(Boolean).some(n=>signature(n)===signature(product.name));
}
function jsonProducts($){
 const out=[];function walk(v){if(!v||typeof v!=='object')return;if(v['@type']==='Product')out.push(v);if(Array.isArray(v))v.forEach(walk);else if(v['@graph'])walk(v['@graph']);}
 $('script[type="application/ld+json"]').each((_,el)=>{try{walk(JSON.parse($(el).text()));}catch{}});return out;
}
export function parseProduct(html,url){
 const $=load(html),host=new URL(url).hostname;let name,image,description,taste='',aroma='';
 if(host==='alcomag.kz'){
  const scope=$('[itemtype="http://schema.org/Product"], [itemtype="https://schema.org/Product"]').first();
  name=scope.find('[itemprop="name"]').first().text()||$('h1.product-column-title').text();
  image=scope.find('[itemprop="image"]').attr('src');description=scope.find('[itemprop="description"]').text();
 }else{
  const product=jsonProducts($)[0];name=product?.name||$('h1').first().text();
  image=$('meta[property="og:image"]').attr('content')||(Array.isArray(product?.image)?product.image[0]:product?.image);
  const block=$('#nav-description .product-description').first();description=block.text();
  block.find('h4').each((_,el)=>{const label=$(el).text().toLowerCase();let text='';for(let n=el.next;n&&n.name!=='h4';n=n.next)text+=$(n).text()+' ';if(label.includes('вкус'))taste=text;if(label.includes('аромат'))aroma=text;});
 }
 if(!name?.trim()||!image)throw Error('Product identity or photo missing');
 const imageURL=safeURL(image,'https://'+host+'/');
 if(/logo|alcomag_0|placeholder|no[_-]?image/i.test(imageURL))throw Error('Placeholder image');
 return {name:name.trim(),image:imageURL,description:(description||'').trim(),taste: taste.trim(),aroma:aroma.trim(),url};
}
const notes=[[/ванил/i,'ваниль'],[/карамел/i,'карамель'],[/орех|миндал/i,'ореховые оттенки'],[/цитрус|апельсин|лимон/i,'цитрусовые оттенки'],[/медов|мёд|мед\b/i,'медовые оттенки'],[/дым|торф/i,'дымные оттенки'],[/ягод/i,'ягодные оттенки'],[/шоколад/i,'шоколад'],[/прян|специ/i,'пряные оттенки'],[/дуб/i,'дубовые оттенки'],[/фрукт/i,'фруктовые оттенки']];
export function descriptions(product){
 const pick=text=>notes.filter(([rx])=>String(text||'').split(/[.!?;]/).some(sentence=>!/(?:без|отсутств|не ощущ|нет нот)/i.test(sentence)&&rx.test(sentence))).map(([,name])=>name).slice(0,4).join(', ');
 const sensory=[product.taste,product.aroma,...String(product.description||'').split(/[.!?;]/).filter(s=>/вкус|аромат|нот[аыок]|оттен/i.test(s))].filter(Boolean).join('. ');
 const general=pick(sensory);const taste=pick(product.taste),aroma=pick(product.aroma);
 return {teaser:general?`Ноты: ${general}.`:null,taste:taste||null,aroma:aroma||null};
}
export function checkImage({bytes,type}){
 const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
 if(bytes.length<500||!/^image\//i.test(type)||(!jpg&&!png&&!webp))throw Error('Not a supported photo');
 return jpg?{ext:'jpg',mime:'image/jpeg'}:png?{ext:'png',mime:'image/png'}:{ext:'webp',mime:'image/webp'};
}
