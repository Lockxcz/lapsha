/* A visible batch gets a full minute. Expiry is not acknowledgement. */
(function(){'use strict';
function createQueue({now=()=>Date.now(),duration=60000,onConfirm=()=>{}}={}){
 const queue=[];const known=new Set();let sequence=0;
 function activate(){if(queue.length&&queue[0].deadline===null)queue[0].deadline=now()+duration;}
 function push(events){const fresh=events.filter(e=>!known.has(String(e.id)));if(!fresh.length)return;fresh.forEach(e=>known.add(String(e.id)));queue.push({id:++sequence,events:fresh,deadline:null});activate();}
 function tick(){if(queue.length&&queue[0].deadline<=now()){queue.shift();activate();}return queue[0]||null;}
 function confirm(id){const active=queue[0];if(!active||active.id!==id)return;if(active.deadline<=now()){tick();return;}queue.shift();onConfirm(active.events);activate();}
 function acknowledge(ids){const set=new Set(ids.map(String));for(let i=queue.length-1;i>=0;i--){queue[i].events=queue[i].events.filter(e=>!set.has(String(e.id)));if(!queue[i].events.length)queue.splice(i,1);}activate();}
 return {push,tick,confirm,acknowledge,get pending(){return queue.length;},get current(){return tick();}};
}
function mount({onConfirm=()=>{},onReview=()=>{}}={}){
 const C=window.PosCore,esc=C.esc;const panel=document.createElement('aside');panel.className='notice-drawer';panel.hidden=true;panel.setAttribute('popover','manual');panel.setAttribute('aria-label','Новое сообщение смены');document.body.append(panel);
 const queue=createQueue({onConfirm});let rendered='',timer;let host=document.body;
 function isOpen(){try{return panel.matches(':popover-open');}catch{return false;}}
 function place(){const dialogs=[...document.querySelectorAll('dialog[open]')];const next=dialogs.at(-1)||document.body;if(host!==next){if(isOpen())panel.hidePopover?.();next.append(panel);host=next;}}
 function render(){place();const current=queue.current;if(!current){if(isOpen())panel.hidePopover?.();panel.hidden=true;rendered='';return;}const signature=current.id+':'+current.events.map(e=>e.id).join(',');if(signature!==rendered){rendered=signature;const events=current.events,latest=events[0],urgent=events.some(e=>e.status==='stop'||e.status==='urgent');panel.classList.toggle('notice-urgent',urgent);panel.innerHTML=`<div class="notice-top"><span class="notice-label">${events.length>1?'ОБНОВЛЕНИЯ СМЕНЫ':latest.kind==='news'?'СООБЩЕНИЕ СМЕНЫ':'ИЗМЕНЕНИЕ СТОП-ЛИСТА'}</span><span class="notice-clock" aria-hidden="true"></span></div><div role="status" aria-live="polite"><h2>${events.length>1?'Новых событий: '+events.length:esc(latest.title)}</h2><div class="notice-content">${events.map(e=>`<div>${events.length>1?`<strong>${esc(e.title)}</strong>`:''}<p>${esc(e.message)}</p></div>`).join('')}</div></div><div class="notice-footer"><button type="button" data-notice-confirm="${current.id}">Подтвердить${events.length>1?' · '+events.length:''}</button><button type="button" data-notice-review>Все события</button></div><p class="notice-help">Подтверждение на этом устройстве · <span class="notice-pending"></span></p><div class="notice-timeline" aria-hidden="true"><span></span></div>`;panel.hidden=false;panel.classList.remove('notice-enter');void panel.offsetWidth;panel.classList.add('notice-enter');}
 const seconds=Math.max(0,Math.ceil((current.deadline-Date.now())/1000));panel.querySelector('.notice-clock').textContent=seconds+' сек';panel.querySelector('.notice-pending').textContent=queue.pending>1?'ещё в очереди: '+(queue.pending-1):'скроется через минуту';panel.querySelector('.notice-timeline span').style.width=(seconds/60*100)+'%';try{if(panel.showPopover&&!isOpen())panel.showPopover();}catch{}
 }
 panel.onclick=e=>{if(e.target.closest('[data-notice-confirm]')){queue.confirm(Number(e.target.closest('[data-notice-confirm]').dataset.noticeConfirm));render();}if(e.target.closest('[data-notice-review]')){onReview();render();}};
 const observer=new MutationObserver(()=>render());document.querySelectorAll('dialog').forEach(d=>observer.observe(d,{attributes:true,attributeFilter:['open']}));
 timer=setInterval(render,250);document.addEventListener('visibilitychange',render);
 return {push(events){queue.push(events);render();},acknowledge(ids){queue.acknowledge(ids);render();},destroy(){clearInterval(timer);observer.disconnect();document.removeEventListener('visibilitychange',render);panel.remove();}};
}
window.NoticeCenter={createQueue,mount};
})();
