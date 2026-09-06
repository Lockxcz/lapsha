/* LAPSHA v4 — device-local study tools and catalogue controls. */
(function(){
'use strict';
const {esc,normalize}=window.GuideUI;
const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key));return v??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
const legacyPrefs=read('lapsha-view-v4',{});
const savedPrefs=read('lapsha-view-v41',{...legacyPrefs,theme:'dark'});
const prefs={theme:'dark',layout:'grid',density:'comfortable',size:'normal',...savedPrefs};
if(!['dark','light'].includes(prefs.theme))prefs.theme='dark';
function paintPrefs(){
 for(const key of ['theme','layout','density','size'])document.documentElement.dataset[key]=prefs[key];
 write('lapsha-view-v41',prefs);
}
paintPrefs();
const modal=document.createElement('dialog');modal.className='guide-dialog';modal.setAttribute('aria-label','Инструменты меню');
modal.innerHTML='<div class="dialog-header"><h2 id="toolTitle"></h2><button type="button" class="icon-button" id="closeTool" aria-label="Закрыть">×</button></div><div id="toolBody"></div>';
document.body.append(modal);
const title=modal.querySelector('#toolTitle'),body=modal.querySelector('#toolBody');
modal.querySelector('#closeTool').onclick=()=>modal.close();
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close();}});
function show(name,html){title.textContent=name;body.innerHTML=html;if(!modal.open)modal.showModal();}
const status=document.createElement('div');status.className='guide-toast';status.setAttribute('role','status');document.body.append(status);let toastTimer;
function toast(message){status.textContent=message;status.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>status.classList.remove('show'),2600);}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('Скопировано');}catch{show('Скопируйте текст',`<textarea class="copy-text" readonly>${esc(text)}</textarea>`);body.querySelector('textarea').select();}}
let news=[];const rawRead=read('lapsha-news-read-v4',[]);const readNews=new Set(Array.isArray(rawRead)?rawRead:[]);
function initNews(e){
 news=e.detail;
 const ticker=document.getElementById('newsTicker');
 const controls=ticker.querySelector('.lapsha-news-head');
 const nextUnread=document.createElement('button');nextUnread.type='button';nextUnread.className='subtle-button';
 const update=()=>{nextUnread.textContent=`Непрочитанные · ${news.filter(n=>!readNews.has(n.id)).length}`;};update();controls.append(nextUnread);
 nextUnread.onclick=()=>{const n=news.find(n=>!readNews.has(n.id));if(!n){toast('Все новости отмечены прочитанными');return;}const c=[...ticker.querySelectorAll('[data-news-id]')].find(c=>c.dataset.newsId===n.id);c?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'start'});};
 ticker.querySelectorAll('[data-news-id]').forEach(card=>{
  const n=news.find(n=>n.id===card.dataset.newsId);if(!n)return;
  const btn=document.createElement('button');btn.type='button';btn.className='news-read';
  const paint=()=>{const on=readNews.has(n.id);btn.textContent=on?'✓ Прочитано':'Отметить прочитанным';btn.setAttribute('aria-pressed',String(on));card.classList.toggle('is-read',on);};paint();
  btn.onclick=()=>{readNews.has(n.id)?readNews.delete(n.id):readNews.add(n.id);write('lapsha-news-read-v4',[...readNews].slice(-500));paint();update();};
  card.append(btn);
 });
}
document.addEventListener('guide:news',initNews);
if(window.GuideNews)initNews({detail:window.GuideNews});
function initCatalogue(){
 if(document.querySelector('.catalog-controls'))return;
 const data=window.GuideData,items=data.items,byId=new Map(items.map(i=>[i.id,i]));
 const cards=[...document.querySelectorAll('#sections .card')],cardById=new Map(cards.map(c=>[c.dataset.id,c]));
 const storedLearned=read('lapsha-learned-v4',[]);const learned=new Set(Array.isArray(storedLearned)?storedLearned:[]);
 const storedRecent=read('lapsha-recent-v4',[]);let recent=(Array.isArray(storedRecent)?storedRecent:[]).filter(id=>byId.has(id)).slice(0,12);
 const selected=new Set();
 const toolbar=document.createElement('section');toolbar.className='catalog-controls';toolbar.setAttribute('aria-label','Настройки меню');
 const opts=(arr)=>arr.map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
 toolbar.innerHTML=`<div class="catalog-title"><div><span class="eyebrow">Барная карта</span><h2>Найти свой вкус<span class="result-count" id="resultCount"></span></h2></div><div class="catalog-actions"><button type="button" id="studyStart">Изучать меню</button><button type="button" id="compareOpen">Сравнить · 0</button><button type="button" id="randomDrink" class="subtle-button">Случайный напиток</button></div></div>
 <div class="filter-row"><label>Категория<select id="categoryFilter"><option value="">Все категории</option>${data.categories.map(c=>`<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('')}</select></label><label>Тип<select id="typeFilter">${opts([['','Любой'],['alco','ALCO'],['nonalco','NON ALCO']])}</select></label><label>Подача<select id="servingFilter">${opts([['','Любая'],['ice','ICE · со льдом'],['cold','COLD · холодный'],['hot','HOT · горячий']])}</select></label><label>Порядок<select id="sortOrder">${opts([['default','Как в меню'],['az','Название А—Я'],['za','Название Я—А']])}</select></label><button type="button" id="resetAll" class="subtle-button">Сбросить</button></div>
 <details class="view-options"><summary>Вид и обучение <span id="studyProgress"></span></summary><div class="filter-row"><label>Тема<select id="themeChoice">${opts([['light','Светлая'],['dark','Тёмная']])}</select></label><label>Карточки<select id="layoutChoice">${opts([['grid','Сетка'],['list','Список']])}</select></label><label>Плотность<select id="densityChoice">${opts([['comfortable','Свободная'],['compact','Компактная']])}</select></label><label>Текст<select id="sizeChoice">${opts([['normal','Обычный'],['large','Увеличенный']])}</select></label><label>Знание меню<select id="learnedFilter">${opts([['','Все напитки'],['new','Ещё не изучены'],['learned','Уже изучены']])}</select></label></div><div class="catalog-actions"><button type="button" id="recentOpen">Недавно открытые</button><button type="button" id="resumeLast">Продолжить изучение</button><button type="button" id="printMenu">Печать текущего меню</button><button type="button" id="clearLearned">Сбросить изученное</button></div></details>`;
 document.getElementById('sections').before(toolbar);
 const $=id=>toolbar.querySelector('#'+id);
 for(const key of ['theme','layout','density','size']){const control=$(key+'Choice');control.value=prefs[key];control.onchange=()=>{prefs[key]=control.value;paintPrefs();};}
 const types=i=>{
  const tags=(i.mood_tags||[]).map(normalize);const visual=window.GuideUI.classify({...i,frame_mode:i.frame_mode==='none'?'auto':i.frame_mode});
  const type=visual.classes.includes('drink-nonalco')?'nonalco':visual.classes.includes('drink-alco')?'alco':'';
  const serving=window.GuideUI.serving(i);
  return {type,serving};
 };
 function filter(){
  const ids=items.filter(i=>{const t=types(i);return (!$('categoryFilter').value||i.category_id===$('categoryFilter').value)&&(!$('typeFilter').value||t.type===$('typeFilter').value)&&(!$('servingFilter').value||t.serving===$('servingFilter').value)&&(!$('learnedFilter').value||($('learnedFilter').value==='learned'?learned.has(i.id):!learned.has(i.id)));}).map(i=>i.id);
  document.dispatchEvent(new CustomEvent('guide:extra-filter',{detail:ids}));
 }
 ['categoryFilter','typeFilter','servingFilter','learnedFilter'].forEach(id=>$(id).onchange=filter);
 const originalGrids=[...document.querySelectorAll('#sections .grid')].map(grid=>({grid,children:[...grid.children]}));
 function sort(){for(const {grid,children} of originalGrids){const ordered=[...children];if($('sortOrder').value!=='default')ordered.sort((a,b)=>(a.querySelector('h3')?.textContent||'').localeCompare(b.querySelector('h3')?.textContent||'','ru')*($('sortOrder').value==='az'?1:-1));ordered.forEach(c=>grid.append(c));}}
 $('sortOrder').onchange=sort;
 $('resetAll').onclick=()=>document.dispatchEvent(new Event('guide:reset'));
 document.addEventListener('guide:reset',()=>{['categoryFilter','typeFilter','servingFilter','learnedFilter'].forEach(id=>$(id).value='');$('sortOrder').value='default';sort();});
 document.addEventListener('guide:filtered',e=>{$('resultCount').textContent=`${e.detail.visible} / ${cards.length}`;});
 function progress(){const n=items.filter(i=>learned.has(i.id)).length;$('studyProgress').textContent=`Изучено ${n} из ${items.length}`;}
 const learnButtons=new Map();
 function mark(id){learned.has(id)?learned.delete(id):learned.add(id);write('lapsha-learned-v4',[...learned]);learnButtons.get(id)?.();progress();filter();}
 function remember(id){if(!byId.has(id))return;recent=[id,...recent.filter(x=>x!==id)].slice(0,12);write('lapsha-recent-v4',recent);}
 document.addEventListener('guide:opened',e=>remember(e.detail));
 function openCard(id){const card=cardById.get(id);if(!card)return;document.dispatchEvent(new Event('guide:reset'));card.closest('.spirit-group')?.setAttribute('open','');card.classList.add('in-view');const detail=card.querySelector(':scope > details');if(detail)detail.open=true;card.scrollIntoView({behavior:'smooth',block:'center'});remember(id);}
 cards.forEach(card=>{
  const id=card.dataset.id,item=byId.get(id);if(!item)return;
  const actions=document.createElement('div');actions.className='card-actions';
  actions.innerHTML='<button type="button" class="compare-toggle" aria-pressed="false">Сравнить</button><button type="button" class="learn-toggle" aria-pressed="false">Изучено</button><details class="card-more"><summary aria-label="Другие действия">•••</summary><div><button type="button" class="copy-drink">Копировать описание</button><button type="button" class="share-drink">Ссылка на напиток</button></div></details>';
  card.append(actions);
  const cb=actions.querySelector('.compare-toggle');cb.onclick=()=>{if(selected.has(id))selected.delete(id);else{if(selected.size===3){toast('Можно сравнить до трёх напитков');return;}selected.add(id);}cb.setAttribute('aria-pressed',String(selected.has(id)));$('compareOpen').textContent=`Сравнить · ${selected.size}`;};
  const lb=actions.querySelector('.learn-toggle');const paint=()=>{lb.setAttribute('aria-pressed',String(learned.has(id)));lb.textContent=learned.has(id)?'✓ Изучено':'Отметить изученным';};learnButtons.set(id,paint);paint();lb.onclick=()=>mark(id);
  actions.querySelector('.copy-drink').onclick=()=>copy([item.name,item.teaser,item.composition?'Состав: '+item.composition:'',item.taste?'Вкус: '+item.taste:'',item.price].filter(Boolean).join('\n\n'));
  actions.querySelector('.share-drink').onclick=()=>{const url=new URL(location.href);url.hash='drink-'+id;copy(url.href);};
  card.querySelector(':scope > details')?.addEventListener('toggle',e=>{if(e.currentTarget.open)remember(id);});
 });
 $('compareOpen').onclick=()=>{
  if(selected.size<2){toast('Выберите «Сравнить» у двух или трёх напитков');return;}
  const records=[...selected].map(id=>byId.get(id));
  const fields=[['teaser','Описание'],['composition','Состав'],['taste','Вкус'],['aroma','Аромат'],['who_for','Кому рекомендовать'],['pairing','Сочетание'],['price','Цена / объём']];
  show('Сравнение напитков',`<div class="compare-scroll"><table class="compare-table"><thead><tr><th>Напиток</th>${records.map(i=>`<th>${esc(i.name)}</th>`).join('')}</tr></thead><tbody>${fields.map(([key,label])=>`<tr><th>${label}</th>${records.map(i=>`<td>${esc(i[key]||'Не указано')}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="dialog-note">Пустые характеристики не дополняются автоматически.</p>`);
 };
 const visible=()=>cards.filter(c=>c.style.display!=='none').map(c=>byId.get(c.dataset.id));
 $('randomDrink').onclick=()=>{const list=visible();if(!list.length){toast('Сначала сбросьте фильтры');return;}openCard(list[Math.floor(Math.random()*list.length)].id);};
 $('recentOpen').onclick=()=>{
  show('Недавно открытые',recent.length?recent.map(id=>`<button type="button" class="recent-entry" data-open="${esc(id)}">${esc(byId.get(id).name)} →</button>`).join(''):'<p>Откройте подробности любого напитка — он появится здесь.</p>');
  body.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{modal.close();openCard(b.dataset.open);});
 };
 $('resumeLast').onclick=()=>recent.length?openCard(recent[0]):toast('Сначала откройте подробности напитка');
 $('clearLearned').onclick=()=>{
  show('Сбросить отметки об изучении?', '<p>Будут сброшены только отметки «Изучено» в этом браузере. Меню и избранное сохранятся.</p><button type="button" id="confirmResetStudy">Сбросить отметки</button>');
  body.querySelector('#confirmResetStudy').onclick=()=>{learned.clear();write('lapsha-learned-v4',[]);learnButtons.forEach(paint=>paint());progress();filter();modal.close();};
 };
 $('printMenu').onclick=()=>{const details=[...document.querySelectorAll('#sections details')];const previous=details.map(d=>d.open);details.forEach(d=>d.open=true);const restore=()=>{details.forEach((d,i)=>d.open=previous[i]);};window.addEventListener('afterprint',restore,{once:true});window.print();};
 $('studyStart').onclick=()=>{
  const deck=visible().filter(i=>i.composition||i.taste||i.presentation||i.aroma);if(!deck.length){toast('Для изучения нужен состав, вкус, аромат или презентация напитков');return;}
  let index=0,revealed=false;
  function renderStudy(){
   const item=deck[index];
   show('Изучение меню',`<div class="study-card"><p class="eyebrow">${index+1} / ${deck.length}</p><h3>${esc(item.name)}</h3><p>Вспомните состав, вкус и как предложить напиток гостю.</p>${revealed?`<div class="study-answer">${[['composition','Состав'],['taste','Вкус'],['aroma','Аромат'],['presentation','Как предложить']].filter(([k])=>item[k]).map(([k,label])=>`<p><strong>${label}</strong><br>${esc(item[k])}</p>`).join('')}</div>`:'<button type="button" id="revealAnswer">Показать ответ</button>'}<div class="study-actions"><button type="button" id="studyPrev" ${index===0?'disabled':''}>Назад</button><button type="button" id="studyMark">${learned.has(item.id)?'✓ Изучено':'Запомнил'}</button><button type="button" id="studyNext" ${index===deck.length-1?'disabled':''}>Далее</button></div></div>`);
   body.querySelector('#revealAnswer')?.addEventListener('click',()=>{revealed=true;remember(item.id);renderStudy();});
   body.querySelector('#studyPrev').onclick=()=>{index=Math.max(0,index-1);revealed=false;renderStudy();};body.querySelector('#studyNext').onclick=()=>{index=Math.min(deck.length-1,index+1);revealed=false;renderStudy();};
   body.querySelector('#studyMark').onclick=()=>{if(!learned.has(item.id))mark(item.id);renderStudy();};
  }
  renderStudy();
 };
 progress();filter();
 const route=()=>{let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}if(id.startsWith('drink-'))openCard(id.slice(6));};route();window.addEventListener('hashchange',route);
}
document.addEventListener('guide:ready',initCatalogue);
if(window.GuideReady)initCatalogue();
})();
