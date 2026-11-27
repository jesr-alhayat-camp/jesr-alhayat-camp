function describeRecordChange(key, before, after) {
    const labels = (EXPORT_SCHEMAS[key] || []).slice();
    if (key === 'db_families') labels.push('كود الأسرة','عدد المصابين','علامة الهشاشة');
    if (key === 'db_injured' || key === 'db_orphans') labels.push('هوية رب الأسرة المرتبطة');
    return labels.flatMap((label,i)=>{
        const previous=String(before[i] ?? '').trim(), current=String(after[i] ?? '').trim();
        if (previous === current) return [];
        return [label+' (قبل: '+(previous || 'فارغ')+'، بعد: '+(current || 'فارغ')+')'];
    }).join('؛ ');
}

function historyEntries(id, stored) {
    const entries = Object.values(stored || {}).filter(Boolean).map(e=>({
        date:e.t, action:e.a, detail:e.d, actor:e.u
    }));
    const requests = obj('db_reqlog');
    for (const req of Object.values(requests)) {
        if (!req || digitsOf(req.fid)!==id) continue;
        const type=REQ_LABEL[req.ty] || 'طلب';
        entries.push({date:req.d,action:'استلام طلب · '+type,detail:[req.x,req.st==='pending'?'قيد المراجعة':''].filter(Boolean).join(' · '),actor:'العائلة'});
        if (req.st && req.st!=='pending') entries.push({
            date:req.decisionAt || req.ud,action:ST_LABEL[req.st] || req.st,detail:[type,req.x,req.r].filter(Boolean).join(' · '),actor:req.decisionBy || 'الإدارة'
        });
    }
    // Older queues can contain requests saved before the request log was introduced.
    for (const type of ['db_children','db_orphans','db_injured','db_chronic']) {
        for (const [key,item] of Object.entries(localDB[type+'_reqs'] || {})) {
            if (item && digitsOf(item.id)===id && !requests[key]) entries.push({
                date:item.date,action:REQ_LABEL[type],detail:[item.payload?.[0],'قيد المراجعة'].filter(Boolean).join(' · '),actor:'العائلة'
            });
        }
    }
    for (const req of getDB('db_edit_requests')) {
        if (req && digitsOf(req.id)===id && !requests[req.rid]) entries.push({
            date:req.date,action:'طلب تعديل بيانات الأسرة',detail:'قيد المراجعة',actor:'العائلة'
        });
    }
    for (const complaint of getDB('db_complaints')) {
        if (complaint && digitsOf(complaint[2])===id && !requests[complaint[6]]) entries.push({
            date:complaint[0],action:'شكوى أو طلب',detail:[complaint[4],complaint[7] || 'قيد المراجعة'].join(' · '),actor:'العائلة'
        });
    }
    for (const [key,item] of Object.entries(localDB.inbox?.[id] || {})) {
        if (item && !requests[id+'_'+key]) entries.push({date:item.date,action:'طلب بانتظار الاستلام',detail:REQ_LABEL[item.type] || 'طلب',actor:'العائلة'});
    }
    for (const aid of getDB('db_aids')) {
        if (aid && digitsOf(aid[1])===id) entries.push({
            date:aidISO(aid[4]),action:'قيد في كشف المساعدات',detail:[aid[3], 'الكمية '+(aid[5] ?? '—')].join(' · '),actor:''
        });
    }
    const stamp=date=>typeof date==='number'?date:(Date.parse(date)||0);
    return entries.sort((a,b)=>stamp(b.date)-stamp(a.date));
}

const historyViews=new WeakMap();
function clearFamilyHistory() {
    const host=document.getElementById('historyResult');
    historyViews.delete(host);
    host.replaceChildren();
}

function openHistoryFor(id) {
    if (ROLE!=='super_admin') return;
    closeModal();
    switchTab('family-history');
    document.getElementById('historyIdentity').value=id;
    return lookupFamilyHistory();
}

function lookupFamilyHistory() {
    const host=document.getElementById('historyResult');
    const id=toLatin(document.getElementById('historyIdentity').value.trim());
    if (!/^\d{9}$/.test(id)) {
        clearFamilyHistory();
        host.textContent='اكتب هوية رب الأسرة من ٩ أرقام.';
        return;
    }
    return loadFamilyHistory(id,host);
}

async function loadFamilyHistory(id,host) {
    host.replaceChildren();
    const ticket={};
    historyViews.set(host,ticket);
    if (ROLE!=='super_admin' || !/^\d{9}$/.test(id)) return;
    host.textContent='جارٍ تحميل سجل الأسرة…';
    let stored,failed=false;
    try {
        const snapshot=await rdb.ref('family_history/'+id).once('value');
        stored=snapshot.val();
    } catch {
        failed=true;
    }
    if (historyViews.get(host)!==ticket || ROLE!=='super_admin') return;
    const entries=historyEntries(id,stored);
    const labels=['التاريخ','العملية أو الطلب','التفاصيل','بواسطة'];
    const rows=entries.map(e=>[
        e.date ? (typeof e.date==='number' || String(e.date).includes('T') ? new Date(e.date).toLocaleString('ar-PS') : formatDateValue(e.date)) : 'غير مسجّل',
        e.action,e.detail || '—',e.actor || 'غير مسجّل'
    ]);
    const family=famByKey(id);
    const heading=document.createElement('h3');
    heading.textContent='سجل الأسرة · '+(family?.[1] ? family[1]+' · ' : '')+id;
    host.replaceChildren(heading);
    if (failed) {
        const msg=document.createElement('p');
        msg.textContent='تعذّر تحميل سجل العمليات. المعروض من الطلبات وكشف المساعدات المتاحين.';
        host.append(msg);
    }
    if (!rows.length) {
        const msg=document.createElement('p');
        msg.textContent='ما في سجلات متاحة لهاي الهوية.';
        host.append(msg);return;
    }
    const wrap=document.createElement('div');
    wrap.className='table-responsive';
    wrap.innerHTML='<table><thead><tr>'+labels.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
    const button=document.createElement('button');
    button.className='btn btn-blue';button.type='button';button.textContent='تصدير سجل الأسرة';
    button.onclick=()=>exportRowsToExcel(['التاريخ','الوقت',...labels.slice(1)],entries.map((e,i)=>{
        const d=e.date?new Date(e.date):null;
        const timed=typeof e.date==='number' || String(e.date).includes('T');
        return [d && !isNaN(+d)?d:'', timed && d?d.toLocaleTimeString('en-GB'):'',...rows[i].slice(1)];
    }),'سجل_الأسرة_'+id+'.xlsx','سجل الأسرة');
    host.append(button,wrap);
}
