        const firebaseConfig = {
          apiKey: "AIzaSyCZdQeLOQu8LPp26eaFtoszSWOJHrgxLrw",
          authDomain: "alhayacamp-a31eb.firebaseapp.com",
          databaseURL: "https://alhayacamp-a31eb-default-rtdb.firebaseio.com",
          projectId: "alhayacamp-a31eb",
          storageBucket: "alhayacamp-a31eb.firebasestorage.app",
          messagingSenderId: "729970326565",
          appId: "1:729970326565:web:9bf09186c7a5ab47376d3cc"
        };
        firebase.initializeApp(firebaseConfig);
        const auth=firebase.auth(), rdb=firebase.database();
        const authReady = prepareCampAuth(auth);

        let localDB = {
            db_families: [], db_aids: [], db_injured: [], db_orphans: [],
            db_children: [], db_chronic: [], db_fund: [], db_stock: [], db_complaints: [],
            db_edit_requests: [], db_passwords: {}, pwvault: {},
            db_children_reqs: {}, db_chronic_reqs: {}, db_injured_reqs: {},
            db_reqlog: {}, db_audit: {}, db_announcements: {}, config: {}, claims: {}
        };
        
        const toLatin=s=>String(s==null?'':s).replace(/[\u0660-\u0669]/g,c=>c.charCodeAt(0)-1632).replace(/[\u06F0-\u06F9]/g,c=>c.charCodeAt(0)-1776);
        const digitsOf=s=>toLatin(s).replace(/\D/g,'');
        const normAr=s=>toLatin(s).toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();
        const matchTokens=(hay,q)=>{q=normAr(q);if(!q)return true;hay=normAr(hay);return q.split(' ').every(t=>hay.includes(t));};
        const safeKey=s=>String(s==null?'':s).replace(/[.#$\[\]\/\s]/g,'');
        const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        let isFirstLoad = true, synced = false, ROLE = '', isLimited = false;
        const OBJ_KEYS = ['db_passwords','pwvault','config','claims','db_reqlog','db_audit','db_announcements'];

        /* ================= ثوابت وأدوات مشتركة ================= */
        const FAM_LABELS=['القاطع','الاسم رباعي','رقم الهوية','الجنس','تاريخ الميلاد','رقم الجوال','رقم الجوال الثاني','الحالة الاجتماعية','اسم الزوجة الأولى','هوية الزوجة الأولى','ميلاد الزوجة الأولى','اسم الزوجة الثانية','هوية الزوجة الثانية','ميلاد الزوجة الثانية','(يوم-سنتين) ذكر','(يوم-سنتين) أنثى','(3-6 سنوات) ذكر','(3-6 سنوات) أنثى','(7-12 سنة) ذكر','(7-12 سنة) أنثى','(13-17 سنة) ذكر','(13-17 سنة) أنثى','(18-60 سنة) ذكر','(18-60 سنة) أنثى','(فوق 60) ذكر','(فوق 60) أنثى','العدد الكلي للأفراد','عنوان السكن الأصلي','المحافظة الأصلية','عنوان السكن الحالي','المحافظة الحالية','المسكن','الحالة','المهنة','نوع الضرر','ذوو الإعاقة','أمراض مزمنة','تعيل الأسرة امرأة؟','امرأة مرضعة/حامل؟','ملاحظات (داخلية)'];
        const CHILD_LABELS=['اسم الطفل','هوية الطفل','تاريخ الميلاد','الجنس','اسم الأب','هوية الأب','جوال الأب','اسم الأم','هوية الأم','ملاحظات'];

        /* ===== توحيد عرض التواريخ ومنع ظهور أرقام Excel مثل 44082 ===== */
        const DATE_FIELDS = { db_families:[4,10,13], db_children:[2], db_chronic:[2], db_injured:[2], db_orphans:[2,5], db_stock:[0] };
        function formatDateValue(value) {
            const p2 = n => String(n).padStart(2, '0');
            if (value === null || value === undefined || value === '') return '';
            if (Object.prototype.toString.call(value) === '[object Date]') {
                if (isNaN(value.getTime())) return '';
                const d = new Date(value.getTime() + 43200000); // +12 ساعة: يمنع انزلاق اليوم بسبب فرق التوقيت
                return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear();
            }
            const raw = String(value).trim(), s = toLatin(raw);
            if (/^\d+(?:\.\d+)?$/.test(s)) {
                const n = Number(s);
                if (n >= 20000 && n <= 80000) { // رقم تسلسلي من إكسل
                    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400000));
                    return p2(d.getUTCDate()) + '/' + p2(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
                }
            }
            let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[T ].*)?$/);
            if (m) return p2(m[3]) + '/' + p2(m[2]) + '/' + m[1];
            m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
            if (m) { let a = +m[1], b = +m[2]; if (b > 12 && a <= 12) { const x = a; a = b; b = x; } return p2(a) + '/' + p2(b) + '/' + m[3]; }
            m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2})$/); // 8/1/26 : صيغة إكسل الأمريكية شهر/يوم/سنة
            if (m) {
                let mo = +m[1], da = +m[2]; if (mo > 12 && da <= 12) { const x = mo; mo = da; da = x; }
                const yy = +m[3], y = yy <= (new Date().getFullYear() % 100) + 1 ? 2000 + yy : 1900 + yy;
                return p2(da) + '/' + p2(mo) + '/' + y;
            }
            return raw;
        }
        function smartNote(v) {
            if (v === null || v === undefined || v === '') return '';
            if (Object.prototype.toString.call(v) === '[object Date]') return formatDateValue(v);
            const s = toLatin(String(v)).trim();
            { const bm = s.match(/^\[(\d{4}-\d{1,2}-\d{1,2})\]\s*/); if (bm) { const d = formatDateValue(bm[1]), rest = String(v).trim().replace(/^\[[^\]]*\]\s*/, ''); return rest ? d + ' — ' + rest : d; } }
            if (/^\d{5}$/.test(s) && +s >= 30000 && +s <= 70000) return formatDateValue(s);
            if (/^\d{1,2}[-\/.]\d{1,2}[-\/.](\d{2}|\d{4})$/.test(s) || /^\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2}$/.test(s)) return formatDateValue(s);
            return String(v).trim();
        }
        function formatCellForDB(dbKey, fieldIndex, value) {
            if (dbKey === 'db_aids' && fieldIndex === 4) return smartNote(value);
            if (Object.prototype.toString.call(value) === '[object Date]') return formatDateValue(value);
            return DATE_FIELDS[dbKey] && DATE_FIELDS[dbKey].includes(fieldIndex) ? formatDateValue(value) : (value==null?'':String(value));
        }
        /* أعمدة الجوال: إكسل يحذف الصفر من أول الرقم إذا كانت الخلية رقمية */
        const PHONE_FIELDS = { db_families:[5,6], db_children:[6], db_chronic:[6], db_injured:[4], db_orphans:[8] };
        function fixPhone(v) {
            const s = toLatin(String(v==null?'':v)).trim();
            return /^5\d{8}$/.test(s) ? '0'+s : s;
        }
        function normalizeImportedRow(dbKey,row,fieldCount) {
            return Array.from({length:fieldCount},(_,i)=>{
                let v = formatCellForDB(dbKey,i,row[i]);
                if (PHONE_FIELDS[dbKey] && PHONE_FIELDS[dbKey].includes(i)) v = fixPhone(v);
                return v;
            });
        }
        const CHRONIC_LABELS=['المريض','الهوية','الميلاد','الجنس','المرض','الدواء / ملاحظات','الجوال'];
        const INJ_LABELS=['اسم المصاب','الهوية','الميلاد','نوع ومكان الإصابة','الجوال','ملاحظات','بقاعدة الأسر؟'];
        const REQ_LABEL={db_edit_requests:'تعديل بيانات',db_children:'إضافة / تعديل طفل',db_chronic:'إضافة مريض مزمن',db_injured:'تسجيل إصابة',db_complaints:'شكوى / طلب'};
        const LOCKED_IDX=[0,1,2,39];
        const ST_LABEL={pending:'قيد المراجعة',accepted:'تمت الموافقة',rejected:'مرفوض',answered:'تم الرد'};
        const ST_COLOR={pending:'#d97706',accepted:'#16a34a',rejected:'#dc2626',answered:'#2563eb'};
        const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
        const localDateOf = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
        const dobNorm=s=>{s=toLatin(s).trim();let m=s.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4})/);if(m)return m[1].padStart(2,'0')+m[2].padStart(2,'0')+m[3];m=s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);return m?m[3].padStart(2,'0')+m[2].padStart(2,'0')+m[1]:'';};
        function ageOf(s){const n=dobNorm(s);if(!n)return '';const d=+n.slice(0,2),m=+n.slice(2,4),y=+n.slice(4,8),now=new Date();let mo=(now.getFullYear()-y)*12+(now.getMonth()+1-m);if(now.getDate()<d)mo--;if(mo<0)return '';return mo<24?mo+' شهر':Math.floor(mo/12)+' سنة';}
        function obj(k){return localDB[k]||{};}
        function waLink(phone,msg){let d=digitsOf(phone);if(!d)return '';if(d.startsWith('00'))d=d.slice(2);if(d.startsWith('0'))d='972'+d.slice(1);else if(d.length===9)d='972'+d;return 'https://wa.me/'+d+(msg?'?text='+encodeURIComponent(msg):'');}
        function openModal(html){document.getElementById('modalBox').innerHTML=html;document.getElementById('modalBg').classList.add('show');}
        function closeModal(){document.getElementById('modalBg').classList.remove('show');}
        function downloadJSON(o,name){const b=new Blob([JSON.stringify(o,null,1)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name+'.json';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);}
        function audit(action,detail){try{rdb.ref('db_audit').push({t:Date.now(),u:(auth.currentUser&&auth.currentUser.email)||'',a:action,d:String(detail||'').slice(0,300)});}catch(e){}}
        function logReq(rid,fid,ty,status,reason,title){
            if(!rid) return;
            const cur=obj('db_reqlog')[rid]||{fid:safeKey(digitsOf(fid)),ty:ty,d:today(),x:String(title||'').slice(0,80)};
            const e=Object.assign({},cur,{st:status,r:String(reason||'').slice(0,300),ud:today()});
            localDB.db_reqlog[rid]=e; rdb.ref('db_reqlog/'+rid).set(e).then(() => schedulePublish([fid])).catch(err => console.error('db_reqlog:', err));
        }
        function diffFam(oldRow,newRow){
            const nv=(i,v)=>{v=toLatin(v==null?'':v).trim();if(i>=14&&i<=25&&v==='')v='0';if([4,10,13].includes(i))v=formatDateValue(v);return v;};
            const out=[];
            for(let i=0;i<40;i++){const a=nv(i,oldRow[i]),b=nv(i,newRow[i]);if(a!==b)out.push({i:i,a:a,b:b,locked:LOCKED_IDX.includes(i)});}
            return out;
        }
        function childrenOf(key){return getDB('db_children').filter(c=>c&&(safeKey(digitsOf(c[5]))===key||safeKey(digitsOf(c[8]))===key));}
        const isChildEdit=(dbKey,p)=>dbKey==='db_children'&&p&&p[10]==='تعديل';
        function findChildIdx(p){
            const db=getDB('db_children'), oid=digitsOf(p[11]), on=String(p[12]||'').trim(), fk=safeKey(digitsOf(p[5]))||safeKey(digitsOf(p[8]));
            let i=oid?db.findIndex(r=>r&&digitsOf(r[1])===oid):-1;
            if(i<0&&on) i=db.findIndex(r=>r&&String(r[0]||'').trim()===on&&(safeKey(digitsOf(r[5]))===fk||safeKey(digitsOf(r[8]))===fk));
            return i;
        }
        function kvTable(labels,row){
            let h='<table><tbody>';
            labels.forEach((l,i)=>{const v=row[i];if(v===''||v==null)return;h+='<tr><td style="width:35%;background:#f1f5f9;font-weight:bold;">'+esc(l)+'</td><td>'+esc(v)+'</td></tr>';});
            return h+'</tbody></table>';
        }
        function miniTable(heads,rows,empty){
            if(!rows.length) return '<p style="color:#64748b;font-size:13px;">'+esc(empty||'لا يوجد')+'</p>';
            return '<table><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
        }

        /* ================= بطاقة الأسرة الكاملة (مرتبطة بالأطفال وباقي الكشوف) ================= */
        function familyHTML(fam){
            const key=safeKey(digitsOf(fam[2]));
            const kids=childrenOf(key);
            const aids=getDB('db_aids').filter(a=>a&&digitsOf(a[1])===key);
            const inj=getDB('db_injured').filter(i=>i&&digitsOf(i[1])===key);
            const chr=getDB('db_chronic').filter(c=>c&&digitsOf(c[1])===key);
            const orp=getDB('db_orphans').filter(o=>o&&(digitsOf(o[4])===key||digitsOf(o[7])===key));
            const logs=Object.values(obj('db_reqlog')).filter(l=>l&&l.fid===key).sort((a,b)=>String(b.d).localeCompare(String(a.d))).slice(0,10);
            let h=kvTable(FAM_LABELS,fam);
            h+='<h4>👶 الأطفال المسجلون ('+kids.length+')</h4>'+miniTable(['الاسم','الهوية','الميلاد','العمر','الجنس','ملاحظات'],kids.map(c=>[c[0],c[1],c[2],ageOf(c[2]),c[3],c[9]]),'لا يوجد أطفال مسجلون');
            h+='<h4>📦 المساعدات المستلمة ('+aids.length+')</h4>'+miniTable(['النوع','الكمية','ملاحظة'],aids.map(a=>[a[3],a[5],smartNote(a[4])]),'لا توجد مساعدات');
            h+='<h4>🛡️ أيتام / مصابون / أمراض مزمنة</h4>'+miniTable(['النوع','الاسم','تفاصيل'],orp.map(o=>['يتيم',o[0],'الوصي: '+(o[3]||'-')]).concat(inj.map(i=>['مصاب',i[0],i[3]])).concat(chr.map(c=>['مزمن',c[0],c[4]])),'لا يوجد');
            h+='<h4>🧾 آخر الطلبات</h4>'+miniTable(['النوع','التاريخ','الحالة','ملاحظة'],logs.map(l=>[REQ_LABEL[l.ty]||l.ty,l.d,ST_LABEL[l.st]||l.st,l.r||'']),'لا توجد طلبات');
            return h;
        }
        function showFamilyByKey(key){
            const fam=famByKey(key); if(!fam){alert('❌ لم يتم العثور على الأسرة في القاعدة.');return;}
            const wa=waLink(fam[5],'السلام عليكم '+fam[1]+'، معك إدارة مخيم جسر الحياة بخصوص: ');
            openModal('<h3>👤 '+esc(fam[1])+' <small style="color:#64748b;">('+esc(fam[2])+' - '+esc(fam[0])+')</small></h3>'+familyHTML(fam)
              +'<div class="btnrow"><button class="btn btn-blue" onclick="printFamily(\''+esc(key)+'\')">🖨 طباعة البطاقة</button>'
              +(wa?'<a class="btn btn-green" target="_blank" rel="noopener" href="'+esc(wa)+'">💬 واتساب</a>':'')
              +'<button class="btn btn-red" onclick="closeModal()">إغلاق</button></div>');
        }
        function printFamily(key){
            const fam=famByKey(key); if(!fam) return;
            const w=window.open('','_blank'); if(!w){alert('اسمح بالنوافذ المنبثقة للطباعة.');return;}
            w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>بطاقة أسرة</title><style>body{font-family:Tahoma,Arial,sans-serif;padding:24px;color:#0f172a}h1{text-align:center;margin:0;font-size:22px}h2{text-align:center;margin:4px 0 16px;font-size:14px;color:#475569;font-weight:normal}h4{margin:14px 0 6px}table{width:100%;border-collapse:collapse;margin-bottom:8px}td,th{border:1px solid #94a3b8;padding:6px;font-size:12px;text-align:right}th{background:#e2e8f0}@media print{body{padding:0}}</style></head><body><h1>⛺ مخيم جسر الحياة</h1><h2>بطاقة بيانات أسرة · '+esc(new Date().toLocaleDateString('en-GB'))+'</h2>'+familyHTML(fam)+'</body></html>');
            w.document.close(); setTimeout(()=>{try{w.focus();w.print();}catch(e){}},400);
            audit('طباعة بطاقة أسرة',fam[1]);
        }
        function renderSrActions(fam){
            const key=safeKey(digitsOf(fam[2])), wa=waLink(fam[5],'السلام عليكم '+fam[1]+'، معك إدارة مخيم جسر الحياة بخصوص: ');
            document.getElementById('srActions').innerHTML='<button class="btn btn-blue" style="margin:0;" onclick="showFamilyByKey(\''+esc(key)+'\')">👁 البطاقة الكاملة</button><button class="btn btn-blue" style="margin:0;background:#7c3aed;" onclick="printFamily(\''+esc(key)+'\')">🖨 طباعة</button>'+(wa?'<a class="btn btn-green" style="margin:0;text-decoration:none;" target="_blank" rel="noopener" href="'+esc(wa)+'">💬 واتساب</a>':'')+'<button class="btn btn-green" style="margin:0;background:#0d9488;" onclick="switchTab(\'quick\');document.getElementById(\'qSearch\').value=\''+esc(digitsOf(fam[2]))+'\';quickFind();">⚡ توزيع</button>';
        }

        /* ================= ربط الأطفال برب الأسرة ================= */
        function linkChildRow(row){
            const fid=safeKey(digitsOf(row[5])), mid=safeKey(digitsOf(row[8]));
            let fam=fid?famByKey(fid):null;
            if(!fam&&mid) fam=getDB('db_families').find(f=>f&&(safeKey(digitsOf(f[10]))===mid||safeKey(digitsOf(f[9]))===mid||safeKey(digitsOf(f[12]))===mid));
            if(fam){ if(!row[4])row[4]=fam[1]; if(!row[5])row[5]=fam[2]; if(!row[6])row[6]=fam[5]; return ''; }
            return '⚠️ لم يتم العثور على أسرة مرتبطة برقم هوية الأب/الأم المدخل، وسيبقى الطفل غير مرتبط برب أسرة.\nهل تريد الإضافة بدون ربط؟';
        }
        function attachChildLink(){
            const f=document.getElementById('c_6'); if(!f) return;
            const hint=document.createElement('div');hint.style.cssText='font-size:11px;margin-top:3px;';f.parentNode.appendChild(hint);
            f.addEventListener('input',()=>{
                const k=safeKey(digitsOf(f.value)); if(k.length<9){hint.textContent='';return;}
                const fam=famByKey(k);
                if(fam){hint.style.color='#047857';hint.textContent='✅ مرتبط بالأسرة: '+fam[1]+' ('+fam[0]+')';const n=document.getElementById('c_5'),p=document.getElementById('c_7');if(n&&!n.value)n.value=fam[1];if(p&&!p.value)p.value=fam[5]||'';}
                else{hint.style.color='#b45309';hint.textContent='⚠️ لا توجد أسرة بهذا الرقم في القاعدة';}
            });
        }

        /* ================= نسخ احتياطي وطباعة كشف توزيع ================= */
        async function backupAll(){
            if(isLimited){alert('⛔ غير مصرح.');return;}
            const o={}; Object.keys(localDB).forEach(k=>{if(['pwvault','claims','db_passwords','db_audit'].includes(k))return;o[k]=localDB[k];});
            try {
                o.db_audit = (await withTO(rdb.ref('db_audit').once('value'))).val() || {};
            } catch (error) {
                toast('تعذر قراءة سجل العمليات للنسخة الاحتياطية.', 'err');
                return false;
            }
            o._meta={exportedAt:new Date().toISOString(),by:(auth.currentUser&&auth.currentUser.email)||''};
            downloadJSON(o,'نسخة_احتياطية_aljalacamp_'+today()); audit('نسخة احتياطية كاملة',''); return true;
        }
        function printDistSheet(){
            loadTable('db_families','familiesTable',40); ADV.apply('familiesTable');
            const rows = filteredFamilyRows();
            if(!rows.length){alert('لا توجد أسر مطابقة للفلتر.');return;}
            const title=prompt('عنوان الكشف:','كشف توزيع مساعدات'); if(title===null) return;
            const w=window.open('','_blank'); if(!w){alert('اسمح بالنوافذ المنبثقة للطباعة.');return;}
            const body=rows.map((f,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(f[1])+'</td><td>'+esc(f[2])+'</td><td>'+esc(f[0])+'</td><td>'+esc(f[26])+'</td><td>'+esc(f[5])+'</td><td></td><td></td></tr>').join('');
            w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>'+esc(title)+'</title><style>body{font-family:Tahoma,Arial,sans-serif;padding:18px}h1{text-align:center;margin:0;font-size:20px}h2{text-align:center;margin:4px 0 4px;font-size:15px}p{text-align:center;color:#475569;font-size:12px;margin:0 0 12px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #475569;padding:7px;font-size:12px;text-align:right}th{background:#e2e8f0}tr{page-break-inside:avoid}td:last-child{width:110px}td:nth-last-child(2){width:90px}.sig{display:flex;justify-content:space-around;margin-top:40px;font-size:13px}</style></head><body><h1>⛺ مخيم جسر الحياة</h1><h2>'+esc(title)+'</h2><p>التاريخ: '+esc(new Date().toLocaleDateString('en-GB'))+' · عدد الأسر: '+rows.length+'</p><table><thead><tr><th>م</th><th>الاسم</th><th>الهوية</th><th>القاطع</th><th>الأفراد</th><th>الجوال</th><th>الكمية/النوع</th><th>التوقيع / البصمة</th></tr></thead><tbody>'+body+'</tbody></table><div class="sig"><div>الموزّع: ................</div><div>المراجع: ................</div><div>المدير: ................</div></div></body></html>');
            w.document.close(); setTimeout(()=>{try{w.focus();w.print();}catch(e){}},400);
            audit('طباعة كشف توزيع',title+' | '+rows.length+' أسرة');
        }

        /* ================= لوحة المؤشرات ================= */
        function barRows(entries,color){
            const max=Math.max.apply(null,entries.map(e=>e[1]).concat([1]));
            return entries.map(e=>'<div class="bar-row"><span class="lbl" title="'+esc(e[0])+'">'+esc(e[0])+'</span><span class="bar"><i style="width:'+Math.round(e[1]/max*100)+'%;'+(color?'background:'+color:'')+'"></i></span><span class="num">'+esc(e[2]!=null?e[2]:e[1])+'</span></div>').join('')||'<p style="color:#64748b;font-size:12px;">لا توجد بيانات</p>';
        }
        function countBy(arr,fn){const m={};arr.forEach(x=>{let k=String(fn(x)||'').trim()||'غير محدد';m[k]=(m[k]||0)+1;});return Object.entries(m).sort((a,b)=>b[1]-a[1]);}
        function pendingTotal(){
            return getDB('db_edit_requests').length+getDB('db_complaints').filter(c=>c&&!c[7]).length+Object.keys(obj('db_children_reqs')).length+Object.keys(obj('db_chronic_reqs')).length+Object.keys(obj('db_injured_reqs')).length;
        }
        function loadDashboard(){
            const fams=getDB('db_families').filter(Boolean), num=v=>parseInt(toLatin(v),10)||0;
            const members=fams.reduce((s,f)=>s+num(f[26]),0);
            const famIds=new Set(fams.map(f=>safeKey(digitsOf(f[2]))));
            const covered=new Set(); getDB('db_aids').forEach(a=>{if(a){const k=safeKey(digitsOf(a[1]));if(famIds.has(k))covered.add(k);}});
            const claimed=new Set(Object.values(obj('claims')).map(c=>c&&safeKey(String(c.id))));
            let activated=0; famIds.forEach(k=>{if(claimed.has(k)||obj('pwvault')[k])activated++;});
            const cards=[['أسر مسجلة',fams.length],['إجمالي الأفراد',members],['أطفال مسجلون (كشف)',getDB('db_children').length],['أيتام',getDB('db_orphans').length],['مصابون',getDB('db_injured').length],['أمراض مزمنة',getDB('db_chronic').length],['أسر استلمت مساعدة',covered.size],['أسر بلا أي مساعدة',fams.length-covered.size],['حسابات مفعّلة',activated],['طلبات معلّقة',pendingTotal()]];
            let h='<div class="stat-grid">'+cards.map(c=>'<div class="stat">'+esc(c[0])+'<b>'+esc(c[1])+'</b></div>').join('')+'</div>';
            if(!isLimited){
                let tin=0,tout=0; getDB('db_fund').forEach(r=>{if(!r)return;const a=parseFloat(String(r[2]).replace(/[^\d.-]/g,''))||0;if(String(r[1]).includes('وارد'))tin+=a;else if(String(r[1]).includes('صادر'))tout+=a;});
                h+='<div class="stat-grid"><div class="stat" style="border-top-color:#10b981">الوارد<b>'+tin+' ₪</b></div><div class="stat" style="border-top-color:#ef4444">الصادر<b>'+tout+' ₪</b></div><div class="stat">الرصيد<b>'+(tin-tout)+' ₪</b></div></div>';
            }
            const sec={}; fams.forEach(f=>{const k=String(f[0]||'').trim()||'غير محدد';sec[k]=sec[k]||{f:0,m:0};sec[k].f++;sec[k].m+=num(f[26]);});
            const secE=Object.entries(sec).sort((a,b)=>b[1].f-a[1].f).map(e=>[e[0],e[1].f,e[1].f+' أسرة / '+e[1].m+' فرد']);
            const groups=[['يوم - سنتين',14,15],['3 - 6',16,17],['7 - 12',18,19],['13 - 17',20,21],['18 - 60',22,23],['فوق 60',24,25]];
            const sum=i=>fams.reduce((s,f)=>s+num(f[i]),0);
            const ageM=groups.map(g=>[g[0]+' ذكور',sum(g[1])]), ageF=groups.map(g=>[g[0]+' إناث',sum(g[2])]);
            h+='<div class="two-col"><div class="card"><h3 class="card-title">🏘️ الأسر حسب القاطع</h3>'+barRows(secE)+'</div>'
              +'<div class="card"><h3 class="card-title">🎂 الفئات العمرية</h3>'+barRows(ageM,'#2563eb')+barRows(ageF,'#db2777')+'</div>'
              +'<div class="card"><h3 class="card-title">⛺ نوع المسكن</h3>'+barRows(countBy(fams,f=>f[31]),'#0d9488')+'</div>'
              +'<div class="card"><h3 class="card-title">📌 الحالة</h3>'+barRows(countBy(fams,f=>f[32]),'#7c3aed')+'</div>'
              +'<div class="card"><h3 class="card-title">💼 المهنة</h3>'+barRows(countBy(fams,f=>f[33]),'#b45309')+'</div>'
              +'<div class="card"><h3 class="card-title">📦 أكثر أنواع المساعدات</h3>'+barRows(countBy(getDB('db_aids').filter(Boolean),a=>a[3]).slice(0,8),'#059669')+'</div></div>';
            if(!isLimited) h+='<div class="card"><button class="btn btn-blue" style="margin:0;" onclick="backupAll()">💾 تنزيل نسخة احتياطية كاملة (JSON)</button></div>';
            document.getElementById('dashContent').innerHTML=h;
            document.getElementById('dashStamp').textContent='آخر تحديث: '+new Date().toLocaleString('en-GB');
        }

        /* ================= التوزيع السريع ================= */
        let _qLog=[], _lastQType='';
        
        // دوال التوزيع الذكي
        function generateSmartList() {
            const aidType = document.getElementById('smartAidType').value.trim().toLowerCase();
            const targetCount = parseInt(document.getElementById('smartTargetCount').value) || 0;
            const resultDiv = document.getElementById('smartDistResult');
            
            if(!aidType || targetCount < 1) { 
                alert('الرجاء إدخال نوع المساعدة والعدد المطلوب.'); 
                return; 
            }

            const families = getDB('db_families').filter(f => f && f[2]);
            const aids = getDB('db_aids').filter(Boolean);

            // 1. تحديد هويات العائلات التي استلمت هذا النوع مسبقاً
            const receivedIds = new Set();
            aids.forEach(a => {
                if(a[1] && a[3] && String(a[3]).toLowerCase().includes(aidType)) {
                    receivedIds.add(digitsOf(a[1]));
                }
            });

            // 2. تصفية العائلات التي لم تستلم
            let eligible = families.filter(f => !receivedIds.has(digitsOf(f[2])));

            // 3. ترتيب العائلات حسب عدد الأفراد (تنازلياً)
            eligible.sort((a, b) => {
                const memA = parseInt(toLatin(a[26])) || 0;
                const memB = parseInt(toLatin(b[26])) || 0;
                return memB - memA;
            });

            // 4. أخذ العدد المطلوب من رأس القائمة
            const selected = eligible.slice(0, targetCount);

            if(selected.length === 0) {
                resultDiv.innerHTML = '<p class="warn">❌ لا توجد عائلات مستحقة (إما أن الجميع استلم هذه المساعدة، أو لا توجد عائلات مسجلة).</p>';
                return;
            }

            // 5. بناء الكشف وعرضه
            let html = `<h4 style="color:#0f766e; margin-bottom:10px;">تم العثور على ${selected.length} أسرة مستحقة (لم تستلم '${esc(aidType)}')</h4>`;
            html += '<div class="table-responsive"><table style="width:100%;"><thead><tr><th>م</th><th>الاسم</th><th>الهوية</th><th>القاطع</th><th>عدد الأفراد</th><th>الجوال</th></tr></thead><tbody>';
            
            selected.forEach((f, index) => {
                html += `<tr><td>${index + 1}</td><td>${esc(f[1])}</td><td>${esc(f[2])}</td><td>${esc(f[0])}</td><td style="font-weight:bold;">${esc(f[26])}</td><td>${esc(f[5])}</td></tr>`;
            });
            html += '</tbody></table></div>';
            html += `<button class="btn btn-green" style="margin-top:10px;" onclick="printSmartList()">🖨 طباعة هذا الكشف</button>`;
            
            resultDiv.innerHTML = html;
        }

        function printSmartList() {
            const tableHTML = document.querySelector('#smartDistResult .table-responsive').innerHTML;
            const aidType = document.getElementById('smartAidType').value;
            const w = window.open('', '_blank');
            if(!w) { alert('الرجاء السماح بالنوافذ المنبثقة للطباعة.'); return; }
            w.document.write(`
                <html dir="rtl">
                <head>
                    <title>كشف توزيع ذكي</title>
                    <style>
                        body { font-family: Tahoma, sans-serif; padding: 20px; text-align: right; }
                        h2, h3 { text-align: center; }
                        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                        th, td { border: 1px solid #000; padding: 8px; text-align: right; font-size: 14px; }
                        th { background-color: #f1f5f9; }
                    </style>
                </head>
                <body>
                    <h2>⛺ مخيم جسر الحياة</h2>
                    <h3>كشف توزيع ذكي: ${esc(aidType)} (أسر لم تستلم سابقاً)</h3>
                    <p style="text-align:center;">التاريخ: ${new Date().toLocaleDateString('en-GB')}</p>
                    ${tableHTML}
                </body>
                </html>
            `);
            w.document.close();
            setTimeout(() => { w.focus(); w.print(); }, 500);
        }

        function loadQuick(){
            const types=new Set(); getDB('db_aids').forEach(a=>{if(a&&a[3])types.add(String(a[3]).trim());});
            document.getElementById('qTypes').innerHTML=[...types].sort().map(v=>'<option value="'+esc(v)+'">').join('');
            document.getElementById('qLog').innerHTML=_qLog.length?_qLog.map(x=>'<div>'+esc(x)+'</div>').join(''):'لا توجد تسجيلات بعد.';
        }
        function quickFind(){
            const q=toLatin(document.getElementById('qSearch').value||'').trim().toLowerCase(); if(!q) return;
            const fams=getDB('db_families'), dq=digitsOf(q), box=document.getElementById('qResult');
            let hits=[]; if(dq.length>=5) hits=fams.filter(f=>f&&digitsOf(f[2])===dq);
            if(!hits.length) hits=famSearch(q).map(x=>x.f);
            if(!hits.length){box.innerHTML='<p class="warn">❌ لا توجد أسرة مطابقة.</p>';return;}
            if(hits.length>1){box.innerHTML='<p>تم العثور على '+hits.length+' نتيجة، اختر الأسرة:</p>'+hits.slice(0,40).map(f=>'<button class="btn btn-blue" style="margin:3px;" onclick="quickShow(\''+esc(safeKey(digitsOf(f[2])))+'\')">'+esc(f[1])+' ('+esc(f[2])+')</button>').join('');return;}
            quickShow(safeKey(digitsOf(hits[0][2])));
        }
        function quickShow(key){
            const f=famByKey(key), box=document.getElementById('qResult'); if(!f){box.innerHTML='<p class="warn">❌ غير موجودة.</p>';return;}
            const aids=getDB('db_aids').filter(a=>a&&digitsOf(a[1])===key), kids=childrenOf(key);
            box.innerHTML='<div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:14px;">'
              +'<div style="font-size:17px;font-weight:bold;">'+esc(f[1])+'</div>'
              +'<div style="font-size:13px;color:#334155;margin-top:4px;">الهوية: '+esc(f[2])+' · القاطع: '+esc(f[0])+' · الأفراد: '+esc(f[26])+' · الجوال: '+esc(f[5])+' · أطفال مسجلون: '+kids.length+'</div></div>'
              +'<h4 style="margin:12px 0 6px;color:#0f766e;">آخر المساعدات ('+aids.length+')</h4>'+miniTable(['النوع','الكمية','ملاحظة'],aids.slice(-5).reverse().map(a=>[a[3],a[5],a[4]]),'لم تستلم أي مساعدة بعد')
              +'<div class="form-grid" style="margin-top:12px;"><div class="input-group"><label>نوع المساعدة</label><input type="text" id="qType" list="qTypes" value="'+esc(_lastQType)+'" onkeydown="if(event.key===\'Enter\')quickRecord(\''+esc(key)+'\')"></div>'
              +'<div class="input-group"><label>الكمية</label><input type="text" id="qQty" value="1"></div>'
              +'<div class="input-group"><label>ملاحظة (اختياري)</label><input type="text" id="qNote"></div></div>'
              +'<button class="btn btn-green" onclick="quickRecord(\''+esc(key)+'\')">✅ تسجيل الاستلام</button>';
            setTimeout(()=>{const e=document.getElementById('qType');if(e)e.focus();},50);
        }
        function quickRecord(key){
            const f=famByKey(key); if(!f) return;
            const type=document.getElementById('qType').value.trim(), qty=document.getElementById('qQty').value.trim()||'1', note=document.getElementById('qNote').value.trim();
            if(!type){alert('اكتب نوع المساعدة.');return;}
            const prev=getDB('db_aids').filter(a=>a&&digitsOf(a[1])===key&&String(a[3]).trim().toLowerCase()===type.toLowerCase());
            if(prev.length&&!confirm('⚠️ هذه الأسرة استلمت «'+type+'» سابقاً ('+prev.length+' مرة).\nهل تريد تسجيل استلام جديد؟')) return;
            const row=[f[1],f[2],f[0],type,('['+today()+'] '+note).trim(),qty];
            appendDBRecord('db_aids',row,safeKey(digitsOf(f[2]))).then(()=>{
                audit('تسجيل استلام',f[1]+' | '+type+' | '+qty);
                _lastQType=type; _qLog.unshift(new Date().toLocaleTimeString('en-GB')+' — '+f[1]+' — '+type+' ('+qty+')');
                loadQuick(); document.getElementById('qResult').innerHTML='<p style="color:#047857;font-weight:bold;">✅ تم تسجيل الاستلام للأسرة: '+esc(f[1])+'</p>';
                document.getElementById('qSearch').value=''; document.getElementById('qSearch').focus();
            }).catch(err=>alert('❌ تعذر تسجيل الاستلام: '+(err.message||err)));
        }

        /* ================= الإعلانات ================= */
        function loadAnn(){
            const set=new Set(); getDB('db_families').forEach(f=>{if(f&&f[0])set.add(String(f[0]).trim());});
            const sel=document.getElementById('ann_sec'), cur=sel.value;
            sel.innerHTML='<option value="all">كل القواطع</option>'+[...set].sort().map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join(''); sel.value=cur||'all';
            const tb=document.querySelector('#annTable tbody'); tb.innerHTML=''; const ents=Object.entries(obj('db_announcements')).sort((a,b)=>(b[1].t||0)-(a[1].t||0));
            ents.forEach((e,i)=>{const a=e[1];tb.innerHTML+='<tr><td>'+(i+1)+'</td><td><strong>'+esc(a.ti)+'</strong></td><td style="white-space:normal;min-width:240px;">'+esc(a.tx)+'</td><td>'+esc(a.sec==='all'?'الكل':a.sec)+'</td><td>'+esc(a.exp||'-')+'</td><td><button class="btn btn-red" style="margin:0;padding:4px 8px;font-size:11px;" onclick="delAnn(\''+esc(e[0])+'\')">حذف</button></td></tr>';});
            if(!ents.length) tb.innerHTML='<tr><td colspan="6" style="text-align:center;">لا توجد إعلانات.</td></tr>';
        }
        function addAnn(e){
            e.preventDefault();
            const ref=rdb.ref('db_announcements').push();
            const o={ti:document.getElementById('ann_ti').value.trim(),tx:document.getElementById('ann_tx').value.trim(),sec:document.getElementById('ann_sec').value,exp:document.getElementById('ann_exp').value||'',t:Date.now(),by:(auth.currentUser&&auth.currentUser.email)||''};
            localDB.db_announcements=Object.assign({},obj('db_announcements'),{[ref.key]:o});
            ref.set(o).then(()=>{schedulePublish();audit('نشر إعلان',o.ti);e.target.reset();loadAnn();toast('✅ تم نشر الإعلان وسيظهر للعائلات خلال لحظات.');}).catch(err=>alert('❌ تعذر النشر: '+err.message));
        }
        function delAnn(id){
            if(!confirm('حذف هذا الإعلان؟')) return;
            const a=obj('db_announcements')[id]; delete localDB.db_announcements[id];
            rdb.ref('db_announcements/'+id).remove().then(()=>{schedulePublish();audit('حذف إعلان',a&&a.ti);loadAnn();});
        }

        /* ================= فحص الجودة ================= */
        function loadQuality(){
            const fams=getDB('db_families').filter(Boolean), num=v=>parseInt(toLatin(v),10)||0;
            const byId={}; fams.forEach(f=>{const k=digitsOf(f[2]);(byId[k]=byId[k]||[]).push(f);});
            const famKeys=new Set(Object.keys(byId));
            const checks=[];
            const dup=[]; Object.keys(byId).forEach(k=>{if(k&&byId[k].length>1)byId[k].forEach(f=>dup.push([f[1],f[2],f[0]]));});
            checks.push(['🔁 هويات أسر مكررة',['الاسم','الهوية','القاطع'],dup,true]);
            checks.push(['🆔 رقم هوية ليس 9 أرقام',['الاسم','الهوية','القاطع'],fams.filter(f=>digitsOf(f[2]).length!==9).map(f=>[f[1],f[2],f[0]]),true]);
            const okPhone=v=>{const d=digitsOf(v);const n=d.slice(-9);return d.length>=9&&d.length<=14&&n[0]==='5';};
            checks.push(['📵 جوال ناقص أو غير صحيح',['الاسم','الهوية','الجوال'],fams.filter(f=>!okPhone(f[5])).map(f=>[f[1],f[2],f[5]||'(فارغ)']),true]);
            const mism=[]; fams.forEach(f=>{let s=0;for(let i=14;i<=25;i++)s+=num(f[i]);const m=num(f[26]);if(m<1||(s>0&&s!==m))mism.push([f[1],f[2],'المجموع حسب الفئات: '+s,'العدد الكلي: '+(f[26]||'(فارغ)')]);});
            checks.push(['🧮 العدد الكلي لا يطابق مجموع الفئات العمرية',['الاسم','الهوية','الفئات','الكلي'],mism,true]);
            const nokids=getDB('db_children').filter(c=>c&&!famKeys.has(digitsOf(c[5]))&&!famKeys.has(digitsOf(c[8]))).map(c=>[c[0],c[1],c[4],c[5]]);
            checks.push(['👶 أطفال غير مرتبطين بأي أسرة',['الطفل','هوية الطفل','الأب','هوية الأب'],nokids,false]);
            const cid={}; getDB('db_children').forEach(c=>{const k=digitsOf(c&&c[1]);if(k)(cid[k]=cid[k]||[]).push(c);});
            const cdup=[]; Object.keys(cid).forEach(k=>{if(cid[k].length>1)cid[k].forEach(c=>cdup.push([c[0],c[1],c[4]]));});
            checks.push(['🔁 أطفال بهوية مكررة',['الطفل','الهوية','الأب'],cdup,false]);
            checks.push(['📦 مساعدات لهوية غير موجودة في قاعدة الأسر',['الاسم','الهوية','النوع'],getDB('db_aids').filter(a=>a&&!famKeys.has(digitsOf(a[1]))).map(a=>[a[0],a[1],a[3]]),false]);
            let h='<div class="stat-grid">'+checks.map(c=>'<div class="stat" style="border-top-color:'+(c[2].length?'#ef4444':'#10b981')+'">'+esc(c[0])+'<b>'+c[2].length+'</b></div>').join('')+'</div>';
            checks.forEach(c=>{
                if(!c[2].length) return;
                h+='<div class="card" style="border-top-color:#ef4444;"><h3 class="card-title">'+esc(c[0])+' ('+c[2].length+')</h3><div class="table-responsive">'
                  +'<table><thead><tr>'+c[1].map(x=>'<th>'+esc(x)+'</th>').join('')+(c[3]?'<th>عرض</th>':'')+'</tr></thead><tbody>'
                  +c[2].slice(0,100).map(r=>'<tr>'+r.map(x=>'<td>'+esc(x)+'</td>').join('')+(c[3]?'<td><button class="btn btn-blue" style="margin:0;padding:3px 8px;font-size:11px;" onclick="showFamilyByKey(\''+esc(safeKey(digitsOf(r[1])))+'\')">👁</button></td>':'')+'</tr>').join('')
                  +'</tbody></table></div>'+(c[2].length>100?'<p style="font-size:12px;color:#64748b;">يعرض أول 100 فقط.</p>':'')+'</div>';
            });
            if(checks.every(c=>!c[2].length)) h+='<div class="card" style="border-top-color:#10b981;"><h3>✅ لم يتم العثور على مشاكل في البيانات.</h3></div>';
            document.getElementById('qualContent').innerHTML=h;
        }

        /* ================= سجل العمليات ================= */
        let auditLoading = false;
        let auditLoaded = false;
        let auditQuery = null;
        function stopRecentAudit() {
            if (auditQuery) auditQuery.off('value');
            auditQuery = null; auditLoading = false; auditLoaded = false;
        }
        function watchRecentAudit() {
            if (auditLoading || auditLoaded) return;
            auditLoading = true;
            auditQuery = rdb.ref('db_audit').orderByKey().limitToLast(300);
            auditQuery.on('value', snapshot => {
                localDB.db_audit = snapshot.val() || {};
                auditLoaded = true;
                auditLoading = false;
                refreshActive('db_audit');
            }, () => {
                auditLoading = false;
                auditLoaded = false;
                toast('تعذر تحميل سجل العمليات.', 'err');
            });
        }
        function auditRows(){
            const q=(document.getElementById('auditSearch').value||'').trim().toLowerCase();
            return Object.values(obj('db_audit')).filter(Boolean).sort((a,b)=>(b.t||0)-(a.t||0)).filter(r=>!q||[r.u,r.a,r.d].join(' ').toLowerCase().includes(q)).slice(0,300);
        }
        function loadAudit(){
            const tb=document.querySelector('#auditTable tbody');
            tb.innerHTML=auditRows().map(r=>'<tr><td style="direction:ltr;">'+esc(new Date(r.t).toLocaleString('en-GB'))+'</td><td>'+esc(r.u)+'</td><td>'+esc(r.a)+'</td><td style="white-space:normal;">'+esc(r.d)+'</td></tr>').join('')||'<tr><td colspan="4" style="text-align:center;">لا توجد عمليات.</td></tr>';
        }
        async function exportAudit(){
            if (!auditLoaded) { toast('انتظر تحميل سجل العمليات.', 'warn'); return; }
            if (!await loadExcel()) return;
            const rows=[['الوقت','المستخدم','العملية','التفاصيل']].concat(auditRows().map(r=>[new Date(r.t).toLocaleString('en-GB'),r.u,r.a,r.d]));
            const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Audit');XLSX.writeFile(wb,'سجل_العمليات.xlsx');
        }


        document.getElementById('adminLoginForm').addEventListener('submit', e => {
            e.preventDefault();
            const btn = document.getElementById('admLoginBtn'), err = document.getElementById('loginError');
            err.classList.remove('show'); btn.classList.add('is-loading');
            btn.disabled = true;
            authReady.then(() => auth.signInWithEmailAndPassword(document.getElementById('admEmail').value.trim(), document.getElementById('admPass').value))
                .catch(ex => {
                    const c = (ex && ex.code) || '';
                    err.textContent = c === 'auth/network-request-failed' ? 'تعذر الاتصال بالإنترنت. تحقق من الشبكة ثم حاول مجدداً.'
                        : c === 'auth/too-many-requests' ? 'محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.'
                        : 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
                    err.classList.remove('show'); void err.offsetWidth; err.classList.add('show');
                })
                .finally(() => { btn.classList.remove('is-loading'); btn.disabled = false; });
        });

        authReady.then(() => auth.onAuthStateChanged(u => {
            if (!u) {
                document.getElementById('loginOverlay').style.display = 'flex';
                synced = false;
                return;
            }
            // لا نخفي شاشة الدخول قبل التأكد من أن الحساب مسؤول فعلاً.
            startSync();
        })).catch(() => showCampStartupError());

        let idleT, idleW; function resetIdle(){ clearTimeout(idleT); clearTimeout(idleW); idleW=setTimeout(()=>toast('ستنتهي الجلسة خلال دقيقة لعدم النشاط. المس الشاشة أو حرّك الماوس للاستمرار.','warn',9000),14*60*1000); idleT=setTimeout(()=>auth.signOut().then(()=>location.reload()),15*60*1000); }
        ['click','keydown','mousemove','touchstart','pointerdown'].forEach(ev=>document.addEventListener(ev,resetIdle,{passive:true})); resetIdle();

        // تحميل البيانات حسب الدور. الـ limited_admin لا يقرأ الجذر / لأن الـ Rules تمنعه.
        function startSync() {
            if (synced) return;
            const uid = auth.currentUser && auth.currentUser.uid;
            if (!uid) return;

            withTO(rdb.ref('admins/' + uid).once('value')).then(snapshot => {
                const role = snapshot.val();
                if (role !== 'super_admin' && role !== 'limited_admin') {
                    throw new Error('هذا الحساب غير مسجل كمسؤول في admins/' + uid);
                }

                ROLE = role;
                isLimited = (role === 'limited_admin');
                synced = true;
                document.getElementById('dashboard-tab').classList.add('active-tab');
                document.getElementById('dashContent').textContent = 'جارٍ تحميل الكشوفات…';
                document.querySelector('.content').inert = true;
                document.getElementById('loginOverlay').style.display = 'none';
                const _sl = document.getElementById('syncLoader'); if (_sl) _sl.style.display = 'block';
                document.getElementById('whoami').textContent = (auth.currentUser.email || '') + ' · ' + (isLimited ? 'مشرف محدود' : 'مدير');
                audit('تسجيل دخول', isLimited ? 'مشرف محدود' : 'مدير');

                if (isLimited) {
                    const passNav = document.getElementById('nav-passwords');
                    const fundNav = document.getElementById('nav-fund');
                    const subNav = document.getElementById('nav-subscribers');
                    if (passNav) passNav.style.display = 'none';
                    if (fundNav) fundNav.style.display = 'none';
                    if (subNav) subNav.style.display = 'none';
                    ['nav-audit','nav-ann','nav-stock'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
                }

                const li = document.createElement('li');
                li.textContent = '🚪 تسجيل الخروج';
                li.style.color = '#fca5a5';
                li.onclick = () => auth.signOut().then(() => location.reload());
                document.getElementById('sidebarMenu').appendChild(li);
                if (!isLimited) {
                    const sy = document.createElement('li'); sy.textContent = '🔄 مزامنة بوابة العائلات'; sy.title = 'إعادة نشر بيانات كل الأسر إلى بوابة العائلات';
                    sy.onclick = () => { toast('جارٍ مزامنة البوابة...', 'warn', 2000); publishPortal().then(() => toast('تمت مزامنة بيانات البوابة لكل الأسر')).catch(err => toast('❌ تعذرت المزامنة: ' + (err.message || err), 'err')); };
                    document.getElementById('sidebarMenu').insertBefore(sy, li);
                }
                enhanceNav();

                // قراءة كل فرع على حدة (بدل قراءة الجذر كاملاً): يمنع تنزيل نسخة "portal" المكررة
                // ويقلل الاستهلاك ويمنع إعادة الرسم عند كل نشر للبوابة.
                const allowed = isLimited ? [
                    'db_families','db_aids','db_injured','db_orphans','db_children',
                    'db_chronic','db_complaints','db_edit_requests','db_children_reqs',
                    'db_chronic_reqs','db_injured_reqs','db_reqlog','db_announcements','config','inbox'
                ] : Object.keys(localDB).filter(key => key !== 'db_audit').concat(['inbox']);
                const __adminSyncStart = performance.now();
                const pending = new Set(allowed);
                const slowNotice = setTimeout(() => {
                    if (pending.size) toast('تحميل الكشوفات يستغرق وقتاً. تحقق من اتصالك وأعد تحميل الصفحة إذا استمر التأخير.', 'warn');
                }, 15000);
                allowed.forEach(key => {
                    rdb.ref(key).on('value', snap => {
                        const val = snap.val();
                        if (key === 'inbox') {
                            localDB.inbox = val || {};
                            if (val && !pending.size) ingestInbox(val);
                        } else if (OBJ_KEYS.includes(key) || key.endsWith('_reqs')) {
                            localDB[key] = val || {};
                        } else {
                            localDB[key] = toRows(val);
                        }
                        if (pending.size) {
                            if (key === 'db_families') renderInitialFamilyCount();
                            pending.delete(key);
                            if (!pending.size) { clearTimeout(slowNotice); finishInitialSync(__adminSyncStart); }
                            return;
                        }
                        if (key !== 'inbox') refreshActive(key);
                        queueBadgeUpdate();
                    }, handleSyncError);
                });
            }).catch(err => {
                console.error('Admin authorization error:', err);
                alert('⛔ لا يمكن دخول لوحة الإدارة: ' + (err.message || 'الحساب غير مصرح به'));
                auth.signOut().then(() => location.reload());
            });

            function finishInitialSync(syncStartedAt) {
                console.info('[TEST PERFORMANCE] Admin initial data sync: ' + Math.round(performance.now() - syncStartedAt) + ' ms');
                isFirstLoad = false;
                document.querySelector('.content').inert = false;
                hideLoader();
                switchTab(adminRoute() || 'dashboard', false, true);
                if (localDB.inbox) ingestInbox(localDB.inbox);
            }

            function handleSyncError(error) {
                console.error('Realtime Database sync error:', error);
                alert('⛔ تم تسجيل الدخول لكن رفضت قاعدة البيانات الوصول: ' + (error && error.message ? error.message : 'PERMISSION_DENIED'));
                auth.signOut().then(() => location.reload());
            }
        }

        function renderInitialFamilyCount() {
            const host = document.getElementById('dashContent');
            const table = document.getElementById('dashboard-tab');
            if (!host || !table.classList.contains('active-tab')) return;
            const count = getDB('db_families').filter(Boolean).length;
            host.textContent = 'الأسر المسجلة: ' + count + ' · جارٍ تحميل بقية الكشوفات…';
        }

        let badgeFrame;
        function queueBadgeUpdate() {
            if (badgeFrame) return;
            badgeFrame = requestAnimationFrame(() => {
                badgeFrame = null;
                updateBadgeCount();
            });
        }

        function updateBadgeCount() {
            let reqs = getDB('db_edit_requests').length;
            let comps = getDB('db_complaints').filter(c => c && !c[7]).length;
            let cReqs = Object.keys(localDB['db_children_reqs'] || {}).length;
            let chReqs = Object.keys(localDB['db_chronic_reqs'] || {}).length;
            let iReqs = Object.keys(localDB['db_injured_reqs'] || {}).length;
            let total = reqs + comps + cReqs + chReqs + iReqs;
            let badge = document.getElementById('reqBadge');
            if (badge) {
                if (total > 0) { badge.style.display = 'inline-block'; badge.innerText = total; } 
                else { badge.style.display = 'none'; }
            }
        }

        const _inboxProcessing = new Set();
        async function ingestInbox(inbox) {
            const ok = ['db_edit_requests','db_complaints','db_children','db_chronic','db_injured'];
            for (const fid of Object.keys(inbox || {})) for (const k of Object.keys(inbox[fid] || {})) {
                const pathKey = fid + '/' + k;
                if (_inboxProcessing.has(pathKey)) continue;
                const original = inbox[fid][k];
                if (!original) continue;
                _inboxProcessing.add(pathKey);
                try {
                    // Claim the inbox item atomically. If another admin claimed it first,
                    // this transaction does not commit and we skip it.
                    const ref = rdb.ref('inbox/' + fid + '/' + k);
                    const tx = await ref.transaction(current => current ? null : undefined);
                    if (!tx.committed) continue;
                    const it = original;
                    if (!ok.includes(it.type) || it.payload == null) continue;
                    const rid = fid + '_' + k;
                    let title = '';
                    if (['db_children','db_chronic','db_injured'].includes(it.type)) {
                        await rdb.ref(it.type + '_reqs/' + rid).set({id: fid, payload: it.payload, date: it.date || ''});
                        if (!localDB[it.type + '_reqs']) localDB[it.type + '_reqs'] = {};
                        localDB[it.type + '_reqs'][rid] = {id: fid, payload: it.payload, date: it.date || ''};
                        title = (it.type === 'db_children' && it.payload[10] === 'تعديل' ? 'تعديل بيانات طفل: ' : '') + String(it.payload[0] || '');
                    } else if (it.type === 'db_edit_requests') {
                        const payload = Object.assign({}, it.payload, {rid});
                        await rdb.ref('db_edit_requests').transaction(cur => {
                            const arr = Array.isArray(cur) ? cur.slice() : (cur ? Object.values(cur) : []);
                            if (!arr.some(x => x && x.rid === rid)) arr.push(payload); return arr;
                        });
                        const arr = getDB('db_edit_requests');
                        localDB.db_edit_requests = (Array.isArray(arr) ? arr.slice() : Object.values(arr)).concat([payload]);
                        title = 'تعديل بيانات الأسرة';
                    } else {
                        const p = Array.isArray(it.payload) ? it.payload.slice() : Object.values(it.payload);
                        while (p.length < 8) p.push('');
                        p[6] = rid;
                        await rdb.ref('db_complaints').transaction(cur => {
                            const arr = Array.isArray(cur) ? cur.slice() : (cur ? Object.values(cur) : []);
                            if (!arr.some(x => Array.isArray(x) && x[6] === rid)) arr.push(p); return arr;
                        });
                        const arr = getDB('db_complaints');
                        localDB.db_complaints = (Array.isArray(arr) ? arr.slice() : Object.values(arr)).concat([p]);
                        title = String(p[4] || '');
                    }
                    const entry = {fid: safeKey(digitsOf(fid)), ty: it.type, d: localDateOf(it.date) || today(), st: 'pending', r: '', x: title.slice(0, 80)};
                    await rdb.ref('db_reqlog/' + rid).set(entry);
                    localDB.db_reqlog[rid] = entry;
                    audit('استلام طلب', title || rid);
                } catch (err) {
                    console.error('ingestInbox item:', pathKey, err);
                    // فشل أثناء المعالجة بعد حجز الطلب: نعيده لصندوق الوارد حتى لا يضيع، وستُعاد معالجته لاحقاً
                    try { await rdb.ref('inbox/' + fid + '/' + k).set(original); } catch (e2) { console.error('inbox restore failed', e2); }
                } finally {
                    _inboxProcessing.delete(pathKey);
                }
            }
            updateBadgeCount();
            schedulePublish();
        }

        let _pt, _pendingPortalKeys = new Set(), _publishAll = false; function schedulePublish(keys){
            if (Array.isArray(keys) && keys.length) {
                keys.map(safeKey).filter(Boolean).forEach(key => _pendingPortalKeys.add(key));
            } else {
                _publishAll = true;
            }
            clearTimeout(_pt);
            _pt = setTimeout(() => {
                const targets = _publishAll ? null : [..._pendingPortalKeys];
                _publishAll = false;
                _pendingPortalKeys.clear();
                if (targets && !targets.length) return;
                publishPortal(targets).catch(err => console.error('publishPortal:', err));
            }, 800);
        }
        function portalSafeRow(f) {
            // Keep the portal schema compatible with index.html. Field 39 is always internal notes.
            const row = Array.from({length: 40}, (_, i) => (f[i] == null ? '' : f[i]));
            row[39] = '';
            return row;
        }
        function buildPortalRecord(f, aids, children, orphans, injured, anns, logs, vk, idx) {
            const k = safeKey(digitsOf(f[2]));
            const sec = String(f[0] || '').trim();
            return {
                row: portalSafeRow(f),
                aids: (idx ? (idx.aids.get(k) || []) : aids.filter(a => a && safeKey(digitsOf(a[1])) === k)).map(a => Array.from({length: 6}, (_, i) => i === 4 ? smartNote(a[i]) : (a[i] == null ? '' : a[i]))),
                children: idx ? (idx.kids.get(k) || []) : children.filter(c => c && (safeKey(digitsOf(c[5])) === k || safeKey(digitsOf(c[8])) === k)),
                orphans: idx ? (idx.orph.get(k) || []) : orphans.filter(orp => orp && (safeKey(digitsOf(orp[4])) === k || safeKey(digitsOf(orp[7])) === k)),
                injured: idx ? (idx.inj.get(k) || []) : injured.filter(inj => inj && safeKey(digitsOf(inj[1])) === k),
                notes: anns.filter(a => !a.sec || a.sec === 'all' || String(a.sec).trim() === sec).sort((x, y) => (y.t || 0) - (x.t || 0)).slice(0, 3).map(a => ({ti: a.ti || '', tx: a.tx || '', t: a.t || 0})),
                reqs: (idx ? (idx.logs.get(k) || []) : logs.filter(l => l.fid === k)).slice().sort((x, y) => String(y.d).localeCompare(String(x.d))).slice(0, 20).map(l => ({ty: REQ_LABEL[l.ty] || l.ty || '', d: l.d || '', st: l.st || 'pending', r: l.r || ''})),
                msgs: famMsgsFor(f, k, children),
                code: f[40] || '',
                vk
            };
        }
        async function publishPortal(targetKeys) {
            const aids = getDB('db_aids'), children = getDB('db_children'), orphans = getDB('db_orphans'), injured = getDB('db_injured');
            const td = today();
            const anns = Object.values(obj('db_announcements')).filter(a => a && (!a.exp || a.exp >= td));
            const logs = Object.values(obj('db_reqlog')).filter(Boolean);
            const idx = {aids: new Map(), kids: new Map(), orph: new Map(), inj: new Map(), logs: new Map()};
            const addTo = (m, k, v) => { if (!k) return; let a = m.get(k); if (!a) m.set(k, a = []); if (a[a.length - 1] !== v) a.push(v); };
            aids.forEach(a => { if (a) addTo(idx.aids, safeKey(digitsOf(a[1])), a); });
            children.forEach(c => { if (!c) return; addTo(idx.kids, safeKey(digitsOf(c[5])), c); addTo(idx.kids, safeKey(digitsOf(c[8])), c); });
            orphans.forEach(o => { if (!o) return; addTo(idx.orph, safeKey(digitsOf(o[4])), o); addTo(idx.orph, safeKey(digitsOf(o[7])), o); });
            injured.forEach(x => { if (x) addTo(idx.inj, safeKey(digitsOf(x[1])), x); });
            logs.forEach(l => addTo(idx.logs, l.fid, l));
            const vk = (localDB.config && localDB.config.vaultPub) || '';
            const wanted = targetKeys && targetKeys.length ? new Set(targetKeys.map(safeKey)) : null;
            const families = getDB('db_families').filter(f => f && safeKey(digitsOf(f[2])) && (!wanted || wanted.has(safeKey(digitsOf(f[2])))));
            if (!families.length) return;
            if (isLimited) {
                // Rules permit limited_admin to write only portal/$id, not the whole portal tree.
                await Promise.all(families.map(f => {
                    const k = safeKey(digitsOf(f[2]));
                    return rdb.ref('portal/' + k).set(buildPortalRecord(f, aids, children, orphans, injured, anns, logs, vk, idx));
                }));
            } else {
                const updates = {};
                families.forEach(f => {
                    const k = safeKey(digitsOf(f[2])); updates['portal/' + k] = buildPortalRecord(f, aids, children, orphans, injured, anns, logs, vk, idx);
                    // بيانات التفعيل الذاتي: verify/ (الإجابات الصحيحة، لا يقرأها إلا المدير) + qmeta/ (أي الأسئلة متاحة لهذه الأسرة)
                    const members = parseInt(toLatin(f[26]), 10), ph = digitsOf(f[5]), w1 = digitsOf(f[9]), w2 = digitsOf(f[12]), dob = dobNorm(f[4]);
                    const ver = {}, qk = [];
                    if (!isNaN(members) && members >= 1) { ver.members = String(members); qk.push('members'); }
                    if (ph.length >= 7) { ver.phone = ph.slice(-9); qk.push('phone'); }
                    if (w1.length >= 5) { ver.wife1 = w1; qk.push('wife1'); }
                    if (w2.length >= 5) { ver.wife2 = w2; qk.push('wife2'); }
                    if (dob) { ver.dob = dob; qk.push('dob'); }
                    updates['verify/' + k] = qk.length >= 2 ? ver : null;
                    updates['qmeta/' + k] = qk.length >= 2 ? qk : null;
                });
                await rdb.ref().update(updates);
            }
        }


        function getDB(key) { return localDB[key] || ((key === 'db_passwords' || key === 'pwvault') ? {} : []); }
        function appendDBRecord(key, row, portalKey) {
            return rdb.ref(key).transaction(cur => {
                const arr = Array.isArray(cur) ? cur.slice() : (cur ? Object.values(cur) : []);
                arr.push(row);
                return arr;
            }).then(result => {
                const snapshot = result && result.snapshot ? result.snapshot : result;
                localDB[key] = (snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || []) : []);
                if (portalKey) schedulePublish([portalKey]); else if (['db_families','db_aids','db_children','db_injured','db_orphans'].includes(key)) schedulePublish();
                updateBadgeCount();
                return snapshot;
            });
        }
        function saveDB(key, data, portalKeys) {
            localDB[key] = data;
            return rdb.ref(key).set(data).then(() => {
                if (['db_families','db_aids','db_children','db_injured','db_orphans','db_announcements','db_reqlog'].includes(key)) {
                    schedulePublish(portalKeys);
                }
                updateBadgeCount();
            }).catch(err => {
                console.error('saveDB error', key, err);
                alert('❌ تعذر حفظ البيانات في Firebase: ' + (err.message || err));
                throw err;
            });
        }

        document.addEventListener('DOMContentLoaded', attachChildLink);
        function toggleMenu(force) { document.body.classList.toggle('menu-open', typeof force === 'boolean' ? force : undefined); }

        // تفريغ قاعدة بيانات: يتطلب كتابة كلمة تأكيد + ينزّل نسخة احتياطية تلقائياً + يسجَّل في سجل العمليات
        function clearDB(dbKey, title) {
            if (isLimited) { alert('⛔ ليست لديك صلاحية تفريغ الكشوفات.'); return; }
            let db = getDB(dbKey);
            if (!db || db.length === 0) { alert('الكشف فارغ أصلاً.'); return; }
            const w = prompt('⚠️ سيتم حذف ' + db.length + ' سجل من (' + title + ') نهائياً.\nسيتم تنزيل نسخة احتياطية تلقائياً قبل التفريغ.\n\nللتأكيد اكتب كلمة: تفريغ');
            if (w === null) return;
            if (w.trim() !== 'تفريغ') { alert('لم تتم العملية: كلمة التأكيد غير صحيحة.'); return; }
            const bk = {}; bk[dbKey] = db; downloadJSON(bk, 'نسخة_قبل_تفريغ_' + dbKey + '_' + today());
            saveDB(dbKey, []);
            audit('تفريغ كشف', title + ' (' + db.length + ' سجل)');
            if (dbKey === 'db_families') rdb.ref('portal').remove();
            toast('✅ تم تفريغ البيانات بنجاح. (تم تنزيل نسخة احتياطية)');
            let currentTab = document.querySelector('.tab-content.active-tab');
            if (currentTab) refreshNow();
        }

        function canOpenAdminPage(name) {
            const nav = document.getElementById('nav-' + name);
            return synced && !isFirstLoad && nav && nav.style.display !== 'none' &&
                document.getElementById(name + '-tab');
        }
        function adminRoute() {
            const name = location.hash.slice(1);
            return canOpenAdminPage(name) ? name : null;
        }
        window.addEventListener('hashchange', () => {
            if (synced && !isFirstLoad) switchTab(adminRoute() || 'dashboard', false, true);
        });

        function switchTab(tabName, silent, fromHistory) {
            if (!canOpenAdminPage(tabName)) return;
            // Keep the audit feed live only while its tab is visible.
            if (tabName !== 'audit' && auditQuery) stopRecentAudit();
            if (!silent) {
                if (!fromHistory && adminRoute() !== tabName) history.pushState(null, '', '#' + tabName);
                toggleMenu(false);
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active-tab', 'tab-enter'));
                document.querySelectorAll('#sidebarMenu li').forEach(li => li.classList.remove('active'));
                const pane = document.getElementById(tabName + '-tab');
                pane.classList.add('active-tab', 'tab-enter');
                pane.addEventListener('animationend', () => pane.classList.remove('tab-enter'), {once: true});
                document.getElementById('nav-' + tabName).classList.add('active');
                const sc = document.querySelector('.content'); if (sc) sc.scrollTop = 0;
            }
            
            if(tabName === 'dashboard') { loadDashboard(); }
            if(tabName === 'quick') { loadQuick(); }
            if(tabName === 'ann') { loadAnn(); }
            if(tabName === 'quality') { loadQuality(); }
            if(tabName === 'audit') { watchRecentAudit(); loadAudit(); }
            if(tabName === 'requests') { loadRequests(); loadComplaints(); loadPendingAddRequests(); }
            if(tabName === 'passwords') { loadPasswordsTable(); }
            if(tabName === 'families') { loadTable('db_families', 'familiesTable', 40); }
            if(tabName === 'aids') { 
                loadTable('db_aids', 'aidsTable', 6); 
                // تحديث القائمة المنسدلة الذكية
                const types = new Set();
                getDB('db_aids').forEach(a => { if(a && a[3]) types.add(String(a[3]).trim()); });
                document.getElementById('aidTypesGlobalList').innerHTML = [...types].sort().map(v => `<option value="${esc(v)}">`).join('');
            }
            if(tabName === 'injured') { loadTable('db_injured', 'injuredTable', 7); }
            if(tabName === 'orphans') { loadTable('db_orphans', 'orphansTable', 9); }
            if(tabName === 'children') { loadTable('db_children', 'childrenTable', 10); }
            if(tabName === 'chronic') { loadTable('db_chronic', 'chronicTable', 7); }
            if(tabName === 'fund') { document.getElementById('fu_1').valueAsDate = new Date(); loadFundTables(); }
            if(tabName === 'subscribers') { loadSubscribers(); }
            updateBadgeCount();
        }

        function performGlobalSearch(famOverride) {
            let query = toLatin(document.getElementById('globalSearchInput').value || '').trim().toLowerCase();
            if (!famOverride && !query) { alert('يرجى كتابة رقم الهوية أو الاسم للبحث.'); return; }
            let families = getDB('db_families');
            const qd = digitsOf(query), isIdQuery = qd.length >= 5 && qd.length >= query.replace(/\s/g,'').length - 1;
            let fam = famOverride || families.find(f => f && String(f[40] || '').toLowerCase() === query) || (isIdQuery && families.find(f => f && digitsOf(f[2]) === qd))
                   || families.find(f => f && ((isIdQuery && digitsOf(f[2]).includes(qd)) || (!isIdQuery && matchTokens(f[1], query))));
            if (!fam) { alert('❌ لم يتم العثور على أسرة بهذا الرقم أو الاسم في قاعدة الأسر.'); document.getElementById('globalSearchResult').classList.add('hidden'); return; }
            let famId = digitsOf(fam[2]);
            renderSrActions(fam);

            let sumBox = document.getElementById('srSummary');
            sumBox.innerHTML = `<p><strong>الاسم رباعي:</strong> ${esc(fam[1])}</p><p><strong>رقم الهوية:</strong> ${esc(fam[2])}</p><p><strong>تاريخ الميلاد:</strong> ${esc(formatDateValue(fam[4]))}</p><p><strong>القاطع:</strong> ${esc(fam[0])}</p><p><strong>رقم الجوال:</strong> ${esc(fam[5])}</p><p><strong>عدد الأفراد:</strong> ${esc(fam[26])}</p><p><strong>نوع المسكن:</strong> ${esc(fam[31])}</p><p><strong>الحالة:</strong> ${esc(fam[32])}</p><p><strong>المهنة:</strong> ${esc(fam[33])}</p>`;

            let children = getDB('db_children').filter(c => c && (digitsOf(c[5]) === famId || digitsOf(c[8]) === famId));
            let cTbody = document.querySelector('#srChildrenTbl tbody'); cTbody.innerHTML = '';
            if (children.length) children.forEach(c => { cTbody.innerHTML += `<tr><td>${esc(c[0])}</td><td>${esc(formatDateValue(c[2]))}</td><td>${esc(c[3])}</td><td>${esc(c[9])}</td></tr>`; });
            else cTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">لا يوجد أطفال مسجلون</td></tr>';

            let aids = getDB('db_aids').filter(a => a && digitsOf(a[1]) === famId);
            let aTbody = document.querySelector('#srAidsTbl tbody'); aTbody.innerHTML = '';
            if (aids.length) aids.forEach(a => { aTbody.innerHTML += `<tr><td>${esc(a[3])}</td><td>${esc(a[5])}</td><td>${esc(a[4])}</td></tr>`; });
            else aTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">لا توجد مساعدات مسجلة</td></tr>';

            let orphans = getDB('db_orphans').filter(o => o && (digitsOf(o[4]) === famId || digitsOf(o[7]) === famId));
            document.getElementById('srOrphans').textContent = orphans.length ? orphans.map(o => o[0]).join(', ') : 'لا يوجد أيتام مسجلين';
            let injured = getDB('db_injured').filter(i => i && digitsOf(i[1]) === famId);
            document.getElementById('srInjured').textContent = injured.length ? injured.map(i => i[0] + ' (' + formatDateValue(i[2]) + ' - ' + i[3] + ')').join(', ') : 'لا يوجد إصابات مسجلة';
            let chronic = getDB('db_chronic').filter(ch => ch && digitsOf(ch[1]) === famId);
            document.getElementById('srChronic').textContent = chronic.length ? chronic.map(ch => ch[0] + ' - ' + ch[4]).join(' | ') : 'لا يوجد أمراض مزمنة مسجلة';

            let fund = getDB('db_fund').filter(fn => fn && String(fn[4]).toLowerCase().includes(String(fam[1]).toLowerCase()));
            let fTbody = document.querySelector('#srFundTbl tbody'); fTbody.innerHTML = '';
            if (fund.length) fund.forEach(fn => { fTbody.innerHTML += `<tr><td>${esc(fn[0])}</td><td>${esc(fn[1])}</td><td>${esc(fn[2])} ₪</td></tr>`; });
            else fTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">لا توجد حركات مالية مسجلة</td></tr>';

            let comps = getDB('db_complaints').filter(cp => cp && digitsOf(cp[2]) === famId);
            let cpTbody = document.querySelector('#srCompTbl tbody'); cpTbody.innerHTML = '';
            if (comps.length) comps.forEach(cp => { cpTbody.innerHTML += `<tr><td>${esc(cp[0])}</td><td>${esc(cp[4])}</td><td>${esc(cp[5])}</td></tr>`; });
            else cpTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">لا توجد شكاوى مسجلة</td></tr>';

            document.getElementById('globalSearchResult').classList.remove('hidden');
        }

        function loadPendingAddRequests() {
            const render = (tblId, dbKey, cols, emptyMsg) => {
                const tbl = document.querySelector('#' + tblId + ' tbody'); tbl.innerHTML = '';
                const reqs = localDB[dbKey + '_reqs'] || {}, keys = Object.keys(reqs);
                keys.forEach((key, idx) => {
                    const item = reqs[key], p = item.payload || [];
                    tbl.innerHTML += '<tr><td>' + (idx + 1) + '</td>' + (dbKey === 'db_children' ? '<td>' + (isChildEdit(dbKey, item.payload) ? '<span style="background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:bold;">✏ تعديل بيانات</span>' : '<span style="background:#d1fae5;color:#047857;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:bold;">➕ طفل جديد</span>') + '</td>' : '') + '<td>' + esc(item.id) + '</td>' + cols.map((c, j) => '<td>' + (j === 0 ? '<strong>' + esc(p[c]) + '</strong>' : esc(p[c])) + '</td>').join('')
                        + '<td><button class="btn btn-blue" style="margin:0;padding:4px 8px;" onclick="viewAddReq(\'' + dbKey + '\',\'' + esc(key) + '\')">👁 التفاصيل</button> '
                        + '<button class="btn btn-green" style="margin:0;padding:4px 8px;" onclick="approveAddReq(\'' + dbKey + '\',\'' + esc(key) + '\')">✔ قبول</button> '
                        + '<button class="btn btn-red" style="margin:0;padding:4px 8px;" onclick="rejectAddReq(\'' + dbKey + '\',\'' + esc(key) + '\')">❌ رفض</button></td></tr>';
                });
                if (!keys.length) tbl.innerHTML = '<tr><td colspan="7" style="text-align:center;">' + emptyMsg + '</td></tr>';
            };
            render('childrenReqTable', 'db_children', [0, 2, 3, 9], 'لا توجد طلبات إضافة أو تعديل أطفال معلقة.');
            render('chronicReqTable', 'db_chronic', [0, 1, 4, 5], 'لا توجد طلبات أمراض مزمنة معلقة.');
            render('injuredReqTable', 'db_injured', [0, 1, 3, 5], 'لا توجد طلبات تسجيل إصابات معلقة.');
            updateBadgeCount();
        }

        function viewAddReq(dbKey, reqKey) {
            const item = (localDB[dbKey + '_reqs'] || {})[reqKey]; if (!item) return;
            const labels = dbKey === 'db_children' ? CHILD_LABELS : dbKey === 'db_chronic' ? CHRONIC_LABELS : INJ_LABELS;
            const p = item.payload || [], fam = famByKey(safeKey(digitsOf(item.id)));
            let warns = [];
            if (!fam) warns.push('⚠️ لا توجد أسرة بهذا الرقم في القاعدة.');
            const pid = digitsOf(p[1]), isEdit = isChildEdit(dbKey, p), editIdx = isEdit ? findChildIdx(p) : -1;
            if (isEdit && editIdx < 0) warns.push('⚠️ لم يُعثر على سجل الطفل الأصلي في الكشف؛ عند القبول سيُضاف كطفل جديد.');
            if (pid) {
                const exist = getDB(dbKey).some((r, i) => r && digitsOf(r[1]) === pid && i !== editIdx);
                if (exist) warns.push('⚠️ يوجد سجل مسجل مسبقاً بنفس رقم الهوية في هذا الكشف (تكرار).');
            }
            let h = '<h3>' + (isEdit ? '✏ طلب تعديل بيانات طفل' : '➕ طلب إضافة طفل جديد') + ': ' + esc(p[0]) + '</h3>';
            if (warns.length) h += '<p class="warn">' + warns.map(esc).join('<br>') + '</p>';
            if (isEdit && editIdx >= 0) {
                const o = getDB(dbKey)[editIdx] || [];
                let cmp = '<h4>🔁 مقارنة: الحالي ← المطلوب</h4><table><thead><tr><th>الحقل</th><th>الحالي</th><th>المطلوب</th></tr></thead><tbody>';
                labels.forEach((l, i) => { const ov = o[i] == null ? '' : String(o[i]), nv = p[i] == null ? '' : String(p[i]); const ch = ov !== nv; cmp += '<tr' + (ch ? ' style="background:#fef9c3;"' : '') + '><td style="font-weight:bold;">' + esc(l) + '</td><td>' + esc(ov || '-') + '</td><td>' + (ch ? '<strong>' + esc(nv || '-') + '</strong>' : esc(nv || '-')) + '</td></tr>'; });
                h += cmp + '</tbody></table>';
            } else {
                h += '<h4>📄 بيانات الطلب</h4>' + kvTable(labels, p);
            }
            if (fam) {
                h += '<h4>👤 رب الأسرة المرتبط</h4><table><tbody><tr><td style="width:35%;background:#f1f5f9;font-weight:bold;">الاسم</td><td>' + esc(fam[1]) + '</td></tr><tr><td style="background:#f1f5f9;font-weight:bold;">الهوية / القاطع</td><td>' + esc(fam[2]) + ' / ' + esc(fam[0]) + '</td></tr><tr><td style="background:#f1f5f9;font-weight:bold;">الجوال</td><td>' + esc(fam[5]) + '</td></tr><tr><td style="background:#f1f5f9;font-weight:bold;">أطفال مسجلون حالياً</td><td>' + childrenOf(safeKey(digitsOf(fam[2]))).length + '</td></tr></tbody></table>';
            }
            h += '<p style="font-size:12px;color:#64748b;margin-top:8px;">تاريخ الطلب: ' + esc((item.date || '').split('T')[0] || '-') + '</p>';
            const wa = fam ? waLink(fam[5], 'السلام عليكم، معك إدارة مخيم جسر الحياة بخصوص طلبك: ') : '';
            h += '<div class="btnrow"><button class="btn btn-green" onclick="approveAddReq(\'' + dbKey + '\',\'' + esc(reqKey) + '\');closeModal();">✔ قبول</button><button class="btn btn-red" onclick="rejectAddReq(\'' + dbKey + '\',\'' + esc(reqKey) + '\');closeModal();">❌ رفض</button>' + (wa ? '<a class="btn btn-green" style="background:#25d366;" target="_blank" rel="noopener" href="' + esc(wa) + '">💬 واتساب</a>' : '') + '<button class="btn btn-blue" onclick="closeModal()">إغلاق</button></div>';
            openModal(h);
        }

        function approveAddReq(dbKey, reqKey) {
            const reqs = localDB[dbKey + '_reqs'] || {}, item = reqs[reqKey]; if (!item) return;
            const rawPayload = Array.from(item.payload || []), isEdit = isChildEdit(dbKey, rawPayload), editIdx = isEdit ? findChildIdx(rawPayload) : -1;
            const row = isEdit ? rawPayload.slice(0, 10) : rawPayload, fam = famByKey(safeKey(digitsOf(item.id)));
            if (!fam && !confirm('⚠️ لا توجد أسرة بهذا الرقم في القاعدة. هل تريد القبول رغم ذلك؟')) return;
            if (isEdit && editIdx < 0 && !confirm('⚠️ لم يُعثر على سجل الطفل الأصلي. هل تريد إضافته كطفل جديد؟')) return;
            const pid = digitsOf(row[1]);
            if (pid && getDB(dbKey).some((r, i) => r && digitsOf(r[1]) === pid && i !== editIdx) && !confirm('⚠️ يوجد سجل بنفس رقم الهوية مسبقاً. هل تريد المتابعة رغم التكرار؟')) return;
            if (dbKey === 'db_children' && fam) { if (!row[4]) row[4] = fam[1]; if (!row[5]) row[5] = fam[2]; if (!row[6]) row[6] = fam[5]; } // ربط بسجل رب الأسرة
            const db = getDB(dbKey);
            if (isEdit && editIdx >= 0) { const old = db[editIdx] || []; db[editIdx] = row.map((v, i) => (v === '' || v == null) && old[i] != null ? old[i] : v); } else db.push(row);
            saveDB(dbKey, db);
            delete reqs[reqKey]; rdb.ref(dbKey + '_reqs/' + reqKey).remove();
            const opLbl = isEdit ? 'تعديل بيانات طفل' : REQ_LABEL[dbKey];
            audit('قبول طلب ' + opLbl, (row[0] || '') + ' | أسرة ' + item.id);
            logReq(reqKey, item.id, dbKey, 'accepted', '', (isEdit ? 'تعديل بيانات طفل: ' : '') + row[0]);
            loadPendingAddRequests(); alert(isEdit && editIdx >= 0 ? '✅ تمت الموافقة وتعديل بيانات الطفل بنجاح!' : '✅ تمت الموافقة وإضافة السجل للكشوفات بنجاح!');
        }

        function askRejectionReason(onConfirm) {
            if (document.getElementById('rejectReasonDialog')) return;
            const dialog = document.createElement('dialog');
            dialog.id = 'rejectReasonDialog';
            dialog.setAttribute('aria-labelledby', 'rejectTitle');
            dialog.innerHTML = '<form method="dialog"><h3 id="rejectTitle">رفض الطلب</h3><label for="rejectReason">سبب الرفض (اختياري، يظهر للعائلة)</label><textarea id="rejectReason" maxlength="300" autofocus></textarea><div class="btnrow"><button class="btn btn-red" value="reject">تأكيد الرفض</button><button class="btn btn-blue" value="cancel">إلغاء</button></div></form>';
            dialog.addEventListener('submit', event => {
                event.preventDefault();
                const reason = dialog.querySelector('textarea').value.trim();
                dialog.close();
                dialog.remove();
                if (event.submitter?.value === 'reject') onConfirm(reason);
            });
            dialog.addEventListener('close', () => dialog.remove(), {once:true});
            document.body.appendChild(dialog);
            dialog.showModal();
        }

        function rejectAddReq(dbKey, reqKey) {
            if (!obj(dbKey + '_reqs')[reqKey]) return;
            askRejectionReason(why => finishRejectAddReq(dbKey, reqKey, why));
        }

        function finishRejectAddReq(dbKey, reqKey, why) {
            const reqs = localDB[dbKey + '_reqs'] || {}, item = reqs[reqKey]; if (!item) return;
            delete reqs[reqKey]; rdb.ref(dbKey + '_reqs/' + reqKey).remove();
            audit('رفض طلب ' + (isChildEdit(dbKey, item.payload) ? 'تعديل بيانات طفل' : REQ_LABEL[dbKey]), (item.payload && item.payload[0] || '') + ' | أسرة ' + item.id + (why ? ' | ' + why : ''));
            logReq(reqKey, item.id, dbKey, 'rejected', why, (isChildEdit(dbKey, item.payload) ? 'تعديل بيانات طفل: ' : '') + (item.payload && item.payload[0] || ''));
            loadPendingAddRequests();
        }

        let _pwBusy = false;
        function famByKey(key) { return getDB('db_families').find(f => f && safeKey(digitsOf(f[2])) === key); }
        function claimUidOf(key) {
            const c = localDB.claims || {};
            return Object.keys(c).find(u => c[u] && safeKey(String(c[u].id)) === key) || null;
        }
        async function familyAccountAction(key, action, button) {
            if (isLimited || _pwBusy || !auth.currentUser || !famByKey(key)) return;
            if (!window.CAMP_RECOVERY_URL) {
                alert('خدمة حسابات العائلات لسه مش مربوطة.');
                return;
            }
            if (action === 'reset-link' && !confirm('هل تحققت من هوية العائلة قبل إصدار رابط إعادة التعيين؟')) return;
            _pwBusy = true;
            try {
                const token = await auth.currentUser.getIdToken();
                const endpoint = new URL('/api/admin/' + action, window.CAMP_RECOVERY_URL);
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token},
                    body: JSON.stringify({id: key})
                });
                const result = await response.json();
                if (response.status === 401) {
                    alert('سجّل خروج وادخل مرة ثانية لتأكيد هويتك، وبعدها جرّب من جديد.');
                } else if (response.status === 404) {
                    alert(action === 'reveal' ? 'كلمة السر غير متاحة. استخدم إعادة التعيين.' : 'ما في حساب دخول فعّال مربوط بهالعائلة.');
                } else if (response.ok && action === 'reveal') {
                    button.textContent = result.password;
                    setTimeout(() => { button.textContent = 'إظهار'; }, 10000);
                } else if (response.ok && action === 'reset-link') {
                    prompt('انسخ الرابط وسلّمه للعائلة مباشرة بعد التحقق من هويتها:', result.link);
                } else {
                    alert('تعذّر إكمال الطلب. تأكّد من صلاحياتك وحاول مرة ثانية.');
                }
            } catch {
                alert('تعذّر الاتصال بخدمة حسابات العائلات.');
            } finally {
                _pwBusy = false;
            }
        }

        function loadPasswordsTable() {
            const tbody = document.querySelector('#passwordsTable tbody');
            const q = (document.getElementById('pwSearch').value || '').trim().toLowerCase(); tbody.innerHTML = ''; let n = 0; const prow = [];
            const claimed = new Set(Object.values(localDB.claims || {}).map(c => c && safeKey(String(c.id))));
            getDB('db_families').forEach(fam => {
                if (!fam || (q && !(String(fam[1]).toLowerCase().includes(q) || String(fam[2]).includes(q)))) return;
                const cleanKey = safeKey(digitsOf(fam[2]));
                n++;
                const active = claimed.has(cleanKey);
                const pwCell = active ? '<button class="btn btn-blue" onclick="familyAccountAction(\'' + esc(cleanKey) + '\',\'reveal\',this)">إظهار</button>' : '—';
                const btns = active ? '<button class="btn btn-blue" onclick="familyAccountAction(\'' + esc(cleanKey) + '\',\'reset-link\')">إعادة تعيين كلمة السر</button>' : '';
                prow.push('<tr><td>' + n + '</td><td>' + esc(fam[2]) + '</td><td><strong>' + esc(fam[1]) + '</strong></td><td style="direction:ltr;font-weight:bold;">' + pwCell + '</td><td style="color:' + (active ? '#10b981' : '#64748b') + ';font-weight:bold;">' + (active ? '✅ مفعّل' : 'لم يفعّل') + '</td><td style="white-space:nowrap;">' + btns + '</td></tr>');
            });
            tbody.innerHTML = prow.join('');
            if (!n) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">لا توجد نتائج.</td></tr>';
        }

        function loadRequests() {
            let reqs = getDB('db_edit_requests'), tbody = document.querySelector('#requestsTable tbody'); tbody.innerHTML = '';
            reqs.forEach((req, index) => {
                const fam = famByKey(safeKey(digitsOf(req.id)));
                const n = fam ? diffFam(fam, Array.from({length: 40}, (_, i) => (req.newData && req.newData[i] != null ? req.newData[i] : ''))).filter(d => !d.locked).length : '?';
                tbody.innerHTML += `<tr><td>${index + 1}</td><td><strong>${esc(req.name)}</strong><div style="font-size:11px;color:#b45309;">${n} حقل معدّل</div></td><td>${esc(req.id)}</td><td style="direction:ltr;">${esc(req.date)}</td><td><button class="btn btn-blue" style="margin:0; padding:4px 8px; font-size:12px;" onclick="viewEditReq(${index})">👁 التفاصيل</button> <button class="btn btn-green" style="margin:0; padding:4px 8px; font-size:12px;" onclick="approveRequest(${index})">✔ موافقة</button> <button class="btn btn-red" style="margin:0; padding:4px 8px; font-size:12px;" onclick="rejectRequest(${index})">❌ رفض</button></td></tr>`;
            });
            if(reqs.length === 0) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">لا يوجد طلبات تعديل.</td></tr>`;
        }

        function viewEditReq(index) {
            const req = getDB('db_edit_requests')[index]; if (!req) return;
            const fam = famByKey(safeKey(digitsOf(req.id)));
            if (!fam) { openModal('<h3>' + esc(req.name) + '</h3><p class="warn">⚠️ الأسرة غير موجودة في القاعدة، لا يمكن مقارنة التعديلات.</p><div class="btnrow"><button class="btn btn-blue" onclick="closeModal()">إغلاق</button></div>'); return; }
            const nd = Array.from({length: 40}, (_, i) => (req.newData && req.newData[i] != null ? req.newData[i] : ''));
            const all = diffFam(fam, nd), real = all.filter(d => !d.locked), locked = all.filter(d => d.locked && d.i !== 39);
            let h = '<h3>📝 طلب تعديل: ' + esc(fam[1]) + ' <small style="color:#64748b;">(' + esc(fam[2]) + ' - ' + esc(fam[0]) + ')</small></h3><p style="font-size:12px;color:#64748b;">تاريخ الطلب: ' + esc(req.date) + '</p>';
            if (!real.length) h += '<p class="warn">لا توجد تغييرات فعلية في هذا الطلب.</p>';
            else h += '<table><thead><tr><th>الحقل</th><th>القيمة الحالية</th><th>القيمة المطلوبة</th></tr></thead><tbody>' + real.map(d => '<tr class="chg"><td><strong>' + esc(FAM_LABELS[d.i]) + '</strong></td><td class="old">' + esc(d.a || '—') + '</td><td class="new">' + esc(d.b || '—') + '</td></tr>').join('') + '</tbody></table>';
            if (locked.length) h += '<p class="warn" style="margin-top:8px;">🔒 تم تجاهل محاولة تغيير حقول مقفلة: ' + locked.map(d => esc(FAM_LABELS[d.i])).join('، ') + '</p>';
            const wa = waLink(fam[5], 'السلام عليكم ' + fam[1] + '، معك إدارة مخيم جسر الحياة بخصوص طلب تعديل بياناتك: ');
            h += '<div class="btnrow"><button class="btn btn-green" onclick="approveRequest(' + index + ');closeModal();">✔ موافقة</button><button class="btn btn-red" onclick="rejectRequest(' + index + ');closeModal();">❌ رفض</button>' + (wa ? '<a class="btn btn-green" style="background:#25d366;" target="_blank" rel="noopener" href="' + esc(wa) + '">💬 واتساب</a>' : '') + '<button class="btn btn-blue" onclick="showFamilyByKey(\'' + esc(safeKey(digitsOf(fam[2]))) + '\')">👁 بطاقة الأسرة</button><button class="btn btn-blue" style="background:#64748b;" onclick="closeModal()">إغلاق</button></div>';
            openModal(h);
        }

        function loadComplaints() {
            let comps = getDB('db_complaints'), tbody = document.querySelector('#complaintsTable tbody'); tbody.innerHTML = ''; let shown = 0; const crow = [];
            comps.forEach((c, i) => {
                if (!c || c[7]) return; shown++;
                crow.push(`<tr><td>${shown}</td><td style="direction:ltr;">${esc(c[0])}</td><td><strong>${esc(c[1])}</strong></td><td style="direction:ltr;">${esc(c[3])}</td><td>${esc(c[4])}</td><td style="white-space:normal;min-width:220px;">${esc(c[5])}</td><td><button class="btn btn-green" style="margin:0 0 4px 0; padding:4px 8px; font-size:11px;" onclick="answerComplaint(${i})">✉️ رد</button> <button class="btn btn-red" style="margin:0; padding:4px 8px; font-size:11px;" onclick="deleteComplaint(${i})">حذف</button></td></tr>`);
            });
            tbody.innerHTML = crow.join('');
            if(!shown) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">لا يوجد شكاوى جديدة.</td></tr>`;
        }

        function approveRequest(index) {
            let reqs = getDB('db_edit_requests'), req = reqs[index], families = getDB('db_families'); if (!req) return;
            let fIndex = families.findIndex(f => f && safeKey(digitsOf(f[2])) === safeKey(digitsOf(req.id)));
            if (fIndex < 0) { toast('⚠️ لم يتم العثور على الأسرة في القاعدة، لا يمكن تطبيق الطلب.'); return; }
            const old = families[fIndex], nd = Array.from({length: 40}, (_, i) => (req.newData && req.newData[i] != null ? req.newData[i] : ''));
            const n = diffFam(old, nd).filter(d => !d.locked).length;
            if (!confirm('تطبيق ' + n + ' تعديل على بيانات أسرة: ' + old[1] + '؟')) return;
            LOCKED_IDX.forEach(i => { nd[i] = old[i] == null ? '' : old[i]; }); // القاطع والاسم والهوية والملاحظات الداخلية لا تتغير
            if (old[40]) nd[40] = old[40]; families[fIndex] = nd; saveDB('db_families', families);
            audit('قبول طلب تعديل', old[1] + ' | ' + n + ' حقل');
            logReq(req.rid, req.id, 'db_edit_requests', 'accepted', '', 'تعديل بيانات الأسرة');
            reqs.splice(index, 1); saveDB('db_edit_requests', reqs); switchTab('requests');
        }
        function rejectRequest(index) {
            const req = getDB('db_edit_requests')[index];
            if (req) askRejectionReason(why => finishRejectRequest(req, why));
        }
        function finishRejectRequest(req, why) {
            const reqs = getDB('db_edit_requests');
            const index = reqs.findIndex(item => item === req || (req.rid && item?.rid === req.rid));
            if (index < 0) { toast('تغيّر الطلب. حدّث القائمة وافتحه من جديد.', 'warn'); return; }
            audit('رفض طلب تعديل', req.name + (why ? ' | ' + why : ''));
            logReq(req.rid, req.id, 'db_edit_requests', 'rejected', why, 'تعديل بيانات الأسرة');
            reqs.splice(index, 1); saveDB('db_edit_requests', reqs); switchTab('requests');
        }
        function answerComplaint(index) {
            let comps = getDB('db_complaints'), c = comps[index]; if (!c) return;
            const msg = prompt('الشكوى: ' + c[4] + '\n\nاكتب الرد الذي سيظهر للعائلة في بوابتها:', ''); if (msg === null) return;
            if (!msg.trim()) { alert('اكتب نص الرد.'); return; }
            while (c.length < 8) c.push('');
            const rid = c[6] || ('c' + Date.now()); c[6] = rid; c[7] = 'تم الرد';
            saveDB('db_complaints', comps);
            logReq(rid, c[2], 'db_complaints', 'answered', msg.trim(), c[4]);
            audit('رد على شكوى', c[1] + ' | ' + c[4]);
            switchTab('requests');
        }
        function deleteComplaint(index) {
            if (isLimited) { alert('⛔ ليست لديك صلاحية الحذف.'); return; }
            if(confirm('حذف الشكوى؟')) { let comps = getDB('db_complaints'); const c = comps[index]; comps.splice(index, 1); saveDB('db_complaints', comps); audit('حذف شكوى', c && (c[1] + ' | ' + c[4])); switchTab('requests'); }
        }

        function addRecord(e, dbKey, inputPrefix, fieldCount) {
            e.preventDefault();
            let db = getDB(dbKey), row = [];
            for (let i = 1; i <= fieldCount; i++) { let el = document.getElementById(inputPrefix + '_' + i); row.push(el ? el.value : ''); }
            row = normalizeImportedRow(dbKey, row, fieldCount);
            if (dbKey === 'db_children') { const w = linkChildRow(row); if (w && !confirm(w)) return; }
            if (dbKey === 'db_families' && db.some(f => f && digitsOf(f[2]) === digitsOf(row[2])) && !confirm('⚠️ توجد أسرة بنفس رقم الهوية مسبقاً. هل تريد الإضافة رغم التكرار؟')) return;
            const portalKey = (dbKey === 'db_families' ? safeKey(digitsOf(row[2])) : dbKey === 'db_aids' ? safeKey(digitsOf(row[1])) : dbKey === 'db_children' ? safeKey(digitsOf(row[5])) || safeKey(digitsOf(row[8])) : dbKey === 'db_injured' || dbKey === 'db_chronic' ? safeKey(digitsOf(row[1])) : dbKey === 'db_orphans' ? (safeKey(digitsOf(row[4])) || safeKey(digitsOf(row[7]))) : '');
            const done = dbKey === 'db_fund' ? saveDB(dbKey, getDB(dbKey).concat([row])) : appendDBRecord(dbKey, row, portalKey);
            done.then(()=>{ audit('إضافة سجل', dbKey + ' | ' + (row[0] || row[1] || '')); if(dbKey !== 'db_fund') e.target.reset(); else { document.getElementById('fu_3').value=''; document.getElementById('fu_4').value=''; document.getElementById('fu_5').value=''; } refreshNow(); }).catch(err=>alert('❌ تعذر حفظ السجل: '+(err.message||err)));
        }

        function addFamily(e) { addRecord(e, 'db_families', 'f', 40); }
        function addAid(e) { addRecord(e, 'db_aids', 'a', 6); }
        function addInjured(e) { addRecord(e, 'db_injured', 'i', 7); }
        function addOrphan(e) { addRecord(e, 'db_orphans', 'o', 9); }
        function addChild(e) { addRecord(e, 'db_children', 'c', 10); }
        function addChronic(e) { addRecord(e, 'db_chronic', 'ch', 7); }
        function addFund(e) { addRecord(e, 'db_fund', 'fu', 5); }

        function loadTable(dbKey, tableId, fieldCount) {
            const db = getDB(dbKey), tbody = document.querySelector('#' + tableId + ' tbody'); if (!tbody) return;
            const btnS = 'margin:0 0 0 4px; padding:4px 8px; font-size:11px;';
            const out = [], cells = [], txt = [], isFamily = dbKey === 'db_families', virt = db.length > 300;
            const rowHtml = (index, row, cv) => {
                let h = '<tr><td>' + (index + 1) + '</td>' + (dbKey === 'db_families' ? '<td>' + esc(row[40] || '') + '</td>' : '');
                for (let c = 0; c < cv.length; c++) h += '<td>' + esc(cv[c]) + '</td>';
                let viewBtn = '';
                if (dbKey === 'db_families') viewBtn = '<button class="btn-blue btn" style="' + btnS + '" onclick="showFamilyByKey(\'' + esc(safeKey(digitsOf(row[2]))) + '\')">👁 عرض</button>';
                if (dbKey === 'db_children') { const fk = safeKey(digitsOf(row[5])) || safeKey(digitsOf(row[8])); viewBtn = '<button class="btn-blue btn" style="' + btnS + '" onclick="showFamilyByKey(\'' + esc(fk) + '\')">👁 الأسرة</button>'; }
                return h + '<td style="white-space:nowrap">' + viewBtn
                  + '<button class="btn-blue btn" style="margin:0 4px 0 0; padding:4px 8px; font-size:11px; background:#b7791f;" onclick="editRecord(\'' + dbKey + '\', ' + index + ')">✏ تعديل</button> '
                  + '<button class="btn-red btn" style="margin:0; padding:4px 8px; font-size:11px;" onclick="deleteRecord(\'' + dbKey + '\', ' + index + ')">حذف</button></td></tr>';
            };
            for (let index = 0; index < db.length; index++) {
                const row = Array.isArray(db[index]) ? db[index] : [];
                const cv = []; for (let c = 0; c < fieldCount; c++) cv.push(formatCellForDB(dbKey, c, row[c]));
                if (dbKey === 'db_children') cv.push(ADV.completedAge(cv[2]));
                if (!virt) out.push(rowHtml(index, row, cv));
                cells.push([String(index + 1)].concat(isFamily ? [String(row[40] || '')] : [], cv, [''])); txt.push(cv.join(' '));
            }
            const searchMap = {aidsTable:'aidsSearch', injuredTable:'injuredSearch', orphansTable:'orphansSearch', childrenTable:'childrenSearch', chronicTable:'chronicSearch', stockTable:'stockSearch'};
            const prev = tbody.__V;
            if (virt) {
                // جدول كبير: لا نبني كل الصفوف في الصفحة، فقط الصفحة الحالية
                const V = tbody.__V = {n: db.length, make: i => rowHtml(i, Array.isArray(db[i]) ? db[i] : [], cells[i].slice(isFamily ? 2 : 1, -1)), cells, txt, q: prev ? prev.q : '', page: prev ? prev.page : 0, matches: [], familyFilter: isFamily ? index => db[index] && famMatch(db[index]) : null};
                const inp = searchMap[tableId] && document.getElementById(searchMap[tableId]);
                if (inp) V.q = toLatin(String(inp.value || '')).trim().toLowerCase();
                if (isFamily) fillQateaOptions();
                VT.render(tbody); return;
            }
            tbody.__V = null; tbody.innerHTML = out.join('');
            if (tableId === 'familiesTable') { fillQateaOptions(); filterFamilies(); }
            else if (searchMap[tableId]) filterSimpleTable(tableId, searchMap[tableId]);
        }
        function flushTable(id) { /* لا حاجة: الجداول الكبيرة افتراضية وتُصدَّر من البيانات */ }


        /* ================= فلترة كشف الأسر (بالاسم / الهوية / الجوال + الفلاتر) ================= */
        function famMatch(f){
            const g=id=>String(document.getElementById(id)?.value||'').trim();
            const q=g('famSearch'), qatea=g('famQatea'), status=g('famStatus'), housing=g('famHousing'), multi=g('famMultiMembers');
            if(q && !matchTokens([f[1],f[2],f[5],f[6],f[40],f[8],f[9],f[11],f[12]].join(' '), q)) return false;
            if(qatea && String(f[0]||'').trim()!==qatea) return false;
            if(status && !normAr(f[32]||'').includes(normAr(status))) return false;
            if(housing && !normAr(f[31]||'').includes(normAr(housing))) return false;
            if(multi){
                const nums=multi.split(/[,،;\s]+/).map(n=>parseInt(digitsOf(n),10)).filter(n=>!isNaN(n));
                if(nums.length && !nums.includes(parseInt(digitsOf(f[26]),10)||0)) return false;
            }
            return true;
        }
        function filterFamilies(){
            const table=document.getElementById('familiesTable'); if(!table||!table.tBodies[0]) return;
            const tbody = table.tBodies[0];
            if (tbody.__V) {
                tbody.__V.page = 0;
                VT.render(tbody);
                return;
            }
            const db=getDB('db_families'), rows=Array.from(tbody.rows); let shown=0;
            rows.forEach(tr=>{
                const f=db[(parseInt(tr.cells[0].textContent,10)||0)-1];
                const ok=!!f && famMatch(f);
                tr.style.display=ok?'':'none'; if(ok) shown++;
            });
            const c=document.getElementById('famCount'); if(c) c.textContent='عدد الأسر المعروضة: '+shown+' من '+rows.length;
            ADV.apply('familiesTable');
        }
        function resetFamFilter(){
            ['famSearch','famQatea','famStatus','famHousing','famMultiMembers'].forEach(id=>{const el=document.getElementById(id); if(el) el.value='';});
            filterFamilies();
        }
        function fillQateaOptions(){
            const sel=document.getElementById('famQatea'); if(!sel) return;
            const cur=sel.value, set=new Set();
            getDB('db_families').forEach(f=>{ if(f && f[0]!=null && String(f[0]).trim()) set.add(String(f[0]).trim()); });
            const arr=Array.from(set).sort((a,b)=>a.localeCompare(b,'ar',{numeric:true}));
            sel.innerHTML='<option value="">كل القواطع</option>'+arr.map(q=>'<option value="'+esc(q)+'">'+esc(q)+'</option>').join('');
            sel.value=set.has(cur)?cur:'';
        }

        /* ================= كشف دافعي الاشتراك ================= */
        function subscriberRows(){
            const families=getDB('db_families').filter(Boolean), funds=getDB('db_fund').filter(Boolean);
            return families.map(f=>{
                const name=String(f[1]||'').trim(), id=f[2]||'', q=f[0]||'';
                const payments=name?funds.filter(x=>x && String(x[1]||'').includes('مساهمة') && String(x[3]||'').includes(name)):[];
                const total=payments.reduce((sum,x)=>sum+(parseFloat(toLatin(String(x[2]||'')).replace(/,/g,''))||0),0);
                return [name,id,q,total,total>0?'تم الدفع':'لم يدفع'];
            });
        }
        function loadSubscribers(){
            const tbody=document.querySelector('#subscribersTable tbody'); if(!tbody) return; tbody.innerHTML='';
            subscriberRows().forEach((r,i)=>{
                const tr=document.createElement('tr');
                [i+1,r[0],r[1],r[2],r[3]+' ₪',r[4]].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td);});
                tbody.appendChild(tr);
            });
            filterSubscribers();
        }
        function filterSubscribers(){
            const q=document.getElementById('subSearch')?.value||'';
            const table=document.getElementById('subscribersTable'); if(!table||!table.tBodies[0]) return;
            Array.from(table.tBodies[0].rows).forEach(tr=>{tr.style.display=(!q.trim()||matchTokens(tr.textContent||'',q))?'':'none';});
        }

        function filterSimpleTable(tableId, inputId) {
            const table=document.getElementById(tableId), input=document.getElementById(inputId); if(!table||!input)return;
            { const tbv=table.tBodies[0]; if(tbv&&tbv.__V){ const qv=toLatin(String(input.value||'')).trim().toLowerCase(); if(qv!==tbv.__V.q){tbv.__V.q=qv;tbv.__V.page=0;} VT.render(tbv); return; } }
            const q=toLatin(String(input.value||'')).trim().toLowerCase();
            const rows=table.tBodies[0]?Array.from(table.tBodies[0].rows):[]; let shown=0;
            rows.forEach(tr=>{if (tr.classList.contains('adv-empty')) return; const ok=!q||matchTokens(tr.textContent||'',q);tr.style.display=ok?'':'none';if(ok)shown++;});
            ADV.apply(tableId);
            let counter=document.getElementById(tableId+'Count');
            if(!counter){const box=table.parentElement&&table.parentElement.parentElement;if(box){counter=document.createElement('div');counter.id=tableId+'Count';counter.style.cssText='font-size:12px;color:#64748b;margin:7px 0;';box.insertBefore(counter,table.parentElement);}}
            if(counter)counter.textContent=q?`النتائج المطابقة: ${shown}`:`إجمالي السجلات: ${rows.length}`;
        }

        // ================= Excel: تصدير/استيراد حقيقي من بيانات Firebase =================
        const EXPORT_SCHEMAS = {
            db_families: FAM_LABELS,
            db_aids: ['الاسم','الهوية','القاطع','النوع','ملاحظة','الكمية'],
            db_injured: INJ_LABELS,
            db_orphans: ['اسم اليتيم','الهوية','الميلاد','الوصي','هوية الوصي','تاريخ الاستشهاد','الشهيد/ة','هوية الشهيد/ة','جوال'],
            db_children: CHILD_LABELS,
            db_chronic: CHRONIC_LABELS,
            db_fund: ['التاريخ','النوع','المبلغ','الجهة','ملاحظات'],
            db_stock: ['التاريخ','الحركة','الصنف','الكمية','الوحدة','الجهة / المستلم','ملاحظات']
        };
        const TABLE_TO_DB = {
            familiesTable:'db_families', aidsTable:'db_aids', injuredTable:'db_injured',
            orphansTable:'db_orphans', childrenTable:'db_children', chronicTable:'db_chronic',
            fundInTable:'db_fund', fundOutTable:'db_fund', subscribersTable:'db_families', stockTable:'db_stock'
        };

        function excelClean(v) {
            if (v === null || v === undefined) return '';
            if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return formatDateValue(v);
            return String(v).trim();
        }
        let excelLoading;
        async function loadExcel() {
            if (typeof XLSX !== 'undefined') return true;
            if (!excelLoading) {
                excelLoading = new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
                    script.onload = resolve;
                    script.onerror = () => { script.remove(); reject(new Error('Excel download failed')); };
                    document.head.appendChild(script);
                }).catch(error => {
                    excelLoading = null;
                    console.error(error);
                });
            }
            await excelLoading;
            if (typeof XLSX !== 'undefined') return true;
            toast('❌ تعذر تحميل مكتبة Excel. تحقق من الاتصال وحاول مرة أخرى.', 'err');
            return false;
        }

        async function exportRowsToExcel(headers, rows, filename, sheetName) {
            if (!await loadExcel()) return;
            
            const dc = headers.map(h => /تاريخ|ميلاد|^التاريخ$/.test(String(h))), nc = headers.map(h => /ملاحظ/.test(String(h)));
            const aoa = [headers].concat(rows.map(row => headers.map((header, index) => {
                const value = row?.[index];
                if (header === 'العمر (سنوات)' && /^\d+$/.test(String(value))) return Number(value);
                if (dc[index]) return formatDateValue(value);
                if (nc[index]) return smartNote(value);
                return excelClean(value);
            })));
            if (aoa.length <= 1) { toast('⚠️ لا توجد بيانات لتصديرها.'); return; }
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = headers.map((h,i) => {
                let max = String(h).length;
                for (let j=1; j<Math.min(aoa.length,501); j++) max=Math.max(max,String(aoa[j][i]||'').length);
                return {wch:Math.min(Math.max(max+2,12),40)};
            });
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, sheetName || 'البيانات');
            XLSX.writeFile(wb, filename || 'export.xlsx', {bookType:'xlsx'});
        }

        function exportExcel(tableId, filename) {
            if (tableId !== 'familiesTable' && ADV.states[tableId]) return ADV.doExport(tableId, filename);
            try {
                const dbKey = TABLE_TO_DB[tableId];
                if (!dbKey) { alert('❌ لم يتم العثور على مصدر البيانات لهذا الكشف.'); return; }
                if (tableId === 'subscribersTable') {
                    const rows=subscriberRows();
                    exportRowsToExcel(['الاسم','الهوية','القاطع','المدفوع','الحالة'],rows,filename,'دافعو الاشتراك');
                    return;
                }
                let rows = getDB(dbKey).filter(Boolean);
                if (tableId === 'fundInTable') rows = rows.filter(r => String(r[1]||'').includes('وارد'));
                if (tableId === 'fundOutTable') rows = rows.filter(r => String(r[1]||'').includes('صادر'));
                // التصدير يعتمد على البيانات الأصلية وليس HTML الخاص بالجدول، لذلك الناتج Excel حقيقي ونظيف.
                exportRowsToExcel(EXPORT_SCHEMAS[dbKey], rows, filename, 'البيانات');
            } catch (err) {
                console.error('exportExcel error:', err);
                alert('❌ تعذر التصدير إلى Excel: ' + (err && err.message ? err.message : err));
            }
        }

        function filteredFamilyRows() {
            const families = getDB('db_families');
            const tbody = document.querySelector('#familiesTable tbody');
            if (tbody.__V) return tbody.__V.matches.map(index => families[index]);
            return Array.from(tbody.rows)
                .filter(row => !row.classList.contains('adv-hide') && row.style.display !== 'none')
                .map(row => families[Number(row.cells[0].textContent) - 1])
                .filter(Boolean);
        }

        function exportFilteredExcel() {
            ADV.apply('familiesTable');
            return exportRowsToExcel(FAM_LABELS, filteredFamilyRows(), 'كشف_الأسر_المفلتر.xlsx', 'الأسر المفلترة');
        }

        /* ================= تعديل أي سجل من الإدارة (كل الكشوفات) ================= */
        const EDIT_TITLES = {db_families:'الأسرة', db_aids:'المساعدة', db_injured:'المصاب', db_orphans:'اليتيم', db_children:'الطفل', db_chronic:'المريض المزمن', db_fund:'القيد المالي', db_stock:'حركة المخزون'};
        function rowPortalKeys(dbKey, row) {
            if (!row) return [];
            const k = v => safeKey(digitsOf(v));
            const ks = dbKey === 'db_families' ? [k(row[2])]
                : dbKey === 'db_aids' || dbKey === 'db_injured' ? [k(row[1])]
                : dbKey === 'db_children' ? [k(row[5]), k(row[8])]
                : dbKey === 'db_orphans' ? [k(row[4]), k(row[7])]
                : dbKey === 'db_chronic' ? [k(row[1])] : [];
            return ks.filter(Boolean);
        }
        function editRecord(dbKey, index) {
            const labels = EXPORT_SCHEMAS[dbKey], db = getDB(dbKey), row = db[index];
            if (!labels || !row) { alert('تعذر العثور على السجل.'); return; }
            let h = '<h3>✏ تعديل بيانات ' + esc(EDIT_TITLES[dbKey] || 'السجل') + ' (سجل رقم ' + (index + 1) + ')</h3>'
                + '<div style="max-height:62vh;overflow:auto;padding:4px;"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">';
            labels.forEach((l, i) => {
                const v = formatCellForDB(dbKey, i, row[i]);
                const long = /ملاحظ|عنوان|الدواء/.test(l);
                h += '<div class="input-group" style="margin:0;' + (long ? 'grid-column:1/-1;' : '') + '"><label style="font-size:12px;font-weight:bold;">' + esc(l) + '</label>'
                    + '<input type="text" class="er-field" data-i="' + i + '" value="' + esc(v == null ? '' : v) + '"></div>';
            });
            h += '</div></div><div class="btnrow" style="margin-top:12px;"><button class="btn btn-green" onclick="saveEditRecord(\'' + dbKey + '\',' + index + ')">💾 حفظ التعديلات</button><button class="btn btn-blue" onclick="closeModal()">إلغاء</button></div>';
            openModal(h);
        }
        function saveEditRecord(dbKey, index) {
            const labels = EXPORT_SCHEMAS[dbKey], db = getDB(dbKey).slice(), old = db[index];
            if (!old) { closeModal(); return; }
            const raw = Array.from({length: labels.length}, (_, i) => old[i] == null ? '' : old[i]);
            document.querySelectorAll('#modalBox .er-field').forEach(el => { raw[parseInt(el.dataset.i, 10)] = el.value; });
            const row = normalizeImportedRow(dbKey, raw, labels.length);
            // الحقول التي لا تظهر في النموذج (إن وُجدت أعمدة زائدة في السجل القديم) تبقى كما هي
            for (let i = labels.length; i < old.length; i++) row[i] = old[i];
            if (dbKey === 'db_families') {
                if (!String(row[1] || '').trim() || !digitsOf(row[2])) { toast('⚠️ اسم الأسرة ورقم الهوية مطلوبان.'); return; }
                const idChanged = digitsOf(old[2]) !== digitsOf(row[2]);
                if (idChanged) {
                    if (db.some((f, i) => i !== index && f && digitsOf(f[2]) === digitsOf(row[2])) && !confirm('⚠️ توجد أسرة أخرى بنفس رقم الهوية. هل تريد المتابعة رغم التكرار؟')) return;
                    if (!confirm('⚠️ تغيير رقم هوية رب الأسرة يغيّر حساب بوابتها (اسم الدخول). تأكد من إبلاغ الأسرة. هل تريد المتابعة؟')) return;
                }
            }
            if (dbKey === 'db_children') { const w = linkChildRow(row); if (w && !confirm(w)) return; }
            db[index] = row;
            const keys = Array.from(new Set(rowPortalKeys(dbKey, old).concat(rowPortalKeys(dbKey, row))));
            saveDB(dbKey, db, keys.length ? keys : undefined).then(() => {
                audit('تعديل سجل', dbKey + ' | ' + (row[0] || row[1] || '') + ' | #' + (index + 1));
                closeModal();
                const act = document.querySelector('.tab-content.active-tab');
                if (act) refreshNow();
                toast('✅ تم حفظ التعديلات.');
            }).catch(() => {});
        }

        function deleteRecord(dbKey, index) {
            if (isLimited) { alert('⛔ ليست لديك صلاحية الحذف.'); return; }
            const cur = getDB(dbKey), r = cur[index];
            if (!r) { toast('⚠️ تعذر العثور على السجل (ربما حُذف مسبقاً).'); return; }
            const label = String(r[1] || r[0] || '').trim();
            if (!confirm('هل أنت متأكد من حذف هذا السجل؟' + (label ? '\n\n' + label : '') + famDeleteNote(dbKey, r))) return;
            const db = cur.slice(); db.splice(index, 1);
            saveDB(dbKey, db).then(() => {
                audit('حذف سجل', dbKey + ' | ' + label);
                toast('تم حذف السجل');
                refreshNow();
            }).catch(() => { localDB[dbKey] = cur; });
        }

        function normalizeExcelHeader(v) {
            return toLatin(String(v==null?'':v)).replace(/\uFEFF/g,'').replace(/[\s\u200f\u200e]+/g,' ').trim().toLowerCase();
        }
        function rowHasData(row) {
            return Array.isArray(row) && row.some(v => String(v==null?'':v).trim() !== '');
        }
        function stripExcelIndexAndActions(row, header) {
            let r = row.slice();
            let h = header.slice();
            const first = normalizeExcelHeader(h[0]);
            if (first === '#' || first === 'رقم' || first === 'الرقم' || first === 'ت') { r.shift(); h.shift(); }
            const last = normalizeExcelHeader(h[h.length-1]);
            if (['حذف','إجراءات','الاجراءات','خيارات','الخيارات'].includes(last)) { r.pop(); h.pop(); }
            return {row:r,header:h};
        }
        // استيراد آمن لتجربة أول خمس أسر فقط من ورقة "الرئيسية".
        // الصف الرابع عناوين، الخامس فئات الجنس، والبيانات تبدأ من الصف السادس.
        function mapCampFirstFive(rows) {
            const hdr = rows[3] || [];
            if (normalizeExcelHeader(hdr[1]) !== normalizeExcelHeader('اسم رب الأسرة رباعي') ||
                normalizeExcelHeader(hdr[2]) !== normalizeExcelHeader('رقم الهوية')) return null;
            const output = [], warnings = [];
            const v = (r, i) => r[i] == null ? '' : r[i];
            const txt = x => String(x == null ? '' : x).trim();
            const number = x => { const n = Number(toLatin(txt(x))); return Number.isFinite(n) ? n : 0; };
            for (let i = 5; i < rows.length && output.length < 5; i++) {
                const r = rows[i] || [];
                if (!txt(v(r,1)) || !digitsOf(v(r,2))) continue;
                const f = new Array(41).fill('');
                f[0]='G'; f[1]=txt(v(r,1)); f[2]=digitsOf(v(r,2)); f[3]=txt(v(r,3));
                f[5]=txt(v(r,4)); f[6]=txt(v(r,5)); f[7]=txt(v(r,6));
                f[8]=txt(v(r,7)); f[9]=digitsOf(v(r,8)); f[11]=txt(v(r,9)); f[12]=digitsOf(v(r,10));
                for (let j=0; j<12; j++) f[14+j] = number(v(r,11+j));
                f[26]=number(v(r,23)); f[27]=txt(v(r,24)); f[28]=txt(v(r,25));
                f[29]=txt(v(r,26)); f[30]=txt(v(r,27)); f[31]=txt(v(r,28));
                f[32]=txt(v(r,29)); f[33]=txt(v(r,30)); f[34]=txt(v(r,31));
                f[35]=number(v(r,32)); f[36]=number(v(r,33));
                f[37]=txt(v(r,34)); f[38]=txt(v(r,35)); f[39]=txt(v(r,36));
                const counted=f.slice(14,26).reduce((a,b)=>a+number(b),0);
                if (counted !== number(f[26])) warnings.push('السطر ' + (i+1) + ': مجموع الفئات '+counted+' ≠ العدد الكلي '+f[26]);
                output.push(f);
            }
            return {output, warnings};
        }
        function importExcel(event, dbKey, fieldCount) {
            const file = event.target.files[0]; if (!file) return;
            const input = event.target, reader = new FileReader();
            reader.onerror = () => { toast('❌ تعذر قراءة الملف.'); input.value = ''; };
            reader.onload = async function(e) {
                if (!await loadExcel()) { input.value = ''; return; }
                try {
                    const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array', cellDates:true, raw:true});
                    // أول ورقة تحتوي بيانات فعلية (وليس بالضرورة الأولى)
                    let json = null;
                    for (const nm of wb.SheetNames) {
                        const j = XLSX.utils.sheet_to_json(wb.Sheets[nm], {header:1, raw:true, defval:''});
                        if (j.filter(rowHasData).length > 1) { json = j; break; }
                    }
                    if (!json) { toast('⚠️ الملف فارغ أو يحتوي على العناوين فقط.'); return; }
                    const campResult = dbKey === 'db_families' ? mapCampFirstFive(json) : null;
                    let headerIndex = 0;
                    while (headerIndex < json.length && !rowHasData(json[headerIndex])) headerIndex++;
                    const header = json[headerIndex].map(v => String(v == null ? '' : v));

                    // 1) إن تطابقت عناوين الملف مع عناوين الكشف نستورد بالاسم (مهما كان ترتيب الأعمدة)
                    const labels = EXPORT_SCHEMAS[dbKey] || [];
                    const labelIdx = new Map(labels.map((l, i) => [normalizeExcelHeader(l), i]));
                    let matched = 0;
                    const colMap = header.map(h => { const i = labelIdx.get(normalizeExcelHeader(h)); if (i !== undefined) matched++; return i === undefined ? -1 : i; });
                    const byName = matched >= Math.max(3, Math.ceil(labels.length * 0.5));

                    let imported = [];
                    if (campResult) imported = campResult.output;
                    else for (let i = headerIndex + 1; i < json.length; i++) {
                        const raw = json[i];
                        if (!rowHasData(raw)) continue;
                        const out = new Array(fieldCount).fill('');
                        if (byName) {
                            raw.forEach((v, j) => { const k = colMap[j]; if (k !== undefined && k >= 0 && k < fieldCount && v != null) out[k] = v; });
                        } else {
                            const row = stripExcelIndexAndActions(raw, header).row;
                            for (let j = 0; j < fieldCount; j++) out[j] = (row[j] === undefined || row[j] === null) ? '' : row[j];
                        }
                        if (!rowHasData(out)) continue;
                        imported.push(normalizeImportedRow(dbKey, out, fieldCount));
                    }
                    if (!imported.length) { toast('⚠️ لم يتم العثور على سجلات صالحة للاستيراد.'); return; }

                    // 2) منع تكرار الأسر (نفس رقم الهوية موجود أو مكرر داخل الملف)
                    let skipped = 0;
                    if (dbKey === 'db_families') {
                        const have = new Set(getDB('db_families').map(f => digitsOf(f && f[2])).filter(Boolean));
                        const seen = new Set(), keep = [];
                        imported.forEach(r => { const id = digitsOf(r[2]); if (id && (have.has(id) || seen.has(id))) { skipped++; return; } if (id) seen.add(id); keep.push(r); });
                        imported = keep;
                        if (!imported.length) { toast('⚠️ كل السجلات في الملف مكررة (أرقام هويات موجودة مسبقاً).'); return; }
                    }
                    const msg = 'سيتم استيراد ' + imported.length + ' سجل'
                        + (skipped ? ' (تخطي ' + skipped + ' سجل مكرر بنفس رقم الهوية)' : '')
                        + '\nطريقة مطابقة الأعمدة: ' + (campResult ? 'الكشف الأصلي (أول خمس أسر، القاطع G)' : (byName ? 'حسب أسماء العناوين' : 'حسب ترتيب الأعمدة'))
                        + (campResult && campResult.warnings.length ? '\n⚠️ اختلافات أعداد الأسرة:\n' + campResult.warnings.join('\n') : '')
                        + '\n\nهل تريد المتابعة؟';
                    if (!confirm(msg)) return;

                    const current = getDB(dbKey);
                    rdb.ref(dbKey).transaction(cur => {
                        const arr = Array.isArray(cur) ? cur.slice() : (cur ? Object.values(cur) : []);
                        if (campResult) {
                            // أعد فحص التكرار داخل المعاملة لحماية الاستيراد من التزامن.
                            const usedIds = new Set(arr.map(r => digitsOf(r && r[2])).filter(Boolean));
                            const usedCodes = new Set(arr.map(r => String((r && r[40]) || '').toUpperCase()).filter(Boolean));
                            let next = 1;
                            for (const fam of imported) {
                                const id = digitsOf(fam[2]);
                                if (!id || usedIds.has(id)) continue;
                                let code;
                                do { code = 'G' + String(next++).padStart(4,'0'); }
                                while (usedCodes.has(code) && next <= 10001);
                                if (usedCodes.has(code) || next > 10001) return;
                                const added = fam.slice(); added[40] = code;
                                arr.push(added); usedIds.add(id); usedCodes.add(code);
                            }
                            return arr;
                        }
                        return arr.concat(imported);
                    }).then(result => {
                        const snapshot = result && result.snapshot ? result.snapshot : result;
                        localDB[dbKey] = snapshot && typeof snapshot.val === 'function' ? toRows(snapshot.val()) : current.concat(imported);
                        if (['db_families','db_aids','db_children','db_injured','db_orphans'].includes(dbKey)) schedulePublish();
                        updateBadgeCount();
                        audit('استيراد إكسل', dbKey + ' | ' + imported.length + ' سجل' + (skipped ? ' | تخطي مكرر ' + skipped : ''));
                        toast('✅ تم استيراد ' + imported.length + ' سجل بنجاح' + (skipped ? ' (تخطي ' + skipped + ' مكرر)' : ''));
                        refreshNow();
                    }).catch(err => {
                        console.error('importExcel error:', err);
                        alert('❌ تعذر الاستيراد إلى Firebase: ' + (err && err.message ? err.message : err));
                    });
                } catch (err) {
                    console.error('Excel parse error:', err);
                    alert('❌ تعذر قراءة ملف Excel: ' + (err && err.message ? err.message : err));
                } finally { input.value = ''; }
            };
            reader.readAsArrayBuffer(file);
        }

        function removeEmptyRows() {
            if (isLimited) { alert('⛔ ليست لديك صلاحية.'); return; }
            const keys = ['db_families','db_aids','db_injured','db_orphans','db_children','db_chronic','db_fund'];
            const plan = keys.map(k => {
                const all = getDB(k), arr = Array.isArray(all) ? all : Object.values(all || {});
                const kept = arr.filter(r => Array.isArray(r) && rowHasData(r));
                return {k, kept, removed: arr.length - kept.length};
            }).filter(x => x.removed > 0);
            if (!plan.length) { toast('✅ لا توجد سجلات فاضية.'); return; }
            const msg = plan.map(x => x.k + ': ' + x.removed + ' سجل فاضي').join('\n');
            if (!confirm('سيتم حذف السجلات الفاضية التالية نهائياً:\n\n' + msg + '\n\nهل تريد المتابعة؟')) return;
            Promise.all(plan.map(x => saveDB(x.k, x.kept))).then(() => {
                audit('حذف سجلات فاضية', plan.map(x => x.k + '=' + x.removed).join(' | '));
                toast('✅ تم حذف السجلات الفاضية.');
                refreshNow();
            }).catch(err => alert('❌ تعذر التنظيف: ' + (err.message || err)));
        }

        function loadFundTables() {
            const db = getDB('db_fund');
            const tbodyIn = document.querySelector('#fundInTable tbody');
            const tbodyOut = document.querySelector('#fundOutTable tbody');
            if (!tbodyIn || !tbodyOut) return;
            let hIn = '', hOut = '', inCount = 1, outCount = 1;
            // الفهرس هنا هو فهرس السجل الأصلي في قاعدة البيانات، حتى يعدّل/يحذف الزر السجل الصحيح
            db.forEach((row, index) => {
                if (!Array.isArray(row)) return;
                const isIncome = String(row[1] || '').includes('وارد');
                const long = row.length > 5;
                const party = long ? (row[3] || row[4] || '') : (row[3] || '');
                const notes = long ? (row[4] || row[5] || '') : (row[4] || '');
                const tr = '<tr><td>' + (isIncome ? inCount++ : outCount++) + '</td><td style="direction:ltr;">' + esc(row[0] || '') + '</td><td>' + esc(row[1] || '') + '</td><td style="font-weight:bold;">' + esc(row[2] || '') + ' ₪</td><td>' + esc(party) + '</td><td>' + esc(notes) + '</td><td style="white-space:nowrap"><button class="btn btn-blue" style="margin:0 0 0 4px;padding:4px 8px;font-size:11px;background:#b7791f;" onclick="editRecord(\'db_fund\',' + index + ')">✏ تعديل</button><button class="btn-red btn" style="margin:0;padding:4px 8px;font-size:11px;" onclick="deleteRecord(\'db_fund\',' + index + ')">حذف</button></td></tr>';
                if (isIncome) hIn += tr; else hOut += tr;
            });
            tbodyIn.innerHTML = hIn; tbodyOut.innerHTML = hOut;
            updateFundTotals(); filterFund();
        }

        function importFund(event, fundType) {
            const file=event.target.files[0]; if(!file)return;
            const input=event.target; const reader=new FileReader();
            reader.onload=async function(e){
                if (!await loadExcel()) { input.value = ''; return; }
                try {
                    const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array',cellDates:false,raw:true});
                    const sheet=wb.Sheets[wb.SheetNames[0]];
                    const json=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:''});
                    if(json.length<=1){toast('⚠️ الملف فارغ أو يحتوي على العناوين فقط!');return;}
                    let headerIndex=0; while(headerIndex<json.length && !rowHasData(json[headerIndex])) headerIndex++;
                    const imported=[];
                    for(let i=headerIndex+1;i<json.length;i++){
                        const raw=json[i]; if(!rowHasData(raw))continue;
                        const clean=stripExcelIndexAndActions(raw,json[headerIndex]); const r=clean.row;
                        if(!rowHasData(r))continue;
                        let start=0;
                        // يدعم ملف الصندوق الذي يحتوي: التاريخ، النوع، المبلغ، الجهة، الملاحظات
                        let typeCell=String(r[1]||'');
                        let date=r[0]||'', amount='', name='', notes='';
                        if(typeCell.includes('وارد')||typeCell.includes('صادر')) { amount=r[2]||''; name=r[3]||''; notes=r[4]||''; }
                        else { amount=r[1]||''; name=r[2]||''; notes=r[3]||''; }
                        const typeStr=(fundType==='in'?'وارد - استيراد':'صادر - استيراد');
                        imported.push([formatDateValue(date),typeStr,String(amount).replace(/[^\d.-]/g,''),String(name||''),String(notes||'')]);
                    }
                    if(!imported.length){toast('⚠️ لم يتم العثور على حركات صالحة.');return;}
                    rdb.ref('db_fund').transaction(cur=>{const arr=Array.isArray(cur)?cur.slice():(cur?Object.values(cur):[]);return arr.concat(imported);}).then(result=>{
                        const snap=result&&result.snapshot?result.snapshot:result;
                        localDB.db_fund=snap&&typeof snap.val==='function'?(snap.val()||[]):getDB('db_fund').concat(imported);
                        updateFundTotals(); loadFundTables(); audit('استيراد صندوق',(fundType==='in'?'وارد':'صادر')+' | '+imported.length+' حركة');
                        toast(`✅ تم استيراد ${imported.length} حركة مالية كـ ${fundType==='in'?'وارد':'صادر'} بنجاح!`);
                    }).catch(err=>alert('❌ تعذر الاستيراد إلى Firebase: '+(err.message||err)));
                }catch(err){console.error(err);alert('❌ تعذر قراءة ملف Excel: '+(err.message||err));}
                finally{input.value='';}
            };
            reader.readAsArrayBuffer(file);
        }

        // حسابات دقيقة للمبالغ بعد استخراج الأرقام الصافية فقط
        function updateFundTotals() {
            let totalIn = 0, totalOut = 0;
            getDB('db_fund').forEach(row => {
                if (!Array.isArray(row)) return;
                // toLatin: يدعم المبالغ المكتوبة بالأرقام العربية (٥٠٠) التي كانت تُحسب صفراً سابقاً
                const amount = parseFloat(toLatin(String(row[2] == null ? '' : row[2])).replace(/[^\d.\-]/g, '')) || 0;
                const type = String(row[1] || '');
                if (type.includes('وارد')) totalIn += amount; else if (type.includes('صادر')) totalOut += amount;
            });
            const fmt = n => (Math.round(n * 100) / 100).toLocaleString('en-US') + ' ₪';
            document.getElementById('totalIn').innerText = fmt(totalIn);
            document.getElementById('totalOut').innerText = fmt(totalOut);
            document.getElementById('totalBalance').innerText = fmt(totalIn - totalOut);
        }

        function filterFund() {
            let input = document.getElementById("fundSearch").value.toLowerCase();
            ['fundInTable', 'fundOutTable'].forEach(tableId => {
                let table = document.getElementById(tableId);
                if(table) {
                    let tr = table.getElementsByTagName("tr");
                    for (let i = 1; i < tr.length; i++) { 
                        let tdName = tr[i].getElementsByTagName("td")[4]; 
                        if (tdName) tr[i].style.display = (tdName.textContent || tdName.innerText).toLowerCase().indexOf(input) > -1 ? "" : "none";
                    }
                }
            });
        }


