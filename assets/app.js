(function(){
  'use strict';

  const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  const mainEl = document.getElementById('sections');
  const tocEl = document.getElementById('toc');
  const chipsEl = document.getElementById('chips');
  const searchInput = document.getElementById('search');
  const noResults = document.getElementById('noResults');
  const filterBar = document.getElementById('filterBar');
  const activeTagLabel = document.getElementById('activeTagLabel');
  const clearFilterBtn = document.getElementById('clearFilter');

  let activeTag = null;

  function esc(s){ return (s==null?'':String(s)); }

  function publicUrl(path){
    if(!path) return '';
    if(/^https?:\/\//.test(path)) return path;
    const { data } = sb.storage.from(window.GUIDE_BUCKET).getPublicUrl(path);
    return data ? data.publicUrl : '';
  }

  async function loadSettings(){
    const { data } = await sb.from('settings').select('*').eq('id',1).single();
    if(!data) return;
    const root = document.documentElement.style;
    root.setProperty('--bg', data.color_bg);
    root.setProperty('--surface', data.color_surface);
    root.setProperty('--gold', data.color_gold);
    root.setProperty('--gold-bright', data.color_gold_bright);
    root.setProperty('--text', data.color_text);
    root.setProperty('--text-muted', data.color_text_muted);
    if(data.font_heading) root.setProperty('--font-head', `'${data.font_heading}', serif`);
    if(data.font_body) root.setProperty('--font-body', `'${data.font_body}', sans-serif`);

    document.title = data.site_title || 'Гид по барному меню';
    document.getElementById('heroEyebrow').textContent = data.hero_eyebrow || '';
    document.getElementById('heroTitle').innerHTML = data.hero_title || '';
    document.getElementById('heroSubtitle').textContent = data.hero_subtitle || '';
    document.getElementById('heroQuote').textContent = data.hero_quote ? `«${data.hero_quote}»` : '';

    const brand = document.getElementById('navBrand');
    const logoBox = document.getElementById('heroLogo');
    if(data.logo_url){
      const url = publicUrl(data.logo_url);
      brand.innerHTML = `<img src="${url}" alt="Логотип">${esc(data.site_title||'')}`;
      logoBox.innerHTML = `<img class="hero-logo" src="${url}" alt="${esc(data.site_title||'Логотип')}">`;
    } else {
      brand.innerHTML = `<span class="ring"></span>${esc(data.site_title||'Гид')}`;
      logoBox.innerHTML = `<div class="hero-logo placeholder">${esc(data.site_title||'ГИД')}</div>`;
    }
    if(data.favicon_url){
      let link = document.querySelector("link[rel~='icon']");
      if(!link){ link = document.createElement('link'); link.rel='icon'; document.head.appendChild(link); }
      link.href = publicUrl(data.favicon_url);
    }
  }

  function tagChip(t){
    return `<span class="tag" data-tag="${esc(t)}">${esc(t)}</span>`;
  }

  function cardHTML(item){
    const tags = (item.mood_tags||[]).map(tagChip).join('');
    const hasDetail = item.taste || item.aroma || item.aftertaste || item.presentation || item.who_for || item.fact || item.composition;
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
    const photo = item.image_url ? `<img class="card-photo" loading="lazy" src="${publicUrl(item.image_url)}" alt="${esc(item.name)}">` : '';
    const searchBlob = [item.name,item.name_en,item.teaser,item.taste,item.aroma,item.aftertaste,item.composition,item.who_for,item.fact,item.presentation,(item.mood_tags||[]).join(' ')].join(' ').toLowerCase();
    return `<div class="card" data-search="${esc(searchBlob)}" data-tags="${esc((item.mood_tags||[]).join('|').toLowerCase())}">
      ${photo}
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
    return `<div class="section-head">
      <div>
        <span class="section-num">${String(cat._num).padStart(2,'0')} / КАТЕГОРИЯ</span>
        <h2>${icon}${esc(cat.title)}</h2>
      </div>
      ${cat.description?`<p class="section-desc">${esc(cat.description)}</p>`:''}
    </div>`;
  }

  function tipHTML(tip){
    if(!tip) return '';
    return `<div class="staff-tip"><span class="lbl">Совет официанту</span>${esc(tip)}</div>`;
  }

  async function loadContent(){
    const [{data:cats}, {data:groups}, {data:items}] = await Promise.all([
      sb.from('categories').select('*').eq('published',true).order('sort_order'),
      sb.from('item_groups').select('*').order('sort_order'),
      sb.from('items').select('*').eq('published',true).order('sort_order'),
    ]);
    if(!cats) return;

    const groupsByCat = {};
    (groups||[]).forEach(g=>{ (groupsByCat[g.category_id] ||= []).push(g); });
    const itemsByCat = {};
    (items||[]).forEach(it=>{ (itemsByCat[it.category_id] ||= []).push(it); });

    mainEl.innerHTML = '';
    tocEl.innerHTML = '';
    chipsEl.innerHTML = `<button class="chip active" data-target="top">Все</button>`;

    cats.forEach((cat, idx)=>{
      cat._num = idx+1;
      const sec = document.createElement('section');
      sec.className = 'section';
      sec.id = cat.slug;
      sec.dataset.cat = cat.slug;

      const catGroups = groupsByCat[cat.id] || [];
      const catItems = itemsByCat[cat.id] || [];

      let body = sectionHead(cat) + tipHTML(cat.staff_tip);

      if(catGroups.length){
        catGroups.forEach(g=>{
          const gi = catItems.filter(it=>it.group_id===g.id);
          if(!gi.length) return;
          body += `<div class="spirit-group"><h4>${esc(g.title)}</h4><div class="grid">${gi.map(cardHTML).join('')}</div></div>`;
        });
        const ungrouped = catItems.filter(it=>!it.group_id);
        if(ungrouped.length) body += `<div class="grid">${ungrouped.map(cardHTML).join('')}</div>`;
      } else {
        body += catItems.length ? `<div class="grid">${catItems.map(cardHTML).join('')}</div>`
                                 : `<p style="color:var(--text-faint);font-size:14px;">Раздел пока пуст — добавьте напитки в админ-панели.</p>`;
      }

      sec.innerHTML = body;
      mainEl.appendChild(sec);

      tocEl.innerHTML += `<a href="#${cat.slug}"><span class="ring"></span>${esc(cat.title)}</a>`;
      chipsEl.innerHTML += `<button class="chip" data-target="${cat.slug}">${esc(cat.title)}</button>`;
    });

    initInteractions();
  }

  function initInteractions(){
    // ---- chip navigation ----
    chipsEl.addEventListener('click', e=>{
      const btn = e.target.closest('.chip');
      if(!btn) return;
      const target = btn.dataset.target;
      if(target === 'top'){ document.getElementById('top').scrollIntoView({behavior:'smooth'}); }
      else { document.getElementById(target).scrollIntoView({behavior:'smooth'}); }
    });

    // ---- scroll-spy ----
    const sections = Array.from(document.querySelectorAll('.section'));
    const chipButtons = Array.from(chipsEl.querySelectorAll('.chip'));
    const spy = new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          const slug = entry.target.dataset.cat;
          chipButtons.forEach(c=>c.classList.toggle('active', c.dataset.target===slug));
        }
      });
    }, { rootMargin:'-40% 0px -55% 0px', threshold:0 });
    sections.forEach(s=>spy.observe(s));

    // ---- clickable tag filters ----
    mainEl.addEventListener('click', e=>{
      const tagEl = e.target.closest('.tag[data-tag]');
      if(!tagEl) return;
      const tag = tagEl.dataset.tag;
      activeTag = (activeTag === tag) ? null : tag;
      applyFilters();
    });
    clearFilterBtn.addEventListener('click', ()=>{ activeTag = null; applyFilters(); });

    // ---- search ----
    searchInput.addEventListener('input', e=> applyFilters(e.target.value));
  }

  function applyFilters(query){
    const q = (query!==undefined ? query : searchInput.value).trim().toLowerCase();

    if(activeTag){
      filterBar.classList.add('show');
      activeTagLabel.textContent = activeTag;
    } else {
      filterBar.classList.remove('show');
    }

    let anyVisible = false;
    document.querySelectorAll('.section').forEach(sec=>{
      let sectionHasMatch = false;
      const cards = sec.querySelectorAll('.card[data-search]');
      cards.forEach(card=>{
        const hay = card.dataset.search || '';
        const tags = (card.dataset.tags || '').split('|');
        const matchesQuery = !q || hay.includes(q);
        const matchesTag = !activeTag || tags.includes(activeTag.toLowerCase());
        const match = matchesQuery && matchesTag;
        card.style.display = match ? '' : 'none';
        if(match) sectionHasMatch = true;
      });
      // sections without cards (spirit lists use plain text, always considered visible unless filtering)
      if(!q && !activeTag){ sec.style.display=''; sectionHasMatch = true; }
      else sec.style.display = sectionHasMatch ? '' : 'none';
      if(sectionHasMatch) anyVisible = true;
    });
    noResults.style.display = ((q||activeTag) && !anyVisible) ? 'block' : 'none';
  }

  document.querySelectorAll('.tag').forEach(t=>{
    t.addEventListener('click', ()=>{
      document.querySelectorAll('.tag').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
    });
  });

  (async function init(){
    await loadSettings();
    await loadContent();
  })();
})();
