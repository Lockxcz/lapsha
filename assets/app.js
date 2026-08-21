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

  // ---------- NEWS TICKER ----------
  // Бегущая строка обновлений (тексты задаются в админ-панели, таблица `news`).
  // Автопрокрутка идёт слева направо и её можно "полистать" мышью/пальцем
  // или стрелками — при взаимодействии автопрокрутка приостанавливается.
  function newsItemHTML(n){
    const d = n.created_at ? new Date(n.created_at) : null;
    const dateStr = d ? d.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit' }) : '';
    return `<span class="news-item">${dateStr?`<span class="date">${dateStr}</span>`:''}<span class="dot"></span>${esc(n.message)}</span>`;
  }

  async function loadNews(){
    const ticker = document.getElementById('newsTicker');
    if(!ticker) return;
    const { data } = await sb.from('news').select('*').eq('published', true).order('sort_order').order('created_at', { ascending:false });
    if(!data || !data.length) return;

    const viewport = document.getElementById('newsViewport');
    const track = document.getElementById('newsTrack');
    const prevBtn = document.getElementById('newsPrev');
    const nextBtn = document.getElementById('newsNext');

    // items are duplicated so the strip can loop seamlessly
    track.innerHTML = data.map(newsItemHTML).join('') + data.map(newsItemHTML).join('');
    ticker.classList.add('show');

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let halfWidth = track.scrollWidth / 2;
    let paused = reduceMotion;
    let resumeTimer = null;

    // if content is shorter than the viewport there's nothing to loop/drag
    if(halfWidth <= viewport.clientWidth){ return; }

    viewport.scrollLeft = halfWidth;

    function pause(){
      paused = true;
      clearTimeout(resumeTimer);
    }
    function resumeSoon(delay){
      clearTimeout(resumeTimer);
      if(reduceMotion) return;
      resumeTimer = setTimeout(()=>{ paused = false; }, delay || 2500);
    }
    function wrap(){
      if(viewport.scrollLeft <= 0) viewport.scrollLeft += halfWidth;
      else if(viewport.scrollLeft >= halfWidth * 2) viewport.scrollLeft -= halfWidth;
    }

    const SPEED = 0.35; // px per frame, moves content left → right
    function tick(){
      if(!paused){
        viewport.scrollLeft -= SPEED;
        wrap();
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    // ---- manual drag (mouse + touch) ----
    let dragging = false, startX = 0, startScroll = 0;
    viewport.addEventListener('pointerdown', e=>{
      dragging = true;
      pause();
      viewport.classList.add('dragging');
      startX = e.clientX;
      startScroll = viewport.scrollLeft;
      viewport.setPointerCapture(e.pointerId);
    });
    viewport.addEventListener('pointermove', e=>{
      if(!dragging) return;
      viewport.scrollLeft = startScroll - (e.clientX - startX);
      wrap();
    });
    function endDrag(){
      if(!dragging) return;
      dragging = false;
      viewport.classList.remove('dragging');
      resumeSoon();
    }
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    viewport.addEventListener('mouseenter', pause);
    viewport.addEventListener('mouseleave', ()=>{ if(!dragging) resumeSoon(400); });

    // ---- prev / next buttons: step by roughly one viewport width ----
    function step(dir){
      pause();
      viewport.scrollLeft += dir * viewport.clientWidth * 0.8;
      wrap();
      resumeSoon();
    }
    prevBtn.addEventListener('click', ()=> step(-1));
    nextBtn.addEventListener('click', ()=> step(1));

    window.addEventListener('resize', ()=>{ halfWidth = track.scrollWidth / 2; });
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
    const photo = item.image_url ? `<div class="card-photo-wrap" tabindex="0" role="button" aria-label="Открыть фото «${esc(item.name)}» на весь экран" data-caption="${esc(item.name)}"><img class="card-photo" loading="lazy" decoding="async" src="${publicUrl(item.image_url)}" alt="${esc(item.name)}" onerror="this.closest('.card-photo-wrap').remove()"><span class="photo-zoom-hint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M11 8v6M8 11h6"/></svg></span></div>` : '';
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

    initLightbox();
    initScrollReveal();
    initBackToTop();
  }

  // ---------- LIGHTBOX ----------
  function initLightbox(){
    const lightbox = document.getElementById('lightbox');
    const imgEl = document.getElementById('lightboxImg');
    const captionEl = document.getElementById('lightboxCaption');
    const countEl = document.getElementById('lightboxCount');
    const closeBtn = document.getElementById('lightboxClose');
    const prevBtn = document.getElementById('lightboxPrev');
    const nextBtn = document.getElementById('lightboxNext');
    let items = [];
    let idx = -1;
    let lastFocused = null;

    function collect(){
      // only include photos that are currently visible (respects active search/tag filters)
      items = Array.from(document.querySelectorAll('.card-photo-wrap')).filter(w => w.offsetParent !== null);
    }

    function openAt(i){
      collect();
      if(!items.length) return;
      idx = (i + items.length) % items.length;
      const wrap = items[idx];
      const img = wrap.querySelector('img');
      if(!img) return;
      imgEl.src = img.src;
      imgEl.alt = img.alt || '';
      captionEl.textContent = wrap.dataset.caption || img.alt || '';
      const multi = items.length > 1;
      prevBtn.style.display = multi ? 'flex' : 'none';
      nextBtn.style.display = multi ? 'flex' : 'none';
      countEl.textContent = multi ? `${idx+1} / ${items.length}` : '';
      lastFocused = document.activeElement;
      lightbox.classList.add('open');
      document.body.style.overflow = 'hidden';
      closeBtn.focus();
    }

    function close(){
      lightbox.classList.remove('open');
      document.body.style.overflow = '';
      imgEl.src = '';
      if(lastFocused && lastFocused.focus) lastFocused.focus();
    }

    mainEl.addEventListener('click', e=>{
      const wrap = e.target.closest('.card-photo-wrap');
      if(!wrap) return;
      collect();
      openAt(items.indexOf(wrap));
    });
    mainEl.addEventListener('keydown', e=>{
      if(e.key !== 'Enter' && e.key !== ' ') return;
      const wrap = e.target.closest('.card-photo-wrap');
      if(!wrap) return;
      e.preventDefault();
      collect();
      openAt(items.indexOf(wrap));
    });

    closeBtn.addEventListener('click', close);
    prevBtn.addEventListener('click', ()=> openAt(idx - 1));
    nextBtn.addEventListener('click', ()=> openAt(idx + 1));
    lightbox.addEventListener('click', e=>{ if(e.target === lightbox) close(); });

    document.addEventListener('keydown', e=>{
      if(!lightbox.classList.contains('open')) return;
      if(e.key === 'Escape') close();
      else if(e.key === 'ArrowLeft') openAt(idx - 1);
      else if(e.key === 'ArrowRight') openAt(idx + 1);
    });

    // basic touch swipe
    let touchStartX = null;
    lightbox.addEventListener('touchstart', e=>{ touchStartX = e.changedTouches[0].clientX; }, {passive:true});
    lightbox.addEventListener('touchend', e=>{
      if(touchStartX==null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      if(Math.abs(dx) > 50) openAt(dx > 0 ? idx - 1 : idx + 1);
      touchStartX = null;
    }, {passive:true});
  }

  // ---------- SCROLL REVEAL ----------
  function initScrollReveal(){
    const targets = document.querySelectorAll('.card, .spirit-group, .section-head, .staff-tip');
    if(!('IntersectionObserver' in window)){
      targets.forEach(t=>t.classList.add('in-view'));
      return;
    }
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold:0.08, rootMargin:'0px 0px -60px 0px' });
    targets.forEach(t=>io.observe(t));
  }

  // ---------- BACK TO TOP ----------
  function initBackToTop(){
    const btn = document.getElementById('backToTop');
    if(!btn) return;
    window.addEventListener('scroll', ()=>{
      btn.classList.toggle('show', window.scrollY > 500);
    }, {passive:true});
    btn.addEventListener('click', ()=>{
      window.scrollTo({top:0, behavior:'smooth'});
    });
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
    loadNews();
  })();
})();
