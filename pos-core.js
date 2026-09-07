/* Shared POS data, connectivity and touch input. */
(function(){'use strict';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ё/g,'е').replace(/[’'`]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function availability(data,id){return data?.availability.find(a=>a.item_id===id)||{item_id:id,status:'available',reason:'',revision:0};}
const labels={available:'В наличии',stop:'СТОП',limited:'Мало в наличии'};
function when(value){if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}
function safePhoto(sb,path){if(!path)return '';if(/^https:\/\//i.test(path))return path;if(/^https?:|^data:|^javascript:/i.test(path))return '';return sb.storage.from(window.GUIDE_BUCKET||'guide-media').getPublicUrl(path).data.publicUrl;}
function createStore(sb,admin=false){
 const target=new EventTarget(),key='lapsha-pos-cache:'+window.SUPABASE_URL;let data=admin?null:read(key,null),checked=0,healthy=false,running=false,again=false,destroyed=false,channel,timer,debounce;
 function emit(type,detail){target.dispatchEvent(new CustomEvent(type,{detail}));}
 function connection(ok,error=''){healthy=ok;emit('connection',{ok,error,checked});}
 async function sync(force=false){if(destroyed)return;if(running){again=true;return;}running=true;
 try{
  if(!navigator.onLine)throw Error('Нет сети');
  if(!force&&data){const result=await sb.from('pos_revision').select('revision').eq('id',1).single();if(result.error)throw result.error;
   if(String(result.data.revision)===String(data.revision)){checked=Date.now();connection(true);return;}}
  const result=await sb.rpc('pos_snapshot',{p_admin:admin});if(result.error)throw result.error;if(!result.data?.items)throw Error('Нет данных меню');
  const previous=data;data=result.data;checked=Date.now();if(!admin)write(key,data);connection(true);emit('data',{data,previous,cached:false});
 }catch(e){connection(false,e.message||'Не удалось связаться с сервером');}
 finally{running=false;if(again&&!destroyed){again=false;clearTimeout(debounce);debounce=setTimeout(()=>sync(true),150);}}
 }
 function schedule(){clearTimeout(timer);if(destroyed)return;timer=setTimeout(async()=>{await sync(false);schedule();},document.hidden?30000:10000);}
 function changed(){clearTimeout(debounce);debounce=setTimeout(()=>sync(true),120);}
 function resume(){sync(true);schedule();}
 function start(){if(data)queueMicrotask(()=>emit('data',{data,previous:null,cached:true}));sync(true);schedule();channel=sb.channel('pos-revision-'+(admin?'admin':'waiter')+'-'+Math.random().toString(36).slice(2)).on('postgres_changes',{event:'UPDATE',schema:'public',table:'pos_revision'},changed).subscribe(state=>{if(state==='SUBSCRIBED')sync(true);});window.addEventListener('online',resume);window.addEventListener('offline',resume);document.addEventListener('visibilitychange',resume);}
 return {on:(event,fn)=>target.addEventListener(event,e=>fn(e.detail)),start,sync:()=>sync(true),get data(){return data;},get fresh(){return healthy&&navigator.onLine&&checked>0&&Date.now()-checked<40000;},get checked(){return checked;},stop(){destroyed=true;clearTimeout(timer);clearTimeout(debounce);if(channel)sb.removeChannel(channel);window.removeEventListener('online',resume);window.removeEventListener('offline',resume);document.removeEventListener('visibilitychange',resume);}};
}
function keyboard(){
 const panel=document.createElement('section');panel.className='pos-keyboard';panel.hidden=true;panel.setAttribute('aria-label','Экранная клавиатура');document.body.append(panel);
 let input=null,lang=read('lapsha-pos-keyboard-lang','ru'),shift=false;const layouts={ru:['йцукенгшщзхъ','фывапролджэ','ячсмитьбю'],en:['qwertyuiop','asdfghjkl','zxcvbnm']};
 function hide(){panel.hidden=true;document.body.classList.remove('keyboard-open');input=null;}
 function change(text,back=false){if(!input)return;const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;const from=back&&start===end?Math.max(0,start-1):start;try{input.setRangeText(text,from,end,'end');}catch{input.value=input.value.slice(0,from)+text+input.value.slice(end);}input.dispatchEvent(new Event('input',{bubbles:true}));input.focus({preventScroll:true});}
 function paint(){panel.innerHTML=`<div class="keyboard-head"><span>Клавиатура · ${lang==='ru'?'Русский':'English'}</span><button type="button" data-key="hide">Скрыть ⌄</button></div><div class="key-row">${[...'1234567890@.-_'].map(k=>`<button type="button" data-key="${k}">${k}</button>`).join('')}</div>${layouts[lang].map(row=>`<div class="key-row">${[...row].map(k=>`<button type="button" data-key="${k}">${shift?k.toUpperCase():k}</button>`).join('')}</div>`).join('')}<div class="key-row"><button type="button" data-key="lang">RU / EN</button><button type="button" data-key="shift">⇧</button><button type="button" data-key="clear">Очистить</button><button type="button" data-key="space" class="space-key">Пробел</button><button type="button" data-key="back" aria-label="Удалить символ">⌫</button><button type="button" data-key="done">Готово</button></div>`;}
 panel.addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault();});
 panel.onclick=e=>{const button=e.target.closest('[data-key]');if(!button)return;const key=button.dataset.key;
 if(key==='hide'||key==='done'){const field=input;hide();field?.blur();if(key==='done')field?.dispatchEvent(new CustomEvent('pos:search-done'));return;}
 if(key==='lang'){lang=lang==='ru'?'en':'ru';write('lapsha-pos-keyboard-lang',lang);paint();return;}if(key==='shift'){shift=!shift;paint();return;}
 if(key==='clear'){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));return;}change(key==='back'?'':key==='space'?' ':shift?key.toUpperCase():key,key==='back');};
 document.addEventListener('focusin',e=>{if(e.target.matches('[data-pos-keyboard]')){input=e.target;if(read('lapsha-pos-keyboard',true)){panel.hidden=false;document.body.classList.add('keyboard-open');paint();}}else if(!panel.contains(e.target))hide();});
 document.addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target)&&e.target!==input&&!e.target.closest('[data-keyboard-toggle]'))hide();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
 return {hide,show(field){input=field;panel.hidden=false;document.body.classList.add('keyboard-open');paint();field.focus({preventScroll:true});}};
}
window.PosCore={read,write,esc,normalize,availability,labels,when,safePhoto,createStore,keyboard};
})();