/* ==========================================================================
   وحدة التحسينات: إشعارات + حالة الاتصال + أمان التحديث + نظام الفلترة المتقدمة
   ========================================================================== */

/* ---------- تطبيع بيانات Firebase (يمنع انهيار الجداول عند وجود سجلات فارغة) ---------- */
function toRows(val) {
    if (!val) return [];
    const arr = Array.isArray(val) ? val : Object.values(val);
    const out = [];
    arr.forEach(r => {
        if (r == null) return;
        if (Array.isArray(r)) { out.push(r); return; }
        if (typeof r === 'object') {
            const all = Object.keys(r), keys = all.filter(k => /^\d+$/.test(k));
            // صف كشف محفوظ ككائن (أعمدة مرقمة فقط) نحوّله لمصفوفة؛ أما السجلات الكائنية الحقيقية
            // (مثل طلبات التعديل: id/name/newData) فتبقى كما هي ولا تُحذف.
            if (!all.length) return;
            if (keys.length && keys.length === all.length) {
                const max = Math.max.apply(null, keys.map(Number));
                out.push(Array.from({length: max + 1}, (_, i) => (r[i] == null ? '' : r[i])));
            } else out.push(r);
        }
    });
    return out;
}

/* ---------- إشعارات خفيفة ---------- */
function toast(msg, type, ms) {
    let host = document.getElementById('toastHost');
    if (!host) { host = document.createElement('div'); host.id = 'toastHost'; host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
    const el = document.createElement('div');
    if (!type) type = /^\s*⚠/u.test(msg) ? 'warn' : /^\s*[❌⛔]/u.test(msg) ? 'err' : '';
    el.className = 'toast-i' + (type === 'err' ? ' err' : type === 'warn' ? ' warn' : '');
    el.textContent = String(msg).replace(/^\s*[✅❌⚠⛔\uFE0F]+\s*/u, '');
    host.appendChild(el);
    while (host.children.length > 4) host.firstChild.remove();
    const life = ms || (type === 'err' ? 6500 : 3600);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, life);
}

