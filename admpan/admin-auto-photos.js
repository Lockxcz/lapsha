/* Read-only progress: filling photos never requires a button in the admin panel. */
(function(){
 'use strict';const {sb}=window.GuideAdmin;let version=0;
 const box=document.createElement('section');box.className='panel auto-photo-panel';box.hidden=true;
 document.querySelector('.bulk-tools').before(box);
 const labels={pending:'В очереди',processing:'Поиск фото…',done:'Фото добавлено автоматически',retry:'Повторим автоматически',unmatched:'Точное совпадение не найдено',skipped:'Фото заполнено'};
 async function show(e){
  const request=++version,items=e.detail;box.hidden=true;if(!items.length)return;
  const category=(window.GuideAdmin.categories||[]).find(c=>c.id===items[0].category_id);
  if(!category||!(['alcohol','alcohol-menu','alcohol-card'].includes(category.slug?.toLowerCase())||['алкогольная карта','алкоголь','алкогольные напитки'].includes(category.title?.trim().toLowerCase())))return;
  box.hidden=false;box.textContent='Проверяем автоматическое заполнение фото…';
  const {data,error}=await sb.from('alcohol_photo_jobs').select('item_id,status,source_url,source_name,message,updated_at').in('item_id',items.map(i=>i.id));
  if(request!==version)return;
  box.replaceChildren();const heading=document.createElement('h3');heading.textContent='Автоматические фото алкогольной карты';box.append(heading);
  const text=document.createElement('p');
  text.textContent=error?'Для автоматического заполнения выполните update-v5.sql и настройте фоновую функцию Netlify по инструкции обновления.':`С фото: ${items.filter(i=>i.image_url?.trim()).length} из ${items.length}. Остальные позиции обрабатываются в фоне, по одной каждые 2 минуты. Обновите список позже, чтобы увидеть результат.`;box.append(text);
  if(error)return;
  const jobs=new Map((data||[]).map(j=>[j.item_id,j]));
  document.querySelectorAll('#itemsTable [data-edit-item]').forEach(button=>{
   const job=jobs.get(button.dataset.editItem);if(!job)return;
   const note=document.createElement('div');note.className='auto-photo-state';note.textContent=labels[job.status]||job.status;note.title=job.message||'';
   if(job.source_url){try{const url=new URL(job.source_url);if(url.protocol==='https:'&&['newelitalco.kz','alcomag.kz'].includes(url.hostname)){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent=' · Источник';link.title=job.source_name||'';note.append(link);}}catch{}}
   button.closest('tr').querySelector('td:nth-child(3)').append(note);
  });
 }
 document.addEventListener('admin:items',show);
 document.addEventListener('admin:items-loading',()=>{version++;box.hidden=true;});
 if(window.GuideAdmin.items)show({detail:window.GuideAdmin.items});
 const theme=document.createElement('button');theme.type='button';theme.className='btn secondary';theme.style.margin='12px 0';
 let value='dark';try{value=localStorage.getItem('lapsha-admin-theme')||'dark';}catch{}
 function paint(){document.documentElement.dataset.theme=value==='light'?'light':'dark';theme.textContent=value==='light'?'Переключить на тёмную тему':'Переключить на светлую тему';}
 theme.onclick=()=>{value=value==='light'?'dark':'light';try{localStorage.setItem('lapsha-admin-theme',value);}catch{}paint();};paint();
 document.querySelector('.sidebar .brand').after(theme);
})();
