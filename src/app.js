// Northwall triage deck: deck engine, alert shift, self-writing report, downtime calculator, booking form.
(()=>{
'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const RM=matchMedia('(prefers-reduced-motion: reduce)'); const reduced=()=>RM.matches;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* ---------------- the ten alerts ---------------- */
const ALERTS=[
  {t:'09:41:07',sev:'info',tag:'INFO',src:'mail-gw',kind:'Email gateway',msg:'Email "Updated payroll portal" from payroll@harrow-pine.co delivered to j.okafor.',ctx:[['Note','Sender domain registered 4 days ago'],['Your domain','harrowpine.co.uk']],real:true},
  {t:'09:41:52',sev:'low',tag:'LOW',src:'identity',kind:'Sign-in',msg:'3 failed sign-ins for m.reyes, then a success from the Leeds office network.',ctx:[['Note','m.reyes changed password yesterday'],['Device','Known, office desktop']],real:false},
  {t:'09:42:31',sev:'low',tag:'LOW',src:'LT-0142',kind:'Endpoint',msg:'Excel opened an attachment. A macro started powershell.exe.',ctx:[['Device','Finance laptop, user j.okafor'],['Seen before','Macros are rare on this laptop']],real:true},
  {t:'09:42:58',sev:'low',tag:'LOW',src:'endpoint',kind:'Endpoint',msg:'Antivirus signature update failed on 4 warehouse tablets.',ctx:[['Note','Retries automatically at 09:50'],['Devices','WH-TAB-03, 05, 07, 11']],real:false},
  {t:'09:43:10',sev:'med',tag:'MED',src:'identity',kind:'Sign-in',msg:'j.okafor signed in from a new network (AS64500), 39 seconds after the macro ran.',ctx:[['Travel','None booked'],['MFA','Approved by push']],real:true},
  {t:'09:43:40',sev:'low',tag:'LOW',src:'WH-TAB-07',kind:'Endpoint',msg:'USB storage connected to a warehouse tablet.',ctx:[['Device name','Label printer driver stick'],['Seen before','Weekly']],real:false},
  {t:'09:44:02',sev:'high',tag:'HIGH',src:'LT-0142',kind:'Network',msg:'Outbound beacon to 203.0.113.44 every 60 s over HTTPS.',ctx:[['Address','Never seen in your network'],['Device','Finance laptop, user j.okafor']],real:true},
  {t:'09:44:30',sev:'med',tag:'MED',src:'cloud',kind:'Cloud app',msg:'1.2 GB uploaded to a file-sharing app by the design team.',ctx:[['Note','Weekly print files'],['Seen before','Same size, same day, 8 weeks running']],real:false},
  {t:'09:44:51',sev:'med',tag:'MED',src:'identity',kind:'Sign-in',msg:'s.patel signed in from London, then from Dubai 7 hours later.',ctx:[['Travel','Flight LHR to DXB booked'],['Device','Known laptop']],real:false},
  {t:'09:45:18',sev:'high',tag:'HIGH',src:'FS-02',kind:'File server',msg:'Finance share on FS-02 opened with the j.okafor session from LT-0142.',ctx:[['Seen before','First time this laptop touched FS-02'],['Share','\\\\FS-02\\finance$']],real:true},
];
const EV=[
  {t:'09:41:07',msg:'Phishing email delivered to j.okafor from a 4-day-old lookalike domain.',a:0},
  {t:'09:42:31',msg:'Macro started powershell.exe on LT-0142.',a:2},
  {t:'09:42:33',msg:'First alert: rule NW-B112, encoded PowerShell from an Office document.'},
  {t:'09:43:10',msg:'j.okafor signed in from a new network (AS64500).',a:4},
  {t:'09:44:02',msg:'LT-0142 beacons to 203.0.113.44 every 60 s.',a:6},
  {t:'09:45:18',msg:'Finance share on FS-02 opened with the stolen session.',a:9},
  {t:'09:45:19',msg:'Incident INC-0417 opened. 5 signals linked.'},
  {t:'09:45:21',msg:'LT-0142 isolated from the network.'},
  {t:'09:45:22',msg:'All j.okafor sessions revoked, password reset forced.'},
  {t:'09:45:24',msg:'203.0.113.44 blocked at all three sites.'},
  {t:'09:45:40',msg:'No mass file changes on FS-02. Shares intact.'},
  {t:'09:46:02',msg:'INC-0417 contained.'},
];

/* build alert cards */
(function(){
  const slot=$('#alertSlot'), frag=document.createDocumentFragment();
  ALERTS.forEach((a,i)=>{
    const c=document.createElement('article'); c.className='card alert'; c.dataset.ch='shift'; c.dataset.alert=i; c.dataset.sev=a.sev; c.dataset.label='Alert '+(i+1)+' of 10';
    c.innerHTML='<header class="ctab"><span><b>Alert '+String(i+1).padStart(2,'0')+'</b> / 10</span><span class="simu">Simulation</span></header>'+
      '<div class="cbody" tabindex="0"><span class="stripe" aria-hidden="true"></span><div class="sevrow"><span class="sev '+a.sev+'">'+a.tag+'</span><span class="atime">'+a.t+'</span></div>'+
      '<p class="asrc"></p><p class="amsg"></p><dl class="actx"></dl><p class="ask"><span>← Dismiss</span><span>Escalate →</span></p><p class="decided" hidden></p></div>'+
      '<span class="stampx esc" aria-hidden="true">ESCALATE</span><span class="stampx dis" aria-hidden="true">DISMISS</span>';
    $('.asrc',c).textContent=a.src+' · '+a.kind; $('.amsg',c).textContent=a.msg;
    const dl=$('.actx',c); a.ctx.forEach(([k,v])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;dl.append(dt,dd)});
    frag.appendChild(c);
  });
  slot.replaceWith(frag);
})();

/* ---------------- deck engine ---------------- */
const stage=$('#stage'); const cards=$$('.card',stage);
const CH=[['cover','Cover'],['shift','Your shift'],['linked','What Northwall saw'],['report','Incident report'],['readme','Readme'],['cost','Downtime cost'],['pricing','Pricing'],['book','Book a review']];
const first=ch=>cards.findIndex(c=>c.dataset.ch===ch);
let idx=0, booted=false; const dec=Array(10).fill(null);

const chap=$('#chapters');
CH.forEach(([k,l],i)=>{const li=document.createElement('li'); li.innerHTML='<button type="button" data-go="'+k+'"><span class="n">0'+i+'</span><span class="l"></span><span class="c"></span></button>'; $('.l',li).textContent=l; chap.appendChild(li)});

function layout(){
  cards.forEach((c,i)=>{
    if(flying.has(c)) return;
    const d=i-idx;
    if(d<0||d>2){ c.hidden=true; c.classList.remove('top'); c.inert=true; return }
    c.hidden=false;
    c.style.zIndex=String(100-d);
    if(!c.classList.contains('dragging')&&!c.classList.contains('nudge')) c.style.transform=d?'translateY('+(-d*11)+'px) scale('+(1-d*.045)+')':'';
    c.style.opacity='1';
    c.classList.toggle('top',d===0);
    c.inert=d!==0; c.setAttribute('aria-hidden',String(d!==0));
  });
}
const current=()=>cards[idx];
const isAlert=c=>c.classList.contains('alert');
function updateUI(){
  const c=current(), al=isAlert(c), ch=c.dataset.ch;
  $('#bBack').disabled=idx===0;
  $('#bDis').hidden=!al; $('#bEsc').hidden=!al; $('#bNext').hidden=al||idx===cards.length-1;
  $('#bNext').firstChild.nodeValue=idx===0?'Start the shift':ch==='shift'?'First alert':ch==='pricing'?'Book':'Next';
  $('#prog').textContent=(idx+1)+' / '+cards.length;
  $$('#chapters button').forEach(b=>{const on=b.dataset.go===ch; b.setAttribute('aria-current',String(on));
    $('.c',b).textContent=b.dataset.go==='shift'?(dec.filter(Boolean).length+'/10'):'';
    if(on&&booted){ const ol=b.closest('ol'); if(ol.scrollWidth>ol.clientWidth){ const li=b.parentElement; ol.scrollTo({left:li.offsetLeft-16,behavior:reduced()?'auto':'smooth'}) } }});
  $('#kbd').innerHTML=al?'<kbd>→</kbd> escalate<br><kbd>←</kbd> dismiss<br><kbd>Backspace</kbd> back':'<kbd>→</kbd> next<br><kbd>←</kbd> back<br><kbd>1</kbd> to <kbd>8</kbd> jump to chapter';
  $('#live').textContent='Card '+(idx+1)+' of '+cards.length+': '+c.dataset.label+(al?'. '+ALERTS[+c.dataset.alert].tag+', '+ALERTS[+c.dataset.alert].msg+' Press right to escalate or left to dismiss.':'.');
  onEnter(c);
}
const flying=new Set();
function flyOut(c,dir){
  flying.add(c); c.inert=true; c.classList.remove('top'); c.style.zIndex='150';
  if(reduced()){ c.style.transition='opacity .18s linear'; c.style.opacity='0' }
  else { const w=stage.clientWidth; c.style.transition='transform .34s cubic-bezier(.4,0,1,1),opacity .34s'; c.style.transform='translate('+(dir*w*1.25)+'px,-30px) rotate('+(dir*16)+'deg)'; c.style.opacity='0' }
  c._t=setTimeout(()=>{ flying.delete(c); c.style.transition='none'; c.style.opacity=''; layout(); c.getBoundingClientRect(); c.style.transition='' },reduced()?200:360);
}
function go(n,{dir=-1,fly=true}={}){
  if(n===idx||n<0||n>=cards.length) return;
  const c=current(), old=idx;
  if(n>old&&fly) flyOut(c,dir);
  if(n<old){ const p=cards[n];
    if(flying.has(p)){ clearTimeout(p._t); flying.delete(p) }
    else if(fly&&!reduced()){ p.hidden=false; p.style.transition='none'; p.style.opacity='1'; p.style.transform='translate('+(-stage.clientWidth*1.2)+'px,-30px) rotate(-14deg)'; p.getBoundingClientRect(); p.style.transition='' }
  }
  idx=n; layout(); updateUI();
}
const next=(dir=-1)=>go(idx+1,{dir});
const nextBtn=()=>go(idx+1,{dir:1});
const back=()=>go(idx-1);
function decide(d){
  const c=current(); if(!isAlert(c)) return;
  const i=+c.dataset.alert; dec[i]=d;
  const p=$('.decided',c); p.hidden=false; p.textContent='Your call: '+(d==='esc'?'escalated':'dismissed'); p.style.color=d==='esc'?'var(--signal-ink)':'var(--ink-2)';
  $('.stampx.'+d,c).style.opacity='1';
  renderLog(); reportDirty=true;
  next(d==='esc'?1:-1);
}
function renderLog(){
  const ol=$('#log'); ol.innerHTML='';
  dec.forEach((d,i)=>{ if(!d) return; const a=ALERTS[i]; const li=document.createElement('li');
    li.innerHTML='<span class="t"></span><span class="s"></span><span class="d '+d+'"></span>';
    li.children[0].textContent=a.t; li.children[1].textContent=a.src; li.children[2].textContent=d==='esc'?'ESC':'DIS'; ol.appendChild(li) });
  $('#logEmpty').hidden=dec.some(Boolean);
}

$('#bBack').addEventListener('click',back);
$('#bNext').addEventListener('click',nextBtn);
$('#bDis').addEventListener('click',()=>decide('dis'));
$('#bEsc').addEventListener('click',()=>decide('esc'));
document.addEventListener('click',e=>{const g=e.target.closest('[data-go]'); if(g){ const n=first(g.dataset.go); if(n>-1) go(n,{fly:Math.abs(n-idx)===1}) }});
document.addEventListener('keydown',e=>{
  const t=document.activeElement, inField=t&&/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  if(inField||e.metaKey||e.ctrlKey||e.altKey) return;
  const al=isAlert(current());
  if(e.key==='ArrowRight'){ e.preventDefault(); al?decide('esc'):next(-1) }
  else if(e.key==='ArrowLeft'){ e.preventDefault(); al?decide('dis'):back() }
  else if(e.key==='Backspace'){ e.preventDefault(); back() }
  else if(e.key==='Home'&&t===stage){ e.preventDefault(); go(0,{fly:false}) }
  else if(/^[1-8]$/.test(e.key)){ go(first(CH[+e.key-1][0]),{fly:false}) }
});

/* drag physics: horizontal throw, vertical left to the card's own scroll */
(function(){
  let d=null;
  const skip=el=>el.closest('input,select,textarea,button,a,label,.field');
  stage.addEventListener('pointerdown',e=>{
    const c=e.target.closest('.card'); if(!c||!c.classList.contains('top')||skip(e.target)) return;
    if(e.pointerType==='mouse'&&e.button!==0) return;
    c.classList.remove('nudge');
    d={c,id:e.pointerId,sx:e.clientX,sy:e.clientY,x:0,lx:e.clientX,lt:performance.now(),v:0,live:false};
  });
  stage.addEventListener('pointermove',e=>{
    if(!d||e.pointerId!==d.id) return;
    const dx=e.clientX-d.sx, dy=e.clientY-d.sy;
    if(!d.live){ if(Math.abs(dx)<8) return; if(Math.abs(dy)>Math.abs(dx)){ d=null; return } d.live=true; d.c.classList.add('dragging'); try{d.c.setPointerCapture(d.id)}catch(_){} }
    const now=performance.now(); d.v=(e.clientX-d.lx)/Math.max(1,now-d.lt); d.lx=e.clientX; d.lt=now; d.x=dx;
    d.c.style.transform='translate('+dx+'px,'+(dy*.15)+'px) rotate('+(dx*.05)+'deg)';
    if(isAlert(d.c)){ const k=Math.min(1,Math.abs(dx)/110); $('.stampx.esc',d.c).style.opacity=dx>0?k:0; $('.stampx.dis',d.c).style.opacity=dx<0?k:0 }
  });
  const end=e=>{
    if(!d||e.pointerId!==d.id) return; const {c,x,v,live}=d; d=null; if(!live) return;
    c.classList.remove('dragging');
    const w=stage.clientWidth, thrown=Math.abs(x)>w*.28||(Math.abs(v)>.55&&Math.abs(x)>30);
    if(thrown&&e.type==='pointerup'){
      const dir=(Math.abs(v)>.55?Math.sign(v):Math.sign(x))||1;
      if(isAlert(c)) decide(dir>0?'esc':'dis'); else if(idx<cards.length-1) next(dir); else springBack(c);
    } else springBack(c);
  };
  function springBack(c){ c.style.transition='transform .45s cubic-bezier(.2,1.5,.4,1)'; c.style.transform=''; if(isAlert(c)){ const i=+c.dataset.alert; $$('.stampx',c).forEach(s=>s.style.opacity=dec[i]&&s.classList.contains(dec[i])?'1':'0') } setTimeout(()=>c.style.transition='',460) }
  stage.addEventListener('pointerup',end); stage.addEventListener('pointercancel',end);
})();

/* ---------------- entering cards ---------------- */
let reportDirty=true, repRun=0;
let touched=false; const nudged=new Set();
stage.addEventListener('pointerdown',()=>touched=true,true); addEventListener('keydown',()=>touched=true,true);
function nudge(c,delay){ if(reduced()||nudged.has(c)) return; nudged.add(c); setTimeout(()=>{ if(current()!==c||(touched&&c.dataset.ch==='cover')) return; c.classList.add('nudge'); c.addEventListener('animationend',()=>c.classList.remove('nudge'),{once:true}) },delay) }
function onEnter(c){
  const ch=c.dataset.ch;
  if(ch==='cover') nudge(c,1400);
  if(isAlert(c)&&c.dataset.alert==='0') nudge(c,2200);
  if(isAlert(c)){ const i=+c.dataset.alert; $$('.stampx',c).forEach(s=>s.style.opacity=dec[i]&&s.classList.contains(dec[i])?'1':'0') }
  if(ch==='linked') renderResult();
  if(ch==='report'&&reportDirty) writeReport();
}
function renderResult(){
  const played=dec.filter(Boolean).length, caught=ALERTS.filter((a,i)=>a.real&&dec[i]==='esc').length, falseEsc=ALERTS.filter((a,i)=>!a.real&&dec[i]==='esc').length;
  $('#scYou').textContent=played?caught+' / 5':'0 / 5';
  $('#scYouTxt').textContent=played?'attack signals you escalated'+(falseEsc?', plus '+falseEsc+' false alarm'+(falseEsc>1?'s':''):''):'You skipped the shift. Go back to play it.';
  $('#resHead').textContent=!played?'The five that mattered, linked.':caught===5?'You caught all five. Northwall linked them in time.':'You caught '+caught+' of 5. Northwall linked all five.';
  const tix=$('#tix'); tix.innerHTML='';
  ALERTS.forEach((a,i)=>{ const d=document.createElement('div'); d.className='tk '+(a.real?'real':'noise');
    d.innerHTML='<span class="tt"></span><span class="ts"></span><span class="ty '+(dec[i]||'none')+'"></span>';
    d.children[0].textContent=a.t; d.children[1].textContent=a.src; d.children[2].textContent=dec[i]==='esc'?'ESCALATED':dec[i]==='dis'?'DISMISSED':'NOT SEEN';
    d.setAttribute('aria-label',a.t+' '+a.src+': '+(a.real?'part of the attack':'noise')+'. You '+(dec[i]==='esc'?'escalated':dec[i]==='dis'?'dismissed':'did not see')+' it.');
    tix.appendChild(d) });
  const wrap=$('#tixwrap'); wrap.classList.remove('shown'); $('#thread').innerHTML=''; $('#dots').innerHTML='';
  setTimeout(()=>{ wrap.classList.add('shown'); drawThread(true) }, reduced()?0:350);
}
function drawThread(animate){
  const wrap=$('#tixwrap'), svg=$('#thread'); if(!wrap.classList.contains('shown')) return;
  const wr=wrap.getBoundingClientRect(); if(!wr.width) return;
  const pts=$$('.tk.real',wrap).map(el=>{const r=el.getBoundingClientRect(); return [r.left-wr.left+r.width/2, r.bottom-wr.top]});
  svg.setAttribute('viewBox','0 0 '+wr.width+' '+wr.height);
  let dstr='M'+pts[0].join(' ');
  for(let i=1;i<pts.length;i++){ const [x0,y0]=pts[i-1],[x1,y1]=pts[i]; const my=Math.max(y0,y1)+(y0===y1?8:6); dstr+=' C'+x0+' '+my+' '+x1+' '+my+' '+x1+' '+y1 }
  svg.innerHTML='<path d="'+dstr+'"/>';
  const dots=$('#dots'); dots.setAttribute('viewBox',svg.getAttribute('viewBox')); dots.innerHTML=pts.map(p=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="4.5"/>').join('');
  const path=$('path',svg);
  if(animate&&!reduced()){ const L=path.getTotalLength(); path.style.strokeDasharray=L; path.style.strokeDashoffset=L; path.getBoundingClientRect(); path.style.transition='stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)'; path.style.strokeDashoffset=0 }
}

/* ---------------- report that writes itself ---------------- */
function money(n){const cur=$('#c-cur').value; try{return new Intl.NumberFormat(cur==='AED'?'en-AE':cur==='GBP'?'en-GB':cur==='AUD'?'en-AU':'en-US',{style:'currency',currency:cur,maximumFractionDigits:0}).format(n)}catch(_){return cur+' '+Math.round(n).toLocaleString()}}
function impactText(){const c=calc(); return 'Downtime: 0 hours. At your inputs on the Downtime cost card, '+c.hrs+' hours down would have cost about '+money(c.total)+'.'}
async function typeText(el,text,my){
  if(reduced()){ el.textContent=text; return }
  el.classList.add('caret');
  for(let i=0;i<=text.length;i+=3){ if(my!==repRun) return; el.textContent=text.slice(0,i); await sleep(7) }
  el.textContent=text; el.classList.remove('caret');
}
async function writeReport(){
  const my=++repRun; reportDirty=false;
  const rep=$('#rep'); rep.innerHTML=''; $('#repState').textContent='writing'; const sc=$('#repScroll'); sc.scrollTop=0;
  const follow=()=>{ if(!reduced()&&sc.scrollHeight-sc.clientHeight-sc.scrollTop<260) sc.scrollTop=sc.scrollHeight };
  const add=(tag,cls)=>{const e=document.createElement(tag); if(cls) e.className=cls; rep.appendChild(e); return e};
  const caught=ALERTS.filter((a,i)=>a.real&&dec[i]==='esc').length, played=dec.some(Boolean);
  await typeText(add('p','kick'),'Report INC-0417 · simulated · filed 09:46:05 by Northwall',my);
  await typeText(add('h2','h m'),'Phishing to lateral movement, contained',my);
  const dl=add('dl');
  for(const [k,v] of [['Company','Harrow & Pine Logistics (fictional), 240 staff'],['Severity','High'],['Status','CONTAINED'],['Time to contain','2 min 51 s from first alert'],['Files lost','None'],['Your shift',played?caught+' of 5 attack signals escalated':'Not played']]){
    if(my!==repRun) return; const dt=document.createElement('dt'),dd=document.createElement('dd'); dt.textContent=k; dl.append(dt,dd); if(v==='CONTAINED') dd.className='ok'; await typeText(dd,v,my) }
  await typeText(add('h3'),'What happened',my);
  await typeText(add('p','p'),'A payroll-themed email carried a macro that started PowerShell on laptop LT-0142. The attacker used the stolen session to sign in from outside and open the finance share on FS-02. Northwall linked five separate signals into one incident and contained it before any file was changed.',my); follow();
  await typeText(add('h3'),'Timeline',my);
  const w=add('div','tablewrap'), tb=document.createElement('table'); w.appendChild(tb);
  tb.innerHTML='<caption class="sr">Incident timeline, simulated times, with your decision for each alert you saw</caption><thead><tr><th>Time</th><th>What happened</th><th>You</th></tr></thead><tbody></tbody>';
  const body=$('tbody',tb);
  for(const e of EV){ if(my!==repRun) return; const tr=body.insertRow(); tr.insertCell().textContent=e.t; const td=tr.insertCell(); const you=tr.insertCell(); you.className='you';
    if(e.a!=null){ const d=dec[e.a]; you.textContent=d==='esc'?'ESCALATED':d==='dis'?'DISMISSED':'NOT SEEN'; if(d==='esc') you.classList.add('esc') }
    await typeText(td,e.msg,my); follow() }
  await typeText(add('h3'),'Actions Northwall took',my);
  const ol=add('ol'); for(const x of ['Isolated LT-0142 from the network at 09:45:21.','Revoked every j.okafor session and forced a password reset at 09:45:22.','Blocked 203.0.113.44 at all three sites at 09:45:24.']){ if(my!==repRun) return; const li=document.createElement('li'); ol.appendChild(li); await typeText(li,x,my); follow() }
  await typeText(add('h3'),'For your team',my);
  const ol2=add('ol'); for(const x of ['Reimage LT-0142 before it rejoins the network.','Block the lookalike domain harrow-pine.co for all users.','Tell j.okafor what happened. Nobody is in trouble.']){ if(my!==repRun) return; const li=document.createElement('li'); ol2.appendChild(li); await typeText(li,x,my); follow() }
  await typeText(add('h3'),'Business impact',my);
  const imp=add('p','impact'); imp.id='impact'; await typeText(imp,impactText(),my); follow();
  if(my!==repRun) return;
  const end=add('div','endrow');
  end.innerHTML='<p class="small mb3">A security review shows what Northwall would find in your company.</p><div class="row"><button class="btn ink" type="button" data-go="book">Book a security review</button><button class="btn line" type="button" data-go="shift">Play the shift again</button></div>';
  follow(); $('#repState').textContent='filed · 1 page';
}

/* ---------------- downtime cost ---------------- */
const num=id=>{const v=parseFloat($('#'+id).value);return isFinite(v)&&v>=0?v:0};
function calc(){ const emp=Math.round(num('c-emp')), rev=num('c-rev'), hrs=num('c-hrs'), wage=num('c-wage'); const lost=rev*hrs, idle=emp*hrs*wage; return {emp,rev,hrs,wage,lost,idle,total:lost+idle} }
function renderCalc(){
  const c=calc();
  $('#costLead').textContent=(c.hrs===1?'1 hour':c.hrs+' hours')+' down would cost about';
  $('#costTotal').textContent=money(c.total); $('#costRev').textContent=money(c.lost); $('#costIdle').textContent=money(c.idle);
  const mx=Math.max(c.lost,c.idle,1); $('#barRev').style.width=(c.lost/mx*100)+'%'; $('#barIdle').style.width=(c.idle/mx*100)+'%';
  const seats=Math.max(c.emp,50);
  $$('.est').forEach(e=>e.textContent='About $'+(+e.dataset.rate*seats).toLocaleString('en-US')+' / month at '+seats+' staff'+(c.emp<50?' (50 seat minimum)':''));
  const imp=$('#impact'); if(imp&&!imp.classList.contains('caret')) imp.textContent=impactText();
}
$('#calc').addEventListener('input',renderCalc);

/* ---------------- booking ---------------- */
(function(){ const sel=$('#b-week'); const d=new Date(); d.setHours(12); d.setDate(d.getDate()+((8-d.getDay())%7||7));
  for(let i=0;i<3;i++){ const o=document.createElement('option'); o.textContent='Week of '+d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}); sel.appendChild(o); d.setDate(d.getDate()+7) } })();