/* ---------- تحديث التبويب الحالي بصمت (بدون إعادة تشغيل الحركة أو فقدان مكان التمرير) ---------- */
let _refT = null;
function refreshNow() {
    const a = document.querySelector('.tab-content.active-tab'); if (!a) return;
    const sc = document.querySelector('.content'), y = sc ? sc.scrollTop : 0;
    switchTab(a.id.split('-')[0], true);
    if (sc) sc.scrollTop = y;
}
const TAB_KEYS = {families: ['db_families', 'config', 'db_aids'], aids: ['db_aids', 'db_families'], injured: ['db_injured'], orphans: ['db_orphans'], children: ['db_children', 'db_families'], chronic: ['db_chronic'], fund: ['db_fund'], stock: ['db_stock', 'config'], reports: [], audit: ['db_audit'], ann: ['db_announcements'], passwords: ['db_passwords', 'pwvault', 'claims', 'db_families'], requests: ['db_edit_requests', 'db_complaints', 'db_children_reqs', 'db_chronic_reqs', 'db_injured_reqs', 'db_families', 'db_reqlog']};
// Keep receiving live Firebase updates, but avoid expensive DOM/table rebuilds
// while the admin tab is hidden. The next visible frame renders current localDB.
let _refreshPendingWhileHidden = false;
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && _refreshPendingWhileHidden) {
        _refreshPendingWhileHidden = false;
        refreshActive();
    }
});
function refreshActive(key) {
    const a0 = document.querySelector('.tab-content.active-tab'), tk = a0 && TAB_KEYS[a0.id.split('-')[0]];
    if (key && tk && !tk.includes(key)) return; // تحديث لا يخص الصفحة المفتوحة
    clearTimeout(_refT);
    if (document.hidden) { _refreshPendingWhileHidden = true; return; }
    _refT = setTimeout(() => {
        if (document.hidden) { _refreshPendingWhileHidden = true; return; }
        const m = document.getElementById('modalBg');
        if (m && m.classList.contains('show')) { refreshActive(); return; }
        refreshNow();
    }, 450);
}

