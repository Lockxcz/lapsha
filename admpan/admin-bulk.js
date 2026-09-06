/* Bulk edits: explicit selection, review, then one scoped update. */
(function(){
'use strict';
const {sb,toast,loadItemsTable}=window.GuideAdmin;
const {esc}=window.GuideUI;
const $=id=>document.getElementById(id);
let records=[],selection=new Set(),groupVersion=0,groupsLoading=false;
const tools=document.createElement('section');tools.className='bulk-tools';
const options=rows=>'<option value="">Не менять</option>'+rows.map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
tools.innerHTML=`<div class="bulk-heading"><h3>Массовое редактирование</h3><strong id="bulkCount" role="status">Выбрано: 0</strong></div><div class="bulk-buttons"><button type="button" class="btn secondary" id="bulkSelectVisible">Выбрать показанные</button><button type="button" class="btn secondary" id="bulkClear">Снять выбор</button><button type="button" class="btn secondary" id="bulkExport">Скачать выбранные JSON</button></div><p class="bulk-help">Отметьте напитки в таблице. Меняются только заполненные ниже параметры; остальные поля сохраняются.</p><div class="row3"><div class="field"><label for="bulkServing">Подача</label><select id="bulkServing">${options([['auto','По тегам'],['none','Не указывать'],['ice','ICE — со льдом'],['cold','COLD — холодный'],['hot','HOT — горячий']])}</select></div><div class="field"><label for="bulkFrame">Рамка</label><select id="bulkFrame">${options([['auto','По тегам'],['none','Без рамки и меток'],['alco','ALCO — красная'],['nonalco','NON ALCO — синяя']])}</select></div><div class="field"><label for="bulkAlign">Выравнивание</label><select id="bulkAlign">${options([['left','Слева'],['center','По центру'],['right','Справа']])}</select></div></div><div class="row3"><div class="field"><label for="bulkPublished">Публикация</label><select id="bulkPublished">${options([['true','Опубликовать'],['false','Скрыть — черновик']])}</select></div><div class="field"><label for="bulkCategory">Перенести в категорию</label><select id="bulkCategory"><option value="">Не менять</option></select></div><div class="field"><label for="bulkGroup">Подкатегория</label><select id="bulkGroup"><option value="">Не менять</option><option value="__none">Без подкатегории</option></select></div></div><div class="row2"><div class="field"><label for="bulkTagsMode">Теги</label><select id="bulkTagsMode">${options([['replace','Заменить весь список тегов'],['clear','Очистить все теги']])}</select></div><div class="field"><label for="bulkTags">Новый список через запятую</label><input id="bulkTags" placeholder="Цитрусовый, мягкий"></div></div><button type="button" class="btn" id="bulkReview">Посмотреть изменения</button><p id="bulkStatus" role="status"></p>`;
$('itemsTable').closest('.panel').before(tools);
const dialog=document.createElement('dialog');dialog.className='bulk-dialog';dialog.setAttribute('aria-labelledby','bulkReviewTitle');dialog.innerHTML='<h2 id="bulkReviewTitle">Проверка массового изменения</h2><div id="bulkSummary"></div><p id="bulkApplyStatus" role="status"></p><div class="bulk-buttons"><button type="button" class="btn secondary" id="bulkCancel">Назад</button><button type="button" class="btn" id="bulkApply">Применить</button></div>';document.body.append(dialog);
let pending=null,busy=false;
function count(){const visible=[...$('itemsTable').querySelectorAll('tr')].filter(r=>!r.hidden&&r.querySelector('[data-bulk-id]')).map(r=>r.querySelector('[data-bulk-id]').dataset.bulkId);const hidden=[...selection].filter(id=>!visible.includes(id)).length;$('bulkCount').textContent=`Выбрано: ${selection.size}${hidden?' · скрыто фильтром: '+hidden:''}`;['bulkReview','bulkExport','bulkClear'].forEach(id=>$(id).disabled=selection.size===0);}
function paint(){document.querySelectorAll('[data-bulk-id]').forEach(c=>{c.checked=selection.has(c.dataset.bulkId);c.closest('tr').classList.toggle('bulk-selected',c.checked);});count();}
function mount(e){records=e.detail;selection.clear();pending=null;
 const head=$('itemsTable').closest('table').querySelector('thead tr');
 if(!head.querySelector('.bulk-column')){const th=document.createElement('th');th.className='bulk-column';th.textContent='Выбор';head.prepend(th);}
 $('itemsTable').querySelectorAll('tr').forEach(row=>{const edit=row.querySelector('[data-edit-item]');if(!edit){row.querySelector('td')?.setAttribute('colspan','6');return;}
  if(row.querySelector('[data-bulk-id]'))return;
  const td=document.createElement('td');td.className='bulk-column';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.dataset.bulkId=edit.dataset.editItem;checkbox.setAttribute('aria-label','Выбрать '+(records.find(i=>i.id===edit.dataset.editItem)?.name||'напиток'));checkbox.onchange=()=>{checkbox.checked?selection.add(checkbox.dataset.bulkId):selection.delete(checkbox.dataset.bulkId);paint();};td.append(checkbox);row.prepend(td);
 });count();loadGroups();
}
document.addEventListener('admin:items-loading',()=>{selection.clear();records=[];count();});
document.addEventListener('admin:items',mount);if(window.GuideAdmin.items)mount({detail:window.GuideAdmin.items});
function cats(e){const previous=$('bulkCategory').value;$('bulkCategory').innerHTML='<option value="">Не менять</option>'+e.detail.map(c=>`<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('');if(e.detail.some(c=>c.id===previous))$('bulkCategory').value=previous;}
document.addEventListener('admin:categories',cats);if(window.GuideAdmin.categories)cats({detail:window.GuideAdmin.categories});
async function loadGroups(){
 const version=++groupVersion,category=$('bulkCategory').value||$('itemsCategorySelect').value;
 $('bulkGroup').innerHTML='<option value="">'+($('bulkCategory').value?'Сбросить старую подкатегорию':'Не менять')+'</option><option value="__none">Без подкатегории</option>';
 if(!category)return;groupsLoading=true;$('bulkGroup').disabled=true;
 try{const {data,error}=await sb.from('item_groups').select('id,title').eq('category_id',category).order('sort_order');if(version!==groupVersion)return;if(error)throw error;$('bulkGroup').insertAdjacentHTML('beforeend',(data||[]).map(g=>`<option value="${esc(g.id)}">${esc(g.title)}</option>`).join(''));$('bulkStatus').textContent='';}
 catch(error){if(version===groupVersion)$('bulkStatus').textContent='Не удалось загрузить подкатегории. Повторно выберите категорию: '+error.message;}
 finally{if(version===groupVersion){groupsLoading=false;$('bulkGroup').disabled=false;}}
}
$('bulkCategory').onchange=loadGroups;
$('itemsCategorySelect').addEventListener('change',()=>{selection.clear();paint();});
new MutationObserver(count).observe($('itemsTable'),{subtree:true,attributes:true,attributeFilter:['hidden']});
$('bulkSelectVisible').onclick=()=>{$('itemsTable').querySelectorAll('tr:not([hidden]) [data-bulk-id]').forEach(c=>selection.add(c.dataset.bulkId));paint();};
$('bulkClear').onclick=()=>{selection.clear();paint();};
$('bulkExport').onclick=()=>{const selected=records.filter(i=>selection.has(i.id));const blob=new Blob([JSON.stringify({exported_at:new Date().toISOString(),note:'Копия выбранных записей перед редактированием. Не импортируйте повторно как новые напитки.',items:selected},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='lapsha-selected-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function buildPayload(){
 const payload={};[['bulkServing','serving_style'],['bulkFrame','frame_mode'],['bulkAlign','text_align']].forEach(([id,key])=>{if($(id).value)payload[key]=$(id).value;});
 if($('bulkPublished').value)payload.published=$('bulkPublished').value==='true';
 if($('bulkCategory').value){payload.category_id=$('bulkCategory').value;payload.group_id=null;}
 if($('bulkGroup').value)payload.group_id=$('bulkGroup').value==='__none'?null:$('bulkGroup').value;
 if($('bulkTagsMode').value==='clear')payload.mood_tags=[];
 if($('bulkTagsMode').value==='replace'){const tags=[...new Set($('bulkTags').value.split(',').map(t=>t.trim()).filter(Boolean))];if(!tags.length)throw Error('Введите теги или выберите «Очистить все теги».');payload.mood_tags=tags;}
 return payload;
}
$('bulkReview').onclick=()=>{
 try{
  if(groupsLoading)throw Error('Подождите загрузки подкатегорий.');
  const ids=[...selection];if(!ids.length)throw Error('Выберите напитки.');if(ids.length>500)throw Error('За один раз можно изменить до 500 напитков.');
  const payload=buildPayload();if(!Object.keys(payload).length)throw Error('Выберите хотя бы один параметр для изменения.');
  pending={ids,payload};
  const labels={serving_style:'Подача',frame_mode:'Рамка',text_align:'Выравнивание',published:'Публикация',category_id:'Категория',group_id:'Подкатегория',mood_tags:'Теги'};
  const values={auto:'По тегам',none:'Не указывать / без оформления',hot:'HOT — горячий',cold:'COLD — холодный',ice:'ICE — со льдом',alco:'ALCO',nonalco:'NON ALCO',left:'Слева',center:'По центру',right:'Справа'};
  const value=(k,v)=>k==='published'?(v?'Опубликовать':'Скрыть'):k==='category_id'?$('bulkCategory').selectedOptions[0].textContent:k==='group_id'?(v?$('bulkGroup').selectedOptions[0].textContent:'Без подкатегории'):Array.isArray(v)?(v.join(', ')||'Очистить все теги'):(values[v]||v);
  $('bulkSummary').innerHTML=`<p>Будут изменены <strong>${ids.length}</strong> напитков. Названия, фото и описания сохраняются.</p><dl>${Object.entries(payload).map(([k,v])=>`<dt>${labels[k]}</dt><dd>${esc(value(k,v))}</dd>`).join('')}</dl><details><summary>Показать выбранные напитки (${ids.length})</summary><ul>${records.filter(i=>ids.includes(i.id)).map(i=>`<li>${esc(i.name)}</li>`).join('')}</ul></details>`;
  $('bulkApplyStatus').textContent='';$('bulkApply').disabled=false;dialog.showModal();
 }catch(error){$('bulkStatus').textContent=error.message;}
};
$('bulkCancel').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('bulkApply').onclick=async()=>{
 if(!pending||busy)return;busy=true;$('bulkApply').disabled=true;$('bulkCancel').disabled=true;$('bulkApplyStatus').textContent='Сохраняем…';
 try{
  const {data,error}=await sb.from('items').update(pending.payload).in('id',pending.ids).select('id');
  if(error)throw error;
  const total=pending.ids.length,changed=data?.length||0;
  if(changed!==total){$('bulkApplyStatus').textContent=`Изменено ${changed} из ${total}. Часть записей удалена или недоступна по правам. Обновите список и проверьте результат.`;pending=null;$('bulkApply').disabled=true;selection.clear();await loadItemsTable();return;}
  dialog.close();selection.clear();pending=null;toast(`Сохранено: ${changed} напитков`);$('bulkStatus').textContent=`Изменены ${changed} напитков.`;await loadItemsTable();
 }catch(error){$('bulkApplyStatus').textContent='Не удалось подтвердить сохранение: '+error.message+'. При сетевой ошибке проверьте данные перед повтором. Для HOT сначала выполните update-v5.sql.';$('bulkApply').disabled=false;}
 finally{busy=false;$('bulkCancel').disabled=false;}
};
})();