$('#book').addEventListener('submit',e=>{
  e.preventDefault(); const f=e.target, name=f.name.value.trim(), email=f.email.value.trim(), co=f.company.value.trim();
  const okMail=/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  [['b-name',!name],['b-email',!okMail],['b-co',!co]].forEach(([id,bad])=>$('#'+id).setAttribute('aria-invalid',String(bad)));
  const errs=[]; if(!name) errs.push('your name'); if(!okMail) errs.push('a work email like you@company.com'); if(!co) errs.push('your company');
  if(errs.length){ $('#bookErr').textContent='Add '+errs.join(', ')+' to book.'; ($('[aria-invalid="true"]',f)||f).focus(); return }
  $('#bookErr').textContent=''; const done=$('#bookDone'); done.innerHTML='';
  const b=document.createElement('b'); b.textContent='Request recorded · '+f.week.value; done.append(b, document.createTextNode('Thanks, '+name+'. On a live site a Northwall engineer would reply to '+email+' within one business day to set a time for '+co+'. This is a concept site, so nothing was sent.'));
  f.hidden=true; done.hidden=false; done.focus();
});

/* ---------------- resize: ignore address-bar height jiggle ---------------- */
let lw=innerWidth, lh=innerHeight, rt;
addEventListener('resize',()=>{ clearTimeout(rt); rt=setTimeout(()=>{ const w=innerWidth,h=innerHeight; if(w===lw&&Math.abs(h-lh)<160) return; lw=w; lh=h; layout(); drawThread(false) },120) });

/* test hook for headless renders */
window.__deck={go:(ch)=>go(first(ch),{fly:false}),decide,idx:()=>idx};

renderCalc(); layout(); updateUI(); booted=true;
})();