/* ---------- حالة الاتصال ---------- */
(function netStatus() {
    const b = document.createElement('div'); b.id = 'netBanner'; b.setAttribute('role', 'alert');
    b.textContent = 'لا يوجد اتصال بالخادم — التعديلات لن تُحفظ حتى يعود الاتصال';
    document.body.appendChild(b);
    let t = null;
    try {
        rdb.ref('.info/connected').on('value', s => {
            clearTimeout(t);
            if (s.val() === true) b.classList.remove('show');
            else t = setTimeout(() => b.classList.add('show'), 3000);
        });
    } catch (e) { console.warn('net status unavailable', e); }
    window.addEventListener('offline', () => b.classList.add('show'));
})();

/* ---------- أخطاء غير متوقعة ---------- */
window.addEventListener('error', e => { console.error('Unhandled:', e.error || e.message); });
window.addEventListener('unhandledrejection', e => { console.error('Unhandled promise:', e.reason); toast('حدث خطأ غير متوقع، حاول مرة أخرى. إن تكرر أبلغ المسؤول.', 'err'); });

/* ---------- تحسينات التنقل ---------- */
function enhanceNav() {
    document.querySelectorAll('#sidebarMenu li').forEach(li => {
        if (li.dataset.enh || li.classList.contains('nav-group')) return;
        li.dataset.enh = '1'; li.setAttribute('role', 'button'); li.tabIndex = 0;
        li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); } });
    });
}
function addNavGroups() {
    [['nav-dashboard', 'نظرة عامة'], ['nav-requests', 'المتابعة'], ['nav-families', 'الكشوفات'], ['nav-fund', 'المالية'], ['nav-audit', 'النظام']].forEach(([id, label]) => {
        const li = document.getElementById(id); if (!li || li.previousElementSibling && li.previousElementSibling.classList.contains('nav-group')) return;
        const g = document.createElement('li'); g.className = 'nav-group'; g.setAttribute('aria-hidden', 'true'); g.textContent = label;
        li.parentNode.insertBefore(g, li);
    });
}
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const m = document.getElementById('modalBg'); if (m && m.classList.contains('show')) closeModal();
    toggleMenu(false);
});
document.addEventListener('DOMContentLoaded', () => { addNavGroups(); enhanceNav(); });

/* ---------- عدّاد الأرقام في لوحة المؤشرات (مرة واحدة فقط) ---------- */
(function statsCountUp() {
    let done = false;
    document.addEventListener('DOMContentLoaded', () => {
        const host = document.getElementById('dashContent'); if (!host) return;
        new MutationObserver(() => {
            if (done || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            const els = host.querySelectorAll('.stat b'); if (!els.length) return;
            done = true;
            els.forEach(el => {
                const txt = el.textContent.trim(), m = txt.match(/^(-?[\d,]+(?:\.\d+)?)(.*)$/);
                if (!m) return;
                const target = parseFloat(m[1].replace(/,/g, '')), suffix = m[2];
                if (!isFinite(target) || target === 0) return;
                const t0 = performance.now(), dur = 700, dec = (m[1].split('.')[1] || '').length;
                (function step(t) {
                    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
                    el.textContent = (target * e).toFixed(dec) + suffix;
                    if (p < 1) requestAnimationFrame(step); else el.textContent = txt;
                })(t0);
            });
        }).observe(host, {childList: true});
    });
})();

/* ==========================================================================
   نظام الفلترة المتقدمة: يعمل على كل جدول، والمعايير يحددها المستخدم لكل كشف
   ========================================================================== */
const ADV = (function () {
    const TEXT_OPS = [['contains', 'يحتوي'], ['not_contains', 'لا يحتوي'], ['equals', 'يساوي'], ['starts', 'يبدأ بـ'], ['in', 'اختيار قيم من القائمة'], ['empty', 'فارغ'], ['not_empty', 'غير فارغ']];
    const NUM_OPS = [['eq', 'يساوي'], ['neq', 'لا يساوي'], ['gt', 'أكبر من'], ['gte', 'أكبر أو يساوي'], ['lt', 'أصغر من'], ['lte', 'أصغر أو يساوي'], ['between', 'بين'], ['empty', 'فارغ'], ['not_empty', 'غير فارغ']];
    const DATE_OPS = [['age_between', 'العمر بين (سنة)'], ['age_gt', 'العمر أكبر من (سنة)'], ['age_lt', 'العمر أصغر من (سنة)'], ['after', 'بعد تاريخ'], ['before', 'قبل تاريخ'], ['date_between', 'بين تاريخين'], ['month', 'الشهر'], ['empty', 'فارغ'], ['not_empty', 'غير فارغ']];
    const EXACT_VALUES = ['in', 'اختيار قيم من القائمة'];
    const OPS = {text: TEXT_OPS, number: [...NUM_OPS, EXACT_VALUES], date: [...DATE_OPS, EXACT_VALUES]};
    const NO_VALUE = ['empty', 'not_empty'];
    const SKIP_HEAD = /^(#|إجراء|الإجراءات|اجراءات|إجراءات|خيارات|الخيارات|حذف|عرض|تحكم)$/;
    const DATE_RE = /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}$|^\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}$/;
    const MONTHS = ['كانون الثاني (1)', 'شباط (2)', 'آذار (3)', 'نيسان (4)', 'أيار (5)', 'حزيران (6)', 'تموز (7)', 'آب (8)', 'أيلول (9)', 'تشرين الأول (10)', 'تشرين الثاني (11)', 'كانون الأول (12)'];
    const states = {};

    const parseDate = value => {
        const text = toLatin(String(value || '')).trim();
        const dmy = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
        const ymd = text.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
        if (!dmy && !ymd) return null;
        const [d, m, y] = dmy ? dmy.slice(1).map(Number) : ymd.slice(1).map(Number).reverse();
        const date = new Date(y, m - 1, d);
        return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? {d, m, y} : null;
    };
    const ageYears = dt => {
        const n = new Date(); let a = n.getFullYear() - dt.y;
        if (n.getMonth() + 1 < dt.m || (n.getMonth() + 1 === dt.m && n.getDate() < dt.d)) a--;
        return a;
    };
    function completedAge(value) {
        const date = parseDate(value);
        if (!date) return '';
        const age = ageYears(date);
        return age >= 0 ? String(age) : '';
    }
    const dateNum = dt => dt.y * 10000 + dt.m * 100 + dt.d;
    const isoNum = iso => { const p = String(iso || '').split('-'); return p.length === 3 ? (+p[0]) * 10000 + (+p[1]) * 100 + (+p[2]) : NaN; };
    const toNum = s => { const v = parseFloat(toLatin(String(s || '')).replace(/[^\d.\-]/g, '')); return isNaN(v) ? NaN : v; };
    const cellText = td => (td ? td.textContent : '').trim();

    function tableInfo(table) {
        const head = table.tHead && table.tHead.rows[0]; if (!head) return null;
        const cols = [];
        Array.from(head.cells).forEach((th, i) => {
            const label = th.textContent.trim();
            if (!label || SKIP_HEAD.test(label)) return;
            cols.push({i, label, type: 'text'});
        });
        return cols.length >= 2 ? {cols, width: head.cells.length} : null;
    }
    function dataRows(table, width) {
        const tb = table.tBodies[0]; if (!tb) return [];
        return Array.from(tb.rows).filter(tr => tr.cells.length >= width && !Array.from(tr.cells).some(td => td.colSpan > 1));
    }
    function rowsText(table, info) { const tb = table.tBodies[0]; if (tb && tb.__V) return tb.__V.cells; return dataRows(table, info.width).map(tr => Array.from(tr.cells).map(cellText)); }
    function detectTypes(table, info) {
        const rows = rowsText(table, info).slice(0, 400);
        info.cols.forEach(c => {
            if (/العمر/.test(c.label)) { c.type = 'number'; return; }
            if (/ميلاد|التاريخ/.test(c.label)) { c.type = 'date'; return; }
            if (/الهوية|هوية|جوال|هاتف|الكود/.test(c.label)) { c.type = 'text'; return; }
            const vals = [];
            rows.forEach(r => { const t = toLatin(String(r[c.i] == null ? '' : r[c.i]).trim()); if (t) vals.push(t); });
            c.filled = vals.length;
            if (vals.length < 2) { c.type = 'text'; return; }
            const dates = vals.filter(v => DATE_RE.test(v)).length;
            const nums = vals.filter(v => /^-?[\d,]*\.?\d+\s*(₪|%)?$/.test(v) && v.replace(/\D/g, '').length < 9).length;
            c.type = dates / vals.length >= .8 ? 'date' : nums / vals.length >= .8 ? 'number' : 'text';
        });
    }
    function distinct(table, info, c) {
        const map = new Map();
        rowsText(table, info).forEach(r => { const t = String(r[c.i] == null ? '' : r[c.i]).trim(); if (t) map.set(t, (map.get(t) || 0) + 1); });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar'));
    }

    function testCond(cond, text, type) {
        const t = text.trim(), op = cond.op;
        if (op === 'empty') return t === '';
        if (op === 'not_empty') return t !== '';
        if (op === 'in') return !cond.vals?.length || cond.vals.some(value => value === t);
        if (type === 'number') {
            const v = toNum(t); if (isNaN(v)) return false;
            const a = parseFloat(cond.v1), b = parseFloat(cond.v2);
            switch (op) {
                case 'eq': return isNaN(a) ? true : v === a;
                case 'neq': return isNaN(a) ? true : v !== a;
                case 'gt': return isNaN(a) ? true : v > a;
                case 'gte': return isNaN(a) ? true : v >= a;
                case 'lt': return isNaN(a) ? true : v < a;
                case 'lte': return isNaN(a) ? true : v <= a;
                case 'between': return (isNaN(a) || v >= a) && (isNaN(b) || v <= b);
            }
            return true;
        }
        if (type === 'date') {
            const dt = parseDate(t); if (!dt) return false;
            const a = parseFloat(cond.v1), b = parseFloat(cond.v2), age = ageYears(dt);
            if (op.startsWith('age_') && age < 0) return false;
            switch (op) {
                case 'age_between': return (isNaN(a) || age >= a) && (isNaN(b) || age <= b);
                case 'age_gt': return isNaN(a) ? true : age > a;
                case 'age_lt': return isNaN(a) ? true : age < a;
                case 'after': { const x = isoNum(cond.v1); return isNaN(x) ? true : dateNum(dt) > x; }
                case 'before': { const x = isoNum(cond.v1); return isNaN(x) ? true : dateNum(dt) < x; }
                case 'date_between': { const x = isoNum(cond.v1), y = isoNum(cond.v2), n = dateNum(dt); return (isNaN(x) || n >= x) && (isNaN(y) || n <= y); }
                case 'month': return !cond.v1 ? true : dt.m === +cond.v1;
            }
            return true;
        }
        const n = normAr(t);
        switch (op) {
            case 'contains': return !cond.v1 ? true : matchTokens(t, cond.v1);
            case 'not_contains': return !cond.v1 ? true : !matchTokens(t, cond.v1);
            case 'equals': return !cond.v1 || (t && n === normAr(cond.v1));
            case 'starts': return !cond.v1 ? true : n.startsWith(normAr(cond.v1));
        }
        return true;
    }
    const isActiveCond = c => c && c.col != null && (NO_VALUE.includes(c.op) || (c.vals && c.vals.length) || String(c.v1 || '') !== '' || String(c.v2 || '') !== '');

    function apply(tableId) {
        const st = states[tableId]; if (!st) return;
        const table = document.getElementById(tableId); if (!table) return;
        const info = tableInfo(table); if (!info) return;
        { const tbv = table.tBodies[0]; if (tbv && tbv.__V) { VT.render(tbv); return; } }
        const filter = predicate(tableId);
        const active = st.conds.filter(isActiveCond);
        const rows = dataRows(table, info.width);
        let shown = 0;
        rows.forEach(tr => {
            const ok = !filter || filter(Array.from(tr.cells).map(cellText));
            tr.classList.toggle('adv-hide', !ok);
            if (ok && tr.style.display !== 'none') shown++;
        });
        const tb = table.tBodies[0];
        let empty = tb.querySelector('tr.adv-empty');
        if (!rows.length && !tb.querySelector('tr:not(.adv-empty)')) {
            if (!empty) { empty = document.createElement('tr'); empty.className = 'adv-empty'; empty.innerHTML = '<td colspan="' + info.width + '">📭 لا توجد سجلات في هذا الكشف بعد.</td>'; tb.appendChild(empty); }
        } else if (filter && rows.length && !shown) {
            if (!empty) { empty = document.createElement('tr'); empty.className = 'adv-empty'; empty.innerHTML = '<td colspan="' + info.width + '">لا توجد نتائج مطابقة للمعايير الحالية. جرّب تخفيف الشروط أو اختر «أي شرط».</td>'; tb.appendChild(empty); }
        } else if (empty) empty.remove();
        const box = document.querySelector('.adv[data-for="' + tableId + '"]'); if (!box) return;
        box.querySelector('.adv-result').innerHTML = rows.length ? 'النتائج: <b>' + shown + '</b> من ' + rows.length : '';
        const cnt = box.querySelector('.adv-count'); cnt.textContent = active.length || '';
        // مزامنة العدّادات القديمة (عدد الأسر المعروضة / النتائج المطابقة)
        const legacy = tableId === 'familiesTable' ? document.getElementById('famCount') : document.getElementById(tableId + 'Count');
        if (legacy) legacy.textContent = (tableId === 'familiesTable' ? 'عدد الأسر المعروضة: ' + shown + ' من ' + rows.length : (shown === rows.length ? 'إجمالي السجلات: ' + rows.length : 'النتائج المطابقة: ' + shown));
    }

    const storeKey = id => 'adv:v1:' + id;
    const loadPresets = id => { try { return JSON.parse(localStorage.getItem(storeKey(id)) || '[]'); } catch (e) { return []; } };
    const savePresets = (id, arr) => { try { localStorage.setItem(storeKey(id), JSON.stringify(arr)); } catch (e) { toast('تعذر حفظ المعيار على هذا المتصفح', 'err'); } };

    function renderChips(tableId) {
        const box = document.querySelector('.adv[data-for="' + tableId + '"]'), st = states[tableId];
        const wrap = box.querySelector('.adv-chips'); wrap.innerHTML = '';
        loadPresets(tableId).forEach((p, idx) => {
            const chip = document.createElement('span'); chip.className = 'adv-chip' + (st.preset === idx ? ' on' : '');
            const b = document.createElement('button'); b.type = 'button'; b.textContent = p.name;
            b.addEventListener('click', () => {
                if (st.preset === idx) { st.preset = null; st.conds = []; }
                else { st.preset = idx; st.match = p.match || 'all'; st.conds = JSON.parse(JSON.stringify(p.conds || [])); }
                renderChips(tableId); renderPanel(tableId); apply(tableId);
            });
            const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '✕'; x.title = 'حذف هذا المعيار';
            x.addEventListener('click', () => {
                if (!confirm('حذف المعيار المحفوظ «' + p.name + '»؟')) return;
                const arr = loadPresets(tableId); arr.splice(idx, 1); savePresets(tableId, arr);
                if (st.preset === idx) st.preset = null; else if (st.preset > idx) st.preset--;
                renderChips(tableId);
            });
            chip.appendChild(b); chip.appendChild(x); wrap.appendChild(chip);
        });
    }

    function opSelect(type, cur) {
        const s = document.createElement('select'); s.setAttribute('aria-label', 'نوع الشرط');
        OPS[type].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; if (v === cur) o.selected = true; s.appendChild(o); });
        return s;
    }

    function renderPanel(tableId) {
        const box = document.querySelector('.adv[data-for="' + tableId + '"]'), st = states[tableId], table = document.getElementById(tableId);
        const host = box.querySelector('.adv-box'); host.innerHTML = '';
        const info = tableInfo(table); if (!info) { host.textContent = 'لا توجد أعمدة قابلة للفلترة.'; return; }
        detectTypes(table, info);
        const colBy = new Map(info.cols.map(c => [c.i, c]));
        const onChange = () => { st.preset = null; clearTimeout(st.t); st.t = setTimeout(() => {
            if (table.tBodies[0].__V) table.tBodies[0].__V.page = 0;
            apply(tableId); renderChips(tableId);
        }, 120); };

        const head = document.createElement('div'); head.className = 'adv-head';
        head.innerHTML = '<span>اعرض السجلات التي تطابق</span>';
        const ms = document.createElement('select');
        ms.innerHTML = '<option value="all">كل الشروط معاً</option><option value="any">أي شرط منها</option>'; ms.value = st.match;
        ms.addEventListener('change', () => { st.match = ms.value; onChange(); });
        head.appendChild(ms); host.appendChild(head);

        if (!st.conds.length) st.conds.push({col: info.cols[0].i, op: 'contains', v1: '', v2: '', vals: []});
        st.conds.forEach((cond, ci) => {
            if (!colBy.has(cond.col)) cond.col = info.cols[0].i;
            const col = colBy.get(cond.col); cond.type = col.type;
            if (!OPS[col.type].some(o => o[0] === cond.op)) { cond.op = OPS[col.type][0][0]; cond.v1 = cond.v2 = ''; cond.vals = []; }
            const row = document.createElement('div'); row.className = 'adv-cond';
            const cs = document.createElement('select'); cs.setAttribute('aria-label', 'العمود');
            info.cols.forEach(c => { const o = document.createElement('option'); o.value = c.i; o.textContent = c.label + (c.type === 'date' ? ' 📅' : c.type === 'number' ? ' #' : ''); if (c.i === cond.col) o.selected = true; cs.appendChild(o); });
            cs.addEventListener('change', () => { cond.col = +cs.value; cond.op = OPS[colBy.get(cond.col).type][0][0]; cond.v1 = cond.v2 = ''; cond.vals = []; renderPanel(tableId); onChange(); });
            const os = opSelect(col.type, cond.op);
            os.addEventListener('change', () => { cond.op = os.value; cond.v1 = cond.v2 = ''; cond.vals = []; renderPanel(tableId); onChange(); });
            row.appendChild(cs); row.appendChild(os);

            const vwrap = document.createElement('div'); vwrap.className = 'adv-vals';
            const mk = (type, key, ph) => { const i = document.createElement('input'); i.type = type; i.placeholder = ph || ''; i.value = cond[key] || ''; if (type === 'number') i.inputMode = 'decimal'; i.addEventListener('input', () => { cond[key] = i.value; onChange(); }); return i; };
            if (NO_VALUE.includes(cond.op)) { /* بدون قيمة */ }
            else if (cond.op === 'in') {
                const vals = distinct(table, info, col);
                const search = document.createElement('input');
                search.type = 'search'; search.placeholder = 'ابحث في قيم العمود';
                search.setAttribute('aria-label', 'ابحث في قيم العمود');
                const list = document.createElement('div'); list.className = 'adv-list';
                const summary = document.createElement('small');
                const redraw = () => {
                    list.replaceChildren();
                    const selected = new Set(cond.vals || []);
                    const matching = vals.filter(([value]) => matchTokens(value, search.value));
                    summary.textContent = matching.length + ' قيمة مطابقة · ' + selected.size + ' مختارة' +
                        (matching.length > 100 ? ' · ضيّق البحث لعرض قيم أخرى' : '');
                    matching.slice(0, 100).forEach(([value, count]) => {
                        const label = document.createElement('label'), checkbox = document.createElement('input');
                        checkbox.type = 'checkbox'; checkbox.checked = selected.has(value);
                        checkbox.addEventListener('change', () => {
                            if (checkbox.checked) selected.add(value); else selected.delete(value);
                            cond.vals = [...selected];
                            summary.textContent = matching.length + ' قيمة مطابقة · ' + selected.size + ' مختارة';
                            onChange();
                        });
                        const text = document.createElement('span'); text.textContent = value;
                        const total = document.createElement('em'); total.textContent = count;
                        label.append(checkbox, text, total); list.appendChild(label);
                    });
                };
                search.addEventListener('input', redraw);
                vwrap.append(search, summary, list); row.appendChild(vwrap); redraw();
            } else {
                if (col.type === 'number') { vwrap.appendChild(mk('number', 'v1', 'القيمة')); if (cond.op === 'between') { const s = document.createElement('span'); s.className = 'sep'; s.textContent = 'إلى'; vwrap.appendChild(s); vwrap.appendChild(mk('number', 'v2', 'القيمة')); } }
                else if (col.type === 'date') {
                    if (cond.op === 'age_between') { vwrap.appendChild(mk('number', 'v1', 'من')); const s = document.createElement('span'); s.className = 'sep'; s.textContent = 'إلى'; vwrap.appendChild(s); vwrap.appendChild(mk('number', 'v2', 'إلى')); }
                    else if (cond.op === 'age_gt' || cond.op === 'age_lt') vwrap.appendChild(mk('number', 'v1', 'السنوات'));
                    else if (cond.op === 'month') {
                        const ms2 = document.createElement('select'); ms2.innerHTML = '<option value="">اختر الشهر</option>' + MONTHS.map((m, i) => '<option value="' + (i + 1) + '">' + m + '</option>').join(''); ms2.value = cond.v1 || '';
                        ms2.addEventListener('change', () => { cond.v1 = ms2.value; onChange(); }); vwrap.appendChild(ms2);
                    }
                    else { vwrap.appendChild(mk('date', 'v1')); if (cond.op === 'date_between') { const s = document.createElement('span'); s.className = 'sep'; s.textContent = 'إلى'; vwrap.appendChild(s); vwrap.appendChild(mk('date', 'v2')); } }
                } else vwrap.appendChild(mk('text', 'v1', 'القيمة'));
                row.appendChild(vwrap);
            }
            if (row.children.length < 3) row.appendChild(document.createElement('span'));
            const del = document.createElement('button'); del.type = 'button'; del.className = 'adv-del'; del.title = 'حذف الشرط'; del.setAttribute('aria-label', 'حذف الشرط'); del.textContent = '✕';
            del.addEventListener('click', () => { st.conds.splice(ci, 1); renderPanel(tableId); onChange(); });
            row.appendChild(del); host.appendChild(row);
        });

        const foot = document.createElement('div'); foot.className = 'adv-foot';
        const add = document.createElement('button'); add.type = 'button'; add.textContent = '＋ إضافة شرط';
        add.addEventListener('click', () => { st.conds.push({col: info.cols[0].i, op: 'contains', v1: '', v2: '', vals: []}); renderPanel(tableId); });
        const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'مسح الكل';
        clear.addEventListener('click', () => { st.conds = []; st.preset = null; renderPanel(tableId); apply(tableId); renderChips(tableId); });
        const nm = document.createElement('input'); nm.type = 'text'; nm.placeholder = 'اسم المعيار للحفظ'; nm.maxLength = 40; nm.setAttribute('aria-label', 'اسم المعيار');
        const save = document.createElement('button'); save.type = 'button'; save.className = 'primary'; save.textContent = 'حفظ كمعيار';
        save.addEventListener('click', () => {
            const name = nm.value.trim(); const act = st.conds.filter(isActiveCond);
            if (!act.length) { toast('أضف شرطاً واحداً على الأقل قبل الحفظ', 'warn'); return; }
            if (!name) { toast('اكتب اسماً للمعيار أولاً', 'warn'); nm.focus(); return; }
            const arr = loadPresets(tableId), i = arr.findIndex(p => p.name === name);
            const rec = {name, match: st.match, conds: JSON.parse(JSON.stringify(act))};
            if (i >= 0) { if (!confirm('يوجد معيار بنفس الاسم. استبداله؟')) return; arr[i] = rec; } else arr.push(rec);
            savePresets(tableId, arr); st.preset = i >= 0 ? i : arr.length - 1; nm.value = ''; renderChips(tableId); toast('تم حفظ المعيار «' + name + '»');
        });
        const hint = document.createElement('span'); hint.className = 'adv-hint'; hint.textContent = 'المعايير المحفوظة تُخزَّن على هذا الجهاز فقط';
        foot.appendChild(add); foot.appendChild(clear); foot.appendChild(nm); foot.appendChild(save); foot.appendChild(hint);
        host.appendChild(foot);
    }

    function predicate(tableId) {
        const st = states[tableId]; if (!st) return null;
        const table = document.getElementById(tableId), info = table && tableInfo(table); if (!info) return null;
        const ageColumn = info.cols.find(column => column.label === 'العمر (سنوات)');
        const ageFilter = ageColumn && st.age && (st.age.min !== '' || st.age.max !== '');
        const colMap = new Map(info.cols.map(c => [c.i, c]));
        const active = st.conds.filter(isActiveCond).filter(c => colMap.has(c.col));
        if (!ageFilter && !active.length) return null;
        if (active.some(condition => !condition.type)) detectTypes(table, info);
        return cells => {
            if (ageFilter && !testCond({op:'between', v1:st.age.min, v2:st.age.max}, String(cells[ageColumn.i] ?? ''), 'number')) return false;
            if (!active.length) return true;
            const matches = c => testCond(c, String(cells[c.col] ?? ''), c.type || colMap.get(c.col).type);
            return st.match === 'any' ? active.some(matches) : active.every(matches);
        };
    }
    function activeCount(id) { const st = states[id]; return st ? st.conds.filter(isActiveCond).length : 0; }
    function visibleData(tableId) {
        apply(tableId);
        const table = document.getElementById(tableId), info = tableInfo(table);
        { const tb0 = table.tBodies[0]; if (tb0 && tb0.__V) { const V = tb0.__V, pr = predicate(tableId); const keep = V.cells.filter((c, i) => (!V.familyFilter || V.familyFilter(i)) && (!V.q || matchTokens(V.txt[i], V.q)) && (!pr || pr(c))); return {headers: info.cols.map(c => c.label), rows: keep.map(r => info.cols.map(c => r[c.i]))}; } }
        const rows = dataRows(table, info.width).filter(tr => !tr.classList.contains('adv-hide') && tr.style.display !== 'none');
        return {headers: info.cols.map(c => c.label), rows: rows.map(tr => info.cols.map(c => cellText(tr.cells[c.i])))};
    }
    function sheetTitle(table) {
        const tab = table.closest('.tab-content'), h = tab && tab.querySelector('h1');
        return (h ? h.textContent : 'كشف').replace(/[^\u0600-\u06FFA-Za-z0-9 ]/g, '').trim().replace(/\s+/g, '_') || 'كشف';
    }
    async function doExport(tableId, filename) {
        const d = visibleData(tableId);
        if (!d.rows.length) { toast('لا توجد نتائج لتصديرها', 'warn'); return; }
        if (!await loadExcel()) return;
        const outputName = filename || sheetTitle(document.getElementById(tableId)) + '_نتائج_مفلترة_' + today() + '.xlsx';
        await exportRowsToExcel(d.headers, d.rows, outputName, 'النتائج');
        toast('تم تصدير ' + d.rows.length + ' سجل');
    }
    function doPrint(tableId) {
        const d = visibleData(tableId);
        if (!d.rows.length) { toast('لا توجد نتائج للطباعة', 'warn'); return; }
        const w = window.open('', '_blank'); if (!w) { toast('اسمح بالنوافذ المنبثقة للطباعة', 'warn'); return; }
        const title = sheetTitle(document.getElementById(tableId)).replace(/_/g, ' ');
        w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>body{font-family:Tahoma,Arial,sans-serif;padding:18px}h2{margin:0 0 4px}p{margin:0 0 12px;color:#555;font-size:13px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #999;padding:5px 7px;text-align:right}th{background:#eee}</style></head><body><h2>' + esc(title) + '</h2><p>عدد السجلات: ' + d.rows.length + ' — ' + esc(new Date().toLocaleDateString('en-GB')) + '</p><table><thead><tr><th>#</th>' + d.headers.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' + d.rows.map((r, i) => '<tr><td>' + (i + 1) + '</td>' + r.map(v => '<td>' + esc(v) + '</td>').join('') + '</tr>').join('') + '</tbody></table></body></html>');
        w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
    }

    function mount(table) {
        const id = table.id; if (!id || states[id]) return;
        const info = tableInfo(table); if (!info) return;
        states[id] = {match: 'all', conds: [], preset: null, t: null};
        const wrap = table.closest('.table-responsive') || table;
        const box = document.createElement('div'); box.className = 'adv'; box.dataset.for = id;
        box.innerHTML = '<div class="adv-bar"><button type="button" class="adv-toggle" aria-expanded="false">🎯 فلترة متقدمة<span class="adv-count"></span></button><div class="adv-chips"></div><span class="adv-result" aria-live="polite"></span><button type="button" class="adv-export" title="تصدير النتائج الظاهرة إلى Excel">⬇ تصدير النتائج</button><button type="button" class="adv-print" title="طباعة النتائج الظاهرة">🖨 طباعة</button></div><div class="adv-panel"><div class="adv-inner"><div class="adv-box"></div></div></div>';
        wrap.parentNode.insertBefore(box, wrap);
        const panel = box.querySelector('.adv-panel'), tg = box.querySelector('.adv-toggle');
        tg.addEventListener('click', () => {
            const open = !panel.classList.contains('open');
            if (open) renderPanel(id);
            panel.classList.toggle('open', open); tg.setAttribute('aria-expanded', open);
        });
        box.querySelector('.adv-export').addEventListener('click', () => doExport(id));
        box.querySelector('.adv-print').addEventListener('click', () => doPrint(id));
        if (id === 'childrenTable') mountAgeRange(box, table);
        renderChips(id);
        // إعادة تطبيق الفلاتر تلقائياً كلما أُعيد بناء الجدول من قاعدة البيانات
        const tb = table.tBodies[0];
        if (tb) {
            let raf = null;
            new MutationObserver(() => { if (tb.__V || raf) return; raf = requestAnimationFrame(() => { raf = null; apply(id); }); }).observe(tb, {childList: true});
        }
        apply(id);
    }
    function mountAgeRange(box, table) {
        const bar = document.createElement('form');
        bar.className = 'age-range';
        bar.innerHTML = '<strong>عمر الطفل بالسنوات المكتملة</strong><label>من <input name="min" type="text" inputmode="numeric" size="4"></label><label>إلى <input name="max" type="text" inputmode="numeric" size="4"></label><button type="submit" class="adv-export">تطبيق</button><button type="reset" class="adv-toggle">مسح العمر</button><span role="status"></span>';
        box.prepend(bar);
        const state = states[table.id];
        const status = bar.querySelector('[role="status"]');
        function applyRange() {
            const read = name => toLatin(bar.elements[name].value).trim();
            const min = read('min'), max = read('max');
            if (![min, max].every(value => value === '' || /^\d{1,3}$/.test(value)) || (min && max && +min > +max)) {
                status.textContent = 'أدخل نطاق عمر صحيحاً.';
                return;
            }
            state.age = {min, max};
            status.textContent = min || max ? 'فلتر العمر مفعّل' : '';
            if (table.tBodies[0].__V) table.tBodies[0].__V.page = 0;
            apply(table.id);
        }
        bar.addEventListener('submit', event => { event.preventDefault(); applyRange(); });
        bar.addEventListener('reset', () => {
            state.age = null;
            status.textContent = '';
            apply(table.id);
        });
        return bar;
    }
    function openChildrenAges() {
        switchTab('children');
        const bar = document.querySelector('.adv[data-for="childrenTable"] .age-range');
        if (!bar) return;
        bar.elements.min.value = '1';
        bar.elements.max.value = '5';
        bar.requestSubmit();
        bar.elements.min.focus();
    }
    function init() {
        document.querySelectorAll('.tab-content table[id]').forEach(t => {
            if (t.closest('#globalSearchResult') || t.closest('#modalBox')) return;
            mount(t);
        });
    }
    return {init, apply, states, predicate, activeCount, completedAge, doExport, openChildrenAges};
})();
document.addEventListener('DOMContentLoaded', () => ADV.init());


