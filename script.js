(() => {
  'use strict';
  const STORE_KEY = 'mente_em_dia_prototype_v2';
  const OLD_STORE_KEY = 'mente_em_dia_prototype_v1';
  const screens = ['home','checkin','diary','map','care','support','more'];
  const $ = (id) => document.getElementById(id);
  const metricIds = ['stress','sleep','energy'];
  let state = loadState();
  let demoActive = false;
  let mapPeriod = 7;
  let selectedMood = 5;
  let journalFeeling = {label:'Bem',emoji:'🙂',value:7};
  let selectedMotives = [];
  let toastTimer = null;
  let breathTimer = null;
  let breathRemaining = 60;
  let breathPhase = 'inhale';

  function loadState(){
    try {
      let raw = localStorage.getItem(STORE_KEY);
      if(!raw){ raw = localStorage.getItem(OLD_STORE_KEY); }
      const parsed = JSON.parse(raw || '{}');
      return {consent:!!parsed.consent,nickname:typeof parsed.nickname==='string'?parsed.nickname:'',entries:Array.isArray(parsed.entries)?parsed.entries:[],journals:Array.isArray(parsed.journals)?parsed.journals:[]};
    } catch { return {consent:false,nickname:'',entries:[],journals:[]}; }
  }
  function persist(){
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      showToast('Não foi possível salvar no navegador. Verifique o espaço disponível.');
    }
  }
  function localDateString(date=new Date()){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return `${y}-${m}-${d}`;}
  function formatDate(dateStr,options={day:'2-digit',month:'short'}){const [y,m,d]=dateStr.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('pt-BR',options);}
  function sortedEntries(){return [...state.entries].sort((a,b)=>a.date.localeCompare(b.date));}
  function recentEntries(limit=7){return sortedEntries().slice(-limit);}
  function average(rows,key){const values=rows.map(r=>r[key]).filter(v=>Number.isFinite(v));return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;}
  function fmtAvg(v){return v===null?'—':v.toFixed(1).replace('.',',');}
  function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function showToast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600);}
  function updateHeader(){const name=state.nickname.trim();$('topName').textContent=name||'Meu espaço';$('topAvatar').textContent=name?name.charAt(0).toUpperCase():'♡';$('moreName').textContent=name||'Seu espaço pessoal';const greeting=name?`Olá, ${name}! 👋`:'Olá! Como você está?';$('greeting').textContent=greeting;}
  window.navigate=function(name){if(!screens.includes(name))return;screens.forEach(s=>$('screen-'+s).classList.toggle('active',s===name));document.querySelectorAll('.sidebar [data-screen]').forEach(btn=>btn.classList.toggle('active',btn.dataset.screen===name));document.querySelectorAll('.bottom-nav [data-screen]').forEach(btn=>btn.classList.toggle('active',btn.dataset.screen===name||((name==='care'||name==='support')&&btn.dataset.screen==='more')));if(name==='checkin')loadCheckinForm();if(name==='diary')renderDiary();if(name==='map')renderMap();if(name==='more'){$('nicknameInput').value=state.nickname;updateHeader();}window.scrollTo({top:0,behavior:'smooth'});};

  function makeChart(rows,keys){
    if(!rows.length)return '<div class="empty-state"><div class="empty-icon">♡</div><strong>Seu gráfico começa com você.</strong><p>Faça alguns check-ins para visualizar suas tendências pessoais.</p></div>';
    const width=700,height=205,left=35,right=13,top=10,bottom=31,innerW=width-left-right,innerH=height-top-bottom;
    const x=i=>left+(rows.length===1?innerW/2:i*innerW/(rows.length-1));
    const y=v=>top+(10-v)*innerH/10;
    const colors={stress:'#285d45',sleep:'#91a984',energy:'#d2a06b',mood:'#c3b15c'};
    let svg=`<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico com ${rows.length} registros, em escala de zero a dez">`;
    [0,2,4,6,8,10].forEach(v=>{svg+=`<line x1="${left}" y1="${y(v)}" x2="${width-right}" y2="${y(v)}" stroke="#ece9df" stroke-width="1"/><text x="${left-10}" y="${y(v)+3}" text-anchor="end" fill="#9ba195" font-size="10">${v}</text>`;});
    keys.forEach(key=>{
      const valid=rows.map((r,i)=>Number.isFinite(r[key])?{x:x(i),y:y(r[key])}:null).filter(Boolean);
      if(valid.length){svg+=`<polyline points="${valid.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="${colors[key]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;valid.forEach(p=>svg+=`<circle cx="${p.x}" cy="${p.y}" r="4" fill="${colors[key]}" stroke="#fffdf6" stroke-width="2"/>`);}
    });
    const labelCount=Math.min(rows.length,7);for(let j=0;j<labelCount;j++){const i=labelCount===1?0:Math.round(j*(rows.length-1)/(labelCount-1));svg+=`<text x="${x(i)}" y="${height-8}" text-anchor="middle" fill="#959e92" font-size="9">${formatDate(rows[i].date,{day:'2-digit',month:'2-digit'})}</text>`;}
    svg+='</svg>';return svg;
  }
  function buildInsight(rows){
    const stressRows=rows.filter(r=>Number.isFinite(r.stress)),highStress=stressRows.filter(r=>r.stress>=7).length;
    const sleepRows=rows.filter(r=>Number.isFinite(r.sleep)),lowSleep=sleepRows.filter(r=>r.sleep<=4).length;
    if(rows.length<3)return {title:'Seus registros contam uma história, no seu tempo.',text:'Com alguns check-ins, você poderá observar tendências da sua própria rotina. Não há pressa.'};
    if(highStress>=2)return {title:'O estresse apareceu elevado em mais de um registro.',text:`Em ${highStress} dos ${stressRows.length} registros recentes com resposta, você marcou estresse 7 ou mais. Pode ser útil observar o que tem pesado na sua rotina e conversar com alguém de confiança.`};
    if(lowSleep>=2)return {title:'Seu descanso merece atenção gentil.',text:`Em ${lowSleep} registros recentes, a qualidade do sono ficou em 4 ou menos. Observe sua rotina sem se cobrar e considere buscar apoio se isso persistir.`};
    return {title:'Você está construindo autopercepção.',text:'Seus registros recentes não mostram repetição dos sinais simples observados por este protótipo. Continue usando o espaço apenas quando fizer sentido.'};
  }
  function signalSummary(rows){
    const recent=rows.slice(-7);const defs=[
      {key:'stress',label:'Estresse elevado',test:v=>v>=7,detail:'Você informou estresse 7 ou mais em registros recentes.',emoji:'💚'},
      {key:'sleep',label:'Sono com nota baixa',test:v=>v<=4,detail:'Você informou qualidade do sono 4 ou menos em registros recentes.',emoji:'🌙'},
      {key:'energy',label:'Disposição baixa',test:v=>v<=3,detail:'Você informou disposição 3 ou menos em registros recentes.',emoji:'🍃'}
    ];
    return defs.map(d=>({...d,count:recent.filter(r=>Number.isFinite(r[d.key])&&d.test(r[d.key])).length})).filter(d=>d.count>=2);
  }
  function renderRadar(rows,targetId){
    const target=$(targetId);if(!rows.length){target.innerHTML='<div class="radar-card radar-ok"><div class="radar-head"><div class="radar-icon">🌱</div><div><strong>Seu radar está começando</strong><span>Faça check-ins para observar tendências.</span></div></div><p style="font-size:10px;margin:0;color:#71806f">Ainda não há registros suficientes para observar repetições. Você pode começar quando quiser.</p></div>';return;}
    const flags=signalSummary(rows);
    if(!flags.length){target.innerHTML='<div class="radar-card radar-ok"><div class="radar-head"><div class="radar-icon">🌿</div><div><strong>Nenhum sinal repetido nas regras deste protótipo</strong><span>Isso não é uma avaliação de saúde.</span></div></div><p style="font-size:10px;margin:0;color:#71806f">Continue observando seus registros no seu ritmo. Um resultado sem alertas não substitui sua própria percepção nem orientação profissional.</p></div>';return;}
    target.innerHTML=`<div class="radar-card"><div class="radar-head"><div class="radar-icon">⚠️</div><div><strong>${flags.length} ${flags.length===1?'indicador merece':'indicadores merecem'} atenção</strong><span>Repetições nos últimos ${Math.min(rows.length,7)} registros</span></div></div><div class="radar-list">${flags.map(f=>`<div class="radar-row"><span>${f.emoji} ${f.label}</span><strong>${f.count} registros</strong></div>`).join('')}</div><p style="font-size:9px;margin:5px 0 0;color:#806c4e">Considere fazer uma pausa, conversar com alguém de confiança ou buscar orientação se isso estiver pesando. Este radar não faz diagnóstico.</p><div class="recommend-grid"><div class="recommend-item"><strong>🌿 Autocuidado</strong><span>Experimente uma pausa possível.</span></div><div class="recommend-item"><strong>🤝 Conversar</strong><span>Procure alguém em quem confia.</span></div><div class="recommend-item"><strong>☎ Apoio</strong><span>Conheça a rede de acolhimento.</span></div></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:11px"><button class="btn btn-soft btn-small" onclick="navigate('care')">Ver recomendações →</button><button class="btn btn-white btn-small" onclick="navigate('support')">Rede de apoio</button></div></div>`;
  }
  function renderHome(){
    updateHeader();const rows=recentEntries(7),today=localDateString(),hasToday=state.entries.some(e=>e.date===today);
    $('todayStatus').textContent=hasToday?'Seu check-in de hoje está salvo.':'Como você chega hoje?';$('todaySub').textContent=hasToday?'Você pode atualizar suas respostas quando quiser.':'Um registro rápido leva menos de 1 minuto.';$('todayButton').textContent=hasToday?'Atualizar hoje →':'Registrar agora →';
    $('statEntries').textContent=state.entries.length;$('statStress').textContent=fmtAvg(average(rows,'stress'));$('statSleep').textContent=fmtAvg(average(rows,'sleep'));
    $('homeChart').innerHTML=makeChart(rows,['stress']);const insight=buildInsight(rows);$('insightTitle').textContent=insight.title;$('insightText').textContent=insight.text;renderRadar(rows,'homeRadar');
  }
  function getDemoRows(period){
    const base=[{stress:5,sleep:6,energy:6},{stress:7,sleep:5,energy:5},{stress:8,sleep:4,energy:4},{stress:6,sleep:6,energy:7},{stress:9,sleep:3,energy:3},{stress:7,sleep:5,energy:5},{stress:6,sleep:7,energy:7}];
    const count=period===7?7:period===30?15:30;const rows=[];for(let i=count-1;i>=0;i--){const offset=count===1?0:Math.round(i*(period-1)/(count-1));const d=new Date();d.setDate(d.getDate()-offset);const v=base[(count-1-i)%base.length];rows.push({date:localDateString(d),...v,mood:null});}return rows;
  }
  function filteredEntries(period){const min=new Date();min.setDate(min.getDate()-(period-1));const minKey=localDateString(min);return sortedEntries().filter(r=>r.date>=minKey&&r.date<=localDateString());}
  function renderMap(){
    const rows=demoActive?getDemoRows(mapPeriod):filteredEntries(mapPeriod);$('demoBanner').classList.toggle('show',demoActive);$('demoToggle').textContent=demoActive?'Sair do exemplo':'Ver exemplo ilustrativo';$('mapPeriodLabel').textContent=mapPeriod===90?'3 MESES':`${mapPeriod} DIAS`;
    $('mapChart').innerHTML=makeChart(rows,['stress','sleep','energy']);$('mapStress').textContent=fmtAvg(average(rows,'stress'));$('mapSleep').textContent=fmtAvg(average(rows,'sleep'));$('mapCount').textContent=rows.length;
    renderRadar(rows,'mapRadar');
    const actual=sortedEntries().slice().reverse();$('historyList').innerHTML=actual.length?actual.map(r=>{const chips=[['Humor',r.mood],['Estresse',r.stress],['Sono',r.sleep],['Disposição',r.energy]].filter(([,v])=>Number.isFinite(v)).map(([label,v])=>`<span class="mini-metric">${label} ${v}/10</span>`).join('');return `<div class="history-row"><div class="history-date">${formatDate(r.date,{day:'2-digit',month:'short',year:'2-digit'})}</div><div class="history-metrics">${chips||'<span class="mini-metric">Sem escala respondida</span>'}</div><button class="delete-one" onclick="deleteOne('${r.date}')" aria-label="Excluir registro">Excluir</button></div>`;}).join(''):'<div class="empty-state"><div class="empty-icon">♡</div><strong>Ainda não há check-ins.</strong><p>Seu histórico começa quando você decide fazer o primeiro registro.</p><button class="btn btn-primary btn-small" onclick="navigate(\'checkin\')">Fazer check-in</button></div>';
    document.querySelectorAll('[data-period]').forEach(b=>b.classList.toggle('active',Number(b.dataset.period)===mapPeriod));
  }
  window.setPeriod=function(period){mapPeriod=Number(period);renderMap();};window.toggleDemo=function(){demoActive=!demoActive;renderMap();};
  function renderDiary(){
    const rows=[...state.journals].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));$('journalCount').textContent=`${rows.length} ${rows.length===1?'REGISTRO':'REGISTROS'}`;
    $('journalHistory').innerHTML=rows.length?rows.map(j=>`<article class="journal-row"><div class="journal-face">${escapeHTML(j.emoji||'♡')}</div><div><div class="journal-meta">${formatDate(j.date,{day:'2-digit',month:'long',year:'numeric'})} · ${escapeHTML(j.time||'')}</div><strong>${escapeHTML(j.feeling||'Registro emocional')}</strong><p>${escapeHTML(j.text)}</p>${j.motive?`<span class="journal-motive">${escapeHTML(j.motive)}</span>`:''}</div><button class="delete-one" onclick="deleteJournal('${escapeHTML(j.id)}')" aria-label="Excluir entrada">Excluir</button></article>`).join(''):'<div class="empty-state"><div class="empty-icon">📖</div><strong>Seu diário começa quando você quiser.</strong><p>Escreva um pensamento, uma lembrança ou algo que queira organizar.</p></div>';
    updateJournalFeelingButtons();
  }
  function updateJournalFeelingButtons(){document.querySelectorAll('[data-jfeel]').forEach(b=>b.classList.toggle('selected',b.dataset.jfeel===journalFeeling.label));}
  window.selectJournalFeeling=function(label,emoji,value){journalFeeling={label,emoji,value};updateJournalFeelingButtons();};
  window.toggleMotive=function(button){const motive=button.dataset.motive;if(selectedMotives.includes(motive)){selectedMotives=selectedMotives.filter(x=>x!==motive);button.classList.remove('selected');}else{selectedMotives.push(motive);button.classList.add('selected');}};
  window.saveJournal=function(){const text=$('journalText').value.trim();if(!text){showToast('Escreva algumas palavras antes de salvar seu diário.');$('journalText').focus();return;}const now=new Date();const entry={id:`j-${now.getTime()}-${Math.random().toString(36).slice(2,7)}`,date:localDateString(now),time:now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),createdAt:now.toISOString(),feeling:journalFeeling.label,emoji:journalFeeling.emoji,value:journalFeeling.value,motive:selectedMotives.join(', '),text};state.journals.push(entry);persist();$('journalText').value='';selectedMotives=[];document.querySelectorAll('.motive-chip').forEach(b=>b.classList.remove('selected'));renderDiary();showToast('Registro adicionado ao seu diário.');};
  window.deleteJournal=function(id){state.journals=state.journals.filter(j=>j.id!==id);persist();renderDiary();showToast('Entrada do diário excluída.');};

  window.selectMood=function(value){selectedMood=Number(value);$('skipMood').checked=false;$('checkinFeelings').querySelectorAll('[data-score]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.score)===selectedMood));};
  function setRange(id,value){$(id).value=Number.isFinite(value)?value:5;$(id+'Value').textContent=Number.isFinite(value)?value:5;}
  function syncMetric(id){const skip=$('skip'+id[0].toUpperCase()+id.slice(1));const range=$(id);range.disabled=skip.checked;$(id+'Value').textContent=skip.checked?'—':range.value;range.style.opacity=skip.checked?'.35':'1';}
  function loadCheckinForm(){
    const today=localDateString();$('checkinDate').textContent=formatDate(today,{weekday:'long',day:'2-digit',month:'long'});const existing=state.entries.find(e=>e.date===today);selectedMood=existing&&Number.isFinite(existing.mood)?existing.mood:5;
    $('skipMood').checked=existing?existing.mood===null:false;$('checkinFeelings').querySelectorAll('[data-score]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.score)===selectedMood));
    metricIds.forEach(id=>{const value=existing?existing[id]:5;const skipId='skip'+id[0].toUpperCase()+id.slice(1);$(skipId).checked=existing?value===null:false;setRange(id,value);syncMetric(id);});$('observation').value=existing?.observation||'';
  }
  metricIds.forEach(id=>{$(id).addEventListener('input',()=>{$(id+'Value').textContent=$(id).value;});$('skip'+id[0].toUpperCase()+id.slice(1)).addEventListener('change',()=>syncMetric(id));});
  $('skipMood').addEventListener('change',()=>{if($('skipMood').checked){$('checkinFeelings').querySelectorAll('[data-score]').forEach(b=>b.classList.remove('selected'));}else{selectMood(selectedMood);}});
  $('checkinForm').addEventListener('submit',event=>{event.preventDefault();const date=localDateString();const record={date,mood:$('skipMood').checked?null:selectedMood,observation:$('observation').value.trim()};metricIds.forEach(id=>{const skipped=$('skip'+id[0].toUpperCase()+id.slice(1)).checked;record[id]=skipped?null:Number($(id).value);});if([record.mood,record.stress,record.sleep,record.energy].every(v=>v===null)&&!record.observation){showToast('Responda pelo menos uma pergunta ou escreva uma observação.');return;}const index=state.entries.findIndex(e=>e.date===date);if(index>=0)state.entries[index]=record;else state.entries.push(record);state.entries.sort((a,b)=>a.date.localeCompare(b.date));persist();demoActive=false;renderHome();showToast(index>=0?'Check-in de hoje atualizado.':'Check-in salvo neste dispositivo.');navigate('home');});
  window.deleteOne=function(date){state.entries=state.entries.filter(e=>e.date!==date);persist();renderMap();renderHome();showToast('Check-in excluído.');};

  window.startBreathing=function(){
    if(breathTimer){clearInterval(breathTimer);breathTimer=null;$('breathButton').textContent='Continuar exercício';$('breathTitle').textContent='Pausa no exercício.';$('breathText').textContent='Quando quiser, continue de onde parou.';$('breathOrb').textContent='Pausa';$('breathOrb').className='breath-orb';return;}
    if(breathRemaining<=0)breathRemaining=60;breathPhase=((60-breathRemaining)%10)<4?'inhale':'exhale';$('breathButton').textContent='Pausar exercício';$('breathTitle').textContent=breathPhase==='inhale'?'Inspire suavemente…':'Solte o ar devagar…';$('breathOrb').textContent=breathPhase==='inhale'?'Inspire':'Solte o ar';$('breathOrb').className='breath-orb '+breathPhase;
    breathTimer=setInterval(()=>{breathRemaining--;if(breathRemaining<=0){clearInterval(breathTimer);breathTimer=null;$('breathButton').textContent='Recomeçar exercício';$('breathTitle').textContent='Pausa concluída.';$('breathText').textContent='Obrigado por reservar esse momento. Volte à respiração natural.';$('breathOrb').textContent='Pausa';$('breathOrb').className='breath-orb';return;}const phase=(60-breathRemaining)%10;if(phase===0){$('breathOrb').textContent='Inspire';$('breathOrb').className='breath-orb inhale';$('breathTitle').textContent='Inspire suavemente…';}if(phase===4){$('breathOrb').textContent='Solte o ar';$('breathOrb').className='breath-orb exhale';$('breathTitle').textContent='Solte o ar devagar…';}$('breathButton').textContent=`Pausar · ${breathRemaining}s`;},1000);
  };

  window.saveNickname=function(){state.nickname=$('nicknameInput').value.trim();persist();updateHeader();renderHome();showToast('Apelido atualizado.');};
  window.exportData=function(){const payload={app:'Mente em Dia',versao:'protótipo visual 2.0',exportado_em:new Date().toISOString(),perfil:{apelido:state.nickname||null},registros_diarios:state.entries,diarios_emocionais:state.journals};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`mente-em-dia-dados-${localDateString()}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);showToast('Arquivo preparado para exportação.');};
  window.openDeleteModal=function(){$('deleteModal').classList.add('show');};window.closeDeleteModal=function(){$('deleteModal').classList.remove('show');};window.confirmDelete=function(){state.entries=[];state.journals=[];persist();closeDeleteModal();renderHome();renderMap();renderDiary();showToast('Todos os registros foram excluídos.');};$('deleteModal').addEventListener('click',e=>{if(e.target===$('deleteModal'))closeDeleteModal();});
  $('welcomeConsent').addEventListener('change',()=>{$('welcomeStart').disabled=!$('welcomeConsent').checked;});window.acceptWelcome=function(){if(!$('welcomeConsent').checked)return;state.consent=true;state.nickname=$('welcomeNickname').value.trim();persist();$('welcomeOverlay').classList.remove('show');updateHeader();renderHome();};
  let introFinished=false;
  function finishIntro(){
    if(introFinished)return;introFinished=true;
    const overlay=$('introOverlay'),video=$('introVideo');
    if(video){video.pause();}
    overlay.classList.add('is-hidden');
    window.setTimeout(()=>{overlay.remove();if(!state.consent){$('welcomeOverlay').classList.add('show');$('welcomeNickname').value=state.nickname;}},560);
  }
  function init(){
    updateHeader();renderHome();renderDiary();
    const video=$('introVideo');
    $('introSkip').addEventListener('click',finishIntro);
    video.addEventListener('ended',finishIntro,{once:true});
    video.addEventListener('error',finishIntro,{once:true});
    const playAttempt=video.play();
    if(playAttempt&&typeof playAttempt.catch==='function')playAttempt.catch(()=>{ /* O botão Pular continua disponível se o navegador bloquear autoplay. */ });
    if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
    window.addEventListener('resize',()=>{if($('screen-home').classList.contains('active'))renderHome();if($('screen-map').classList.contains('active'))renderMap();});
  }
  init();
})();
