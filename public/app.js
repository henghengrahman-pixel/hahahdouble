const $ = (id) => document.getElementById(id);
const state = { dana: [], amounts: [], warnings: [], user: '' };

function setVisible(loggedIn) {
  $('loginView').classList.toggle('hidden', loggedIn);
  $('appView').classList.toggle('hidden', !loggedIn);
}
async function api(url, options={}) {
  const r = await fetch(url, { headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options });
  let body = {}; try { body = await r.json(); } catch {}
  if (!r.ok) throw new Error(body.error || 'Terjadi kesalahan.');
  return body;
}
async function boot() {
  try { const s = await api('/api/session'); state.user=s.user; $('userName').textContent=s.user; setVisible(true); }
  catch { setVisible(false); }
}
$('loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault(); $('loginError').textContent='';
  try { const r=await api('/api/login',{method:'POST',body:JSON.stringify({id:$('loginId').value,password:$('loginPassword').value})}); state.user=r.user; $('userName').textContent=r.user; $('loginPassword').value=''; setVisible(true); }
  catch(err){ $('loginError').textContent=err.message; }
});
$('logoutBtn').onclick=async()=>{try{await api('/api/logout',{method:'POST',body:'{}'});}catch{} state.user=''; setVisible(false);};

document.querySelectorAll('.nav-item[data-tab]').forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll('.nav-item[data-tab]').forEach(x=>x.classList.toggle('active',x===btn));
  document.querySelectorAll('.tab-panel').forEach(x=>x.classList.toggle('active',x.id===btn.dataset.tab));
  const isCombine=btn.dataset.tab==='combine'; $('pageTitle').textContent=isCombine?'Gabungkan Data':'Formatter'; $('pageSub').textContent=isCombine?'Pasangkan hasil nomor dan nominal dalam urutan yang sama.':'Rapikan nomor DANA dan nominal sebelum dipindahkan ke template.';
});

function extractNumber(line) {
  const parts=line.split(','); let raw='';
  if(parts.length>=2) raw=parts[1]; else raw=line;
  const m=raw.match(/[0-9][0-9.\-\s]*/); return m?m[0].replace(/\D/g,''):'';
}
function to8059(n) {
  if(!n) return '';
  if(n.startsWith('8059')) return n;
  if(n.startsWith('62')) n=n.slice(2); else if(n.startsWith('0')) n=n.slice(1);
  return '8059'+n;
}
function processDana(){
  const lines=$('danaInput').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean); const out=[], warn=[];
  lines.forEach((line,i)=>{
    const src=extractNumber(line); if(!src){warn.push(`Baris ${i+1}: nomor tidak ditemukan`);return;}
    const val=to8059(src); out.push(val);
    let core=src;if(core.startsWith('8059'))core=core.slice(4);else if(core.startsWith('62'))core=core.slice(2);else if(core.startsWith('0'))core=core.slice(1);
    if(core.length<9||core.length>13)warn.push(`Baris ${i+1}: ${src} → ${val} (cek panjang nomor)`);
    if(src.startsWith('3901'))warn.push(`Baris ${i+1}: ${src} tampak seperti VA/non-HP, cek sebelum transfer`);
  });
  state.dana=out;state.warnings=warn;$('danaOutput').value=out.join('\n');$('danaWarnings').textContent=warn.length?'PERLU CEK:\n'+warn.join('\n'):'';$('danaWarnings').classList.toggle('hidden',!warn.length);refreshStats();
}
function processAmount(){
  const lines=$('amountInput').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean); const out=[];
  for(const line of lines){const m=line.match(/\d[\d,.\s]*/);if(m){const n=m[0].replace(/\D/g,'');if(n)out.push(n);}}
  state.amounts=out;$('amountOutput').value=out.join('\n');refreshStats();
}
function refreshStats(){
  $('statDana').textContent=state.dana.length;$('statAmount').textContent=state.amounts.length;$('statWarn').textContent=state.warnings.length;
  const total=state.amounts.reduce((a,b)=>a+(Number(b)||0),0);$('statTotal').textContent='Rp'+total.toLocaleString('id-ID');
}
async function copyText(text){if(!text)return;try{await navigator.clipboard.writeText(text);}catch{const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();}}
$('processDana').onclick=processDana;$('processAmount').onclick=processAmount;$('copyDana').onclick=()=>copyText($('danaOutput').value);$('copyAmount').onclick=()=>copyText($('amountOutput').value);
$('clearDana').onclick=()=>{$('danaInput').value='';$('danaOutput').value='';$('danaWarnings').classList.add('hidden');state.dana=[];state.warnings=[];refreshStats();};
$('clearAmount').onclick=()=>{$('amountInput').value='';$('amountOutput').value='';state.amounts=[];refreshStats();};

function buildCombined(){
  if(!state.dana.length) processDana(); if(!state.amounts.length) processAmount();
  const body=$('combinedBody');body.innerHTML='';
  if(!state.dana.length||!state.amounts.length){$('combineStatus').textContent='Nomor dan nominal harus diproses terlebih dahulu.';body.innerHTML='<tr><td colspan="3" class="empty">Data belum lengkap.</td></tr>';return;}
  if(state.dana.length!==state.amounts.length){$('combineStatus').textContent=`Jumlah tidak sama: ${state.dana.length} nomor dan ${state.amounts.length} nominal. Penggabungan dibatalkan agar urutan tidak salah.`;body.innerHTML='<tr><td colspan="3" class="empty">Periksa jumlah baris terlebih dahulu.</td></tr>';return;}
  state.dana.forEach((n,i)=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${i+1}</td><td>${n}</td><td>${Number(state.amounts[i]).toLocaleString('id-ID')}</td>`;body.appendChild(tr);});
  $('combineStatus').textContent=`${state.dana.length} data berhasil dipasangkan.`;
}
function combinedCsv(){if(state.dana.length!==state.amounts.length||!state.dana.length)return'';return ['No,Nomor DANA,Nominal',...state.dana.map((n,i)=>`${i+1},${n},${state.amounts[i]}`)].join('\n');}
$('buildCombined').onclick=buildCombined;$('copyCombined').onclick=()=>copyText(combinedCsv());$('downloadCsv').onclick=()=>{const csv=combinedCsv();if(!csv)return;const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`dana-format-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);};
boot();