function hideLoader() { const l = document.getElementById('syncLoader'); if (l) l.remove(); }
document.addEventListener('DOMContentLoaded', () => {
    const b = document.getElementById('admPassToggle'), i = document.getElementById('admPass');
    if (b && i) b.addEventListener('click', () => { const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.textContent = show ? 'إخفاء' : 'إظهار'; });
});


/* ---------- بطاقات «إضافة سجل» قابلة للطي: يظهر الكشف مباشرة وتُفتح الإضافة بضغطة ---------- */
function collapsibleForms() {
    ['families', 'aids', 'injured', 'orphans', 'children', 'chronic', 'fund'].forEach(tab => {
        const pane = document.getElementById(tab + '-tab'); if (!pane) return;
        const card = Array.from(pane.children).find(c => c.classList.contains('card') && c.querySelector('form') && c.querySelector(':scope > .card-title'));
        if (!card || card.dataset.cc) return; card.dataset.cc = '1';
        const title = card.querySelector(':scope > .card-title');
        const body = document.createElement('div'), inner = document.createElement('div');
        body.className = 'cc-body'; inner.className = 'cc-inner';
        let n = title.nextSibling; while (n) { const nx = n.nextSibling; inner.appendChild(n); n = nx; }
        body.appendChild(inner); card.appendChild(body);
        card.classList.add('cc'); title.setAttribute('role', 'button'); title.tabIndex = 0; title.setAttribute('aria-expanded', 'false');
        const toggle = () => { const o = !card.classList.contains('open'); card.classList.toggle('open', o); title.setAttribute('aria-expanded', o); };
        title.addEventListener('click', toggle);
        title.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });
}
document.addEventListener('DOMContentLoaded', collapsibleForms);


