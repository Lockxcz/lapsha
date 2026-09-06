import {SOURCES,download,parseIndex,shortlist,parseProduct,exactMatch,descriptions,checkImage} from './catalog.mjs';
export function database(env,fetcher=fetch){
 const base=env.SUPABASE_URL?.replace(/\/$/,'');const key=env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)throw Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify');
 const u=new URL(base);if(u.protocol!=='https:')throw Error('SUPABASE_URL must use HTTPS');
 const headers={apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${key}`})};
 async function request(path,{method='GET',body,extra={}}={}){
  const response=await fetcher(base+path,{method,headers:{...headers,'Content-Type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(3500)});
  const text=await response.text();if(!response.ok)throw Error(`Database HTTP ${response.status}`);
  return text?JSON.parse(text):null;
 }
 return {request,async upload(path,photo,mime){
  const bucket=encodeURIComponent(env.GUIDE_BUCKET||'guide-media');
  const response=await fetcher(`${base}/storage/v1/object/${bucket}/${path}`,{method:'POST',headers:{...headers,'Content-Type':mime,'x-upsert':'false'},body:photo,signal:AbortSignal.timeout(4000)});
  if(!response.ok)throw Error(`Photo storage HTTP ${response.status}`);
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
 },async remove(path){await request(`/storage/v1/object/${encodeURIComponent(env.GUIDE_BUCKET||'guide-media')}`,{method:'DELETE',body:{prefixes:[path]}});}};
}
export async function synchronize(env,{db=database(env),get=download,now=()=>Date.now()}={}){
 const started=now();
 const caches=await db.request('/rest/v1/alcohol_catalog_cache?select=source,entries,refreshed_at');
 // One index refresh per invocation keeps the function within Netlify's 30-second limit.
 const staleSources=Object.keys(SOURCES).filter(source=>!caches.some(c=>c.source===source&&now()-Date.parse(c.refreshed_at)<86400000));
 for(const stale of staleSources){
  try{
   const data=await get(SOURCES[stale],{timeout:7000});const entries=parseIndex(stale,data.bytes.toString());
   if(!entries.length)throw Error('Empty catalogue');
   await db.request('/rest/v1/alcohol_catalog_cache?on_conflict=source',{method:'POST',extra:{Prefer:'resolution=merge-duplicates'},body:{source:stale,entries,refreshed_at:new Date(now()).toISOString()}});
   return {status:'catalogue-refreshed',source:stale,count:entries.length};
  }catch(error){
   // A unavailable catalogue must not starve the other source or queued drinks.
   console.warn('Catalogue unavailable:',stale,error.message);
  }
 }
 if(!caches.length||now()-started>10000)return {status:'sources-unavailable'};
 const claim=await db.request('/rest/v1/rpc/claim_alcohol_photo',{method:'POST',body:{}});
 if(!claim)return {status:'idle'};
 const {item,job}=claim;const ranked=shortlist(item,caches.flatMap(c=>c.entries));
 const offset=((job.attempts||1)-1)%Math.max(ranked.length,1);
 const candidates=[...ranked.slice(offset),...ranked.slice(0,offset)];
 let product,failed=false,path;const incomplete=Object.keys(SOURCES).some(s=>!caches.some(c=>c.source===s));
 let checked=0;
 try{
  for(const candidate of candidates){
   if(now()-started>10500){failed=true;break;}
   try{const data=await get(candidate.url,{timeout:3500});const p=parseProduct(data.bytes.toString(),data.url);checked++;if(exactMatch(item,p)){product=p;break;}}
   catch{failed=true;}
  }
  let result;
  if(product){
   const photo=await get(product.image,{timeout:3500,max:5000000});const {ext,mime}=checkImage(photo);
   path=`alcohol-auto/${item.id}/${job.lease}.${ext}`;
   const image_url=await db.upload(path,photo.bytes,mime);
   result={status:'done',image_url,...descriptions(product),source_url:product.url,source_name:product.name,source_image:product.image,message:'Фото подобрано по точному названию'};
  }else result={status:failed||incomplete?'retry':'unmatched',message:failed||incomplete?'Источник временно недоступен; повтор автоматически':'Точного совпадения нет; повтор через 7 дней'};
  const applied=await db.request('/rest/v1/rpc/finish_alcohol_photo',{method:'POST',body:{p_item:item.id,p_lease:job.lease,p_snapshot:item,p_result:result}});
  if(!applied&&path)await db.remove(path);
  return {status:applied?result.status:'changed-during-sync',item:item.id,checked};
 }catch(error){
  // If completion response was lost, retain the photo: the database may already reference it.
  await db.request('/rest/v1/rpc/finish_alcohol_photo',{method:'POST',body:{p_item:item.id,p_lease:job.lease,p_snapshot:item,p_result:{status:'retry',message:error.message}}});
  return {status:'retry',item:item.id};
 }
}
