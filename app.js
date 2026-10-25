'use strict';
const $ = id => document.getElementById(id);
const CATEGORIES = { expense: ['餐饮','交通','购物','学习','娱乐','居住','医疗','其他'], income: ['工资','兼职','红包','其他'] };
const ICONS = {'餐饮':'🍜','交通':'🚇','购物':'🛒','学习':'📚','娱乐':'🎮','居住':'🏠','医疗':'💊','其他':'✨','工资':'💰','兼职':'💼','红包':'🧧'};
const PASTELS = {'餐饮':'#ffd3b6','交通':'#c9e4f6','购物':'#ffc9d6','学习':'#d9efc2','娱乐':'#e3d7f5','居住':'#ffe8a3','医疗':'#bfe8d6','其他':'#f3e8d8','工资':'#bfe8d6','兼职':'#c9e4f6','红包':'#ffc9d6'};
const COLORS = ['#ffc08f','#9ed8c0','#f7a8bc','#b9d991','#c8b6ec','#ffe08a','#8ecbdc','#c6b8a5'];
const STORAGE_KEY = 'daily-ledger-v1';
const MAX_CENTS = 99999999999;
let state = {records:[],budgets:{}}, storageBroken = false, toastTimer;
let sheetOpener;
function localDate(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function validDate(s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || s < '0001-01-01') return false; const d = new Date(`${s}T12:00:00`); return !isNaN(d) && localDate(d) === s; }
function validMonth(s) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) && s.slice(0,4) !== '0000'; }
function parseMoney(s, allowZero=false) { s=String(s).trim(); if(!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('金额必须是最多两位小数的非负数字'); const n=Math.round(Number(s)*100); if(!Number.isSafeInteger(n)||n>MAX_CENTS||n<(allowZero?0:1)) throw new Error('金额须在 0.01 至 999,999,999.99 元之间'); return n; }
function money(cents) { return '¥'+(cents/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function uid() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function validateRecord(r) { return r && typeof r.id==='string' && r.id.length>0 && CATEGORIES[r.type]?.includes(r.category) && Number.isSafeInteger(r.cents) && r.cents>0 && r.cents<=MAX_CENTS && typeof r.date==='string' && validDate(r.date) && typeof r.note==='string' && r.note.length<=200; }
function toast(message) { $('toast').textContent=message; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,4500); }
function load() {
  try {
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw)return;
    const data=JSON.parse(raw);
    if(!data || !Array.isArray(data.records)||!data.records.every(validateRecord)||new Set(data.records.map(r=>r.id)).size!==data.records.length||!data.budgets||typeof data.budgets!=='object'||Array.isArray(data.budgets)||!Object.entries(data.budgets).every(([m,v])=>validMonth(m)&&Number.isSafeInteger(v)&&v>=0&&v<=MAX_CENTS)) throw Error();
    state=data;
  } catch {
    storageBroken=true;
    toast('无法读取本地数据。为保护原数据，已暂停写入；请检查浏览器存储设置或备份。');
  }
}
function commit(next) { if(storageBroken){toast('本地存储不可用，无法保存；原数据未覆盖。');return false;} try { localStorage.setItem(STORAGE_KEY,JSON.stringify(next)); state=next; render(); return true; } catch { toast('保存失败：存储空间不足或浏览器禁止存储，请先导出备份。'); return false; } }
function setCategories(value) {
  const type = document.querySelector('[name="type"]:checked').value;
  const selected = CATEGORIES[type].includes(value) ? value : CATEGORIES[type][0];
  $('category').value = selected;
  $('category-chips').replaceChildren(...CATEGORIES[type].map(category => {
    const button = node('button', 'category-chip');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(category === selected));
    const icon = node('span', '', ICONS[category] || '✨');
    icon.style.background = PASTELS[category] || PASTELS['其他'];
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon, document.createTextNode(category));
    button.addEventListener('click', () => {
      setCategories(category);
      $('category-chips').querySelector('[aria-pressed="true"]').focus();
    });
    return button;
  }));
}
function resetForm() {
  $('entry-form').reset();
  $('entry-id').value = '';
  $('date').value = localDate();
  setCategories();
  $('entry-title').textContent = '记一笔';
  $('save-entry').textContent = '保存这一笔';
  $('cancel-edit').hidden = true;
}
function openSheet() {
  sheetOpener = document.activeElement;
  // Toasts must share the dialog's top layer to remain visible during validation.
  $('entry-sheet').append($('toast'));
  if (!$('entry-sheet').open) $('entry-sheet').showModal();
  $('amount').focus();
}
function closeSheet() { $('entry-sheet').close(); }
function route() {
  const view = ['home', 'bills', 'stats'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
  document.querySelectorAll('.view').forEach(section => section.hidden = section.id !== view);
  document.querySelectorAll('.tabs a').forEach(link => {
    if (link.hash === '#' + view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
function node(tag,cls,text) { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n; }
function renderList(target,records,editable) {
  const box=$(target);
  box.replaceChildren();
  if(!records.length){
    const empty=node('div','empty');
    empty.append(node('span','empty-symbol','▤'),node('span','',target==='today-list'?'今天还没有记录，记下生活的第一笔吧。':'没有符合条件的账单'));
    box.append(empty);
    return;
  } const fragment=document.createDocumentFragment();
  records.forEach(r=>{
    const row=node('div','record');
    const details=node('div','record-details');
    details.append(node('div','record-title',r.category),node('div','record-note',`${r.date}${r.note?' · '+r.note:''}`));
    row.append(categoryIcon(r.category),details,node('div',`record-amount ${r.type==='income'?'income':''}`,`${r.type==='income'?'+':'−'}${money(r.cents)}`));
    if(editable){
      const actions=node('div','record-actions');
      [['edit','编辑'],['delete','删除']].forEach(([action,label])=>{
        const b=node('button','',label);
        b.type='button';
        b.dataset.action=action;
        b.dataset.id=r.id;
        b.setAttribute('aria-label',`${label} ${r.date} ${r.category} ${money(r.cents)}`);
        actions.append(b);
      });
      row.append(actions);
    }fragment.append(row);
  });
  box.append(fragment);
}
function sorted(records) { return [...records].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)); }
function render() {
  const today=localDate();
  $('today-label').textContent=new Date().toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'});
  const todayRecords=state.records.filter(r=>r.date===today);
  const total=type=>todayRecords.filter(r=>r.type===type).reduce((s,r)=>s+r.cents,0);
  $('today-income').textContent=money(total('income'));
  $('today-expense').textContent=money(total('expense'));
  $('today-balance').textContent=money(total('income')-total('expense'));
  $('today-count').textContent=`${todayRecords.length} 笔`;
  renderList('today-list',sorted(todayRecords),true);
  const currentMonth=today.slice(0,7);
  $('month-label').textContent=`本月支出（${Number(today.slice(5,7))}月）`;
  $('month-expense').textContent=money(sum(state.records.filter(r=>r.date.startsWith(currentMonth)), 'expense'));
  const date=$('filter-date').value,month=$('filter-month').value,query=$('search').value.trim().toLocaleLowerCase();
  const filtered=state.records.filter(r=>(!date||r.date===date)&&(!month||r.date.startsWith(month))&&(!query||`${r.note} ${r.category}`.toLocaleLowerCase().includes(query)));
  $('filter-summary').textContent=`共 ${filtered.length} 笔 · 支出 ${money(sum(filtered, 'expense'))} · 收入 ${money(sum(filtered, 'income'))}`;
  renderBills(sorted(filtered));
  renderStats();
}
function sum(records, type) { return records.filter(r => r.type === type).reduce((total, r) => total + r.cents, 0); }
function categoryIcon(category) {
  const icon = node('div', 'category-icon', ICONS[category] || '✨');
  icon.style.background = PASTELS[category] || PASTELS['其他'];
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}
function renderBills(records) {
  const list = $('bill-list');
  list.replaceChildren();
  if (!records.length) {
    list.append(node('div', 'card empty', '🧾 暂时没有符合条件的账单，试试其他筛选吧。'));
    return;
  }
  const groups = new Map();
  records.forEach(record => {
    if (!groups.has(record.date)) groups.set(record.date, []);
    groups.get(record.date).push(record);
  });
  groups.forEach((daily, date) => {
    const heading = node('div', 'day-heading');
    heading.append(node('h3', '', `${date}${date === localDate() ? ' 今天' : ''}`),
      node('span', '', `支出 ${money(sum(daily, 'expense'))} · 收入 ${money(sum(daily, 'income'))}`));
    const card = node('div', 'card record-list');
    // Reuse the same record renderer for grouped bills and today's list.
    card.id = 'day-' + date;
    list.append(heading, card);
    renderList(card.id, daily, true);
  });
}
function svgNode(tag, attributes = {}, text) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  if (text !== undefined) element.textContent = text;
  return element;
}
function renderStats() {
  const month=$('stats-month').value;
  if(!validMonth(month))return;
  const expenses=state.records.filter(r=>r.type==='expense'&&r.date.startsWith(month));
  const totals=CATEGORIES.expense.map(c=>expenses.filter(r=>r.category===c).reduce((s,r)=>s+r.cents,0));
  const spent=totals.reduce((a,b)=>a+b,0), budget=state.budgets[month]||0;
  $('budget').value=budget?(budget/100).toFixed(2):'';
  const ratio=budget?spent/budget:0;
  const cls=ratio>1?'danger':ratio>.8?'warning':'';
  $('budget-progress').className='progress '+cls;
  $('budget-progress').setAttribute('aria-valuenow',String(Math.min(100,Math.round(ratio*100))));
  $('budget-bar').style.width=`${Math.min(100,ratio*100)}%`;
  $('budget-status').className='muted '+cls;
  $('budget-status').textContent=!budget?`已支出 ${money(spent)} · 尚未设置预算`:ratio>1?`已超出预算 ${money(spent-budget)}（已用 ${(ratio*100).toFixed(1)}%）`:ratio>.8?`预算已用 ${(ratio*100).toFixed(1)}%，请留意支出 · 剩余 ${money(budget-spent)}`:`已用 ${(ratio*100).toFixed(1)}% · 剩余 ${money(budget-spent)}`;
  $('budget-description').textContent=`${month} 的消费计划 · 输入 0 可取消预算`;

  $('category-chart').replaceChildren();
  $('category-legend').replaceChildren();
  $('category-empty').hidden = spent > 0;
  $('month-total').textContent = `本月累计支出 ${money(spent)} · ${expenses.length} 笔记录`;
  if (spent) {
    const chart = svgNode('svg', {viewBox:'0 0 120 120', role:'img', 'aria-label':`分类支出占比，总支出 ${money(spent)}`});
    let offset = 0;
    totals.forEach((value, index) => {
      if (!value) return;
      const percent = value / spent * 100;
      const circle = svgNode('circle', {cx:60, cy:60, r:45, fill:'none', stroke:COLORS[index], 'stroke-width':17, pathLength:100, 'stroke-dasharray':`${percent} ${100-percent}`, 'stroke-dashoffset':-offset, transform:'rotate(-90 60 60)'});
      circle.append(svgNode('title', {}, `${CATEGORIES.expense[index]} ${money(value)} · ${percent.toFixed(1)}%`));
      chart.append(circle);
      offset += percent;
      const item = node('div', 'legend-item');
      const dot = node('span', 'legend-dot');
      dot.style.background = COLORS[index];
      item.append(dot, node('span', '', CATEGORIES.expense[index]), node('strong', '', `${money(value)} · ${percent.toFixed(1)}%`));
      $('category-legend').append(item);
    });
    $('category-chart').append(chart);
  }
  renderTrend();
}
function renderTrend() {
  const days = Array.from({length:7}, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = localDate(date);
    return {date:key, label:index === 6 ? '今天' : `${date.getMonth()+1}/${date.getDate()}`, cents:sum(state.records.filter(r => r.date === key), 'expense')};
  });
  const max = Math.max(...days.map(day => day.cents), 1);
  const chart = svgNode('svg', {viewBox:'0 0 336 180', role:'img', 'aria-label':'近七天支出：' + days.map(day => `${day.date} ${money(day.cents)}`).join('；')});
  days.forEach((day, index) => {
    const height = day.cents / max * 108;
    const x = index * 48 + 9;
    const bar = svgNode('rect', {x, y:140-Math.max(height, 2), width:30, height:Math.max(height, 2), rx:9, fill:index === 6 ? '#f2a65a' : '#ffd3b6'});
    bar.append(svgNode('title', {}, `${day.date}：${money(day.cents)}`));
    chart.append(bar, svgNode('text', {x:x+15, y:162, 'text-anchor':'middle'}, day.label));
    chart.append(svgNode('text', {x:x+15, y:140-height-8, 'text-anchor':'middle', 'font-size':9}, day.cents ? `¥${(day.cents/100).toLocaleString('zh-CN', {maximumFractionDigits:2, notation:'compact'})}` : '0'));
  });
  $('trend-chart').replaceChildren(chart);
  $('trend-empty').hidden = days.some(day => day.cents > 0);
}
function csvEncode(rows) {return '\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');}
function csvParse(text) {
  text=text.replace(/^\uFEFF/,'');
  const rows=[];
  let row=[],field='',quoted=false,closed=false;
  for(let i=0;
  i<text.length;
  i++){
    const c=text[i];
    if(quoted){
      if(c==='"'){
        if(text[i+1]==='"'){
          field+='"';
          i++;
        }else{
          quoted=false;
          closed=true;
        }
      }else field+=c;
    }else if(c==='"'){
      if(field||closed)throw Error('CSV 引号格式错误');
      quoted=true;
    }else if(c===','){
      row.push(field);
      field='';
      closed=false;
    }else if(c==='\n'||c==='\r'){
      row.push(field);
      rows.push(row);
      row=[];
      field='';
      closed=false;
      if(c==='\r'&&text[i+1]==='\n')i++;
    }else{
      if(closed)throw Error('CSV 引号后包含多余字符');
      field+=c;
    }
  }if(quoted)throw Error('CSV 引号未闭合');
  if(field||closed||row.length){
    row.push(field);
    rows.push(row);
  }return rows.filter(r=>r.some(v=>v!==''));
}
// Prefix formula-like notes for Excel; escape a leading apostrophe as well for lossless round trips.
function safeNote(note){return /^[=+\-@\t\r\n']/.test(note)||/^\s+[=+\-@]/.test(note)?"'"+note:note;}
function importRows(rows){
  const header=['日期','类型','分类','金额','备注'];
  if(!rows.length||rows[0].length!==5||!header.every((h,i)=>rows[0][i]===h))throw Error('表头必须为：日期,类型,分类,金额,备注');
  return rows.slice(1).map((cells,i)=>{
    try{
      if(cells.length!==5)throw Error('应为 5 列');
      let [date,type,category,amount,note]=cells;
      type=type==='收入'?'income':type==='支出'?'expense':'';
      if(note.startsWith("'")&&/^[=+\-@\t\r\n'\s]/.test(note.slice(1)))note=note.slice(1);
      const r={id:uid(),date,type,category,cents:parseMoney(amount),note};
      if(!validateRecord(r))throw Error('日期、收支类型、分类或备注不合法（备注最多 200 字）');
      return r;
    }catch(e){
      throw Error(`第 ${i+2} 行：${e.message}`);
    }
  });
}
function fingerprint(r){return JSON.stringify([r.date,r.type,r.category,r.cents,r.note]);}
function init(){
  load();
  $('date').value=localDate();
  $('stats-month').value=localDate().slice(0,7);
  $('filter-month').value=localDate().slice(0,7);
  setCategories();
  document.querySelectorAll('[name="type"]').forEach(r=>r.addEventListener('change',()=>setCategories()));
  $('cancel-edit').addEventListener('click',closeSheet);
  $('entry-form').addEventListener('submit',e=>{
    e.preventDefault();
    try{
      const record={id:$('entry-id').value||uid(),type:document.querySelector('[name="type"]:checked').value,category:$('category').value,cents:parseMoney($('amount').value),date:$('date').value,note:$('note').value.trim()};
      if(!validateRecord(record))throw Error('请检查日期、分类和备注');
      const editing=!!$('entry-id').value;
      const records=editing?state.records.map(r=>r.id===record.id?record:r):[...state.records,record];
      if(commit({...state,records})){
        closeSheet();
        resetForm();
        toast(editing?'记录已更新':'已记下这笔记录');
      }
    }catch(err){
      toast(err.message);
    }
  });
  $('app').addEventListener('click',e=>{
    const b=e.target.closest('button[data-action]');
    if(!b)return;
    const r=state.records.find(r=>r.id===b.dataset.id);
    if(!r)return;
    if(b.dataset.action==='delete'){
      if(!confirm(`确定删除 ${r.date} 的${r.category}${r.type==='income'?'收入':'支出'} ${money(r.cents)}？`))return;
      if(commit({...state,records:state.records.filter(x=>x.id!==r.id)})){
        if($('entry-id').value===r.id)resetForm();
        toast('记录已删除');
      }
    }else{
      $('entry-id').value=r.id;
      document.querySelector(`[name="type"][value="${r.type}"]`).checked=true;
      setCategories(r.category);
      $('amount').value=(r.cents/100).toFixed(2);
      $('date').value=r.date;
      $('note').value=r.note;
      $('entry-title').textContent='编辑这一笔';
      $('save-entry').textContent='保存修改';
      $('cancel-edit').hidden=false;
      openSheet();
    }
  });
  $('filter-month').addEventListener('change',()=>{
    $('filter-date').value='';
    render();
  });
  $('filter-date').addEventListener('change',()=>{
    $('filter-month').value='';
    render();
  });
  $('reset-filters').addEventListener('click',()=>{
    $('filter-month').value='';
    $('filter-date').value='';
    $('search').value='';
    render();
  });
  $('stats-month').addEventListener('change',renderStats);
  $('budget-form').addEventListener('submit',e=>{
    e.preventDefault();
    try{
      const month=$('stats-month').value;
      if(!validMonth(month))throw Error('请选择有效月份');
      const amount=parseMoney($('budget').value,true);
      if(commit({...state,budgets:{...state.budgets,[month]:amount}}))toast(amount?'月预算已保存':'已取消该月预算');
    }catch(err){
      toast(err.message);
    }
  });
  $('export-csv').addEventListener('click',()=>{
    const rows=[['日期','类型','分类','金额','备注'],...sorted(state.records).map(r=>[r.date,r.type==='income'?'收入':'支出',r.category,(r.cents/100).toFixed(2),safeNote(r.note)])];
    const url=URL.createObjectURL(new Blob([csvEncode(rows)],{type:'text/csv;charset=utf-8;'}));
    const a=document.createElement('a');
    a.href=url;
    a.download=`日常账本-${localDate()}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast(`已导出全部 ${state.records.length} 笔账单`);
  });
  $('import-trigger').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',async e=>{
    const file=e.target.files[0];
    if(!file)return;
    try{
      if(file.size>5*1024*1024)throw Error('文件过大，请使用不超过 5 MB 的 CSV');
      const records=importRows(csvParse(await file.text()));
      const known=new Set(state.records.map(fingerprint));
      const added=records.filter(r=>{
        const key=fingerprint(r);
        if(known.has(key))return false;
        known.add(key);
        return true;
      });
      if(!added.length){
        toast('没有新记录，重复账单已跳过');
        return;
      }if(!confirm(`将导入 ${added.length} 笔新账单，跳过 ${records.length-added.length} 笔重复记录。现有账单将保留，是否继续？`))return;
      if(commit({...state,records:[...state.records,...added]}))toast(`成功导入 ${added.length} 笔账单`);
    }catch(err){
      toast(`导入失败：${err.message}，未更改任何账单。`);
    }finally{
      e.target.value='';
    }
  });
 $('search').addEventListener('input', render);
 $('add-entry').addEventListener('click', () => { resetForm(); openSheet(); });
 $('close-sheet').addEventListener('click', closeSheet);
 $('entry-sheet').addEventListener('click', event => {
   if (event.target !== $('entry-sheet')) return;
   const bounds = $('entry-sheet').getBoundingClientRect();
   if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeSheet();
 });
 $('entry-sheet').addEventListener('close', () => {
   document.body.append($('toast'));
   sheetOpener?.focus();
 });
 window.addEventListener('hashchange', route);
 route(); render();
 let day=localDate();setInterval(()=>{if(localDate()!==day){day=localDate();if(!$('entry-id').value)$('date').value=day;render();}},60000);window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){load();render();toast('账本已同步其他标签页的更改');}});}
init();