/* ---------- ثيم v2: أيقونات الشريط الجانبي + بانر الترحيب ---------- */
function railify() {
    document.querySelectorAll('#sidebarMenu li:not(.nav-group)').forEach(li => {
        if (li.dataset.rail) return;
        const tn = Array.from(li.childNodes).find(n => n.nodeType === 3 && n.textContent.trim());
        if (!tn) return;
        const m = tn.textContent.trim().match(/^(\p{Extended_Pictographic}\uFE0F?|[^\s\p{L}\p{N}]+)\s*([\s\S]*)$/u);
        li.dataset.rail = '1';
        const ic = document.createElement('span'), lb = document.createElement('span');
        ic.className = 'ic'; lb.className = 'lb';
        ic.textContent = m ? m[1] : '•'; lb.textContent = m ? m[2] : tn.textContent.trim();
        li.title = lb.textContent;
        li.replaceChild(lb, tn); li.insertBefore(ic, lb);
    });
}
(function () {
    const _en = enhanceNav; enhanceNav = function () { _en(); railify(); };
    document.addEventListener('DOMContentLoaded', () => {
        railify();
        const dash = document.getElementById('dashboard-tab'), content = document.getElementById('dashContent');
        if (dash && content && !dash.querySelector('.hero')) {
            const d = new Date().toLocaleDateString('ar', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
            const h = document.createElement('div'); h.className = 'hero';
            const hr = new Date().getHours(), greet = hr < 12 ? 'صباح الخير' : hr < 18 ? 'مساء الخير' : 'مساء النور';
            h.innerHTML = '<div><h2></h2><p>اضغط على أي رقم أو شريط في اللوحة لتظهر لك الأسماء مباشرة، ومن الشريط الجانبي تنتقل لأي كشف.</p><span class="hero-live"><i></i><span>البيانات تتحدّث لحظياً</span></span></div><div class="hero-date"></div>';
            h.querySelector('h2').textContent = greet + '، أهلاً بك في إدارة المخيم';
            h.querySelector('.hero-date').textContent = d;
            try { rdb.ref('.info/connected').on('value', s => { const l = h.querySelector('.hero-live'); l.classList.toggle('off', s.val() !== true); l.lastChild.textContent = s.val() === true ? 'البيانات تتحدّث لحظياً' : 'غير متصل بالخادم'; }); } catch (e) {}
            content.parentNode.insertBefore(h, content);
        }
    });
})();

/* ==========================================================================
   لوحة المؤشرات التفاعلية: اضغط على أي رقم أو شريط لتظهر الأسماء، + استعادة النسخة الاحتياطية
   ========================================================================== */
const DR = {}; let _dr = null;
(function () {
    const _om = openModal, _cm = closeModal;
    openModal = function (h, wide) { _om(h); document.getElementById('modalBox').classList.toggle('wide', !!wide); };
    closeModal = function () { _cm(); document.getElementById('modalBox').classList.remove('wide'); };
})();

function drill(id) {
    const c = DR[id]; if (!c) return;
    if (c.go) { switchTab(c.go); return; }
    const rows = c.rows();
    _dr = {title: c.title, cols: c.cols, rows: rows.map(r => r.c), go: c.open, keys: c.open === 'families' ? rows.map(r => r.k).filter(Boolean) : []};
    const clickable = rows.some(r => r.k);
    let h = '<h3>' + esc(c.title) + '<span class="dr-n">' + rows.length + '</span></h3>';
    if (!rows.length) { h += '<p style="padding:26px;text-align:center;color:#7b808c">✔ لا توجد سجلات في هذه القائمة.</p><div class="btnrow"><button class="btn btn-blue" onclick="closeModal()">إغلاق</button></div>'; openModal(h, true); return; }
    h += '<input type="search" id="drQ" placeholder="🔍 ابحث بالاسم أو الهوية أو القاطع..." oninput="drFilter()" style="margin:6px 0 10px;width:100%">';
    if (clickable) h += '<p style="font-size:12px;color:#7b808c;margin:0 0 6px">اضغط على أي اسم لفتح بطاقة الأسرة كاملة.</p>';
    h += '<div class="table-responsive dr-scroll"><table id="drTable"><thead><tr><th>#</th>' + c.cols.map(x => '<th>' + esc(x) + '</th>').join('') + '</tr></thead><tbody>'
        + rows.map((r, i) => '<tr' + (r.k ? ' class="clickable" onclick="showFamilyByKey(\'' + esc(r.k) + '\')"' : '') + '><td>' + (i + 1) + '</td>' + r.c.map(v => '<td>' + esc(v == null ? '' : v) + '</td>').join('') + '</tr>').join('')
        + '</tbody></table></div><div class="btnrow" style="margin-top:12px">'
        + '<button class="btn btn-green" onclick="drExport()">⬇ تصدير Excel</button><button class="btn btn-blue" onclick="drPrint()">🖨 طباعة</button>'
        + (_dr.keys.length && !isLimited ? '<button class="btn btn-blue" onclick="openMsgDialog(\'\', _dr.title, _dr.keys)">📩 رسالة لهم</button>' : '')
        + (c.open ? '<button class="btn btn-blue" onclick="closeModal();switchTab(\'' + c.open + '\')">📂 فتح الكشف</button>' : '')
        + '<button class="btn btn-red" onclick="closeModal()">إغلاق</button></div>';
    openModal(h, true);
}
function drFilter() {
    const q = normAr(document.getElementById('drQ').value);
    document.querySelectorAll('#drTable tbody tr').forEach(tr => { tr.style.display = !q || normAr(tr.textContent).includes(q) ? '' : 'none'; });
}
async function drExport() { if (!_dr || !await loadExcel()) return; await exportRowsToExcel(_dr.cols, _dr.rows, _dr.title.replace(/[\\/:*?"<>|]/g, ' ') + '_' + today() + '.xlsx', 'القائمة'); toast('تم تصدير ' + _dr.rows.length + ' سجل'); }
function drPrint() {
    if (!_dr) return; const w = window.open('', '_blank'); if (!w) { toast('اسمح بالنوافذ المنبثقة للطباعة', 'warn'); return; }
    w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' + esc(_dr.title) + '</title><style>body{font-family:Tahoma,Arial,sans-serif;padding:18px}h2{margin:0 0 4px}p{margin:0 0 12px;color:#555;font-size:13px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #999;padding:5px 7px;text-align:right}th{background:#eee}</style></head><body><h2>' + esc(_dr.title) + '</h2><p>العدد: ' + _dr.rows.length + ' — ' + esc(new Date().toLocaleDateString('en-GB')) + '</p><table><thead><tr><th>#</th>' + _dr.cols.map(x => '<th>' + esc(x) + '</th>').join('') + '</tr></thead><tbody>' + _dr.rows.map((r, i) => '<tr><td>' + (i + 1) + '</td>' + r.map(v => '<td>' + esc(v == null ? '' : v) + '</td>').join('') + '</tr>').join('') + '</tbody></table></body></html>');
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}

function loadDashboard() {
    const fams = getDB('db_families').filter(Boolean), num = v => parseInt(toLatin(v), 10) || 0;
    const fk = f => safeKey(digitsOf(f[2])), members = fams.reduce((s, f) => s + num(f[26]), 0);
    const famIds = new Set(fams.map(fk)), covered = new Map();
    const aids = getDB('db_aids').filter(Boolean);
    aids.forEach(a => { const k = safeKey(digitsOf(a[1])); if (famIds.has(k)) covered.set(k, (covered.get(k) || 0) + 1); });
    const claimed = new Set(Object.values(obj('claims')).map(c => c && safeKey(String(c.id)))), vault = obj('pwvault');
    const isAct = f => claimed.has(fk(f)) || vault[fk(f)];
    const FC = ['الكود', 'الاسم', 'رقم الهوية', 'القاطع', 'عدد الأفراد', 'الجوال'];
    const famRows = (list, extra) => list.map(f => ({k: fk(f), c: [f[40] || '-', f[1], f[2], f[0], f[26], f[5]].concat(extra ? [extra(f)] : [])}));
    const dbList = (key, open, ck) => { const labels = (EXPORT_SCHEMAS[key] || []).slice(0, 6); return {cols: labels, open, rows: () => getDB(key).filter(Boolean).map(r => ({k: ck ? ck(r) : '', c: labels.map((_, i) => formatCellForDB(key, i, r[i]))}))}; };
    const childKey = r => safeKey(digitsOf(r[5])) || safeKey(digitsOf(r[8]));
    let n = 0; const reg = (o) => { const id = 'd' + (++n); DR[id] = o; return id; };
    Object.keys(DR).forEach(k => delete DR[k]);

    const tile = (label, val, icon, tone, o, attn) => {
        const id = reg(o);
        return '<div class="stat ' + tone + ' clickable' + (attn ? ' attn' : '') + '" role="button" tabindex="0" style="--i:' + n + '" onclick="drill(\'' + id + '\')" onkeydown="if(event.key===\'Enter\')this.click()"><span class="s-ic">' + icon + '</span><span class="s-l">' + esc(label) + '</span><b>' + esc(val) + '</b><span class="s-go" aria-hidden="true">↗</span></div>';
    };
    const fl = (title, list, extra, xl) => ({title, cols: FC.concat(xl ? [xl] : []), open: 'families', rows: () => famRows(list, extra)});
    const youngChildren = getDB('db_children').filter(row => {
        const age = row && ADV.completedAge(formatDateValue(row[2]));
        return age !== '' && age >= 1 && age <= 5;
    }).length;
    let h = '<div class="card"><div class="btnrow"><button type="button" class="btn btn-blue" onclick="ADV.openChildrenAges()">كشف الأطفال من سنة إلى 5 سنوات (' + youngChildren + ')</button></div></div><div class="stat-grid">'
        + tile('أسر مسجلة', fams.length, '🏠', 't-lav', fl('الأسر المسجلة', fams))
        + tile('إجمالي الأفراد', members, '👥', 't-lav', fl('الأسر مرتبة حسب عدد الأفراد', fams.slice().sort((a, b) => num(b[26]) - num(a[26]))))
        + tile('أطفال مسجلون (كشف)', getDB('db_children').length, '👶', 't-pink', Object.assign({title: 'الأطفال المسجلون'}, dbList('db_children', 'children', childKey)))
        + tile('أيتام', getDB('db_orphans').length, '🧒', 't-pink', Object.assign({title: 'الأيتام'}, dbList('db_orphans', 'orphans')))
        + tile('مصابون', getDB('db_injured').length, '🩹', 't-peach', Object.assign({title: 'المصابون'}, dbList('db_injured', 'injured')))
        + tile('أمراض مزمنة', getDB('db_chronic').length, '💊', 't-peach', Object.assign({title: 'الأمراض المزمنة'}, dbList('db_chronic', 'chronic')))
        + tile('أسر استلمت مساعدة', covered.size, '📦', 't-mint', fl('الأسر التي استلمت مساعدة', fams.filter(f => covered.has(fk(f))), f => covered.get(fk(f)), 'عدد المساعدات'))
        + tile('أسر بلا أي مساعدة', fams.length - covered.size, '⚠️', 't-peach', fl('الأسر التي لم تستلم أي مساعدة', fams.filter(f => !covered.has(fk(f)))), (fams.length - covered.size) > 0)
        + tile('حسابات مفعّلة', fams.filter(isAct).length, '🔑', 't-sky', fl('الأسر التي فعّلت حسابها', fams.filter(isAct)))
        + tile('لم تفعّل حسابها', fams.filter(f => !isAct(f)).length, '🔒', 't-sky', fl('الأسر التي لم تفعّل حسابها بعد', fams.filter(f => !isAct(f))))
        + tile('طلبات معلّقة', pendingTotal(), '🔔', 't-pink', {go: 'requests'}, pendingTotal() > 0)
        + (!isLimited ? tile('مواد وصلت اليوم', getDB('db_stock').filter(r => Array.isArray(r) && String(r[1]).includes('وارد') && stockISO(r[0]) === stockFrom('today')).length + ' حركة', '📦', 't-mint', {go: 'stock'}) : '')
        + tile('أسر بلا كود', fams.filter(f => !/^[a-z]\d{3,4}$/i.test(String(f[40] || ''))).length, '🏷️', 't-sky', fl('الأسر التي ليس لها كود', fams.filter(f => !/^[a-z]\d{3,4}$/i.test(String(f[40] || '')))), fams.some(f => !/^[a-z]\d{3,4}$/i.test(String(f[40] || ''))))
        + tile('أسر بلا رقم جوال', fams.filter(f => digitsOf(f[5]).length < 7).length, '📵', 't-lav', fl('الأسر التي ليس لها رقم جوال صالح', fams.filter(f => digitsOf(f[5]).length < 7)))
        + '</div>';

    if (!isLimited) {
        let tin = 0, tout = 0; const fund = getDB('db_fund').filter(Array.isArray);
        const amt = r => parseFloat(toLatin(String(r[2] == null ? '' : r[2])).replace(/[^\d.\-]/g, '')) || 0;
        fund.forEach(r => { if (String(r[1]).includes('وارد')) tin += amt(r); else if (String(r[1]).includes('صادر')) tout += amt(r); });
        const fm = v => (Math.round(v * 100) / 100).toLocaleString('en-US') + ' ₪';
        const fr = (title, f) => ({title, cols: ['التاريخ', 'النوع', 'المبلغ', 'الجهة', 'ملاحظات'], open: 'fund', rows: () => fund.filter(f).map(r => ({c: [r[0], r[1], r[2], r[3], r[4]]}))});
        h += '<div class="stat-grid fund3">'
            + tile('الوارد', fm(tin), '⬇️', 't-mint', fr('حركات الوارد', r => String(r[1]).includes('وارد')))
            + tile('الصادر', fm(tout), '⬆️', 't-pink', fr('حركات الصادر', r => String(r[1]).includes('صادر')))
            + tile('الرصيد', fm(tin - tout), '💰', 't-dark', fr('كل حركات الصندوق', () => true)) + '</div>';
    }

    const bars = (entries, color, mk) => entries.map(e => {
        const id = reg(mk(e)), max = Math.max.apply(null, entries.map(x => x[1]).concat([1]));
        return '<div class="bar-row clickable" role="button" tabindex="0" onclick="drill(\'' + id + '\')" onkeydown="if(event.key===\'Enter\')this.click()"><span class="lbl" title="' + esc(e[0]) + '">' + esc(e[0]) + '</span><span class="bar"><i style="width:' + Math.round(e[1] / max * 100) + '%"></i></span><span class="num">' + esc(e[2] != null ? e[2] : e[1]) + '</span></div>';
    }).join('');
    const byField = (idx, title) => e => ({title: title + ': ' + e[0], cols: FC, open: 'families', rows: () => famRows(fams.filter(f => (String(f[idx] || '').trim() || 'غير محدد') === e[0]))});
    const sec = {}; fams.forEach(f => { const k = String(f[0] || '').trim() || 'غير محدد'; sec[k] = sec[k] || {f: 0, m: 0}; sec[k].f++; sec[k].m += num(f[26]); });
    const secE = Object.entries(sec).sort((a, b) => b[1].f - a[1].f).map(e => [e[0], e[1].f, e[1].f + ' أسرة / ' + e[1].m + ' فرد']);
    const groups = [['يوم - سنتين', 14, 15], ['3 - 6', 16, 17], ['7 - 12', 18, 19], ['13 - 17', 20, 21], ['18 - 60', 22, 23], ['فوق 60', 24, 25]];
    const sum = i => fams.reduce((s, f) => s + num(f[i]), 0);
    const ageBars = (sx, ci) => groups.map(g => [g[0] + ' ' + sx, sum(g[ci])]);
    const ageDrill = ci => e => { const g = groups.find(x => e[0].startsWith(x[0])); const col = g[ci]; return {title: 'الأسر التي فيها ' + e[0], cols: FC.concat(['العدد']), open: 'families', rows: () => famRows(fams.filter(f => num(f[col]) > 0), f => num(f[col]))}; };
    h += '<div class="two-col"><div class="card"><h3 class="card-title">🏘️ الأسر حسب القاطع</h3>' + bars(secE, '', byField(0, 'القاطع')) + '</div>'
        + '<div class="card"><h3 class="card-title">🎂 الفئات العمرية</h3>' + bars(ageBars('ذكور', 1), '', ageDrill(1)) + bars(ageBars('إناث', 2), '', ageDrill(2)) + '</div>'
        + '<div class="card"><h3 class="card-title">⛺ نوع المسكن</h3>' + bars(countBy(fams, f => f[31]), '', byField(31, 'المسكن')) + '</div>'
        + '<div class="card"><h3 class="card-title">📌 الحالة</h3>' + bars(countBy(fams, f => f[32]), '', byField(32, 'الحالة')) + '</div>'
        + '<div class="card"><h3 class="card-title">💼 المهنة</h3>' + bars(countBy(fams, f => f[33]), '', byField(33, 'المهنة')) + '</div>'
        + '<div class="card"><h3 class="card-title">📦 أكثر أنواع المساعدات</h3>' + bars(countBy(aids, a => a[3]).slice(0, 8), '', e => ({title: 'مساعدة: ' + e[0], cols: ['الاسم', 'الهوية', 'القاطع', 'النوع', 'الكمية'], open: 'aids', rows: () => aids.filter(a => (String(a[3] || '').trim() || 'غير محدد') === e[0]).map(a => ({k: safeKey(digitsOf(a[1])), c: [a[0], a[1], a[2], a[3], a[5]]}))})) + '</div></div>';
    if (!isLimited) h += '<div class="card"><div class="btnrow" style="margin:0"><button class="btn btn-blue" onclick="backupAll()">💾 تنزيل نسخة احتياطية كاملة (JSON)</button><button class="btn btn-red" onclick="restoreBackup()">♻️ استعادة من نسخة احتياطية</button><button class="btn btn-blue" onclick="normalizeDatesAll()">🕒 توحيد صيغة التواريخ</button><button class="btn btn-blue" onclick="openChangeHead()">🔁 استبدال رب الأسرة / ربط المساعدات</button><button class="btn btn-blue" onclick="openCodesTool()">🏷️ أكواد الأسر</button><button class="btn btn-blue" onclick="openReqCheck()">🩺 فحص الطلبات</button><button class="btn btn-blue" onclick="openBulkAid()">📦 توزيع جماعي لقاطع</button></div></div>';
    const host = document.getElementById('dashContent');
    host.classList.toggle('enter', !window.__dashShown); window.__dashShown = true;
    host.innerHTML = h;
    document.getElementById('dashStamp').textContent = 'آخر تحديث: ' + new Date().toLocaleString('en-GB');
}

function restoreBackup() {
    if (isLimited) { alert('⛔ غير مصرح.'); return; }
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => {
        const f = inp.files[0]; if (!f) return; const rd = new FileReader();
        rd.onload = async () => {
            let o; try { o = JSON.parse(rd.result); } catch (e) { alert('❌ الملف ليس نسخة احتياطية صالحة (JSON تالف).'); return; }
            const secret = ['pwvault', 'claims', 'db_passwords', 'inbox'];
            const ok = Object.keys(localDB).filter(k => !secret.includes(k));
            const keys = Object.keys(o || {}).filter(k => ok.includes(k));
            if (!o || typeof o !== 'object' || !keys.includes('db_families')) { alert('❌ الملف لا يحتوي بيانات الأسر؛ لا يبدو نسخة احتياطية من هذا النظام.'); return; }
            const cnt = k => Array.isArray(o[k]) ? o[k].length : (o[k] ? Object.keys(o[k]).length : 0);
            const when = o._meta && o._meta.exportedAt ? new Date(o._meta.exportedAt).toLocaleString('en-GB') : 'غير معروف';
            const msg = 'سيتم استبدال البيانات الحالية بمحتوى النسخة:\nتاريخ النسخة: ' + when + '\nأسر: ' + cnt('db_families') + ' | مساعدات: ' + cnt('db_aids') + ' | أطفال: ' + cnt('db_children') + '\nالأقسام التي ستُستعاد: ' + keys.length + '\n\n⚠️ هذا الإجراء يمسح البيانات الحالية في هذه الأقسام. سيتم تنزيل نسخة من البيانات الحالية تلقائياً قبل الاستعادة.\nهل تريد المتابعة؟';
            if (!confirm(msg)) return;
            if (prompt('للتأكيد النهائي اكتب كلمة: استعادة') !== 'استعادة') { toast('تم إلغاء الاستعادة', 'warn'); return; }
            if (!await backupAll()) return;
            const up = {}; keys.forEach(k => { up[k] = o[k] == null ? null : o[k]; });
            rdb.ref().update(up).then(() => { audit('استعادة نسخة احتياطية', keys.length + ' قسم | ' + when); schedulePublish(); toast('تمت استعادة النسخة الاحتياطية بنجاح'); })
              .catch(err => alert('❌ فشلت الاستعادة: ' + (err && err.message ? err.message : err)));
        };
        rd.readAsText(f);
    };
    inp.click();
}

/* ملاحظة عند حذف أسرة لها سجلات مرتبطة */
function famDeleteNote(dbKey, r) {
    if (dbKey !== 'db_families') return '';
    const id = digitsOf(r[2]); if (!id) return '';
    const a = getDB('db_aids').filter(x => x && digitsOf(x[1]) === id).length;
    const c = getDB('db_children').filter(x => x && (digitsOf(x[5]) === id || digitsOf(x[8]) === id)).length;
    return (a || c) ? '\n\n⚠️ مرتبط بهذه الأسرة: ' + a + ' مساعدة و' + c + ' طفل. لن تُحذف تلقائياً وستبقى في كشوفها.' : '';
}

/* ==========================================================================
   v4: تحية باسم المستخدم + صور الهويات + توحيد التواريخ
   ========================================================================== */
function heroGreet() {
    const em = (auth.currentUser && auth.currentUser.email) || '', nm = em.split('@')[0] || '';
    const h = document.querySelector('.hero h2'); if (h && nm) h.textContent = 'مرحباً ' + nm;
}
(function () { const _ld = loadDashboard; loadDashboard = function () { _ld(); heroGreet(); }; })();

/* ---------- توحيد صيغة كل التواريخ المخزنة ---------- */
const DATE_MIG = {db_families: [4, 10, 13], db_children: [2], db_chronic: [2], db_injured: [2], db_orphans: [2, 5], db_aids: [4]};
function normalizeDatesAll() {
    if (isLimited) { alert('⛔ غير مصرح.'); return; }
    const plan = [], samples = []; let total = 0;
    Object.keys(DATE_MIG).forEach(k => {
        const db = getDB(k).map(r => Array.isArray(r) ? r.slice() : r); let ch = 0;
        db.forEach(r => {
            if (!Array.isArray(r)) return;
            DATE_MIG[k].forEach(i => {
                const old = r[i]; if (old == null || old === '') return;
                const nv = k === 'db_aids' ? smartNote(old) : formatDateValue(old);
                if (String(nv) !== String(old)) { if (samples.length < 5) samples.push(old + '  ←  ' + nv); r[i] = nv; ch++; }
            });
        });
        if (ch) { plan.push([k, db]); total += ch; }
    });
    if (!total) { toast('كل التواريخ بصيغة موحدة بالفعل (يوم/شهر/سنة)'); return; }
    if (!confirm('سيتم توحيد ' + total + ' تاريخ إلى صيغة يوم/شهر/سنة.\nأمثلة (القديم ← الجديد):\n' + samples.map(s => String(s).replace(/\s+/g, ' ')).join('\n') + '\n\nملاحظة: التواريخ ذات السنة بخانتين تُعامل بصيغة شهر/يوم/سنة (صيغة إكسل الأمريكية).\nمتابعة؟')) return;
    Promise.all(plan.map(p => saveDB(p[0], p[1]))).then(() => { audit('توحيد التواريخ', total + ' تاريخ'); schedulePublish(); toast('تم توحيد ' + total + ' تاريخ'); refreshNow(); });
}

/* ==========================================================================
   فحص الجودة الموسّع + رسائل مخصصة لكل أسرة تظهر على صفحتها
   ========================================================================== */
function famCond(kind, f, kids) {
    const num = v => parseInt(toLatin(v), 10) || 0;
    if (kind === 'mism') { let s = 0; for (let i = 14; i <= 25; i++) s += num(f[i]); const m = num(f[26]); return m < 1 || (s > 0 && s !== m); }
    if (kind === 'nokids') return num(f[26]) > 2 && !kids.length;
    if (kind === 'phone') { const d = digitsOf(f[5]), n = d.slice(-9); return !(d.length >= 9 && d.length <= 14 && n[0] === '5'); }
    return true;
}
/* الرسائل الظاهرة لأسرة معيّنة: المستهدفة + (الشرط ما زال قائماً أو الرسالة بلا شرط) */
function famMsgsFor(f, k, children) {
    const all = (localDB.config && localDB.config.famMsgs) || {};
    if (!Object.keys(all).length) return [];
    const kids = children.filter(c => c && (safeKey(digitsOf(c[5])) === k || safeKey(digitsOf(c[8])) === k));
    return Object.keys(all).map(id => Object.assign({id}, all[id])).filter(m => m && m.tx && Array.isArray(m.keys) && m.keys.includes(k) && (!m.cond || famCond(m.cond, f, kids)))
        .sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 5).map(m => ({id: m.id, tx: String(m.tx).slice(0, 600), t: m.t || 0, act: m.act || ''}));
}

const MSG_DEFAULT = {
    mism: {tx: 'السلام عليكم، لاحظنا أن العدد الكلي لأفراد أسرتكم لا يطابق مجموع الفئات العمرية المسجلة. الرجاء تعديل تقسيمة الأفراد بشكل صحيح من زر «تحديث الاستبيان وبيانات الأسرة». شكراً لتعاونكم.', act: 'edit'},
    nokids: {tx: 'السلام عليكم، عدد أفراد أسرتكم أكثر من فردين ولم يتم تسجيل أي من الأبناء لدينا. الرجاء إضافة بيانات الأبناء من زر «إضافة طفل». شكراً لتعاونكم.', act: 'addChild'},
    phone: {tx: 'السلام عليكم، رقم الجوال المسجل لأسرتكم ناقص أو غير صحيح. الرجاء تحديثه من زر «تحديث الاستبيان وبيانات الأسرة» حتى نتمكن من التواصل معكم.', act: 'edit'},
    '': {tx: '', act: ''}
};
let _mg = null;
function openMsgDialog(cond, title, keys) {
    if (isLimited) { alert('⛔ إرسال الرسائل متاح للمدير العام فقط.'); return; }
    keys = Array.from(new Set(keys.filter(Boolean)));
    if (!keys.length) { toast('لا توجد أسر لإرسال الرسالة لها', 'warn'); return; }
    _mg = {cond, title, keys}; const d = MSG_DEFAULT[cond] || MSG_DEFAULT[''];
    openModal('<h3>📩 رسالة إلى أسر مختارة</h3><p style="margin:4px 0 12px;color:#5d6e73">ستصل الرسالة إلى <b>' + keys.length + '</b> أسرة، وتظهر لكل أسرة في أعلى صفحتها (<b>' + esc(title) + '</b>).</p>'
        + '<label>نص الرسالة</label><textarea id="mgText" rows="5" maxlength="500" style="width:100%">' + esc(d.tx) + '</textarea><div style="font-size:12px;color:#7b808c;text-align:left"><span id="mgLen">0</span>/500</div>'
        + '<label>زر الإجراء داخل الرسالة</label><select id="mgAct" style="width:100%"><option value="">بدون زر</option><option value="edit"' + (d.act === 'edit' ? ' selected' : '') + '>✏️ تحديث الاستبيان وبيانات الأسرة</option><option value="addChild"' + (d.act === 'addChild' ? ' selected' : '') + '>👶 إضافة طفل</option><option value="complaint">📝 تقديم شكوى أو طلب</option></select>'
        + (cond ? '<label style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" id="mgAuto" checked style="width:auto;min-height:0"> إخفاء الرسالة تلقائياً من صفحة الأسرة عند تصحيح المشكلة</label>' : '')
        + '<div class="btnrow" style="margin-top:14px"><button class="btn btn-green" id="mgSend" onclick="sendFamMsg()">📨 إرسال إلى ' + keys.length + ' أسرة</button><button class="btn btn-red" onclick="closeModal()">إلغاء</button></div>');
    const ta = document.getElementById('mgText'), ln = document.getElementById('mgLen'); const upd = () => { ln.textContent = ta.value.length; }; ta.addEventListener('input', upd); upd(); ta.focus();
}
function sendFamMsg() {
    const tx = document.getElementById('mgText').value.trim(); if (tx.length < 5) { toast('اكتب نص الرسالة أولاً', 'warn'); return; }
    const auto = document.getElementById('mgAuto'), id = 'm' + Date.now().toString(36);
    const rec = {tx, keys: _mg.keys, act: document.getElementById('mgAct').value, t: Date.now(), by: (auth.currentUser && auth.currentUser.email) || '', ti: _mg.title};
    if (_mg.cond && auto && auto.checked) rec.cond = _mg.cond;
    const b = document.getElementById('mgSend'); b.classList.add('is-loading');
    rdb.ref('config/famMsgs/' + id).set(rec).then(() => {
        localDB.config = localDB.config || {}; (localDB.config.famMsgs = localDB.config.famMsgs || {})[id] = rec;
        audit('إرسال رسالة لأسر', _mg.title + ' | ' + _mg.keys.length + ' أسرة'); schedulePublish(_mg.keys);
        closeModal(); toast('تم إرسال الرسالة إلى ' + _mg.keys.length + ' أسرة'); refreshNow();
    }).catch(e => { b.classList.remove('is-loading'); alert('❌ تعذر الإرسال: ' + (e && e.message ? e.message : e)); });
}
function delFamMsg(id) {
    const m = ((localDB.config || {}).famMsgs || {})[id]; if (!m) return;
    if (!confirm('حذف هذه الرسالة؟ ستختفي من صفحات ' + (m.keys || []).length + ' أسرة.')) return;
    rdb.ref('config/famMsgs/' + id).remove().then(() => { delete localDB.config.famMsgs[id]; audit('حذف رسالة أسر', (m.ti || '') + ' | ' + id); schedulePublish(m.keys || []); toast('تم حذف الرسالة'); refreshNow(); })
        .catch(e => alert('❌ تعذر الحذف: ' + (e && e.message ? e.message : e)));
}
function qSend(i) { const c = (window.__qchecks || [])[i]; if (c) openMsgDialog(c[4] || '', c[0].replace(/^[^\s]+\s/, ''), c[2].map(r => safeKey(digitsOf(r[1])))); }

/* ---------- فحص جودة البيانات (الأصلي + فحص جديد + أزرار الرسائل) ---------- */
function loadQuality() {
    const fams = getDB('db_families').filter(Boolean), num = v => parseInt(toLatin(v), 10) || 0;
    const byId = {}; fams.forEach(f => { const k = digitsOf(f[2]); (byId[k] = byId[k] || []).push(f); });
    const famKeys = new Set(Object.keys(byId)), checks = [];
    const dup = []; Object.keys(byId).forEach(k => { if (k && byId[k].length > 1) byId[k].forEach(f => dup.push([f[1], f[2], f[0]])); });
    checks.push(['🔁 هويات أسر مكررة', ['الاسم', 'الهوية', 'القاطع'], dup, true]);
    checks.push(['🆔 رقم هوية ليس 9 أرقام', ['الاسم', 'الهوية', 'القاطع'], fams.filter(f => digitsOf(f[2]).length !== 9).map(f => [f[1], f[2], f[0]]), true]);
    checks.push(['📵 جوال ناقص أو غير صحيح', ['الاسم', 'الهوية', 'الجوال'], fams.filter(f => famCond('phone', f, [])).map(f => [f[1], f[2], f[5] || '(فارغ)']), true, 'phone']);
    const mism = []; fams.forEach(f => { let s = 0; for (let i = 14; i <= 25; i++) s += num(f[i]); if (famCond('mism', f, [])) mism.push([f[1], f[2], 'المجموع حسب الفئات: ' + s, 'العدد الكلي: ' + (f[26] || '(فارغ)')]); });
    checks.push(['🧮 العدد الكلي لا يطابق مجموع الفئات العمرية', ['الاسم', 'الهوية', 'الفئات', 'الكلي'], mism, true, 'mism']);
    const kidKeys = new Set(); getDB('db_children').forEach(c => { if (!c) return; const a = digitsOf(c[5]), b = digitsOf(c[8]); if (a) kidKeys.add(a); if (b) kidKeys.add(b); });
    checks.push(['👨‍👩‍👧 أسر أفرادها أكثر من 2 وأبناؤها غير مسجلين', ['الاسم', 'الهوية', 'عدد الأفراد', 'القاطع'], fams.filter(f => num(f[26]) > 2 && !kidKeys.has(digitsOf(f[2]))).map(f => [f[1], f[2], f[26], f[0]]), true, 'nokids']);
    const nokids = getDB('db_children').filter(c => c && !famKeys.has(digitsOf(c[5])) && !famKeys.has(digitsOf(c[8]))).map(c => [c[0], c[1], c[4], c[5]]);
    checks.push(['👶 أطفال غير مرتبطين بأي أسرة', ['الطفل', 'هوية الطفل', 'الأب', 'هوية الأب'], nokids, false]);
    const cid = {}; getDB('db_children').forEach(c => { const k = digitsOf(c && c[1]); if (k) (cid[k] = cid[k] || []).push(c); });
    const cdup = []; Object.keys(cid).forEach(k => { if (cid[k].length > 1) cid[k].forEach(c => cdup.push([c[0], c[1], c[4]])); });
    checks.push(['🔁 أطفال بهوية مكررة', ['الطفل', 'الهوية', 'الأب'], cdup, false]);
    checks.push(['📦 مساعدات لهوية غير موجودة في قاعدة الأسر', ['الاسم', 'الهوية', 'النوع'], getDB('db_aids').filter(a => a && !famKeys.has(digitsOf(a[1]))).map(a => [a[0], a[1], a[3]]), false]);
    window.__qchecks = checks;
    let h = '<div class="stat-grid">' + checks.map((c, i) => {
        const bad = c[2].length > 0, ic = (c[0].match(/^\S+/) || ['•'])[0], lb = c[0].replace(/^\S+\s/, '');
        return '<div class="stat ' + (bad ? 't-peach' : 't-mint') + (bad ? ' clickable' : '') + '" ' + (bad ? 'role="button" tabindex="0" onclick="document.getElementById(\'qc-' + i + '\').scrollIntoView({behavior:\'smooth\',block:\'start\'})"' : '') + ' style="--i:' + i + '"><span class="s-ic">' + (bad ? ic : '✅') + '</span><span class="s-l">' + esc(lb) + '</span><b>' + c[2].length + '</b></div>';
    }).join('') + '</div>';
    checks.forEach((c, i) => {
        if (!c[2].length) return;
        const canMsg = !isLimited && c[3];
        h += '<div class="card" id="qc-' + i + '"><div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between"><h3 class="card-title" style="margin:0">' + esc(c[0]) + ' (' + c[2].length + ')</h3>'
            + '<div class="btnrow" style="margin:0">' + (canMsg ? '<button class="btn btn-blue" style="margin:0" onclick="qSend(' + i + ')">📩 إرسال رسالة لهم (' + c[2].length + ')</button>' : '') + '<button class="btn btn-green" style="margin:0" onclick="qExport(' + i + ')">⬇ Excel</button></div></div><div class="table-responsive">'
            + '<table><thead><tr>' + c[1].map(x => '<th>' + esc(x) + '</th>').join('') + (c[3] ? '<th>عرض</th>' : '') + '</tr></thead><tbody>'
            + c[2].slice(0, 100).map(r => '<tr>' + r.map(x => '<td>' + esc(x) + '</td>').join('') + (c[3] ? '<td><button class="btn btn-blue" style="margin:0;padding:3px 8px;font-size:11px;" onclick="showFamilyByKey(\'' + esc(safeKey(digitsOf(r[1]))) + '\')">👁</button></td>' : '') + '</tr>').join('')
            + '</tbody></table></div>' + (c[2].length > 100 ? '<p style="font-size:12px;color:#64748b;">يعرض أول 100 فقط (الرسالة والتصدير يشملان الكل).</p>' : '') + '</div>';
    });
    if (checks.every(c => !c[2].length)) h += '<div class="card"><h3>✅ لم يتم العثور على مشاكل في البيانات.</h3></div>';
    h += sentMsgsCard();
    document.getElementById('qualContent').innerHTML = h;
}
async function qExport(i) { const c = (window.__qchecks || [])[i]; if (c && await loadExcel()) { await exportRowsToExcel(c[1], c[2], c[0].replace(/^\S+\s/, '').replace(/[\\/:*?"<>|]/g, ' ') + '_' + today() + '.xlsx', 'القائمة'); toast('تم تصدير ' + c[2].length + ' سجل'); } }
function sentMsgsCard() {
    const all = (localDB.config && localDB.config.famMsgs) || {}, ids = Object.keys(all).sort((a, b) => (all[b].t || 0) - (all[a].t || 0));
    if (!ids.length) return '';
    const fam = {}; getDB('db_families').filter(Boolean).forEach(f => { fam[safeKey(digitsOf(f[2]))] = f; });
    const kidsOf = k => getDB('db_children').filter(c => c && (safeKey(digitsOf(c[5])) === k || safeKey(digitsOf(c[8])) === k));
    return '<div class="card"><h3 class="card-title">📨 الرسائل المرسلة للأسر (' + ids.length + ')</h3><div class="table-responsive"><table><thead><tr><th>الرسالة</th><th>التاريخ</th><th>المستهدفون</th><th>ما زالت تظهر لـ</th>' + (isLimited ? '' : '<th>حذف</th>') + '</tr></thead><tbody>'
        + ids.map(id => { const m = all[id], ks = m.keys || []; const live = ks.filter(k => fam[k] && (!m.cond || famCond(m.cond, fam[k], kidsOf(k)))).length;
            return '<tr><td style="white-space:normal;min-width:240px"><b>' + esc(m.ti || '') + '</b><br><small>' + esc(String(m.tx).slice(0, 110)) + (String(m.tx).length > 110 ? '…' : '') + '</small></td><td>' + esc(new Date(m.t || 0).toLocaleDateString('en-GB')) + '</td><td>' + ks.length + '</td><td><b>' + live + '</b>' + (m.cond ? '' : ' <small>(بلا شرط)</small>') + '</td>'
                + (isLimited ? '' : '<td><button class="btn btn-red" style="margin:0;padding:3px 10px;font-size:11px" onclick="delFamMsg(\'' + id + '\')">حذف</button></td>') + '</tr>'; }).join('')
        + '</tbody></table></div></div>';
}

/* ==========================================================================
   استبدال رب الأسرة بالزوجة مع نقل كل ما يرتبط به (المساعدات، الأبناء، الطلبات) دفعة واحدة
   ========================================================================== */
const chValid = id => /^\d{9}$/.test(id);
const WSLOTS = [[8, 9, 10], [11, 12, 13]]; // (الاسم، الهوية، الميلاد) للزوجة الأولى والثانية

function planChangeHead(oldKey) {
    const fams = getDB('db_families'), idx = fams.findIndex(f => f && safeKey(digitsOf(f[2])) === oldKey);
    if (idx < 0) return {ok: false, key: oldKey, reason: 'الهوية غير موجودة في قاعدة الأسر'};
    const f = fams[idx], oldId = digitsOf(f[2]), famKeys = new Set(fams.filter(Boolean).map(x => safeKey(digitsOf(x[2]))));
    let slot = null, why = 'لا توجد زوجة بهوية صحيحة (9 أرقام) في خانتي الزوجة';
    WSLOTS.forEach(s => {
        if (slot) return; const id = digitsOf(f[s[1]]), nm = String(f[s[0]] || '').trim();
        if (!nm || nm === '0' || !id) return;
        if (!chValid(id)) { why = 'هوية الزوجة (' + id + ') ليست 9 أرقام'; return; }
        if (id === oldId) { why = 'هوية الزوجة نفس هوية رب الأسرة، صحّحها يدوياً أولاً'; return; }
        if (famKeys.has(safeKey(id))) { why = 'الزوجة مسجلة أصلاً كرب أسرة أخرى'; return; }
        slot = s;
    });
    if (!slot) return {ok: false, key: oldKey, name: f[1], reason: why};
    const aids = [], kids = [], reqs = [];
    getDB('db_aids').forEach((a, i) => { if (a && digitsOf(a[1]) === oldId) aids.push(i); });
    getDB('db_children').forEach((c, i) => { if (c && digitsOf(c[5]) === oldId && digitsOf(c[8]) !== digitsOf(f[slot[1]])) kids.push(i); });
    getDB('db_edit_requests').forEach((r, i) => { if (r && !Array.isArray(r) && digitsOf(r.id) === oldId) reqs.push(i); });
    return {ok: true, idx, slot, oldId, oldName: f[1], newId: digitsOf(f[slot[1]]), newName: String(f[slot[0]]).trim(), aids, kids, reqs};
}
function planOrphanAids() {
    const fams = getDB('db_families'), famKeys = new Set(fams.filter(Boolean).map(x => safeKey(digitsOf(x[2])))), byW = {};
    fams.forEach((f, i) => { if (!f) return; [9, 12].forEach(c => { const id = digitsOf(f[c]); if (chValid(id) && !famKeys.has(safeKey(id))) (byW[id] = byW[id] || []).push(i); }); });
    const res = []; getDB('db_aids').forEach((a, i) => { if (!a) return; const id = digitsOf(a[1]), m = byW[id]; if (m && m.length === 1) { const f = fams[m[0]]; res.push({ai: i, fi: m[0], from: id, fromName: a[0], to: digitsOf(f[2]), toName: f[1], type: a[3]}); } });
    return res;
}

function openChangeHead(prefill) {
    if (isLimited) { alert('⛔ هذه الأداة للمدير العام فقط.'); return; }
    openModal('<h3>🔁 استبدال رب الأسرة بالزوجة</h3>'
        + '<p style="color:#5d6e73;margin:4px 0 10px;line-height:1.7">تصبح <b>هوية الزوجة</b> هي هوية رب الأسرة، وتنتقل إليها المساعدات المسجلة (ويُحفظ الزوج في خانة الزوجة بدل أن يُحذف). يتم التنفيذ دفعة واحدة، وتُنزَّل نسخة احتياطية تلقائياً قبل التنفيذ.</p>'
        + '<div class="card" style="box-shadow:none;padding:14px!important;background:#f7f8fa"><b>1) استبدال أسر محددة</b><p style="font-size:13px;color:#5d6e73;margin:4px 0 8px">اكتب هوية رب الأسرة الحالي (الزوج) لكل أسرة، سطر لكل هوية:</p>'
        + '<textarea id="chIds" rows="4" style="width:100%;direction:ltr" placeholder="400000001\n400000002">' + esc(prefill || '') + '</textarea><div class="btnrow" style="margin-top:8px"><button class="btn btn-blue" onclick="chPreview()">معاينة</button></div></div>'
        + '<div class="card" style="box-shadow:none;padding:14px!important;background:#f7f8fa;margin-top:10px"><b>2) مساعدات مسجلة بهوية زوج لم يعد رب أسرة</b><p style="font-size:13px;color:#5d6e73;margin:4px 0 8px">يفحص المساعدات التي هويتها غير موجودة كأسرة، لكنها تطابق هوية «الزوجة» في خانة أسرة موجودة، ويقترح نقلها لرب الأسرة الحالي.</p>'
        + '<button class="btn btn-blue" onclick="chScanOrphans()">فحص المساعدات المنفصلة</button></div><div id="chOut" style="margin-top:12px"></div>');
    document.getElementById('modalBox').classList.add('wide');
    if (prefill) chPreview();
}
function chPreview() {
    const ids = Array.from(new Set(document.getElementById('chIds').value.split(/[\s,؛;]+/).map(x => safeKey(digitsOf(x))).filter(Boolean)));
    if (!ids.length) { toast('اكتب هوية واحدة على الأقل', 'warn'); return; }
    window.__chPlans = ids.map(planChangeHead); const P = window.__chPlans, okN = P.filter(p => p.ok).length;
    let h = '<div class="table-responsive dr-scroll"><table><thead><tr><th></th><th>رب الأسرة الحالي</th><th>سيصبح (الزوجة)</th><th>مساعدات</th><th>أبناء</th><th>طلبات</th><th>الحالة</th></tr></thead><tbody>'
        + P.map((p, i) => p.ok ? '<tr><td><input type="checkbox" class="chk" data-i="' + i + '" checked style="width:auto;min-height:0"></td><td>' + esc(p.oldName) + '<br><small>' + esc(p.oldId) + '</small></td><td><b>' + esc(p.newName) + '</b><br><small>' + esc(p.newId) + '</small></td><td>' + p.aids.length + '</td><td>' + p.kids.length + '</td><td>' + p.reqs.length + '</td><td>✅ جاهز</td></tr>'
            : '<tr><td></td><td>' + esc(p.name || '') + '<br><small>' + esc(p.key) + '</small></td><td colspan="4" style="color:#c0392b">' + esc(p.reason) + '</td><td>⛔ لن يُنفَّذ</td></tr>').join('')
        + '</tbody></table></div><div class="btnrow" style="margin-top:10px">' + (okN ? '<button class="btn btn-green" id="chGo" onclick="chExecute()">✔ تنفيذ المحدد</button>' : '') + '<button class="btn btn-red" onclick="closeModal()">إغلاق</button></div>';
    document.getElementById('chOut').innerHTML = h;
}
function chScanOrphans() {
    const R = window.__chOrph = planOrphanAids();
    document.getElementById('chOut').innerHTML = !R.length ? '<p style="padding:16px;text-align:center;color:#5d6e73">✔ لا توجد مساعدات منفصلة تحتاج نقلاً.</p>'
        : '<div class="table-responsive dr-scroll"><table><thead><tr><th></th><th>المساعدة</th><th>مسجلة بهوية</th><th>تُنقل إلى (رب الأسرة الحالي)</th></tr></thead><tbody>'
        + R.map((r, i) => '<tr><td><input type="checkbox" class="chk" data-i="' + i + '" checked style="width:auto;min-height:0"></td><td>' + esc(r.type || '') + '</td><td>' + esc(r.fromName) + '<br><small>' + esc(r.from) + '</small></td><td><b>' + esc(r.toName) + '</b><br><small>' + esc(r.to) + '</small></td></tr>').join('')
        + '</tbody></table></div><div class="btnrow" style="margin-top:10px"><button class="btn btn-green" onclick="chExecuteOrphans()">✔ نقل المحدد (' + R.length + ')</button><button class="btn btn-red" onclick="closeModal()">إغلاق</button></div>';
}
const chSel = () => Array.from(document.querySelectorAll('#chOut .chk:checked')).map(c => +c.dataset.i);
const cp = arr => arr.map(r => Array.isArray(r) ? r.slice() : (r && typeof r === 'object' ? Object.assign({}, r) : r));

async function chExecute() {
    const sel = chSel().map(i => window.__chPlans[i]).filter(p => p && p.ok);
    if (!sel.length) { toast('لم تحدد أي أسرة', 'warn'); return; }
    if (new Set(sel.map(p => p.newId)).size !== sel.length) { alert('⛔ توجد زوجتان بنفس الهوية في الأسر المحددة. أزل إحداهما.'); return; }
    if (!confirm('سيتم استبدال رب الأسرة في ' + sel.length + ' أسرة ونقل مساعداتها. متابعة؟\n(ستُنزَّل نسخة احتياطية تلقائياً أولاً)')) return;
    if (!await backupAll()) return;
    const fams = cp(getDB('db_families')), aids = cp(getDB('db_aids')), kids = cp(getDB('db_children')), reqs = cp(getDB('db_edit_requests'));
    sel.forEach(p => {
        const f = fams[p.idx], s = p.slot, oldName = f[1], oldId = f[2], oldDob = f[4], wDob = f[s[2]];
        f[1] = p.newName; f[2] = p.newId; f[3] = 'أنثى'; if (wDob) f[4] = wDob;
        f[s[0]] = oldName; f[s[1]] = oldId; f[s[2]] = oldDob || '';
        f[39] = (f[39] ? f[39] + ' | ' : '') + '[' + today() + '] استبدال رب الأسرة: ' + oldName + ' (' + p.oldId + ') ← ' + p.newName + ' (' + p.newId + ')';
        p.aids.forEach(i => { aids[i][0] = p.newName; aids[i][1] = p.newId; });
        p.kids.forEach(i => { kids[i][8] = p.newId; });
        p.reqs.forEach(i => { reqs[i].id = p.newId; reqs[i].name = p.newName; });
    });
    const up = {db_families: fams, db_aids: aids, db_children: kids, db_edit_requests: reqs};
    sel.forEach(p => { const o = safeKey(p.oldId), uid = claimUidOf(o); up['portal/' + o] = null; up['qmeta/' + o] = null; up['verify/' + o] = null; up['pwvault/' + o] = null; if (uid) up['claims/' + uid] = null; });
    const b = document.getElementById('chGo'); if (b) b.classList.add('is-loading');
    rdb.ref().update(up).then(() => {
        localDB.db_families = fams; localDB.db_aids = aids; localDB.db_children = kids; localDB.db_edit_requests = reqs;
        audit('استبدال رب الأسرة بالزوجة', sel.length + ' أسرة | مساعدات منقولة: ' + sel.reduce((n, p) => n + p.aids.length, 0));
        schedulePublish(); closeModal(); refreshNow();
        alert('✅ تم استبدال رب الأسرة في ' + sel.length + ' أسرة ونقل مساعداتها.\n\nتنبيه: حسابات البوابة القديمة (بهوية الزوج) أُلغيت. لتفعيل الحساب الجديد: بتقدر الأسرة تفعّل الحساب الجديد بهوية رب الأسرة الجديدة من بوابة العائلات.');
    }).catch(e => { if (b) b.classList.remove('is-loading'); alert('❌ لم يتم أي تغيير بسبب خطأ: ' + (e && e.message ? e.message : e)); });
}
async function chExecuteOrphans() {
    const sel = chSel().map(i => window.__chOrph[i]).filter(Boolean); if (!sel.length) { toast('لم تحدد أي مساعدة', 'warn'); return; }
    if (!confirm('نقل ' + sel.length + ' مساعدة إلى رب الأسرة الحالي؟')) return;
    if (!await backupAll()) return; const aids = cp(getDB('db_aids'));
    sel.forEach(r => { aids[r.ai][1] = r.to; aids[r.ai][0] = r.toName; });
    rdb.ref().update({db_aids: aids}).then(() => { localDB.db_aids = aids; audit('نقل مساعدات منفصلة', sel.length + ' مساعدة'); schedulePublish(); closeModal(); refreshNow(); toast('تم نقل ' + sel.length + ' مساعدة'); })
        .catch(e => alert('❌ لم يتم أي تغيير: ' + (e && e.message ? e.message : e)));
}
/* زر داخل بطاقة الأسرة */
(function () {
    const _sf2 = showFamilyByKey;
    showFamilyByKey = function (key) {
        _sf2(key); if (isLimited) return; const box = document.getElementById('modalBox'); if (!box || !box.querySelector('h3')) return;
        const row = document.createElement('div'); row.className = 'btnrow'; row.style.marginTop = '10px';
        row.innerHTML = '<button class="btn btn-blue" onclick="openChangeHead(\'' + esc(digitsOf(key)) + '\')">🔁 استبدال رب الأسرة بالزوجة</button>'; box.appendChild(row);
    };
})();

/* ==========================================================================
   كود ثابت لكل أسرة (حرف القاطع + 3 أرقام، مثل s001) + ربط المساعدات به
   الكود لا يتغير أبداً حتى لو تغيّر رب الأسرة أو هويته، وتتبعه المساعدات تلقائياً.
   ========================================================================== */
const secNorm = f => normAr(String(f[0] || '').trim());
const CODE_RE = /^[a-z]\d{3,4}$/i;
function defaultLetter(label, used) {
    const n = normAr(label), rules = [['عبدالله', 's'], ['حسام', 'h'], ['لؤي', 'l'], ['لوي', 'l'], ['محمود', 'm'], ['فادي', 'f'], ['ماجد', 'b'], ['الباز', 'a']];
    for (const [k, l] of rules) if (n.includes(normAr(k)) && !used.has(l)) return l;
    for (const l of 'cdegijknopqrtuvwxyz') if (!used.has(l)) return l;
    return '';
}
function rowArr(r) {
    if (Array.isArray(r)) return r.slice();
    if (r && typeof r === 'object') { const ks = Object.keys(r); if (ks.length && ks.every(k => /^\d+$/.test(k))) return Array.from({length: Math.max.apply(null, ks.map(Number)) + 1}, (_, i) => (r[i] == null ? '' : r[i])); }
    return r;
}
function codeLetters() { return (localDB.config && localDB.config.codeLetters) || null; }

/* تعيين الأكواد داخل transaction: لا يطمس تعديلات مدير آخر، ويحافظ على الأكواد الموجودة */
function assignCodesTxn(map) {
    return rdb.ref('db_families').transaction(cur => {
        if (cur == null) return cur;
        const arr = (Array.isArray(cur) ? cur : Object.keys(cur).sort((a, b) => a - b).map(k => cur[k])).map(rowArr);
        const max = {}, seen = new Set();
        arr.forEach(f => { if (Array.isArray(f) && CODE_RE.test(String(f[40] || ''))) { const c = String(f[40]).toLowerCase(), L = c[0], n = +c.slice(1); if (seen.has(c)) { f[40] = ''; return; } seen.add(c); max[L] = Math.max(max[L] || 0, n); } });
        arr.forEach(f => {
            if (!Array.isArray(f) || CODE_RE.test(String(f[40] || ''))) return;
            const L = map[secNorm(f)]; if (!L) return; max[L] = (max[L] || 0) + 1; if (max[L] > 9999) return;
            while (f.length < 40) f.push(''); f[40] = L + String(max[L]).padStart(4, '0');
        });
        return arr;
    });
}
/* ربط المساعدات بكود الأسرة وإبقاء هويتها متزامنة مع هوية رب الأسرة الحالية */
function aidFix(a, byCode, byId, apply) {
    if (!Array.isArray(a)) return false; const code = String(a[6] || '').toLowerCase(), f = code && byCode[code];
    if (f) { if (digitsOf(a[1]) !== digitsOf(f[2])) { if (apply) { a[0] = f[1]; a[1] = f[2]; } return true; } return false; }
    if (!code) { const g = byId[digitsOf(a[1])]; if (g && g[40]) { if (apply) { while (a.length < 6) a.push(''); a[6] = String(g[40]).toLowerCase(); } return true; } }
    return false;
}
function relinkAids() {
    if (isLimited || window.__relinking) return;
    const byCode = {}, byId = {}; getDB('db_families').filter(Boolean).forEach(f => { if (f[40]) byCode[String(f[40]).toLowerCase()] = f; byId[digitsOf(f[2])] = f; });
    if (!getDB('db_aids').some(a => aidFix(a, byCode, byId, false))) return;
    window.__relinking = true;
    rdb.ref('db_aids').transaction(cur => {
        if (cur == null) return cur;
        const arr = (Array.isArray(cur) ? cur : Object.keys(cur).sort((a, b) => a - b).map(k => cur[k])).map(rowArr);
        arr.forEach(a => aidFix(a, byCode, byId, true)); return arr;
    }).then(res => { const v = res && res.snapshot && res.snapshot.val(); if (v) { localDB.db_aids = toRows(v); schedulePublish(); } }).catch(e => console.warn('relinkAids', e)).finally(() => { window.__relinking = false; });
}
function autoCodes() {
    if (isLimited || window.__acBusy || Date.now() - (window.__acLast || 0) < 15000) return;
    const map = codeLetters(); if (!map) return;
    const fams = getDB('db_families').filter(Boolean), seen = new Set();
    const need = fams.some(f => { const c = String(f[40] || '').toLowerCase(); if (CODE_RE.test(c)) { if (seen.has(c)) return true; seen.add(c); return false; } return !!map[secNorm(f)]; });
    window.__acLast = Date.now();
    if (!need) { relinkAids(); return; }
    window.__acBusy = true;
    assignCodesTxn(map).then(res => { const v = res && res.snapshot && res.snapshot.val(); if (v) { localDB.db_families = toRows(v); schedulePublish(); } setTimeout(relinkAids, 800); })
        .catch(e => console.warn('autoCodes', e)).finally(() => { window.__acBusy = false; });
}
(function () { const _ld2 = loadDashboard; loadDashboard = function () { _ld2(); setTimeout(autoCodes, 1200); }; })();

/* ---------- أداة الأكواد ---------- */
function openCodesTool() {
    if (isLimited) { alert('⛔ هذه الأداة للمدير العام فقط.'); return; }
    const fams = getDB('db_families').filter(Boolean), saved = codeLetters() || {}, groups = {}, used = new Set();
    fams.forEach(f => { const k = secNorm(f), g = groups[k] = groups[k] || {n: 0, coded: 0, labels: {}}; g.n++; if (CODE_RE.test(String(f[40] || ''))) g.coded++; const lb = String(f[0] || '').trim(); g.labels[lb] = (g.labels[lb] || 0) + 1; });
    Object.keys(groups).forEach(k => { if (saved[k]) used.add(saved[k]); });
    const rows = Object.keys(groups).sort((a, b) => groups[b].n - groups[a].n).map(k => {
        const g = groups[k], label = Object.keys(g.labels).sort((a, b) => g.labels[b] - g.labels[a])[0] || 'بدون قاطع';
        const L = saved[k] || defaultLetter(label, used); if (L) used.add(L);
        return '<tr><td>' + esc(label) + '</td><td>' + g.n + '</td><td>' + g.coded + '</td><td><input class="cl" data-k="' + esc(k) + '" maxlength="1" value="' + esc(L) + '" style="width:60px;text-align:center;direction:ltr;text-transform:lowercase"></td><td dir="ltr" style="color:#7b808c">' + esc((L || '?') + '001') + '</td></tr>';
    }).join('');
    const unc = fams.filter(f => !CODE_RE.test(String(f[40] || ''))).length;
    openModal('<h3>🏷️ أكواد الأسر</h3><p style="color:#5d6e73;margin:4px 0 10px;line-height:1.8">لكل أسرة <b>كود ثابت</b> من حرف القاطع وثلاث خانات (مثل <b dir="ltr">s001</b>). لا يتغير الكود أبداً حتى لو تغيّر رب الأسرة أو هويته، وتتبعه المساعدات تلقائياً. الأسر التي لها كود تحتفظ به، ويُعطى الجديد رقماً تالياً دون إعادة استخدام أي رقم.</p>'
        + '<div class="table-responsive"><table><thead><tr><th>القاطع</th><th>عدد الأسر</th><th>لها كود</th><th>الحرف</th><th>مثال</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        + '<p style="font-size:13px;margin:10px 0 0">أسر بلا كود حالياً: <b>' + unc + '</b></p>'
        + '<div class="btnrow" style="margin-top:12px"><button class="btn btn-green" id="cdGo" onclick="codesGenerate()">🏷️ حفظ الحروف وتوليد الأكواد الناقصة</button><button class="btn btn-blue" onclick="codesExport()">⬇ كشف الأكواد (Excel)</button><button class="btn btn-red" onclick="closeModal()">إغلاق</button></div>');
    document.getElementById('modalBox').classList.add('wide');
}
async function codesGenerate() {
    const map = {}, letters = new Set();
    for (const el of document.querySelectorAll('#modalBox .cl')) {
        const L = el.value.trim().toLowerCase();
        if (!/^[a-z]$/.test(L)) { toast('اكتب حرفاً إنجليزياً واحداً لكل قاطع', 'warn'); el.focus(); return; }
        if (letters.has(L)) { toast('الحرف «' + L + '» مكرر. لكل قاطع حرف مختلف', 'warn'); el.focus(); return; }
        letters.add(L); map[el.dataset.k] = L;
    }
    if (!confirm('سيتم توليد أكواد للأسر التي ليس لها كود، وربط المساعدات بها. الأكواد الموجودة لن تتغير. متابعة؟')) return;
    if (!await backupAll()) return; const b = document.getElementById('cdGo'); b.classList.add('is-loading');
    const before = getDB('db_families').filter(f => f && CODE_RE.test(String(f[40] || ''))).length;
    rdb.ref('config/codeLetters').set(map).then(() => { localDB.config = localDB.config || {}; localDB.config.codeLetters = map; return assignCodesTxn(map); }).then(res => {
        const v = res && res.snapshot && res.snapshot.val(); if (v) localDB.db_families = toRows(v);
        const after = getDB('db_families').filter(f => f && CODE_RE.test(String(f[40] || ''))).length;
        audit('توليد أكواد الأسر', (after - before) + ' كود جديد'); schedulePublish(); setTimeout(relinkAids, 500);
        closeModal(); refreshNow(); toast('تم توليد ' + (after - before) + ' كود جديد، والمجموع ' + after);
    }).catch(e => { b.classList.remove('is-loading'); alert('❌ تعذر التوليد: ' + (e && e.message ? e.message : e)); });
}
function codesExport() {
    const rows = getDB('db_families').filter(Boolean).slice().sort((a, b) => String(a[40] || 'zzz').localeCompare(String(b[40] || 'zzz'))).map(f => [f[40] || '', f[1], f[2], f[0], f[5]]);
    exportRowsToExcel(['كود الأسرة', 'الاسم', 'رقم الهوية', 'القاطع', 'الجوال'], rows, 'كشف_أكواد_الأسر_' + today() + '.xlsx', 'الأكواد');
}
/* كود الأسرة داخل بطاقتها */
(function () {
    const _sf3 = showFamilyByKey;
    showFamilyByKey = function (key) {
        _sf3(key); const box = document.getElementById('modalBox'), h = box && box.querySelector('h3'); if (!h) return;
        const f = famByKey(key); if (!f || !f[40]) return;
        const chip = document.createElement('div'); chip.className = 'code-chip'; chip.textContent = 'كود الأسرة: ' + f[40]; h.insertAdjacentElement('afterend', chip);
    };
})();

// تعرض الجداول الكبيرة صفحة واحدة. البحث والفلاتر يطبّقان على الكشف كاملاً.
const VT = (function () {
    const PAGE = 150;
    function counter(table) {
        const familyCount = table.id === 'familiesTable' && document.getElementById('famCount');
        if (familyCount) return familyCount;
        let element = document.getElementById(table.id + 'Count');
        const wrapper = table.parentElement;
        if (!element && wrapper && wrapper.parentElement) {
            element = document.createElement('div');
            element.id = table.id + 'Count';
            element.style.cssText = 'font-size:12px;color:#64748b;margin:7px 0;';
            wrapper.before(element);
        }
        return element;
    }
    function render(tbody) {
        const state = tbody.__V, table = tbody.closest('table');
        if (!state || !table) return;
        const predicate = ADV.predicate(table.id), query = state.q;
        const matches = [];
        for (let index = 0; index < state.n; index++) {
            if ((!state.familyFilter || state.familyFilter(index)) &&
                (!query || matchTokens(state.txt[index], query)) &&
                (!predicate || predicate(state.cells[index]))) matches.push(index);
        }
        state.matches = matches;
        const pages = Math.max(1, Math.ceil(matches.length / PAGE));
        state.page = Math.min(state.page, pages - 1);
        const start = state.page * PAGE;
        const width = table.tHead ? table.tHead.rows[0].cells.length : 8;
        let html = matches.slice(start, start + PAGE).map(state.make).join('');
        if (!matches.length) {
            html = '<tr class="adv-empty"><td colspan="' + width + '">' +
                (query || predicate ? 'لا توجد نتائج مطابقة.' : 'لا توجد سجلات في هذا الكشف.') + '</td></tr>';
        } else if (pages > 1) {
            html += `<tr><td colspan="${width}">
                <button type="button" class="btn" data-page-step="-1" ${state.page === 0 ? 'disabled' : ''}>السابق</button>
                <span>صفحة ${state.page + 1} من ${pages}</span>
                <button type="button" class="btn btn-blue" data-page-step="1" ${state.page === pages - 1 ? 'disabled' : ''}>التالي</button>
            </td></tr>`;
        }
        tbody.innerHTML = html;
        tbody.querySelectorAll('[data-page-step]').forEach(button => {
            button.onclick = () => {
                state.page += Number(button.dataset.pageStep);
                render(tbody);
                table.scrollIntoView({block: 'start'});
            };
        });
        const count = counter(table);
        if (count) count.textContent = 'السجلات المطابقة: ' + matches.length + ' من ' + state.n;
        const box = document.querySelector('.adv[data-for="' + table.id + '"]');
        if (box) {
            box.querySelector('.adv-result').textContent = 'النتائج: ' + matches.length + ' من ' + state.n;
            box.querySelector('.adv-count').textContent = ADV.activeCount(table.id) || '';
        }
    }
    return {render};
})();

/* ==========================================================================
   المخزون والمواد العينية: سيارات مياه، تكايا، ربطات خبز، صواني رز... (وارد / موزَّع / متبقي)
   ========================================================================== */
const STOCK_DEFAULT = [{n: 'سيارة مياه', u: 'سيارة', i: '🚛'}, {n: 'تكية', u: 'تكية', i: '🍲'}, {n: 'ربطة خبز', u: 'ربطة', i: '🍞'}, {n: 'صنية رز', u: 'صنية', i: '🍚'}];
function stockItems() {
    const c = localDB.config && localDB.config.stockItems, arr = Array.isArray(c) ? c : (c && typeof c === 'object' ? Object.values(c) : null);
    const ok = (arr || []).filter(x => x && x.n); return ok.length ? ok : STOCK_DEFAULT;
}
const stockNum = v => parseFloat(toLatin(String(v == null ? '' : v)).replace(/[^\d.\-]/g, '')) || 0;
function stockISO(v) { const m = formatDateValue(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; }
function stockFrom(p) {
    const d = new Date(); const iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    if (p === 'today') return iso(d); if (p === '7') { d.setDate(d.getDate() - 6); return iso(d); } if (p === 'month') { d.setDate(1); return iso(d); } return '';
}
const fmtQ = n => (Math.round(n * 100) / 100).toLocaleString('en-US');
const PERIOD_LBL = {today: 'اليوم', '7': 'آخر 7 أيام', month: 'هذا الشهر', all: 'الكل'};

function buildStockTab() {
    const fund = document.getElementById('fund-tab'); if (!fund || document.getElementById('stock-tab')) return;
    const d = document.createElement('div'); d.id = 'stock-tab'; d.className = 'tab-content';
    d.innerHTML = '<div class="header"><h1>📦 المخزون والمواد العينية</h1><p style="margin:2px 0 0;color:#7b808c;font-size:13px">سجّل ما يصل المخيم من مواد (مياه، خبز، أرز، تكايا...) وما يُوزَّع منها، ويحسب النظام المتبقي تلقائياً.</p></div>'
        + '<div class="card"><div class="stock-bar"><div id="stockQuick" class="stock-quick"></div><div class="stock-tools"><label style="margin:0">الفترة:</label><select id="stockPeriod" onchange="window.__stockP=this.value;loadStock()"><option value="today">اليوم</option><option value="7">آخر 7 أيام</option><option value="month">هذا الشهر</option><option value="all">الكل</option></select><button class="btn btn-blue" style="margin:0" onclick="openStockDialog()">➕ تسجيل حركة</button><button class="btn btn-blue" style="margin:0" onclick="openStockItems()">⚙️ الأصناف</button></div></div></div>'
        + '<div id="stockTiles" class="stat-grid"></div>'
        + '<div class="card"><h2 class="card-title">📋 سجل الحركات</h2><div class="btnrow" style="gap:10px;flex-wrap:wrap"><input type="text" id="stockSearch" oninput="filterSimpleTable(\'stockTable\',\'stockSearch\')" placeholder="🔍 بحث بالصنف / الجهة / التاريخ..." style="flex:1;min-width:220px"><button class="btn btn-blue" style="margin:0" onclick="exportExcel(\'stockTable\',\'المخزون.xlsx\')">📥 تصدير إكسل</button></div>'
        + '<div class="table-responsive"><table id="stockTable"><thead><tr><th>#</th><th>التاريخ</th><th>الحركة</th><th>الصنف</th><th>الكمية</th><th>الوحدة</th><th>الجهة / المستلم</th><th>ملاحظات</th><th>إجراء</th></tr></thead><tbody></tbody></table></div></div>';
    fund.insertAdjacentElement('afterend', d);
    const nav = document.getElementById('nav-fund');
    if (nav) { const li = document.createElement('li'); li.id = 'nav-stock'; li.setAttribute('onclick', "switchTab('stock')"); li.textContent = '📦 المخزون والمواد'; nav.insertAdjacentElement('afterend', li); }
}
buildStockTab(); // قبل تهيئة الفلاتر حتى يتفعّل نظام الفلترة على الجدول
(function () { const _s = switchTab; switchTab = function (n, s, fromHistory) { if (!canOpenAdminPage(n)) return; _s(n, s, fromHistory); if (n === 'stock') loadStock(); }; })();

function stockAgg() {
    const items = stockItems(), from = stockFrom(window.__stockP || 'today'), agg = {}, order = [];
    items.forEach(it => { agg[it.n] = {it, tin: 0, tout: 0, pin: 0, pout: 0}; order.push(it.n); });
    getDB('db_stock').filter(Array.isArray).forEach(r => {
        const nm = String(r[2] || '').trim(); if (!nm) return;
        if (!agg[nm]) { agg[nm] = {it: {n: nm, u: r[4] || '', i: '📦'}, tin: 0, tout: 0, pin: 0, pout: 0}; order.push(nm); }
        const a = agg[nm], q = stockNum(r[3]), inc = String(r[1]).includes('وارد'), iso = stockISO(r[0]);
        if (inc) a.tin += q; else a.tout += q; if (!from || iso >= from) { if (inc) a.pin += q; else a.pout += q; }
    });
    return {agg, order, from};
}
function stockBalance(name) { const {agg} = stockAgg(); const a = agg[name]; return a ? a.tin - a.tout : 0; }
function loadStock() {
    const sel = document.getElementById('stockPeriod'); if (sel) sel.value = window.__stockP || 'today';
    const {agg, order} = stockAgg(), per = PERIOD_LBL[window.__stockP || 'today'], tones = ['t-lav', 't-mint', 't-pink', 't-sky', 't-peach'];
    document.getElementById('stockQuick').innerHTML = stockItems().map(it => '<div class="sq"><span class="sq-n">' + esc(it.i || '📦') + ' ' + esc(it.n) + '</span><button class="btn btn-green" onclick="openStockDialog(\'' + esc(it.n).replace(/'/g, '&#39;') + '\',\'وارد\')">＋ وصل</button><button class="btn btn-blue" onclick="openStockDialog(\'' + esc(it.n).replace(/'/g, '&#39;') + '\',\'صادر\')">− وُزّع</button></div>').join('');
    document.getElementById('stockTiles').innerHTML = order.map((nm, i) => {
        const a = agg[nm], bal = a.tin - a.tout, u = a.it.u || '';
         const low = a.it.m > 0 && bal <= a.it.m;
        return '<div class="stat ' + tones[i % 5] + (low ? ' low' : '') + ' clickable" role="button" tabindex="0" style="--i:' + i + '" onclick="drillStock(' + i + ')" onkeydown="if(event.key===\'Enter\')this.click()"><span class="s-ic">' + esc(a.it.i || '📦') + '</span><span class="s-l">' + esc(nm) + ' (المتبقي)</span><b class="' + (bal < 0 ? 'neg' : '') + '">' + fmtQ(bal) + ' <small>' + esc(u) + '</small></b><span class="s-sub">' + per + ': وصل <b>' + fmtQ(a.pin) + '</b> · وُزّع <b>' + fmtQ(a.pout) + '</b></span>' + (low ? '<span class="s-sub" style="color:#c0392b;font-weight:700">⚠️ أقل من حد التنبيه (' + fmtQ(a.it.m) + ')</span>' : '') + '<span class="s-sub">الإجمالي: وارد ' + fmtQ(a.tin) + ' · صادر ' + fmtQ(a.tout) + '</span><span class="s-go" aria-hidden="true">↗</span></div>';
    }).join('');
    window.__stockOrder = order;
    loadTable('db_stock', 'stockTable', 7);
}
function drillStock(i) {
    const name = (window.__stockOrder || [])[i]; if (name == null) return;
    DR.stk = {title: 'حركات: ' + name, cols: ['التاريخ', 'الحركة', 'الكمية', 'الوحدة', 'الجهة / المستلم', 'ملاحظات'], open: 'stock',
        rows: () => getDB('db_stock').filter(r => Array.isArray(r) && String(r[2] || '').trim() === name).sort((a, b) => stockISO(b[0]).localeCompare(stockISO(a[0]))).map(r => ({c: [formatDateValue(r[0]), r[1], r[3], r[4], r[5], r[6]]}))};
    drill('stk');
}
function openStockDialog(item, dir) {
    if (isLimited) { alert('⛔ غير مصرح.'); return; }
    const items = stockItems(), cur = item || (items[0] && items[0].n) || '', parties = Array.from(new Set(getDB('db_stock').filter(Array.isArray).map(r => String(r[5] || '').trim()).filter(Boolean)));
    openModal('<h3>📦 تسجيل حركة مواد</h3>'
        + '<div class="sk-dir"><label class="sk-pill"><input type="radio" name="skdir" value="وارد" ' + (dir !== 'صادر' ? 'checked' : '') + '><span>⬇️ وصل إلى المخيم</span></label><label class="sk-pill"><input type="radio" name="skdir" value="صادر" ' + (dir === 'صادر' ? 'checked' : '') + '><span>⬆️ وُزّع / خرج</span></label></div>'
        + '<div class="form-grid"><div class="input-group"><label>الصنف</label><select id="sk_item" onchange="stockItemChange()">' + items.map(it => '<option value="' + esc(it.n) + '"' + (it.n === cur ? ' selected' : '') + '>' + esc((it.i || '') + ' ' + it.n) + '</option>').join('') + '<option value="__new">➕ صنف آخر...</option></select><input type="text" id="sk_new" placeholder="اسم الصنف الجديد" style="display:none;margin-top:6px"></div>'
        + '<div class="input-group"><label>الكمية</label><input type="number" id="sk_qty" min="0.01" step="any" inputmode="decimal" placeholder="مثال: 3"></div>'
        + '<div class="input-group"><label>الوحدة</label><input type="text" id="sk_unit"></div>'
        + '<div class="input-group"><label>التاريخ</label><input type="date" id="sk_date" value="' + today() + '"></div>'
        + '<div class="input-group"><label>الجهة المتبرعة / المستلمة</label><input type="text" id="sk_party" list="sk_parties" placeholder="اختياري"><datalist id="sk_parties">' + parties.map(p => '<option value="' + esc(p) + '">').join('') + '</datalist></div>'
        + '<div class="input-group"><label>ملاحظات</label><input type="text" id="sk_note" placeholder="اختياري"></div></div>'
        + '<div id="sk_bal" style="font-size:13px;color:#5d6e73;margin:6px 0"></div>'
        + '<div class="btnrow" style="margin-top:12px"><button class="btn btn-green" id="skSave" onclick="saveStock()">💾 حفظ</button><button class="btn btn-red" onclick="closeModal()">إلغاء</button></div>');
    stockItemChange(); document.getElementById('sk_qty').focus();
}
function stockItemChange() {
    const s = document.getElementById('sk_item'), isNew = s.value === '__new'; document.getElementById('sk_new').style.display = isNew ? '' : 'none';
    const it = stockItems().find(x => x.n === s.value); if (it && !document.getElementById('sk_unit').dataset.touched) document.getElementById('sk_unit').value = it.u || '';
    document.getElementById('sk_unit').oninput = function () { this.dataset.touched = '1'; };
    document.getElementById('sk_bal').textContent = isNew ? '' : 'المتبقي الحالي من «' + s.value + '»: ' + fmtQ(stockBalance(s.value));
}
function saveStock() {
    const dir = (document.querySelector('input[name=skdir]:checked') || {}).value, sel = document.getElementById('sk_item').value;
    const item = sel === '__new' ? document.getElementById('sk_new').value.trim() : sel, qty = stockNum(document.getElementById('sk_qty').value);
    if (!item) { toast('اختر الصنف أو اكتب اسمه', 'warn'); return; } if (!(qty > 0)) { toast('اكتب كمية صحيحة أكبر من صفر', 'warn'); return; }
    const bal = stockBalance(item);
    if (dir === 'صادر' && qty > bal && !confirm('الكمية الموزعة (' + fmtQ(qty) + ') أكبر من المتبقي (' + fmtQ(bal) + ') من «' + item + '». هل تريد المتابعة؟')) return;
    const row = [document.getElementById('sk_date').value || today(), dir, item, qty, document.getElementById('sk_unit').value.trim(), document.getElementById('sk_party').value.trim(), document.getElementById('sk_note').value.trim()];
    const b = document.getElementById('skSave'); b.classList.add('is-loading');
    appendDBRecord('db_stock', row).then(() => { audit('مخزون: ' + dir, item + ' × ' + qty); closeModal(); toast((dir === 'وارد' ? 'تم تسجيل وصول ' : 'تم تسجيل توزيع ') + fmtQ(qty) + ' ' + (row[4] || '') + ' من ' + item); refreshNow(); })
        .catch(e => { b.classList.remove('is-loading'); alert('❌ تعذر الحفظ: ' + (e && e.message ? e.message : e)); });
}
function stockItemRow(it) {
    return '<tr><td><input class="si-i" value="' + esc(it.i || '') + '" maxlength="2" style="width:56px;text-align:center"></td><td><input class="si-n" value="' + esc(it.n) + '" placeholder="اسم الصنف"></td><td><input class="si-u" value="' + esc(it.u || '') + '" placeholder="الوحدة" style="width:110px"></td><td><input class="si-m" type="number" min="0" value="' + (it.m || '') + '" placeholder="اختياري" style="width:90px"></td><td><button type="button" class="btn btn-red" style="margin:0;padding:4px 10px" onclick="this.closest(\'tr\').remove()">حذف</button></td></tr>';
}
function stockAddItemRow() {
    const body = document.getElementById('siBody'); body.insertAdjacentHTML('beforeend', stockItemRow({i: '📦', n: '', u: ''}));
    const last = body.lastElementChild; if (last) last.querySelector('.si-n').focus();
}
function openStockItems() {
    if (isLimited) { alert('⛔ غير مصرح.'); return; }
    openModal('<h3>⚙️ أصناف المخزون</h3><p style="color:#5d6e73;font-size:13px;margin:4px 0 10px">أضف أي صنف يصل المخيم (مياه، خبز، أرز، طرود...) مع وحدة العدّ. حذف صنف من هنا لا يحذف حركاته المسجلة.</p>'
        + '<div class="table-responsive"><table><thead><tr><th>رمز</th><th>اسم الصنف</th><th>الوحدة</th><th>حد التنبيه</th><th></th></tr></thead><tbody id="siBody">' + stockItems().map(stockItemRow).join('') + '</tbody></table></div>'
        + '<div class="btnrow" style="margin-top:10px"><button type="button" class="btn btn-blue" onclick="stockAddItemRow()">➕ صنف جديد</button><button type="button" class="btn btn-green" onclick="saveStockItems()">💾 حفظ</button><button type="button" class="btn btn-red" onclick="closeModal()">إلغاء</button></div>');
}
function saveStockItems() {
    const arr = Array.from(document.querySelectorAll('#siBody tr')).map(tr => ({i: tr.querySelector('.si-i').value.trim() || '📦', n: tr.querySelector('.si-n').value.trim(), u: tr.querySelector('.si-u').value.trim(), m: parseFloat(tr.querySelector('.si-m').value) || 0})).filter(x => x.n);
    if (!arr.length) { toast('أضف صنفاً واحداً على الأقل', 'warn'); return; }
    if (new Set(arr.map(x => x.n)).size !== arr.length) { toast('يوجد صنفان بنفس الاسم', 'warn'); return; }
    rdb.ref('config/stockItems').set(arr).then(() => { localDB.config = localDB.config || {}; localDB.config.stockItems = arr; audit('تعديل أصناف المخزون', arr.length + ' صنف'); closeModal(); toast('تم حفظ الأصناف'); refreshNow(); })
        .catch(e => alert('❌ تعذر الحفظ: ' + (e && e.message ? e.message : e)));
}


/* ==========================================================================
   التقارير: المساعدات الموزعة (حسب شهر/فترة) + الصندوق المالي + المخزون + شامل
   عرض على الشاشة، طباعة (PDF)، وتصدير إلى Excel
   ========================================================================== */
const RMONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const p2r = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2r(d.getMonth() + 1) + '-' + p2r(d.getDate());
const moneyR = v => (Math.round(v * 100) / 100).toLocaleString('en-US') + ' ₪';

function buildReportsTab() {
    const anchor = document.getElementById('stock-tab') || document.getElementById('fund-tab'); if (!anchor || document.getElementById('reports-tab')) return;
    const d = document.createElement('div'); d.id = 'reports-tab'; d.className = 'tab-content';
    d.innerHTML = '<div class="header"><h1>📑 التقارير</h1><p style="margin:2px 0 0;color:#7b808c;font-size:13px">اختر نوع التقرير والفترة، ثم اعرضه أو اطبعه أو صدّره إلى Excel.</p></div>'
        + '<div class="card"><div class="rp-form">'
        + '<div class="input-group"><label>نوع التقرير</label><select id="rp_type" onchange="repExtra()"></select></div>'
        + '<div class="input-group"><label>الفترة</label><select id="rp_mode" onchange="repModeChange()"><option value="month">شهر محدد</option><option value="prev">الشهر الماضي</option><option value="year">السنة الحالية</option><option value="custom">فترة مخصصة</option><option value="all">كل الفترات</option></select></div>'
        + '<div class="input-group" id="rp_monthBox"><label>الشهر</label><input type="month" id="rp_month"></div>'
        + '<div class="input-group" id="rp_fromBox" style="display:none"><label>من تاريخ</label><input type="date" id="rp_from"></div>'
        + '<div class="input-group" id="rp_toBox" style="display:none"><label>إلى تاريخ</label><input type="date" id="rp_to"></div>'
        + '<div id="rp_extra" style="display:contents"></div></div>'
        + '<div class="btnrow" style="margin-top:6px"><button class="btn btn-green" onclick="repRun()">📊 عرض التقرير</button><button class="btn btn-blue" onclick="repPrint()">🖨 طباعة / PDF</button><button class="btn btn-blue" onclick="repExcel()">⬇ Excel</button></div></div>'
        + '<div id="repOut"><div class="card" style="text-align:center;color:#7b808c;padding:40px!important">اختر التقرير والفترة ثم اضغط «عرض التقرير».</div></div>';
    anchor.insertAdjacentElement('afterend', d);
    const nav = document.getElementById('nav-stock') || document.getElementById('nav-fund');
    if (nav) { const li = document.createElement('li'); li.id = 'nav-reports'; li.setAttribute('onclick', "switchTab('reports')"); li.textContent = '📑 التقارير'; nav.insertAdjacentElement('afterend', li); }
}
buildReportsTab();
(function () { const _s = switchTab; switchTab = function (n, s, fromHistory) { if (!canOpenAdminPage(n)) return; _s(n, s, fromHistory); if (n === 'reports') repInit(); }; })();

function repInit() {
    const t = document.getElementById('rp_type'); if (!t) return;
    if (!t.options.length) {
        const types = [['aids', '📦 تقرير المساعدات الموزعة']].concat(isLimited ? [] : [['fund', '💰 تقرير الصندوق المالي'], ['stock', '🧺 تقرير المخزون والمواد العينية'], ['all', '🗂️ التقرير الشامل']]);
        t.innerHTML = types.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('');
        const m = document.getElementById('rp_month'); if (!m.value) m.value = isoOf(new Date()).slice(0, 7);
        repExtra();
    }
}
function repModeChange() {
    const m = document.getElementById('rp_mode').value;
    document.getElementById('rp_monthBox').style.display = m === 'month' ? '' : 'none';
    document.getElementById('rp_fromBox').style.display = document.getElementById('rp_toBox').style.display = m === 'custom' ? '' : 'none';
}
function repExtra() {
    const box = document.getElementById('rp_extra'), type = document.getElementById('rp_type').value;
    if (type !== 'aids') { box.innerHTML = ''; return; }
    const aids = getDB('db_aids').filter(Array.isArray), uniq = i => Array.from(new Set(aids.map(a => String(a[i] || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ar'));
    const opt = (arr, all) => '<option value="">' + all + '</option>' + arr.map(x => '<option value="' + esc(x) + '">' + esc(x) + '</option>').join('');
    box.innerHTML = '<div class="input-group"><label>القاطع</label><select id="rp_sector">' + opt(uniq(2), 'كل القواطع') + '</select></div><div class="input-group"><label>نوع المساعدة</label><select id="rp_atype">' + opt(uniq(3), 'كل الأنواع') + '</select></div>';
}
function repPeriod() {
    const mode = document.getElementById('rp_mode').value, now = new Date(); let from = '', to = '', label = 'كل الفترات';
    const monthRange = (y, mo) => { const last = new Date(y, mo, 0).getDate(); return [y + '-' + p2r(mo) + '-01', y + '-' + p2r(mo) + '-' + p2r(last), 'شهر ' + RMONTHS[mo - 1] + ' ' + y]; };
    if (mode === 'month') { const v = document.getElementById('rp_month').value || isoOf(now).slice(0, 7), [y, mo] = v.split('-').map(Number); [from, to, label] = monthRange(y, mo); }
    else if (mode === 'prev') { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); [from, to, label] = monthRange(d.getFullYear(), d.getMonth() + 1); }
    else if (mode === 'year') { from = now.getFullYear() + '-01-01'; to = now.getFullYear() + '-12-31'; label = 'سنة ' + now.getFullYear(); }
    else if (mode === 'custom') { from = document.getElementById('rp_from').value; to = document.getElementById('rp_to').value; if (from && to && from > to) { const x = from; from = to; to = x; } label = 'من ' + (from ? formatDateValue(from) : 'البداية') + ' إلى ' + (to ? formatDateValue(to) : 'اليوم'); }
    return {from, to, label, all: !from && !to, inR: iso => (!from || iso >= from) && (!to || iso <= to)};
}
const famByIdMap = () => { const m = {}; getDB('db_families').filter(Boolean).forEach(f => { m[digitsOf(f[2])] = f; }); return m; };

/* ---------- 1) المساعدات ---------- */
function repAids(P) {
    const fm = famByIdMap(), fs = (document.getElementById('rp_sector') || {}).value || '', ft = (document.getElementById('rp_atype') || {}).value || '';
    const sel = [], undated = [];
    getDB('db_aids').filter(Array.isArray).forEach(a => {
        if (fs && String(a[2] || '').trim() !== fs) return; if (ft && String(a[3] || '').trim() !== ft) return;
        const iso = aidISO(a[4]);
        if (!iso) { undated.push(a); if (P.all) sel.push({a, iso: ''}); return; }
        if (P.inR(iso)) sel.push({a, iso});
    });
    sel.sort((x, y) => x.iso.localeCompare(y.iso));
    const fam = new Set(sel.map(s => digitsOf(s.a[1])).filter(Boolean)), qty = sel.reduce((n, s) => n + (stockNum(s.a[5]) || 1), 0);
    const grp = (keyFn) => { const m = {}; sel.forEach(s => { const k = keyFn(s.a) || 'غير محدد'; (m[k] = m[k] || {n: 0, q: 0, f: new Set()}); m[k].n++; m[k].q += stockNum(s.a[5]) || 1; m[k].f.add(digitsOf(s.a[1])); }); return Object.entries(m).sort((a, b) => b[1].n - a[1].n); };
    const R = {title: 'تقرير المساعدات الموزعة', sub: P.label + (fs ? ' — قاطع: ' + fs : '') + (ft ? ' — نوع: ' + ft : ''), tiles: [{l: 'عدد المساعدات', v: sel.length, t: 't-lav', i: '📦'}, {l: 'أسر مستفيدة', v: fam.size, t: 't-mint', i: '🏠'}, {l: 'إجمالي الكمية', v: fmtQ(qty), t: 't-sky', i: '🔢'}, {l: 'أنواع المساعدات', v: grp(a => String(a[3] || '').trim()).length, t: 't-pink', i: '🏷️'}], sections: [], notes: []};
    R.sections.push({h: 'حسب نوع المساعدة', cols: ['النوع', 'عدد المساعدات', 'الكمية', 'عدد الأسر'], rows: grp(a => String(a[3] || '').trim()).map(([k, v]) => [k, v.n, v.q, v.f.size]), bar: 1});
    R.sections.push({h: 'حسب القاطع', cols: ['القاطع', 'عدد المساعدات', 'عدد الأسر'], rows: grp(a => String(a[2] || '').trim()).map(([k, v]) => [k, v.n, v.f.size]), bar: 1});
    R.sections.push({h: 'تفاصيل المساعدات', cols: ['التاريخ', 'الكود', 'الاسم', 'الهوية', 'القاطع', 'النوع', 'الكمية'], rows: sel.map(s => { const f = fm[digitsOf(s.a[1])]; return [s.iso ? formatDateValue(s.iso) : 'بلا تاريخ', (f && f[40]) || s.a[6] || '', s.a[0], s.a[1], s.a[2], s.a[3], stockNum(s.a[5]) || 1]; }), limit: 100});
    const amb = sel.filter(s => /^\s*\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2}\s*$/.test(toLatin(String(s.a[4] || '')))).length;
    if (amb) R.notes.push('ℹ️ ' + amb + ' سجل تاريخه مكتوب بخانتين للسنة (مثل 10/5/26) وفُسِّر بصيغة شهر/يوم/سنة (صيغة Excel الأمريكية). تأكد أن هذا يطابق كشفكم.');
    if (undated.length && !P.all) { R.notes.push('⚠️ ' + undated.length + ' سجل مساعدات ليس له تاريخ مقروء، لذلك لا يدخل في أي تقرير محدد بفترة. التاريخ يُقرأ من عمود «ملاحظة» في كشف الاستلام.'); R.sections.push({h: 'سجلات بلا تاريخ (غير محتسبة)', cols: ['الاسم', 'الهوية', 'القاطع', 'النوع', 'الملاحظة'], rows: undated.map(a => [a[0], a[1], a[2], a[3], a[4]]), limit: 30, noPrint: true}); }
    return R;
}
/* ---------- 2) الصندوق ---------- */
function repFund(P) {
    let open = 0, inn = 0, out = 0, undated = 0; const party = {in: {}, out: {}}, days = {}, det = [];
    getDB('db_fund').filter(Array.isArray).forEach(r => {
        const iso = stockISO(r[0]), amt = stockNum(r[2]), inc = String(r[1]).includes('وارد'); if (!iso) { undated++; if (!P.all) return; }
        if (iso && P.from && iso < P.from) { open += inc ? amt : -amt; return; } if (iso && P.to && iso > P.to) return;
        if (inc) inn += amt; else out += amt;
        const who = String(r[3] || '').trim() || 'غير محدد', pm = party[inc ? 'in' : 'out']; (pm[who] = pm[who] || {s: 0, n: 0}); pm[who].s += amt; pm[who].n++;
        const dk = iso || 'بلا تاريخ'; (days[dk] = days[dk] || {i: 0, o: 0}); days[dk][inc ? 'i' : 'o'] += amt;
        det.push({iso, r, amt, inc});
    });
    det.sort((a, b) => a.iso.localeCompare(b.iso));
    const pr = o => Object.entries(o).sort((a, b) => b[1].s - a[1].s).map(([k, v]) => [k, v.s, v.n]);
    const R = {title: 'تقرير الصندوق المالي', sub: P.label, tiles: [{l: 'الرصيد الافتتاحي', v: moneyR(open), t: 't-sky', i: '🏦'}, {l: 'إجمالي الوارد', v: moneyR(inn), t: 't-mint', i: '⬇️'}, {l: 'إجمالي الصادر', v: moneyR(out), t: 't-pink', i: '⬆️'}, {l: 'الرصيد الختامي', v: moneyR(open + inn - out), t: 't-dark', i: '💰'}], sections: [], notes: []};
    R.sections.push({h: 'ملخص الفترة', cols: ['البند', 'المبلغ'], rows: [['الرصيد الافتتاحي', open], ['إجمالي الوارد', inn], ['إجمالي الصادر', out], ['صافي الحركة', inn - out], ['الرصيد الختامي', open + inn - out]], money: [1]});
    R.sections.push({h: 'الوارد حسب الجهة المتبرعة', cols: ['الجهة', 'المبلغ', 'عدد الحركات'], rows: pr(party.in), money: [1], bar: 1});
    R.sections.push({h: 'الصادر حسب الجهة المستلمة', cols: ['الجهة', 'المبلغ', 'عدد الحركات'], rows: pr(party.out), money: [1], bar: 1});
    R.sections.push({h: 'الحركة اليومية', cols: ['التاريخ', 'وارد', 'صادر', 'الصافي'], rows: Object.keys(days).sort().map(k => [k === 'بلا تاريخ' ? k : formatDateValue(k), days[k].i, days[k].o, days[k].i - days[k].o]), money: [1, 2, 3]});
    R.sections.push({h: 'تفاصيل القيود', cols: ['التاريخ', 'النوع', 'المبلغ', 'الجهة', 'ملاحظات'], rows: det.map(d => [d.iso ? formatDateValue(d.iso) : 'بلا تاريخ', d.r[1], d.amt, d.r[3], d.r[4]]), money: [2], limit: 100});
    if (undated && !P.all) R.notes.push('⚠️ ' + undated + ' قيد مالي بلا تاريخ مقروء لم يُحتسب في هذه الفترة (ولا في الرصيد الافتتاحي).');
    return R;
}
/* ---------- 3) المخزون ---------- */
function repStock(P) {
    const items = {}, units = {}; stockItems().forEach(it => { items[it.n] = {open: 0, in: 0, out: 0}; units[it.n] = it.u || ''; });
    const party = {}, det = []; let undated = 0;
    getDB('db_stock').filter(Array.isArray).forEach(r => {
        const nm = String(r[2] || '').trim(); if (!nm) return; const iso = stockISO(r[0]), q = stockNum(r[3]), inc = String(r[1]).includes('وارد');
        if (!items[nm]) { items[nm] = {open: 0, in: 0, out: 0}; units[nm] = r[4] || ''; }
        if (!iso) { undated++; if (!P.all) return; }
        if (iso && P.from && iso < P.from) { items[nm].open += inc ? q : -q; return; } if (iso && P.to && iso > P.to) return;
        items[nm][inc ? 'in' : 'out'] += q;
        const who = String(r[5] || '').trim() || 'غير محدد', k = who + '||' + nm; (party[k] = party[k] || {who, nm, in: 0, out: 0}); party[k][inc ? 'in' : 'out'] += q;
        det.push({iso, r, q});
    });
    det.sort((a, b) => a.iso.localeCompare(b.iso));
    const names = Object.keys(items), mov = det.length, ps = Array.from(new Set(Object.values(party).map(p => p.who))).length;
    const R = {title: 'تقرير المخزون والمواد العينية', sub: P.label, tiles: [{l: 'عدد الحركات', v: mov, t: 't-lav', i: '🔄'}, {l: 'أصناف تحركت', v: names.filter(n => items[n].in || items[n].out).length, t: 't-mint', i: '📦'}, {l: 'جهات متعامَل معها', v: ps, t: 't-sky', i: '🤝'}], sections: [], notes: []};
    R.sections.push({h: 'حركة الأصناف', cols: ['الصنف', 'الوحدة', 'الرصيد الافتتاحي', 'وصل', 'وُزّع', 'الرصيد الختامي'], rows: names.map(n => [n, units[n], items[n].open, items[n].in, items[n].out, items[n].open + items[n].in - items[n].out]), bar: 3});
    R.sections.push({h: 'حسب الجهة والصنف', cols: ['الجهة', 'الصنف', 'وصل منها', 'وُزّع لها'], rows: Object.values(party).sort((a, b) => (b.in + b.out) - (a.in + a.out)).map(p => [p.who, p.nm, p.in, p.out])});
    R.sections.push({h: 'تفاصيل الحركات', cols: ['التاريخ', 'الحركة', 'الصنف', 'الكمية', 'الوحدة', 'الجهة', 'ملاحظات'], rows: det.map(d => [d.iso ? formatDateValue(d.iso) : 'بلا تاريخ', d.r[1], d.r[2], d.q, d.r[4], d.r[5], d.r[6]]), limit: 100});
    if (undated && !P.all) R.notes.push('⚠️ ' + undated + ' حركة مخزون بلا تاريخ مقروء لم تُحتسب.');
    return R;
}
/* ---------- 4) الشامل ---------- */
function repAll(P) {
    const A = repAids(P), F = isLimited ? null : repFund(P), S = isLimited ? null : repStock(P);
    const R = {title: 'التقرير الشامل', sub: P.label, tiles: [{l: 'مساعدات موزعة', v: A.tiles[0].v, t: 't-lav', i: '📦'}, {l: 'أسر مستفيدة', v: A.tiles[1].v, t: 't-mint', i: '🏠'}], sections: [], notes: A.notes.slice()};
    if (F) R.tiles.push({l: 'وارد الصندوق', v: F.tiles[1].v, t: 't-sky', i: '⬇️'}, {l: 'صادر الصندوق', v: F.tiles[2].v, t: 't-pink', i: '⬆️'}, {l: 'الرصيد الختامي', v: F.tiles[3].v, t: 't-dark', i: '💰'});
    if (S) R.tiles.push({l: 'حركات المخزون', v: S.tiles[0].v, t: 't-peach', i: '🔄'});
    R.sections.push(Object.assign({}, A.sections[0], {h: 'المساعدات حسب النوع'}), Object.assign({}, A.sections[1], {h: 'المساعدات حسب القاطع'}));
    if (F) { R.sections.push(Object.assign({}, F.sections[0], {h: 'الصندوق المالي: ملخص الفترة'}), Object.assign({}, F.sections[1], {h: 'الوارد حسب الجهة المتبرعة'})); F.notes.forEach(n => R.notes.push(n)); }
    if (S) { R.sections.push(Object.assign({}, S.sections[0], {h: 'المخزون: حركة الأصناف'})); S.notes.forEach(n => R.notes.push(n)); }
    return R;
}
const REPS = {aids: repAids, fund: repFund, stock: repStock, all: repAll};

/* ---------- العرض ---------- */
function repCell(v, sec, ci) { if (v == null) return ''; if (typeof v === 'number') return (sec.money && sec.money.includes(ci)) ? moneyR(v) : fmtQ(v); return String(v); }
function repHTML(R, forPrint) {
    const tiles = '<div class="stat-grid rp-tiles">' + R.tiles.map(t => '<div class="stat ' + (t.t || 't-lav') + '"><span class="s-ic">' + (t.i || '📊') + '</span><span class="s-l">' + esc(t.l) + '</span><b>' + esc(t.v) + '</b></div>').join('') + '</div>';
    const notes = R.notes.map(n => '<div class="rp-note">' + esc(n) + '</div>').join('');
    const secs = R.sections.filter(s => !(forPrint && s.noPrint)).map(s => {
        if (!s.rows.length) return '<div class="card"><h3 class="card-title">' + esc(s.h) + '</h3><p style="color:#7b808c;margin:0">لا توجد بيانات في هذه الفترة.</p></div>';
        const shown = !forPrint && s.limit ? s.rows.slice(0, s.limit) : s.rows, max = s.bar != null ? Math.max.apply(null, s.rows.map(r => Number(r[s.bar]) || 0).concat([1])) : 0;
        return '<div class="card"><h3 class="card-title">' + esc(s.h) + ' <span class="dr-n">' + s.rows.length + '</span></h3><div class="table-responsive"><table><thead><tr><th>#</th>' + s.cols.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>'
            + shown.map((r, i) => '<tr><td>' + (i + 1) + '</td>' + r.map((v, ci) => '<td>' + esc(repCell(v, s, ci)) + (!forPrint && s.bar === ci ? '<div class="rbar"><i style="width:' + Math.round((Number(v) || 0) / max * 100) + '%"></i></div>' : '') + '</td>').join('') + '</tr>').join('')
            + '</tbody></table></div>' + (s.rows.length > shown.length ? '<p style="font-size:12px;color:#7b808c;margin:8px 0 0">يعرض أول ' + shown.length + ' من ' + s.rows.length + ' — الطباعة والتصدير يشملان الكل.</p>' : '') + '</div>';
    }).join('');
    return {tiles, notes, secs};
}
function repRun() {
    repInit(); const type = document.getElementById('rp_type').value, P = repPeriod();
    const R = REPS[type](P); R.type = type; R.P = P; window.__rep = R;
    const h = repHTML(R, false);
    document.getElementById('repOut').innerHTML = '<div class="rp-head"><div><h2>' + esc(R.title) + '</h2><span>' + esc(R.sub) + '</span></div><small>أُنشئ ' + esc(new Date().toLocaleString('en-GB')) + '</small></div>' + h.tiles + h.notes + h.secs;
    return R;
}
function repPrint() {
    const R = repRun(), h = repHTML(R, true), w = window.open('', '_blank'); if (!w) { toast('اسمح بالنوافذ المنبثقة للطباعة', 'warn'); return; }
    const by = (auth.currentUser && auth.currentUser.email || '').split('@')[0];
    w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' + esc(R.title) + '</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#111;font-size:12px;margin:0}.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #111;padding-bottom:8px;margin-bottom:12px}.top h1{margin:0;font-size:20px}.top p{margin:2px 0 0;color:#444}.camp{font-weight:700;font-size:14px}.tiles{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.tile{flex:1;min-width:120px;border:1px solid #999;border-radius:8px;padding:8px 10px}.tile small{display:block;color:#555}.tile b{font-size:17px}.note{background:#fff4d6;border:1px solid #e0b84c;padding:6px 10px;border-radius:6px;margin:8px 0}h3{margin:16px 0 6px;font-size:14px;border-right:4px solid #111;padding-right:8px}table{width:100%;border-collapse:collapse;margin-bottom:6px}th,td{border:1px solid #888;padding:4px 6px;text-align:right}th{background:#e8e8e8}tr{page-break-inside:avoid}tbody tr:nth-child(even){background:#f6f6f6}.sign{display:flex;justify-content:space-between;margin-top:36px}.sign div{width:30%;text-align:center;border-top:1px solid #111;padding-top:4px}.dr-n{display:none}.rbar{display:none}</style></head><body>'
        + '<div class="top"><div><div class="camp">⛺ مخيم جسر الحياة</div><h1>' + esc(R.title) + '</h1><p>' + esc(R.sub) + '</p></div><div style="text-align:left;color:#444">تاريخ الإصدار: ' + esc(new Date().toLocaleDateString('en-GB')) + '<br>أعدّه: ' + esc(by) + '</div></div>'
        + '<div class="tiles">' + R.tiles.map(t => '<div class="tile"><small>' + esc(t.l) + '</small><b>' + esc(t.v) + '</b></div>').join('') + '</div>' + R.notes.map(n => '<div class="note">' + esc(n) + '</div>').join('')
        + h.secs.replace(/<div class="card">/g, '<div>').replace(/<h3 class="card-title">/g, '<h3>').replace(/<div class="table-responsive">/g, '<div>')
        + '<div class="sign"><div>إعداد</div><div>مراجعة</div><div>اعتماد</div></div></body></html>');
    w.document.close(); w.focus(); setTimeout(() => w.print(), 400);
}
async function repExcel() {
    if (!await loadExcel()) return;
    
    const R = repRun(), wb = XLSX.utils.book_new(); wb.Workbook = {Views: [{RTL: true}]};
    const used = new Set(), nm = s => { let n = String(s).replace(/[\\/?*\[\]:]/g, ' ').slice(0, 28) || 'ورقة', k = n, i = 2; while (used.has(k)) k = n.slice(0, 26) + ' ' + (i++); used.add(k); return k; };
    const sum = [[R.title], [R.sub], ['تاريخ الإصدار', new Date().toLocaleDateString('en-GB')], []].concat(R.tiles.map(t => [t.l, t.v])).concat(R.notes.length ? [[], ['ملاحظات']].concat(R.notes.map(n => [n])) : []);
    const s0 = XLSX.utils.aoa_to_sheet(sum); s0['!cols'] = [{wch: 30}, {wch: 24}]; XLSX.utils.book_append_sheet(wb, s0, nm('ملخص'));
    R.sections.forEach(sec => { const aoa = [sec.cols].concat(sec.rows.map(r => r.map(v => v == null ? '' : v))); const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = sec.cols.map(() => ({wch: 20})); XLSX.utils.book_append_sheet(wb, ws, nm(sec.h)); });
    XLSX.writeFile(wb, R.title.replace(/\s+/g, '_') + '_' + R.sub.replace(/[^\u0600-\u06FF\w]+/g, '_') + '.xlsx'); toast('تم تصدير التقرير');
}


/* ==========================================================================
   بحث شامل محسّن (كل النتائج + اسم الزوجة + الكود) + توزيع جماعي على قاطع
   ========================================================================== */
function famSearch(q) {
    const query = toLatin(String(q || '')).trim().toLowerCase(); if (!query) return [];
    const dq = digitsOf(query), isNum = dq.length >= 3 && dq.length >= query.replace(/\s/g, '').length - 1, out = [], nq = normAr(query);
    getDB('db_families').forEach(f => {
        if (!f) return; let why = '', rank = 99;
        const code = String(f[40] || '').toLowerCase();
        if (code && code === query) { why = 'كود الأسرة'; rank = 0; }
        else if (isNum) {
            [[2, 'رقم الهوية', 1], [9, 'هوية الزوجة الأولى', 2], [12, 'هوية الزوجة الثانية', 2], [5, 'رقم الجوال', 3], [6, 'الجوال الثاني', 3]].some(([i, l, r]) => {
                const d = digitsOf(f[i]); if (d && (d === dq || d.includes(dq))) { why = l + (d === dq ? '' : ' (جزء من الرقم)'); rank = d === dq ? r : r + 3; return true; } return false;
            });
        } else {
            if (matchTokens(f[1], query)) { why = 'اسم رب الأسرة'; rank = normAr(f[1]).startsWith(nq) ? 7 : 8; }
            else if (f[8] && String(f[8]).trim() !== '0' && matchTokens(f[8], query)) { why = 'اسم الزوجة الأولى: ' + f[8]; rank = 9; }
            else if (f[11] && String(f[11]).trim() !== '0' && matchTokens(f[11], query)) { why = 'اسم الزوجة الثانية: ' + f[11]; rank = 9; }
            else if (code && /^[a-z]\d{0,3}$/i.test(query) && code.startsWith(query)) { why = 'كود الأسرة'; rank = 6; }
        }
        if (why) out.push({f, why, rank});
    });
    if (!isNum) getDB('db_children').forEach(c => {
        if (!c || !matchTokens(c[0], query)) return;
        const f = famByKey(safeKey(digitsOf(c[5]))) || famByKey(safeKey(digitsOf(c[8])));
        if (f && !out.some(o => o.f === f)) out.push({f, why: 'الطفل: ' + c[0], rank: 10});
    });
    out.sort((a, b) => a.rank - b.rank || String(a.f[1]).localeCompare(String(b.f[1]), 'ar')); return out;
}
function globalSearchAll() {
    const q = document.getElementById('globalSearchInput').value, box = document.getElementById('gsList');
    if (!toLatin(q || '').trim()) { toast('اكتب رقم الهوية أو الاسم أو الكود للبحث', 'warn'); return; }
    const res = famSearch(q), resCard = document.getElementById('globalSearchResult');
    if (!res.length) { box.classList.add('hidden'); resCard.classList.add('hidden'); alert('❌ لم يتم العثور على أسرة تطابق «' + q + '» (بحثنا في اسم رب الأسرة والزوجات والأطفال والهوية والجوال والكود).'); return; }
    if (res.length === 1) { box.classList.add('hidden'); gsOpen(res[0]); return; }
    window.__gsRes = res; resCard.classList.add('hidden');
    box.innerHTML = '<div class="card"><h3 class="card-title">تم العثور على <span class="dr-n">' + res.length + '</span> نتيجة — اضغط على الأسرة لعرض بياناتها</h3><div class="table-responsive dr-scroll"><table><thead><tr><th>#</th><th>الكود</th><th>الاسم رباعي</th><th>الهوية</th><th>القاطع</th><th>سبب ظهورها</th></tr></thead><tbody>'
        + res.slice(0, 150).map((r, i) => '<tr class="clickable" onclick="gsOpen(window.__gsRes[' + i + '])"><td>' + (i + 1) + '</td><td dir="ltr">' + esc(r.f[40] || '') + '</td><td><b>' + esc(r.f[1]) + '</b></td><td>' + esc(r.f[2]) + '</td><td>' + esc(r.f[0]) + '</td><td>' + esc(r.why) + '</td></tr>').join('')
        + '</tbody></table></div>' + (res.length > 150 ? '<p style="font-size:12px;color:#7b808c;margin:8px 0 0">يعرض أول 150 نتيجة. أضف حرفاً أو كلمة لتضييق البحث.</p>' : '') + '</div>';
    box.classList.remove('hidden'); box.scrollIntoView({behavior: 'smooth', block: 'start'});
}
function gsOpen(r) {
    performGlobalSearch(r.f);
    const sum = document.getElementById('srSummary'), f = r.f, w = (i, j) => (f[i] && String(f[i]).trim() !== '0') ? esc(f[i]) + (f[j] ? ' (' + esc(f[j]) + ')' : '') : '';
    let extra = '';
    if (f[40]) extra += '<p><strong>كود الأسرة:</strong> <span dir="ltr">' + esc(f[40]) + '</span></p>';
    if (w(8, 9)) extra += '<p><strong>الزوجة الأولى:</strong> ' + w(8, 9) + '</p>'; if (w(11, 12)) extra += '<p><strong>الزوجة الثانية:</strong> ' + w(11, 12) + '</p>';
    sum.insertAdjacentHTML('afterbegin', '<p class="gs-why">🔎 ظهرت هذه الأسرة بسبب: ' + esc(r.why) + '</p>'); sum.insertAdjacentHTML('beforeend', extra);
    document.getElementById('globalSearchResult').scrollIntoView({behavior: 'smooth', block: 'start'});
}
(function () {
    const res = document.getElementById('globalSearchResult'), inp = document.getElementById('globalSearchInput');
    if (res && !document.getElementById('gsList')) res.insertAdjacentHTML('beforebegin', '<div id="gsList" class="hidden"></div>');
    if (inp) { inp.addEventListener('keydown', e => { if (e.key === 'Enter') globalSearchAll(); }); inp.setAttribute('placeholder', 'اسم رب الأسرة أو الزوجة أو الطفل، أو الهوية، أو الجوال، أو الكود...'); }
})();

/* تاريخ المساعدة من عمود الملاحظة بكل صيغه: [2026-10-27] أو 27/10/2026 أو رقم إكسل */
function aidISO(v) {
    if (v == null || v === '') return ''; if (Object.prototype.toString.call(v) === '[object Date]') return stockISO(v);
    const raw = toLatin(String(v)).trim(); let m = raw.match(/^\[?\s*(\d{4}-\d{1,2}-\d{1,2})\s*\]?/); if (m) return stockISO(m[1]);
    m = raw.match(/^\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})(?:\s|$|—)/); if (m) return stockISO(m[1]);
    return stockISO(smartNote(v));
}

/* ---------- توزيع جماعي على قاطع ---------- */
let _ba = null;
function baSectors() {
    const m = {}; getDB('db_families').filter(Boolean).forEach(f => { const k = secNorm(f), lb = String(f[0] || '').trim() || 'بدون قاطع'; (m[k] = m[k] || {n: 0, l: {}}).n++; m[k].l[lb] = (m[k].l[lb] || 0) + 1; });
    return Object.keys(m).map(k => ({k, n: m[k].n, label: Object.keys(m[k].l).sort((a, b) => m[k].l[b] - m[k].l[a])[0]})).sort((a, b) => b.n - a.n);
}
function openBulkAid(preSector) {
    const types = Array.from(new Set(getDB('db_aids').filter(Array.isArray).map(a => String(a[3] || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ar'));
    openModal('<h3>📦 توزيع جماعي على قاطع</h3><p style="color:#5d6e73;margin:4px 0 10px;line-height:1.7">سجّل استلام مساعدة لكل أسر قاطع (أو لمن تحدّده منهم) دفعة واحدة، بدل تسجيلها أسرة أسرة. يمكنك التراجع عن أي دفعة لاحقاً.</p>'
        + '<div class="form-grid"><div class="input-group"><label>القاطع</label><select id="ba_sec" onchange="baList()"><option value="">— اختر القاطع —</option>' + baSectors().map(s => '<option value="' + esc(s.k) + '"' + (s.k === preSector ? ' selected' : '') + '>' + esc(s.label) + ' (' + s.n + ' أسرة)</option>').join('') + '<option value="__all">كل القواطع</option></select></div>'
        + '<div class="input-group"><label>نوع المساعدة</label><input id="ba_type" list="ba_types" oninput="baList()" placeholder="مثال: طرد غذائي"><datalist id="ba_types">' + types.map(t => '<option value="' + esc(t) + '">').join('') + '</datalist></div>'
        + '<div class="input-group"><label>الكمية لكل أسرة</label><input id="ba_qty" type="number" min="1" value="1" inputmode="decimal"></div>'
        + '<div class="input-group"><label>تاريخ الاستلام</label><input id="ba_date" type="date" value="' + today() + '" onchange="baList()"></div>'
        + '<div class="input-group" style="grid-column:1/-1"><label>ملاحظة (اختياري)</label><input id="ba_note" maxlength="80"></div></div>'
        + '<label class="ba-chk"><input type="checkbox" id="ba_skip" onchange="baList()"> استبعاد الأسر التي استلمت هذا النوع سابقاً (في أي تاريخ)</label>'
        + '<div id="ba_out"></div><div class="btnrow" style="margin-top:12px"><button class="btn btn-green" id="baGo" onclick="baExecute()" disabled>📦 تسجيل</button><button class="btn btn-red" onclick="closeModal()">إغلاق</button></div><div id="ba_undo"></div>');
    document.getElementById('modalBox').classList.add('wide'); baList(); baUndoRender();
}
function baList() {
    const sec = document.getElementById('ba_sec').value, type = document.getElementById('ba_type').value.trim(), date = document.getElementById('ba_date').value || today(), skip = document.getElementById('ba_skip').checked, out = document.getElementById('ba_out');
    if (!sec || !type) { _ba = null; out.innerHTML = '<p style="padding:14px;text-align:center;color:#7b808c">اختر القاطع واكتب نوع المساعدة لتظهر قائمة الأسر.</p>'; document.getElementById('baGo').disabled = true; document.getElementById('baGo').textContent = '📦 تسجيل'; return; }
    const fams = getDB('db_families').filter(f => f && (sec === '__all' || secNorm(f) === sec)), nt = normAr(type), aids = getDB('db_aids').filter(Array.isArray), got = {};
    aids.forEach(a => { if (normAr(a[3]) !== nt) return; const k = digitsOf(a[1]), iso = aidISO(a[4]); (got[k] = got[k] || {n: 0, same: false}).n++; if (iso && iso === date) got[k].same = true; });
    const list = fams.map(f => { const g = got[digitsOf(f[2])] || {n: 0, same: false}; return {f, n: g.n, same: g.same, on: !g.same && !(skip && g.n > 0)}; });
    _ba = {list};
    out.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0 6px"><input type="search" id="ba_q" placeholder="🔍 بحث داخل القائمة..." oninput="baFilter()" style="flex:1;min-width:180px"><button type="button" class="btn btn-blue" style="margin:0" onclick="baAll(true)">تحديد الكل</button><button type="button" class="btn" style="margin:0" onclick="baAll(false)">إلغاء التحديد</button></div>'
        + '<div class="table-responsive dr-scroll"><table id="baTable"><thead><tr><th></th><th>الكود</th><th>الاسم</th><th>الهوية</th><th>أفراد</th><th>الحالة</th></tr></thead><tbody>'
        + list.map((r, i) => '<tr><td><input type="checkbox" class="bac" data-i="' + i + '"' + (r.on ? ' checked' : '') + ' onchange="baCount()" style="width:auto;min-height:0"></td><td dir="ltr">' + esc(r.f[40] || '') + '</td><td>' + esc(r.f[1]) + '</td><td>' + esc(r.f[2]) + '</td><td>' + esc(r.f[26] || '') + '</td><td>' + (r.same ? '⛔ مسجلة بنفس التاريخ' : r.n ? '⚠️ استلمت هذا النوع (' + r.n + ')' : '✅ جاهزة') + '</td></tr>').join('') + '</tbody></table></div>';
    baCount();
}
function baFilter() { const q = document.getElementById('ba_q').value; document.querySelectorAll('#baTable tbody tr').forEach(tr => { tr.style.display = !q || matchTokens(tr.textContent, q) ? '' : 'none'; }); }
function baAll(v) { document.querySelectorAll('#baTable tbody tr').forEach(tr => { if (tr.style.display === 'none') return; tr.querySelector('.bac').checked = v; }); baCount(); }
function baCount() { const n = document.querySelectorAll('#ba_out .bac:checked').length, b = document.getElementById('baGo'); b.disabled = !n; b.textContent = n ? '📦 تسجيل لـ ' + n + ' أسرة' : '📦 تسجيل'; }
function baExecute() {
    if (!_ba) return; const sel = Array.from(document.querySelectorAll('#ba_out .bac:checked')).map(c => _ba.list[+c.dataset.i]).filter(Boolean);
    const type = document.getElementById('ba_type').value.trim(), qty = parseFloat(toLatin(document.getElementById('ba_qty').value)) || 1, date = document.getElementById('ba_date').value || today(), note = document.getElementById('ba_note').value.trim();
    if (!sel.length || !type) return; const warn = sel.filter(r => r.n).length;
    if (!confirm('سيتم تسجيل «' + type + '» (الكمية ' + qty + ') بتاريخ ' + formatDateValue(date) + ' لـ ' + sel.length + ' أسرة.' + (warn ? '\n⚠️ منهم ' + warn + ' استلموا هذا النوع سابقاً.' : '') + '\n\nمتابعة؟')) return;
    const batch = 'b' + Date.now().toString(36), stamp = ('[' + date + '] ' + note).trim();
    const rows = sel.map(r => [r.f[1], r.f[2], r.f[0], type, stamp, qty, r.f[40] || '', batch]), b = document.getElementById('baGo'); b.classList.add('is-loading'); b.disabled = true;
    rdb.ref('db_aids').transaction(cur => { if (cur == null) return rows.slice(); const arr = (Array.isArray(cur) ? cur : Object.keys(cur).sort((x, y) => x - y).map(k => cur[k])).map(rowArr); return arr.concat(rows); }).then(res => {
        const v = res && res.snapshot && res.snapshot.val(); localDB.db_aids = v ? toRows(v) : getDB('db_aids').concat(rows);
        audit('توزيع جماعي', type + ' × ' + qty + ' | ' + sel.length + ' أسرة | دفعة ' + batch); schedulePublish(sel.map(r => safeKey(digitsOf(r.f[2]))));
        closeModal(); refreshNow(); toast('تم تسجيل «' + type + '» لـ ' + sel.length + ' أسرة', null, 5000);
    }).catch(e => { b.classList.remove('is-loading'); alert('❌ لم يتم التسجيل: ' + (e && e.message ? e.message : e)); baCount(); });
}
function baBatches() {
    const m = {}; getDB('db_aids').filter(Array.isArray).forEach(a => { const id = a[7]; if (!id) return; const g = m[id] = m[id] || {id, n: 0, type: a[3], date: aidISO(a[4]), sec: a[2]}; g.n++; });
    return Object.values(m).sort((a, b) => b.id.localeCompare(a.id)).slice(0, 8);
}
function baUndoRender() {
    const bs = baBatches(), box = document.getElementById('ba_undo'); if (!box) return;
    box.innerHTML = bs.length ? '<div class="card" style="box-shadow:none;background:#f7f8fa;padding:14px!important;margin-top:14px"><b>↩️ آخر الدفعات الجماعية (للتراجع)</b><div class="table-responsive" style="margin-top:8px"><table><tbody>' + bs.map(b => '<tr><td>' + esc(b.type) + '</td><td>' + esc(b.sec || '') + '</td><td>' + esc(b.date ? formatDateValue(b.date) : '') + '</td><td>' + b.n + ' أسرة</td><td><button type="button" class="btn btn-red" style="margin:0;padding:3px 12px;font-size:12px" onclick="baUndo(\'' + b.id + '\')">تراجع</button></td></tr>').join('') + '</tbody></table></div></div>' : '';
}
function baUndo(id) {
    const g = baBatches().find(b => b.id === id); if (!g) return;
    if (!confirm('التراجع عن دفعة «' + g.type + '» (' + g.n + ' أسرة)؟ سيتم حذف هذه السجلات من كشف الاستلام.')) return;
    const keys = getDB('db_aids').filter(a => Array.isArray(a) && a[7] === id).map(a => safeKey(digitsOf(a[1])));
    rdb.ref('db_aids').transaction(cur => { if (cur == null) return cur; return (Array.isArray(cur) ? cur : Object.keys(cur).sort((x, y) => x - y).map(k => cur[k])).map(rowArr).filter(r => !(Array.isArray(r) && r[7] === id)); }).then(res => {
        const v = res && res.snapshot && res.snapshot.val(); localDB.db_aids = v ? toRows(v) : []; audit('تراجع عن توزيع جماعي', g.type + ' | ' + g.n + ' أسرة | ' + id); schedulePublish(keys); refreshNow(); baUndoRender(); toast('تم التراجع عن الدفعة (' + g.n + ' سجل)');
    }).catch(e => alert('❌ تعذر التراجع: ' + (e && e.message ? e.message : e)));
}
document.addEventListener('DOMContentLoaded', () => {
    const btn = '<button class="btn btn-blue" style="margin:0 0 0 10px;font-size:13px;padding:7px 16px" onclick="openBulkAid()">📦 توزيع جماعي على قاطع</button>';
    ['quick-tab', 'aids-tab'].forEach(id => { const h = document.querySelector('#' + id + ' .header'); if (h && !h.querySelector('[onclick="openBulkAid()"]')) h.insertAdjacentHTML('beforeend', btn); });
});


/* ==========================================================================
   صندوق الوارد والطلبات: استلام موثوق + إظهار ما لم يصل + فحص وإصلاح
   ========================================================================== */
const _inboxFail = {};
const INBOX_TYPES = {db_edit_requests: 'تعديل بيانات الأسرة', db_complaints: 'شكوى / طلب', db_children: 'إضافة أو تعديل طفل', db_chronic: 'مريض مزمن', db_injured: 'إصابة'};
const withTO = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('انتهت مهلة الاتصال')), ms || 25000))]);
const inboxItems = () => { const out = []; const ib = localDB.inbox || {}; Object.keys(ib).forEach(fid => Object.keys(ib[fid] || {}).forEach(k => { if (ib[fid][k]) out.push({fid, k, it: ib[fid][k], path: fid + '/' + k}); })); return out; };

async function ingestInbox(inbox, force) {
    const ok = Object.keys(INBOX_TYPES), affectedFamilies = new Set(); let done = 0, failed = 0;
    for (const fid of Object.keys(inbox || {})) for (const k of Object.keys(inbox[fid] || {})) {
        const pathKey = fid + '/' + k;
        if (_inboxProcessing.has(pathKey)) continue;
        const original = inbox[fid][k]; if (!original) continue;
        // نتحقق قبل الحجز: الطلب غير الصالح يبقى ظاهراً في «فحص الطلبات» ولا يُحذف بصمت
        if (typeof original !== 'object' || !ok.includes(original.type) || original.payload == null) { _inboxFail[pathKey] = {n: 99, msg: 'نوع الطلب أو محتواه غير صالح'}; continue; }
        const prev = _inboxFail[pathKey]; if (prev && prev.n >= 3 && !force) continue;
        _inboxProcessing.add(pathKey); let claimed = false;
        try {
            const ref = rdb.ref('inbox/' + fid + '/' + k);
            const tx = await withTO(ref.transaction(current => current ? null : undefined));
            if (!tx.committed) continue; claimed = true;
            const it = original, rid = fid + '_' + k; let title = '';
            if (['db_children', 'db_chronic', 'db_injured'].includes(it.type)) {
                await withTO(rdb.ref(it.type + '_reqs/' + rid).set({id: fid, payload: it.payload, date: it.date || ''}));
                if (!localDB[it.type + '_reqs']) localDB[it.type + '_reqs'] = {};
                localDB[it.type + '_reqs'][rid] = {id: fid, payload: it.payload, date: it.date || ''};
                title = (it.type === 'db_children' && it.payload[10] === 'تعديل' ? 'تعديل بيانات طفل: ' : '') + String(it.payload[0] || '');
            } else if (it.type === 'db_edit_requests') {
                const payload = Object.assign({}, it.payload, {rid});
                await withTO(rdb.ref('db_edit_requests').transaction(cur => {
                    const arr = cur == null ? [] : (Array.isArray(cur) ? cur.slice() : Object.keys(cur).sort((a, b) => a - b).map(x => cur[x]));
                    if (!arr.some(x => x && x.rid === rid)) arr.push(payload); return arr;
                }));
                if (!getDB('db_edit_requests').some(x => x && x.rid === rid)) localDB.db_edit_requests = getDB('db_edit_requests').concat([payload]);
                title = 'تعديل بيانات الأسرة';
            } else {
                const p = Array.isArray(it.payload) ? it.payload.slice() : Object.values(it.payload);
                while (p.length < 8) p.push(''); p[6] = rid;
                await withTO(rdb.ref('db_complaints').transaction(cur => {
                    const arr = cur == null ? [] : (Array.isArray(cur) ? cur.slice() : Object.keys(cur).sort((a, b) => a - b).map(x => cur[x]));
                    if (!arr.some(x => Array.isArray(x) && x[6] === rid)) arr.push(p); return arr;
                }));
                if (!getDB('db_complaints').some(x => Array.isArray(x) && x[6] === rid)) localDB.db_complaints = getDB('db_complaints').concat([p]);
                title = String(p[4] || '');
            }
            const entry = {fid: safeKey(digitsOf(fid)), ty: it.type, d: localDateOf(it.date) || today(), st: 'pending', r: '', x: title.slice(0, 80)};
            await withTO(rdb.ref('db_reqlog/' + rid).set(entry)); localDB.db_reqlog[rid] = entry;
            audit('استلام طلب', title || rid); delete _inboxFail[pathKey]; affectedFamilies.add(entry.fid); done++;
        } catch (err) {
            failed++; console.error('ingestInbox item:', pathKey, err);
            _inboxFail[pathKey] = {n: (prev ? prev.n : 0) + 1, msg: String(err && err.message || err).slice(0, 200)};
            if (claimed) { try { await rdb.ref('inbox/' + fid + '/' + k).set(original); } catch (e2) { console.error('inbox restore failed', e2); } }
        } finally { _inboxProcessing.delete(pathKey); }
    }
    updateBadgeCount(); if (done) schedulePublish([...affectedFamilies]); rqAlert();
    return {done, failed};
}
/* الشارة تشمل ما ينتظر في صندوق الوارد ولم يُستلم بعد */
(function () { const _pt = pendingTotal; pendingTotal = function () { return _pt() + inboxItems().length; }; })();

/* ---------- طلبات ظاهرة للمستفيد ولا نص لها عندك ---------- */
function reqMissing() {
    const out = [], log = obj('db_reqlog'), edits = getDB('db_edit_requests'), comps = getDB('db_complaints');
    Object.keys(log).forEach(rid => {
        const e = log[rid]; if (!e || e.st !== 'pending') return; let has;
        if (e.ty === 'db_edit_requests') has = edits.some(r => r && r.rid === rid);
        else if (e.ty === 'db_complaints') has = comps.some(c => Array.isArray(c) && c[6] === rid);
        else has = !!((localDB[e.ty + '_reqs'] || {})[rid]);
        if (!has) out.push({rid, e});
    });
    return out;
}
function rqAlert() {
    const box = document.getElementById('rqAlert'); if (!box) return;
    const w = inboxItems(), miss = reqMissing(); let h = '';
    if (w.length) h += '<div class="rq-alert warn">📥 يوجد <b>' + w.length + '</b> طلب في صندوق الوارد لم يُستلم بعد <button class="btn btn-blue" style="margin:0 8px;padding:5px 14px" onclick="rqIngestNow()">استلام الآن</button><button class="btn" style="margin:0;padding:5px 14px" onclick="openReqCheck()">التفاصيل</button></div>';
    if (miss.length) h += '<div class="rq-alert bad">⚠️ يوجد <b>' + miss.length + '</b> طلب يظهر للمستفيدين «قيد المراجعة» لكن نصه غير موجود عندك <button class="btn btn-blue" style="margin:0 8px;padding:5px 14px" onclick="openReqCheck()">فحص وإصلاح</button></div>';
    box.innerHTML = h;
}
async function rqIngestNow() {
    const w = inboxItems(); if (!w.length) { toast('صندوق الوارد فارغ'); return; }
    toast('جارٍ استلام الطلبات...', 'warn', 2000);
    const r = await ingestInbox(localDB.inbox, true); refreshNow();
    if (r.failed) toast('استُلم ' + r.done + ' وفشل ' + r.failed + ' — افتح «فحص الطلبات» لمعرفة السبب', 'err', 7000); else toast('تم استلام ' + r.done + ' طلب');
    if (document.getElementById('modalBg').classList.contains('show') && document.getElementById('rcBody')) openReqCheck();
}
function openReqCheck() {
    const famName = fid => { const f = famByKey(safeKey(digitsOf(fid))); return f ? f[1] : '(غير معروفة)'; };
    const w = inboxItems(), miss = reqMissing();
    const stat = x => { const f = _inboxFail[x.path]; return f ? (f.n >= 99 ? '⛔ ' + f.msg : '⚠️ فشل (' + f.n + '): ' + f.msg) : '⏳ بانتظار الاستلام'; };
    let h = '<h3>🩺 فحص الطلبات</h3><div id="rcBody">'
        + '<div class="card" style="box-shadow:none;background:#f7f8fa;padding:14px!important"><b>1) صندوق الوارد (طلبات أرسلتها العائلات ولم تُستلم)</b>'
        + (w.length ? '<div class="table-responsive" style="margin-top:8px"><table><thead><tr><th>الأسرة</th><th>النوع</th><th>التاريخ</th><th>الحالة</th><th></th></tr></thead><tbody>' + w.map(x => '<tr><td>' + esc(famName(x.fid)) + '<br><small>' + esc(x.fid) + '</small></td><td>' + esc(INBOX_TYPES[x.it.type] || x.it.type || '؟') + '</td><td>' + esc((x.it.date || '').slice(0, 10)) + '</td><td>' + esc(stat(x)) + '</td><td><button class="btn btn-red" style="margin:0;padding:3px 10px;font-size:12px" onclick="rcDel(\'' + esc(x.fid) + '\',\'' + esc(x.k) + '\')">حذف</button></td></tr>').join('') + '</tbody></table></div><div class="btnrow" style="margin-top:8px"><button class="btn btn-green" onclick="rqIngestNow()">📥 استلام الكل الآن</button></div>' : '<p style="margin:8px 0 0;color:#1d8a5f">✅ صندوق الوارد فارغ: لا يوجد طلبات عالقة.</p>') + '</div>'
        + '<div class="card" style="box-shadow:none;background:#f7f8fa;padding:14px!important;margin-top:10px"><b>2) طلبات تظهر للمستفيد «قيد المراجعة» ولا نص لها عندك</b>'
        + (miss.length ? '<p style="font-size:13px;color:#5d6e73;margin:6px 0">نص هذه الطلبات لم يُحفظ (حُذف من الوارد قبل اكتمال الحفظ). لا يمكن استرجاع محتواها، لكن تستطيع أن تطلب من الأسرة إعادة الإرسال.</p><div class="table-responsive"><table><thead><tr><th>الأسرة</th><th>النوع</th><th>التاريخ</th><th></th></tr></thead><tbody>' + miss.map(m => '<tr><td>' + esc(famName(m.e.fid)) + '<br><small>' + esc(m.e.fid) + '</small></td><td>' + esc(INBOX_TYPES[m.e.ty] || m.e.ty) + '</td><td>' + esc(m.e.d || '') + '</td><td><button class="btn btn-blue" style="margin:0;padding:3px 10px;font-size:12px" onclick="rcResend(\'' + esc(m.rid) + '\')">اطلب إعادة الإرسال</button></td></tr>').join('') + '</tbody></table></div><div class="btnrow" style="margin-top:8px"><button class="btn btn-green" onclick="rcResendAll()">اطلب من الجميع (' + miss.length + ')</button></div>' : '<p style="margin:8px 0 0;color:#1d8a5f">✅ كل طلب ظاهر للمستفيدين له نص عندك.</p>') + '</div>'
        + '<div class="card" style="box-shadow:none;background:#f7f8fa;padding:14px!important;margin-top:10px"><b>3) مطابقة مع قاعدة البيانات مباشرة</b><div id="rcRaw" style="margin-top:8px;color:#5d6e73">جارٍ الفحص...</div></div>'
        + '</div><div class="btnrow" style="margin-top:12px"><button class="btn btn-red" onclick="closeModal()">إغلاق</button></div>';
    openModal(h, true);
    const cols = [['db_edit_requests', 'طلبات تعديل البيانات'], ['db_complaints', 'الشكاوى والطلبات'], ['db_children_reqs', 'طلبات الأطفال'], ['db_chronic_reqs', 'طلبات المرضى'], ['db_injured_reqs', 'طلبات الإصابات']];
    Promise.all(cols.map(([k]) => withTO(rdb.ref(k).once('value'), 15000).then(s => { const v = s.val(); return v ? Object.keys(v).length : 0; }).catch(() => null))).then(counts => {
        const shown = k => (k.endsWith('_reqs') ? Object.keys(obj(k)).length : getDB(k).length), el = document.getElementById('rcRaw'); if (!el) return;
        el.innerHTML = '<table><thead><tr><th>القسم</th><th>في Firebase</th><th>ظاهر في الصفحة</th><th></th></tr></thead><tbody>' + cols.map(([k, l], i) => { const c = counts[i], s = shown(k); return '<tr><td>' + l + '</td><td>' + (c == null ? 'تعذر القراءة' : c) + '</td><td>' + s + '</td><td>' + (c == null ? '—' : c === s ? '✅' : '⚠️ يوجد فرق: أعد تحميل الصفحة') + '</td></tr>'; }).join('') + '</tbody></table>';
    });
}
function rcDel(fid, k) { if (!confirm('حذف هذا الطلب من صندوق الوارد نهائياً؟')) return; rdb.ref('inbox/' + fid + '/' + k).remove().then(() => { if (localDB.inbox && localDB.inbox[fid]) delete localDB.inbox[fid][k]; delete _inboxFail[fid + '/' + k]; audit('حذف طلب من الوارد', fid + '/' + k); openReqCheck(); rqAlert(); updateBadgeCount(); }).catch(e => alert('❌ ' + (e && e.message || e))); }
function rcResend(rid) { const e = obj('db_reqlog')[rid]; if (!e) return; logReq(rid, e.fid, e.ty, 'rejected', 'لم يصلنا نص طلبك بشكل كامل. الرجاء إعادة إرساله من جديد.', e.x); audit('طلب إعادة إرسال', rid); setTimeout(() => { openReqCheck(); rqAlert(); }, 300); }
function rcResendAll() { const m = reqMissing(); if (!m.length || !confirm('إرسال طلب «إعادة الإرسال» إلى ' + m.length + ' أسرة؟')) return; m.forEach(x => logReq(x.rid, x.e.fid, x.e.ty, 'rejected', 'لم يصلنا نص طلبك بشكل كامل. الرجاء إعادة إرساله من جديد.', x.e.x)); audit('طلب إعادة إرسال جماعي', m.length + ' طلب'); toast('تم إشعار ' + m.length + ' أسرة بإعادة الإرسال'); setTimeout(() => { openReqCheck(); rqAlert(); }, 400); }

/* ---------- جدول الطلبات: أسرع وأكثر أماناً ---------- */
function loadRequests() {
    const reqs = getDB('db_edit_requests'), tbody = document.querySelector('#requestsTable tbody'); if (!tbody) return;
    const rows = reqs.map((req, index) => {
        if (!req || typeof req !== 'object') return '';
        let n = '?'; try { const fam = famByKey(safeKey(digitsOf(req.id))); if (fam) n = diffFam(fam, Array.from({length: 40}, (_, i) => (req.newData && req.newData[i] != null ? req.newData[i] : ''))).filter(d => !d.locked).length; } catch (e) { n = '?'; }
        return `<tr><td>${index + 1}</td><td><strong>${esc(req.name || '(بدون اسم)')}</strong><div style="font-size:11px;color:#b45309;">${n} حقل معدّل</div></td><td>${esc(req.id)}</td><td style="direction:ltr;">${esc(req.date)}</td><td><button class="btn btn-blue" style="margin:0; padding:4px 8px; font-size:12px;" onclick="viewEditReq(${index})">👁 التفاصيل</button> <button class="btn btn-green" style="margin:0; padding:4px 8px; font-size:12px;" onclick="approveRequest(${index})">✔ موافقة</button> <button class="btn btn-red" style="margin:0; padding:4px 8px; font-size:12px;" onclick="rejectRequest(${index})">❌ رفض</button></td></tr>`;
    }).join('');
    tbody.innerHTML = rows || `<tr><td colspan="5" style="text-align:center;">لا يوجد طلبات تعديل.</td></tr>`;
    rqAlert();
}
(function () {
    const tab = document.getElementById('requests-tab'); if (!tab) return;
    const h = tab.querySelector('.header'); if (h && !document.getElementById('rqAlert')) h.insertAdjacentHTML('afterend', '<div id="rqAlert"></div>');
    if (h) { h.style.display = 'flex'; h.style.flexWrap = 'wrap'; h.style.alignItems = 'center'; h.style.justifyContent = 'space-between'; h.style.gap = '8px'; h.insertAdjacentHTML('beforeend', '<button class="btn btn-blue" style="margin:0;font-size:13px;padding:7px 16px" onclick="openReqCheck()">🩺 فحص الطلبات</button>'); }
})();
setInterval(() => { try { if (!auth.currentUser) return; const ib = localDB.inbox; if (ib && inboxItems().length) ingestInbox(ib); else rqAlert(); } catch (e) { console.warn(e); } }, 45000);


/* ==========================================================================
   مركز المهام + البحث السريع (Ctrl+K) + تنبيه نقص المخزون + تذكير بالنسخة الاحتياطية
   ========================================================================== */
(function () {
    const save = backupAll;
    backupAll = async function () {
        const saved = await save();
        if (saved) {
            try { localStorage.setItem('lastBackupAt', String(Date.now())); } catch (error) {}
        }
        return saved;
    };
})();
function lastBackupDays() { try { const t = +localStorage.getItem('lastBackupAt'); return t ? Math.floor((Date.now() - t) / 86400000) : null; } catch (e) { return null; } }
function lowStockItems() {
    if (isLimited) return []; const {agg, order} = stockAgg(); return order.filter(n => agg[n].it.m > 0 && (agg[n].tin - agg[n].tout) <= agg[n].it.m).map(n => ({n, bal: agg[n].tin - agg[n].tout, m: agg[n].it.m, u: agg[n].it.u || ''}));
}
function taskList() {
    const T = [], fams = getDB('db_families').filter(Boolean);
    const pend = getDB('db_edit_requests').filter(r => r && typeof r === 'object').length; if (pend) T.push(['📝', pend + ' طلب تعديل بيانات بانتظار قرارك', "switchTab('requests')", 'مراجعة']);
    const comp = getDB('db_complaints').filter(c => Array.isArray(c) && !c[7]).length; if (comp) T.push(['💬', comp + ' شكوى أو طلب جديد', "switchTab('requests')", 'عرض']);
    const adds = ['db_children_reqs', 'db_chronic_reqs', 'db_injured_reqs'].reduce((n, k) => n + Object.keys(obj(k)).length, 0); if (adds) T.push(['➕', adds + ' طلب إضافة (أطفال/مرضى/إصابات)', "switchTab('requests')", 'عرض']);
    const inb = typeof inboxItems === 'function' ? inboxItems().length : 0; if (inb) T.push(['📥', inb + ' طلب في صندوق الوارد لم يُستلم', 'rqIngestNow()', 'استلام الآن']);
    const miss = typeof reqMissing === 'function' ? reqMissing().length : 0; if (miss) T.push(['⚠️', miss + ' طلب يظهر للمستفيد ولا نص له عندك', 'openReqCheck()', 'فحص وإصلاح']);
    const nocode = fams.filter(f => !/^[a-z]\d{3,4}$/i.test(String(f[40] || ''))).length; if (nocode && !isLimited) T.push(['🏷️', nocode + ' أسرة بلا كود', 'openCodesTool()', 'توليد الأكواد']);
    const A_ = getDB('db_aids'); if (!window.__ud || window.__ud.ref !== A_) window.__ud = {ref: A_, n: A_.filter(a => Array.isArray(a) && !aidISO(a[4])).length}; const undated = window.__ud.n; if (undated) T.push(['📅', undated + ' مساعدة بلا تاريخ مقروء (لا تدخل في تقارير الأشهر)', "switchTab('reports')", 'التقارير']);
    lowStockItems().forEach(x => T.push(['📦', 'المخزون منخفض: ' + x.n + ' (المتبقي ' + fmtQ(x.bal) + ' ' + x.u + ')', "switchTab('stock')", 'المخزون']));
    if (!isLimited) { const d = lastBackupDays(); if (d == null) T.push(['💾', 'لم تُنزَّل نسخة احتياطية من هذا الجهاز بعد', 'backupAll()', 'نسخة الآن']); else if (d >= 7) T.push(['💾', 'آخر نسخة احتياطية قبل ' + d + ' يوماً', 'backupAll()', 'نسخة الآن']); }
    return T;
}
function injectTasks() {
    const host = document.getElementById('dashContent'); if (!host) return; const old = host.querySelector('.task-card'); if (old) old.remove();
    const T = taskList();
    host.insertAdjacentHTML('afterbegin', '<div class="card task-card"><h3 class="card-title">🎯 مركز المهام ' + (T.length ? '<span class="dr-n">' + T.length + '</span>' : '') + '</h3>'
        + (T.length ? T.map(t => '<div class="task-row"><span class="t-ic">' + t[0] + '</span><span class="t-tx">' + esc(t[1]) + '</span><button class="btn btn-blue" style="margin:0;padding:6px 16px;font-size:12.5px" onclick="' + t[2] + '">' + esc(t[3]) + '</button></div>').join('') : '<p style="margin:0;color:#1d8a5f;font-weight:600">✅ لا توجد مهام عالقة الآن. كل شيء على ما يرام.</p>') + '</div>');
}
(function () { const _ld = loadDashboard; loadDashboard = function () { _ld(); injectTasks(); }; })();

/* ---------- البحث السريع (Ctrl+K أو /) ---------- */
let _ck = {items: [], sel: 0};
function ckActions() {
    const a = [['📦', 'توزيع جماعي لقاطع', () => openBulkAid()], ['🏷️', 'أكواد الأسر', () => openCodesTool()], ['🩺', 'فحص الطلبات', () => openReqCheck()], ['📑', 'تقرير: المساعدات / الصندوق / المخزون', () => switchTab('reports')], ['➕', 'تسجيل حركة مخزون', () => openStockDialog()], ['🔁', 'استبدال رب الأسرة بالزوجة', () => openChangeHead()], ['💾', 'تنزيل نسخة احتياطية', () => backupAll()], ['🕒', 'توحيد صيغة التواريخ', () => normalizeDatesAll()]];
    return isLimited ? a.filter(x => !['تسجيل حركة مخزون', 'تنزيل نسخة احتياطية', 'أكواد الأسر', 'استبدال رب الأسرة بالزوجة', 'توحيد صيغة التواريخ'].some(s => x[1].includes(s))) : a;
}
function ckBuild(q) {
    const nq = normAr(q), out = [];
    document.querySelectorAll('#sidebarMenu li[id^=nav-]').forEach(li => { if (li.style.display === 'none') return; const name = li.title || li.textContent.trim(); if (!nq || normAr(name).includes(nq)) out.push({ic: '🧭', t: name, s: 'انتقال إلى القسم', f: () => switchTab(li.id.replace('nav-', ''))}); });
    ckActions().forEach(x => { if (!nq || normAr(x[1]).includes(nq)) out.push({ic: x[0], t: x[1], s: 'إجراء', f: x[2]}); });
    if (nq.length >= 2) famSearch(q).slice(0, 8).forEach(r => out.push({ic: '👤', t: r.f[1] + (r.f[40] ? '  ·  ' + r.f[40] : ''), s: r.f[0] + ' — ' + r.why, f: () => showFamilyByKey(safeKey(digitsOf(r.f[2])))}));
    return out.slice(0, 14);
}
function ckRender() {
    const q = document.getElementById('ckInput').value; _ck.items = ckBuild(q); if (_ck.sel >= _ck.items.length) _ck.sel = 0;
    document.getElementById('ckList').innerHTML = _ck.items.length ? _ck.items.map((x, i) => '<div class="ck-item' + (i === _ck.sel ? ' on' : '') + '" onmouseenter="_ck.sel=' + i + ';ckMark()" onclick="ckGo(' + i + ')"><span class="ck-ic">' + x.ic + '</span><span class="ck-t">' + esc(x.t) + '</span><small>' + esc(x.s) + '</small></div>').join('') : '<div class="ck-empty">لا توجد نتائج</div>';
}
function ckMark() { document.querySelectorAll('#ckList .ck-item').forEach((e, i) => e.classList.toggle('on', i === _ck.sel)); }
function ckGo(i) { const x = _ck.items[i]; if (!x) return; ckClose(); setTimeout(x.f, 30); }
function ckClose() { const o = document.getElementById('ck'); if (o) o.classList.remove('show'); }
function ckOpen() {
    let o = document.getElementById('ck');
    if (!o) {
        o = document.createElement('div'); o.id = 'ck'; o.innerHTML = '<div class="ck-box"><input id="ckInput" placeholder="ابحث عن أسرة (اسم/هوية/كود/زوجة) أو قسم أو إجراء..." autocomplete="off"><div id="ckList"></div><div class="ck-foot">↑↓ تنقّل · Enter فتح · Esc إغلاق</div></div>';
        o.addEventListener('click', e => { if (e.target === o) ckClose(); }); document.body.appendChild(o);
        const inp = o.querySelector('#ckInput'); inp.addEventListener('input', () => { _ck.sel = 0; ckRender(); });
        inp.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { _ck.sel = Math.min(_ck.sel + 1, _ck.items.length - 1); ckMark(); e.preventDefault(); } else if (e.key === 'ArrowUp') { _ck.sel = Math.max(_ck.sel - 1, 0); ckMark(); e.preventDefault(); } else if (e.key === 'Enter') { ckGo(_ck.sel); } else if (e.key === 'Escape') ckClose(); });
    }
    o.classList.add('show'); const inp = o.querySelector('#ckInput'); inp.value = ''; _ck.sel = 0; ckRender(); setTimeout(() => inp.focus(), 20);
}
document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ckOpen(); }
    else if (e.key === '/' && !typing && !document.querySelector('#modalBg.show')) { e.preventDefault(); ckOpen(); }
});
(function () { if (document.getElementById('ckBtn')) return; const b = document.createElement('button'); b.id = 'ckBtn'; b.type = 'button'; b.title = 'بحث سريع (Ctrl+K)'; b.innerHTML = '🔍 <span>بحث سريع</span><kbd>Ctrl K</kbd>'; b.onclick = ckOpen; document.body.appendChild(b); })();

