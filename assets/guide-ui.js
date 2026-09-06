/* Shared rendering: public guide and live admin preview. */
(function(){
'use strict';
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize = s => String(s??'').toLowerCase().replace(/ё/g,'е').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
const align = v => ['left','center','right'].includes(v)?v:'left';
function classify(item){
 const tags=(item.mood_tags||[]).map(normalize);
 const non=tags.some(t=>['non alco','non alcohol','без алкоголя','безалкогольный','безалкогольное','0%'].includes(t));
 const alco=tags.some(t=>['alco','alcohol','алко','алкоголь','алкогольный','алкогольное'].includes(t));
 let frame=item.frame_mode||'auto';
 if(frame==='auto') frame=non?'nonalco':alco?'alco':'';
 let cold=item.serving_style||'auto';
 if(cold==='auto') cold=tags.includes('ice')||tags.includes('со льдом')?'ice':tags.some(t=>['cold','холодный','холодное','лед'].includes(t))?'cold':'';
 if(frame==='none') return {classes:'',flags:''};
 const flags=[];
 if(['alco','nonalco'].includes(frame)) flags.push(`<span class="drink-flag ${frame}">${frame==='alco'?'ALCO':'NON ALCO'}</span>`);
 if(['ice','cold'].includes(cold)) flags.push(`<span class="drink-flag cold">${cold.toUpperCase()}</span>`);
 return {classes:[['alco','nonalco'].includes(frame)?'drink-'+frame:'', ['ice','cold'].includes(cold)?'drink-cold':''].join(' '),flags:flags.length?`<div class="drink-flags">${flags.join('')}</div>`:''};
}
  function tagChip(t){
    return `<button type="button" class="tag" data-tag="${esc(t)}">${esc(t)}</button>`;
  }

  function cardHTML(item, publicUrl = value=>value){
    const visual = classify(item);
    const tags = (item.mood_tags||[]).map(tagChip).join('');
    const hasDetail = item.taste || item.aroma || item.aftertaste || item.presentation || item.who_for || item.fact || item.composition || item.pairing;
    let detail = '';
    if(hasDetail){
      detail += `<details>`;
      detail += `<summary>Подробнее</summary>`;
      if(item.composition) detail += `<div class="detail-row"><span class="k">Состав</span>${esc(item.composition).replace(/\n/g,', ')}</div>`;
      if(item.taste) detail += `<div class="detail-row"><span class="k">Вкус</span>${esc(item.taste)}</div>`;
      if(item.aroma) detail += `<div class="detail-row"><span class="k">Аромат</span>${esc(item.aroma)}</div>`;
      if(item.aftertaste) detail += `<div class="detail-row"><span class="k">Послевкусие</span>${esc(item.aftertaste)}</div>`;
      if(item.who_for) detail += `<div class="detail-row"><span class="k">Кому рекомендовать</span>${esc(item.who_for)}</div>`;
      if(item.fact) detail += `<div class="detail-row"><span class="k">Интересный факт</span>${esc(item.fact)}</div>`;
      if(item.pairing) detail += `<div class="detail-row"><span class="k">Сочетание</span>${esc(item.pairing)}</div>`;
      if(item.presentation) detail += `<div class="present">«${esc(item.presentation)}»</div>`;
      detail += `</details>`;
    }
    const photo = item.image_url ? `<div class="card-photo-wrap" tabindex="0" role="button" aria-label="Открыть фото «${esc(item.name)}» на весь экран" data-caption="${esc(item.name)}"><img class="card-photo" loading="lazy" decoding="async" src="${esc(publicUrl(item.image_url))}" alt="${esc(item.name)}" onerror="this.closest('.card-photo-wrap').remove()"><span class="photo-zoom-hint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M11 8v6M8 11h6"/></svg></span></div>` : '';
    const searchBlob = [item.name,item.name_en,item.teaser,item.taste,item.aroma,item.aftertaste,item.composition,item.who_for,item.fact,item.presentation,(item.mood_tags||[]).join(' ')].join(' ').toLowerCase();
    return `<div id="drink-${esc(item.id||'preview')}" class="card ${visual.classes}" data-align="${align(item.text_align)}" data-id="${esc(item.id||'')}" data-search="${esc(searchBlob)}" data-tags="${esc((item.mood_tags||[]).join('|').toLowerCase())}">
      ${photo}
      ${visual.flags}
      <div class="card-top">
        <div>
          <h3>${esc(item.name)}</h3>
          ${item.name_en?`<div class="eng">${esc(item.name_en)}</div>`:''}
        </div>
        ${item.price?`<div class="eng">${esc(item.price)}</div>`:''}
      </div>
      ${tags?`<div class="tags">${tags}</div>`:''}
      ${item.teaser?`<p class="teaser">${esc(item.teaser)}</p>`:''}
      ${detail}
    </div>`;
  }

  function sectionHead(cat){
    const icon = window.ICONS && window.ICONS[cat.icon] ? `<span class="icon" style="width:26px;height:26px;color:var(--gold)">${window.ICONS[cat.icon]}</span>` : '';
    return `<div class="section-head" data-align="${align(cat.text_align)}">
      <div>
        <span class="section-num">${String(cat._num).padStart(2,'0')} / КАТЕГОРИЯ</span>
        <h2>${icon}${esc(cat.title)}</h2>
      </div>
      ${cat.description?`<p class="section-desc">${esc(cat.description)}</p>`:''}
    </div>`;
  }


function newsHTML(n,index=0){
 const date=n.created_at?new Date(n.created_at):null;
 const stamp=date&&!isNaN(date)?date.toLocaleDateString('ru-RU',{day:'numeric',month:'long'}):'';
 return `<article class="lapsha-news-card ${n.pinned?'is-pinned':''}" data-align="${align(n.text_align)}"><div class="lapsha-news-meta"><span class="lapsha-news-index">${n.pinned?'Важное':'Новость '+String(index+1).padStart(2,'0')}</span><time class="lapsha-news-date">${esc(stamp)}</time></div>${n.title?`<h3 class="news-heading">${esc(n.title)}</h3>`:''}<p class="lapsha-news-message">${esc(n.message)}</p></article>`;
}
function renderNews(ticker,news){
 ticker.innerHTML=''; ticker.className='news-ticker lapsha-news-v2';
 if(!news.length){ticker.hidden=true;return;}
 ticker.hidden=false;
 const data=[...news].sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned));
 ticker.innerHTML=`<div class="lapsha-news-shell"><div class="lapsha-news-head"><div><span class="lapsha-news-kicker">Для команды</span><h2 class="lapsha-news-title">Новости меню</h2><p class="lapsha-news-subtitle">Изменения и новинки · листайте влево и вправо</p></div><div class="lapsha-news-controls"><button type="button" class="lapsha-news-btn prev" aria-label="Предыдущая новость">←</button><button type="button" class="lapsha-news-btn next" aria-label="Следующая новость">→</button></div></div><div class="lapsha-news-viewport" tabindex="0" role="region" aria-label="Лента новостей"><div class="lapsha-news-track">${data.map(newsHTML).join('')}</div></div><div class="lapsha-news-count" aria-live="polite"></div></div>`;
 const viewport=ticker.querySelector('.lapsha-news-viewport');
 const cards=[...ticker.querySelectorAll('.lapsha-news-card')];
 const prev=ticker.querySelector('.prev'),next=ticker.querySelector('.next');
 const size=()=>cards[0].getBoundingClientRect().width+14;
 const update=()=>{const index=Math.min(data.length,Math.round(viewport.scrollLeft/size())+1);ticker.querySelector('.lapsha-news-count').textContent=`${index} / ${data.length}`;prev.disabled=viewport.scrollLeft<2;next.disabled=viewport.scrollLeft+viewport.clientWidth>=viewport.scrollWidth-2;};
 const step=d=>viewport.scrollBy({left:d*size(),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 prev.onclick=()=>step(-1);next.onclick=()=>step(1);
 viewport.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();step(e.key==='ArrowLeft'?-1:1);}};
 viewport.addEventListener('scroll',update,{passive:true});
 let dragging=false,x=0,left=0;
 viewport.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0)return;dragging=true;x=e.clientX;left=viewport.scrollLeft;viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');});
 viewport.addEventListener('pointermove',e=>{if(dragging)viewport.scrollLeft=left-(e.clientX-x);});
 const end=()=>{dragging=false;viewport.classList.remove('dragging');update();};
 viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);
 if(window.ResizeObserver){const observer=new ResizeObserver(update);observer.observe(viewport);}
 requestAnimationFrame(update);
}
window.GuideUI={esc,normalize,align,classify,cardHTML,sectionHead,newsHTML,renderNews};
})();
