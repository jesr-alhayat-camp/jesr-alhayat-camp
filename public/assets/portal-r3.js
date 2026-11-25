        firebase.initializeApp({apiKey:"AIzaSyBFo63U4rpdr7ZYUMdhxIzVIyMSRNv4GVc",authDomain:"aljalacamp-test.firebaseapp.com",databaseURL:"https://aljalacamp-test-default-rtdb.firebaseio.com",projectId:"aljalacamp-test",storageBucket:"aljalacamp-test.firebasestorage.app",messagingSenderId:"1024191676814",appId:"1:1024191676814:web:7e0637d1e6acede51f64df"});
        const auth=firebase.auth(), rdb=firebase.database();
        const authReady = prepareCampAuth(auth);
        authReady.catch(() => showCampStartupError());
        
        const toLatin=s=>String(s==null?'':s).replace(/[\u0660-\u0669]/g,c=>c.charCodeAt(0)-1632).replace(/[\u06F0-\u06F9]/g,c=>c.charCodeAt(0)-1776);
        const digitsOf=s=>toLatin(s).replace(/\D/g,'');
        const safeKey=s=>String(s==null?'':s).replace(/[.#$\[\]\/\s]/g,'');
        const dobNorm=s=>{s=toLatin(s).trim();let m=s.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4})/);if(m)return m[1].padStart(2,'0')+m[2].padStart(2,'0')+m[3];m=s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);return m?m[3].padStart(2,'0')+m[2].padStart(2,'0')+m[1]:'';};
        
        const strongPw=p=>p.length>=8&&/[A-Za-z\u0600-\u06FF]/.test(p)&&/\d/.test(p);

        const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const emailOf=id=>safeKey(digitsOf(id))+'@camp.local';
        let portalNotes=[], portalReqs=[], vaultKey='', sentLocal=[], helpFrom='normalLogin';
        let currentFamilyRow=null, portalAids=[], portalChildren=[], portalOrphans=[], portalInjured=[], currentId='', fails=0, lockedUntil=0, idleT;


        // عرض تاريخ الميلاد بصيغة يوم/شهر/سنة بدون أصفار زائدة (مثال 20/1/2026) — لا يغيّر القيمة المخزنة
        function fmtDob(value){
            if(value === null || value === undefined || value === '') return '';
            const s = toLatin(String(value)).trim();
            const out = (d,m,y) => (+d) + '/' + (+m) + '/' + y;
            if(/^\d+(?:\.\d+)?$/.test(s)){
                const n = Number(s);
                if(n >= 20000 && n <= 80000){
                    const d = new Date(Date.UTC(1899,11,30) + Math.round(n * 86400000));
                    return out(d.getUTCDate(), d.getUTCMonth()+1, d.getUTCFullYear());
                }
                return s;
            }
            let m = s.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})(?:\D.*)?$/);
            if(m) return out(m[3], m[2], m[1]);
            m = s.match(/^(\d{1,2})\D+(\d{1,2})\D+(\d{4})$/);
            if(m) return out(m[1], m[2], m[3]);
            return s;
        }
        function displayBirthDate(value){ return fmtDob(value) || '-'; }

        function switchView(viewId){
            document.querySelectorAll('.card-box, #dashboardSection').forEach(el=>el.classList.add('hidden'));
            {const el=document.getElementById(viewId+'Section');el.classList.remove('hidden','view-enter');void el.offsetWidth;el.classList.add('view-enter');}
            if(viewId==='addChild') prepChildForm();
            window.scrollTo(0,0);
        }

        function saveDB(key,data){
            if(!currentId) return;
            const item={type:key,date:new Date().toISOString(),payload:data[data.length-1]};
            rdb.ref('inbox/'+currentId).push(JSON.parse(JSON.stringify(item,(k,v)=>v===undefined?'':v)))
               .catch(()=>notify('❌ تعذر إرسال الطلب، حاول لاحقاً'));
        }
        let idleW; function resetIdle(){ clearTimeout(idleT); clearTimeout(idleW); if(currentId){ idleW=setTimeout(()=>notify('⚠️ ستنتهي جلستك خلال دقيقة لعدم النشاط. المس الشاشة للاستمرار.'),9*60*1000); idleT=setTimeout(()=>{auth.signOut().then(()=>location.reload());},10*60*1000); } }
        ['click','keydown','touchstart','pointerdown','scroll'].forEach(ev=>document.addEventListener(ev,resetIdle,{passive:true,capture:true}));

        document.getElementById('normalLoginForm').addEventListener('submit',function(e){
            e.preventDefault();
            const btn=document.getElementById('loginBtn'), err=document.getElementById('loginErr');
            const showErr=m=>{err.textContent=m;err.classList.remove('show');void err.offsetWidth;err.classList.add('show');};
            err.classList.remove('show');
            if(Date.now()<lockedUntil){showErr('⏳ محاولات كثيرة، انتظر دقيقة ثم أعد المحاولة.');return;}
            const id=document.getElementById('normalId').value.trim(), pass=document.getElementById('normalPassword').value;
            if(!digitsOf(id)){showErr('اكتب رقم هوية رب الأسرة (أرقاماً).');return;}
            btn.classList.add('is-loading'); btn.disabled=true;
            authReady.then(()=>auth.signInWithEmailAndPassword(emailOf(id),pass)).then(()=>loadPortal(id)).catch(ex=>{
                const c=(ex&&ex.code)||'';
                if(c==='auth/network-request-failed'){showErr('تعذر الاتصال بالإنترنت. تحقق من الشبكة ثم حاول مجدداً.');return;}
                if(c==='auth/too-many-requests'){showErr('محاولات كثيرة من هذا الجهاز. انتظر قليلاً ثم أعد المحاولة.');return;}
                if(++fails>=5){lockedUntil=Date.now()+60000;fails=0;}
                showErr('رقم الهوية أو كلمة المرور غير صحيحة.');
            }).finally(()=>{btn.classList.remove('is-loading');btn.disabled=false;});
        });

        document.getElementById('changePwdForm').addEventListener('submit',function(e){
            e.preventDefault();
            const form=e.target, cur=document.getElementById('curPwd').value, nw=document.getElementById('newPwd2').value, u=auth.currentUser;
            if(!u||!currentId) return;
            if(!strongPw(nw)){notify('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل وتحتوي حروفاً وأرقاماً.');return;}
            if(nw===cur){notify('كلمة المرور الجديدة يجب أن تختلف عن الحالية.');return;}
            const cleanKey=safeKey(digitsOf(currentId));
            u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email,cur))
              .then(()=>u.updatePassword(nw).then(()=>saveVault(cleanKey,nw).then(()=>true).catch(err=>{console.error('vault',err);return false;})))
              .then(vaultOk=>{
                  notify('✅ تم تغيير كلمة المرور بنجاح.');
                  form.reset();switchView('dashboard');
              })
              .catch(err=>{
                  const c=err&&err.code||'';
                  if(c==='auth/wrong-password'||c==='auth/invalid-credential'||c==='auth/invalid-login-credentials') notify('❌ كلمة المرور الحالية غير صحيحة.');
                  else notify('❌ تعذر تغيير كلمة المرور: '+(c||err.message));
              });
        });

        function saveVault(key,pw){
            return encVault(pw).then(v=>{ if(!v) return; return rdb.ref('pwvault/'+key).set(v); });
        }
        function syncVault(){ /* لم يعد يتم تخزين كلمة المرور كنص صريح */ }

        function loadPortal(id){
            const __portalStart = performance.now();
            currentId=safeKey(digitsOf(id));
            return rdb.ref('portal/'+currentId).once('value').then(s=>{
                const v=s.val();
                console.info('[TEST PERFORMANCE] Family portal read: ' + Math.round(performance.now() - __portalStart) + ' ms');
                if(!v){notify('لا توجد بيانات لهذه الهوية بعد، راجع الإدارة.');auth.signOut();currentId='';return;}
                currentFamilyRow=Array.from(v.row||[]); window.famCode=v.code||''; 
                portalAids=Object.values(v.aids||{});
                portalChildren=Object.values(v.children||{});
                portalOrphans=Object.values(v.orphans||{});
                portalInjured=Object.values(v.injured||{});
                portalNotes=Object.values(v.notes||{}); portalMsgs=Object.values(v.msgs||{});
                portalReqs=Object.values(v.reqs||{});
                vaultKey=v.vk||'';
                renderedPortalTabs.clear(); currentTab=portalRoute() || 'home'; loadDashboard(); resetIdle();
            }).catch(error=>{
                const denied = /permission.?denied/i.test(String(error && (error.code || error.message)));
                notify(denied ? '❌ لا تملك صلاحية الدخول.' : '❌ تعذر تحميل بيانات الأسرة. تحقق من الاتصال ثم حاول مجدداً.');
                auth.signOut();currentId='';
            });
        }

        function loadDashboard(){
            if(!currentFamilyRow) return;
            const T=(id,v)=>document.getElementById(id).textContent=v||'';
            T('dashName',currentFamilyRow[1]);T('dashSector',currentFamilyRow[0]);T('dashId',currentFamilyRow[2]);
            T('dashMembers',currentFamilyRow[26]);T('dashHousing',currentFamilyRow[31]);T('dashJob',currentFamilyRow[33]);T('dashStatus',currentFamilyRow[32]);
            T('dashDob', displayBirthDate(currentFamilyRow[4]));
            [[8,10,'dashW1'],[11,13,'dashW2']].forEach(w=>{
                const nm=currentFamilyRow[w[0]], has=!!(nm&&String(nm).trim());
                document.getElementById(w[2]+'Row').classList.toggle('hidden',!has);
                T(w[2], has ? nm + ' — تاريخ الميلاد: ' + displayBirthDate(currentFamilyRow[w[1]]) : '');
            });
            
            // الأيتام والمصابين
            T('dashOrphans', portalOrphans.length ? portalOrphans.map(o=>o[0]).join(', ') : 'لا يوجد أيتام مسجلين');
            T('dashInjured', portalInjured.length ? portalInjured.map(i=>i[0] + ' (' + i[3] + ')').join(', ') : 'لا يوجد إصابات مسجلة');

            const nm=a=>a[3]==='غير ذلك'?a[4]:a[3];
            const banner=document.getElementById('aidDetailsText');
            if(portalAids.length){const l=portalAids[portalAids.length-1];banner.textContent='تم استلام: '+nm(l)+' — الكمية: '+(l[5]||'-');}
            else banner.textContent='لم يتم تسجيل استلام مساعدات حديثة في الكشوفات.';
            
            renderNotices(); renderMsgs(); renderContact(); kpiRefresh();
            switchView('dashboard');
        }

        function renderPortalChildren() {
            // جدول الأطفال مع زر التعديل
            const ct=document.querySelector('#dashChildrenTable tbody'); ct.innerHTML='';
            if(!portalChildren.length){const tr=ct.insertRow();const td=tr.insertCell();td.colSpan=7;td.style.textAlign='center';td.textContent='لا يوجد أطفال مسجلون في الكشوفات';}
            portalChildren.forEach((c, index)=>{
                const tr=ct.insertRow();
                [c[0], c[1]||'-', displayBirthDate(c[2]), ageOf(c[2])||'-', c[3]||'-', (c[9]||'-')].forEach(v=>{tr.insertCell().textContent=v;});
                const editTd = tr.insertCell();
                editTd.innerHTML = `<button class="btn-warning" style="padding:4px 8px; font-size:12px; border:none; border-radius:4px; cursor:pointer;" onclick="openEditChild(${index})">تعديل</button>`;
            });

            mfInit('dashChildrenTable');
        }

        function renderPortalAids() {
            const tb=document.querySelector('#dashAidsTable tbody'); tb.innerHTML='';
            if(!portalAids.length){const tr=tb.insertRow();const td=tr.insertCell();td.colSpan=3;td.style.textAlign='center';td.textContent='سجل المساعدات فارغ';}
            portalAids.forEach(a=>{const tr=tb.insertRow();[a[3]==='غير ذلك'?'أخرى':a[3],a[5]||'-',smartNote(a[4])||'-'].forEach(v=>{tr.insertCell().textContent=v;});});
            mfInit('dashAidsTable', 0, 'تصفية حسب نوع المساعدة', 'كل الأنواع');
        }


        /* ===== ثوابت التواصل ===== */
        const CAMP_PHONE_INTL='972599606955', CAMP_PHONE_SHOW='00972599606955', CAMP_GROUP='https://chat.whatsapp.com/KJxAeBhippD8Draz69zz4f';
        const FAM_LABELS=['القاطع','الاسم رباعي','رقم الهوية','الجنس','تاريخ الميلاد','رقم الجوال','رقم الجوال الثاني','الحالة الاجتماعية','اسم الزوجة الأولى','هوية الزوجة الأولى','ميلاد الزوجة الأولى','اسم الزوجة الثانية','هوية الزوجة الثانية','ميلاد الزوجة الثانية','(يوم-سنتين) ذكر','(يوم-سنتين) أنثى','(3-6 سنوات) ذكر','(3-6 سنوات) أنثى','(7-12 سنة) ذكر','(7-12 سنة) أنثى','(13-17 سنة) ذكر','(13-17 سنة) أنثى','(18-60 سنة) ذكر','(18-60 سنة) أنثى','(فوق 60) ذكر','(فوق 60) أنثى','العدد الكلي للأفراد','عنوان السكن الأصلي','المحافظة الأصلية','عنوان السكن الحالي','المحافظة الحالية','المسكن','الحالة','المهنة','نوع الضرر','ذوو الإعاقة','أمراض مزمنة','تعيل الأسرة امرأة؟','امرأة مرضعة/حامل؟','ملاحظات'];
        const REQ_TYPES={db_edit_requests:'تعديل بيانات',db_children:'إضافة / تعديل طفل',db_chronic:'إضافة مريض مزمن',db_injured:'تسجيل إصابة',db_complaints:'شكوى / طلب'};
        const ST_TXT={pending:'قيد المراجعة',accepted:'تمت الموافقة',rejected:'مرفوض',answered:'تم الرد',sent:'أُرسل (بانتظار استلام الإدارة)'};

        function notify(msg){const t=document.getElementById('toast'),m=String(msg),bad=/^\s*[❌⛔⚠⏳]/u.test(m);t.textContent=m;t.className=/^\s*[❌⛔]/u.test(m)?'err':bad?'warn':'';void t.offsetWidth;t.classList.add('show');clearTimeout(notify._t);notify._t=setTimeout(()=>t.classList.remove('show'),bad?6000:3800);}

        function inContactHours(){
            try{const h=parseInt(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hour12:false,timeZone:'Asia/Jerusalem'}).format(new Date()),10);return h>=12&&h<18;}
            catch(e){const h=new Date().getHours();return h>=12&&h<18;}
        }
        function renderContact(){
            const open=inContactHours();
            const name=currentFamilyRow?currentFamilyRow[1]:'';
            const msg='السلام عليكم، أنا '+(name||'')+(currentId?' (هوية '+currentId+')':'')+' وأحتاج مساعدة بخصوص: ';
            const html='<h4>📞 التواصل مع الإدارة</h4>'
              +'<div style="font-size:13px;color:#334155">أوقات التواصل: من الساعة <b>12 ظهراً</b> حتى <b>6 مساءً</b></div>'
              +'<div style="font-size:13px;margin:6px 0"><span class="dot" style="background:'+(open?'#16a34a':'#9ca3af')+'"></span>'+(open?'متاح الآن للرد':'خارج أوقات التواصل حالياً، يمكنك ترك رسالة وسيتم الرد في أوقات الدوام')+'</div>'
              +'<a class="a-wa" target="_blank" rel="noopener" href="https://wa.me/'+CAMP_PHONE_INTL+'?text='+encodeURIComponent(msg)+'">💬 واتساب مباشر</a>'
              +'<a class="a-tel" href="tel:+'+CAMP_PHONE_INTL+'">📞 اتصال</a>'
              +'<a class="a-grp" target="_blank" rel="noopener" href="'+CAMP_GROUP+'">👥 مجموعة المخيم على واتساب</a>'
              +'<div class="sub-muted" dir="ltr" style="text-align:right">'+CAMP_PHONE_SHOW+'</div>';
            document.querySelectorAll('.contact-slot').forEach(s=>{s.className='contact-slot contact';s.innerHTML=html;});
        }
        function openHelp(){helpFrom=currentId?'dashboard':'normalLogin';renderContact();switchView('help');}
        function closeHelp(){switchView(helpFrom);}

        /* ===== أدوات التحقق والعمر ===== */
        function ageOf(s){
            const n=dobNorm(s); if(!n) return '';
            const d=+n.slice(0,2), m=+n.slice(2,4), y=+n.slice(4,8); const now=new Date();
            let months=(now.getFullYear()-y)*12+(now.getMonth()+1-m); if(now.getDate()<d) months--;
            if(months<0) return '';
            if(months<24) return months+' شهر';
            return Math.floor(months/12)+' سنة';
        }
        function checkId(elId,required){
            const v=digitsOf(document.getElementById(elId).value);
            if(!v) return required?(notify('رقم الهوية مطلوب.'),false):true;
            if(v.length!==9) return confirm('رقم الهوية يجب أن يكون 9 أرقام (أدخلت '+v.length+'). هل تريد المتابعة رغم ذلك؟');
            return true;
        }
        function checkDob(elId){
            const v=document.getElementById(elId).value.trim(); if(!v) return true;
            const n=dobNorm(v), y=n?+n.slice(4,8):0;
            if(!n||y<1900||new Date(y,+n.slice(2,4)-1,+n.slice(0,2))>new Date()){notify('تاريخ الميلاد غير صحيح. استخدم الصيغة يوم/شهر/سنة، مثال: 12/05/2018');return false;}
            return true;
        }
        const normV=(i,v)=>{v=toLatin(v==null?'':v).trim();if(i>=14&&i<=25&&v==='')v='0';if([4,10,13].includes(i))v=fmtDob(v);return v;};
        function famDiff(oldRow,newRow){
            const out=[];
            for(let i=0;i<40;i++){
                if([0,1,2,39].includes(i)) continue;
                const a=normV(i,oldRow[i]), b=normV(i,newRow[i]);
                if(a!==b) out.push([FAM_LABELS[i],a||'—',b||'—']);
            }
            return out;
        }

        /* ===== الأم / الطفل ===== */
        function prepChildForm(){
            const sel=document.getElementById('c_mom_sel'); if(!sel) return; sel.innerHTML='';
            const r=currentFamilyRow||[];
            [[8,9],[11,12]].forEach(p=>{if(r[p[0]]){const o=document.createElement('option');o.value=(r[p[1]]||'');o.textContent=r[p[0]];sel.appendChild(o);}});
            const o=document.createElement('option');o.value='__manual';o.textContent='أخرى / إدخال يدوي';sel.appendChild(o);
            momToggle();
        }
        function momToggle(){const m=document.getElementById('c_mom_sel').value==='__manual';document.getElementById('c_mom_manual').classList.toggle('hidden',!m);}
        function momName(){const s=document.getElementById('c_mom_sel');return s.value==='__manual'?document.getElementById('c_mom_name').value:s.options[s.selectedIndex].textContent;}
        function momId(){const s=document.getElementById('c_mom_sel');return s.value==='__manual'?document.getElementById('c_mom_id').value:s.value;}

        /* ===== الإعلانات وطلباتي ===== */
        function renderNotices(){
            const b=document.getElementById('noticeBox'); b.innerHTML='';
            portalNotes.slice().sort((a,c)=>(c.t||0)-(a.t||0)).forEach(n=>{
                const d=document.createElement('div');d.className='notice';
                const h=document.createElement('h4');h.textContent='📢 '+(n.ti||'إعلان من الإدارة');
                const p=document.createElement('p');p.textContent=n.tx||'';p.style.cssText='font-size:14px;white-space:pre-wrap;color:#78350f';
                d.appendChild(h);d.appendChild(p);b.appendChild(d);
            });
        }
        function noteSent(label){sentLocal.unshift({ty:label,d:todayLocal()});renderedPortalTabs.delete('requests');kpiRefresh();}
        function renderMyReqs(){
            const tb=document.querySelector('#myReqsTable tbody'); tb.innerHTML='';
            const rows=[];
            sentLocal.forEach(s=>rows.push({ty:s.ty,d:s.d,st:'sent',r:''}));
            portalReqs.slice().sort((a,b)=>String(b.d).localeCompare(String(a.d))).forEach(q=>rows.push(q));
            if(!rows.length){const tr=tb.insertRow();const td=tr.insertCell();td.colSpan=4;td.style.textAlign='center';td.textContent='لا توجد طلبات سابقة';return;}
            rows.forEach(q=>{
                const tr=tb.insertRow();
                tr.insertCell().textContent=q.ty||'-';
                const dc=tr.insertCell();dc.textContent=q.d||'-';dc.style.direction='ltr';
                const sc=tr.insertCell();const sp=document.createElement('span');sp.className='pill p-'+(ST_TXT[q.st]?q.st:'pending');sp.textContent=ST_TXT[q.st]||q.st||'-';sc.appendChild(sp);
                tr.insertCell().textContent=q.r||'-';
            });
        }

        /* ===== طباعة بطاقة العائلة ===== */
        function printCard(){
            if(!currentFamilyRow) return; const r=currentFamilyRow;
            const w=window.open('','_blank'); if(!w){notify('اسمح بالنوافذ المنبثقة لطباعة البطاقة.');return;}
            const rows=[['الاسم',r[1]],['رقم الهوية',r[2]],['تاريخ الميلاد',displayBirthDate(r[4])],...(r[8]?[['الزوجة الأولى',r[8]+' — ميلاد: '+displayBirthDate(r[10])]]:[]),...(r[11]?[['الزوجة الثانية',r[11]+' — ميلاد: '+displayBirthDate(r[13])]]:[]),['القاطع',r[0]],['عدد الأفراد',r[26]],['رقم الجوال',r[5]],['المسكن',r[31]],['الحالة',r[32]],['المهنة',r[33]]];
            const kids=portalChildren.map(c=>'<tr><td>'+esc(c[0])+'</td><td>'+esc(c[1]||'-')+'</td><td>'+esc(displayBirthDate(c[2]))+'</td><td>'+esc(ageOf(c[2])||'-')+'</td></tr>').join('')||'<tr><td colspan="4" style="text-align:center">لا يوجد</td></tr>';
            w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>بطاقة عائلة</title><style>body{font-family:Tahoma,Arial,sans-serif;padding:30px;color:#0f172a}h1{text-align:center;margin:0;font-size:22px}h2{text-align:center;margin:4px 0 20px;font-size:15px;color:#475569;font-weight:normal}table{width:100%;border-collapse:collapse;margin-bottom:18px}td,th{border:1px solid #94a3b8;padding:8px;font-size:14px;text-align:right}th{background:#e2e8f0}.k{width:30%;background:#f1f5f9;font-weight:bold}.f{text-align:center;color:#64748b;font-size:12px;margin-top:30px}</style></head><body>'
              +'<h1>⛺ مخيم الأصدقاء الجلاء</h1><h2>بطاقة بيانات أسرة</h2><table>'
              +rows.map(x=>'<tr><td class="k">'+esc(x[0])+'</td><td>'+esc(x[1]||'-')+'</td></tr>').join('')
              +'</table><h3>الأطفال المسجلون</h3><table><tr><th>الاسم</th><th>الهوية</th><th>تاريخ الميلاد</th><th>العمر</th></tr>'+kids+'</table>'
              +'<div class="f">طُبعت بتاريخ '+esc(new Date().toLocaleDateString('ar-EG'))+' · للتواصل مع الإدارة: '+CAMP_PHONE_SHOW+' (12 ظهراً - 6 مساءً)</div></body></html>');
            w.document.close(); setTimeout(()=>{try{w.focus();w.print();}catch(e){}},400);
        }

        /* ===== حماية كلمات المرور: تخزين مشفّر فقط ===== */
        const VAULT_PRE='rsa1:';
        async function encVault(pw){
            if(!vaultKey||!window.crypto||!crypto.subtle) return null;
            try{
                const k=await crypto.subtle.importKey('jwk',JSON.parse(vaultKey),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
                const c=await crypto.subtle.encrypt({name:'RSA-OAEP'},k,new TextEncoder().encode(pw));
                return VAULT_PRE+btoa(String.fromCharCode.apply(null,new Uint8Array(c)));
            }catch(e){return null;}
        }

        function openEditForm() {
            if(!currentFamilyRow) return;
            document.getElementById('edit_sector').value = currentFamilyRow[0] || '';
            document.getElementById('edit_name').value = currentFamilyRow[1] || '';
            document.getElementById('edit_gender').value = currentFamilyRow[3] || '';
            document.getElementById('edit_dob').value = fmtDob(currentFamilyRow[4]);
            document.getElementById('edit_phone1').value = currentFamilyRow[5] || '';
            document.getElementById('edit_phone2').value = currentFamilyRow[6] || '';
            document.getElementById('edit_marital').value = currentFamilyRow[7] || '';
            
            /* -- إضافة حقول الزوجات -- */
            document.getElementById('edit_wife1_name').value = currentFamilyRow[8] || '';
            document.getElementById('edit_wife1_id').value = currentFamilyRow[9] || '';
            document.getElementById('edit_wife1_dob').value = fmtDob(currentFamilyRow[10]);
            document.getElementById('edit_wife2_name').value = currentFamilyRow[11] || '';
            document.getElementById('edit_wife2_id').value = currentFamilyRow[12] || '';
            document.getElementById('edit_wife2_dob').value = fmtDob(currentFamilyRow[13]);
            
            document.getElementById('edit_a_15').value = currentFamilyRow[14] || '0';
            document.getElementById('edit_a_16').value = currentFamilyRow[15] || '0';
            document.getElementById('edit_a_17').value = currentFamilyRow[16] || '0';
            document.getElementById('edit_a_18').value = currentFamilyRow[17] || '0';
            document.getElementById('edit_a_19').value = currentFamilyRow[18] || '0';
            document.getElementById('edit_a_20').value = currentFamilyRow[19] || '0';
            document.getElementById('edit_a_21').value = currentFamilyRow[20] || '0';
            document.getElementById('edit_a_22').value = currentFamilyRow[21] || '0';
            document.getElementById('edit_a_23').value = currentFamilyRow[22] || '0';
            document.getElementById('edit_a_24').value = currentFamilyRow[23] || '0';
            document.getElementById('edit_a_25').value = currentFamilyRow[24] || '0';
            document.getElementById('edit_a_26').value = currentFamilyRow[25] || '0';

            document.getElementById('edit_members').value = currentFamilyRow[26] || '';
            document.getElementById('edit_orig_addr').value = currentFamilyRow[27] || '';
            document.getElementById('edit_orig_gov').value = currentFamilyRow[28] || '';
            document.getElementById('edit_curr_addr').value = currentFamilyRow[29] || '';
            document.getElementById('edit_curr_gov').value = currentFamilyRow[30] || '';
            document.getElementById('edit_housing').value = currentFamilyRow[31] || '';
            document.getElementById('edit_status').value = currentFamilyRow[32] || '';
            document.getElementById('edit_job').value = currentFamilyRow[33] || '';
            document.getElementById('edit_damage').value = currentFamilyRow[34] || '';
            document.getElementById('edit_woman_sup').value = currentFamilyRow[37] || '';
            document.getElementById('edit_preg_nurse').value = currentFamilyRow[38] || '';
            document.getElementById('edit_disab').value = currentFamilyRow[35] || '';
            document.getElementById('edit_chronic_txt').value = currentFamilyRow[36] || '';
            document.getElementById('edit_id').value = currentFamilyRow[2] || '';
            
            switchView('editData');
        }

        document.getElementById('editFamilyForm').addEventListener('submit', function(e) {
            e.preventDefault();
            let updatedRow = [...currentFamilyRow];
            updatedRow[0] = document.getElementById('edit_sector').value;
            updatedRow[1] = document.getElementById('edit_name').value;
            updatedRow[3] = document.getElementById('edit_gender').value;
            updatedRow[4] = document.getElementById('edit_dob').value;
            updatedRow[5] = document.getElementById('edit_phone1').value;
            updatedRow[6] = document.getElementById('edit_phone2').value;
            updatedRow[7] = document.getElementById('edit_marital').value;
            
            /* -- تحديث مصفوفة الطلب ببيانات الزوجات -- */
            updatedRow[8] = document.getElementById('edit_wife1_name').value;
            updatedRow[9] = document.getElementById('edit_wife1_id').value;
            updatedRow[10] = document.getElementById('edit_wife1_dob').value;
            updatedRow[11] = document.getElementById('edit_wife2_name').value;
            updatedRow[12] = document.getElementById('edit_wife2_id').value;
            updatedRow[13] = document.getElementById('edit_wife2_dob').value;
            [4,10,13].forEach(i=>{const o=currentFamilyRow[i]; if(o!=null && o!=='' && dobNorm(updatedRow[i]) && dobNorm(updatedRow[i])===dobNorm(o)) updatedRow[i]=o;});
            
            updatedRow[14] = document.getElementById('edit_a_15').value;
            updatedRow[15] = document.getElementById('edit_a_16').value;
            updatedRow[16] = document.getElementById('edit_a_17').value;
            updatedRow[17] = document.getElementById('edit_a_18').value;
            updatedRow[18] = document.getElementById('edit_a_19').value;
            updatedRow[19] = document.getElementById('edit_a_20').value;
            updatedRow[20] = document.getElementById('edit_a_21').value;
            updatedRow[21] = document.getElementById('edit_a_22').value;
            updatedRow[22] = document.getElementById('edit_a_23').value;
            updatedRow[23] = document.getElementById('edit_a_24').value;
            updatedRow[24] = document.getElementById('edit_a_25').value;
            updatedRow[25] = document.getElementById('edit_a_26').value;

            updatedRow[26] = document.getElementById('edit_members').value;
            updatedRow[27] = document.getElementById('edit_orig_addr').value;
            updatedRow[28] = document.getElementById('edit_orig_gov').value;
            updatedRow[29] = document.getElementById('edit_curr_addr').value;
            updatedRow[30] = document.getElementById('edit_curr_gov').value;
            updatedRow[31] = document.getElementById('edit_housing').value;
            updatedRow[32] = document.getElementById('edit_status').value;
            updatedRow[33] = document.getElementById('edit_job').value;
            updatedRow[34] = document.getElementById('edit_damage').value;
            updatedRow[37] = document.getElementById('edit_woman_sup').value;
            updatedRow[38] = document.getElementById('edit_preg_nurse').value;
            updatedRow[35] = document.getElementById('edit_disab').value;
            updatedRow[36] = document.getElementById('edit_chronic_txt').value;
            /* الحقول المقفلة: القاطع، الاسم، رقم الهوية (والملاحظات الداخلية للإدارة) */
            updatedRow[0]=currentFamilyRow[0]; updatedRow[1]=currentFamilyRow[1]; updatedRow[2]=currentFamilyRow[2]; updatedRow[39]=currentFamilyRow[39]||'';
            const chg=famDiff(currentFamilyRow,updatedRow);
            if(!chg.length){notify('ℹ️ لم تقم بتغيير أي بيانات.');return;}
            const ph1=digitsOf(updatedRow[5]); if(ph1&&ph1.length<9){notify('رقم الجوال غير صحيح.');return;}
            if(!confirm('سيتم إرسال التعديلات التالية للإدارة للمراجعة:\n\n'+chg.map(c=>'• '+c[0]+': '+c[1]+'  ←  '+c[2]).join('\n'))) return;

            rdb.ref('inbox/'+currentId).push({type:'db_edit_requests',date:new Date().toISOString(),payload:{id:currentFamilyRow[2],name:currentFamilyRow[1],date:todayLocal(),newData:updatedRow}})
               .then(()=>{notify("✅ تم إرسال طلب التعديل للإدارة، تابع حالته من قسم طلباتي");noteSent('تعديل بيانات'); switchView('dashboard');})
               .catch(()=>notify('❌ تعذر إرسال الطلب'));
        });

        document.getElementById('addComplaintForm').addEventListener('submit', function(e) {
            e.preventDefault();
            rdb.ref('inbox/'+currentId).push({type:'db_complaints',date:new Date().toISOString(),payload:[todayLocal(),currentFamilyRow[1],currentFamilyRow[2],currentFamilyRow[5]||'-','['+document.getElementById('comp_cat').value+'] '+document.getElementById('comp_subject').value,document.getElementById('comp_details').value]})
               .then(()=>{notify("✅ تم إرسال طلبك للإدارة");noteSent('شكوى / طلب'); e.target.reset(); switchView('dashboard');})
               .catch(()=>notify('❌ تعذر إرسال الشكوى'));
        });

        document.getElementById('addChildForm').addEventListener('submit', function(e) {
            e.preventDefault();
            if(!checkDob('c_dob')||!checkId('c_id',false)) return;
            const cid=digitsOf(document.getElementById('c_id').value);
            if(cid&&portalChildren.some(c=>digitsOf(c[1])===cid)){notify('هذا الطفل مسجل مسبقاً برقم الهوية نفسه.');return;}
            const dSize = document.getElementById('c_diapers').value;
            const milkType = document.getElementById('c_milk').value;
            const notes = 'مضاف من البوابة | حفاظات: ' + (dSize || 'لا يوجد') + ' | حليب: ' + (milkType || 'لا يوجد');

            rdb.ref('inbox/'+currentId).push({type:'db_children',date:new Date().toISOString(),payload:[
                document.getElementById('c_name').value, document.getElementById('c_id').value,
                document.getElementById('c_dob').value, document.getElementById('c_gender').value,
                currentFamilyRow[1], currentFamilyRow[2], currentFamilyRow[5],
                momName(), momId(), notes
            ]}).then(()=>{notify("✅ تم إرسال بيانات الطفل للإدارة للمراجعة");noteSent('إضافة طفل'); e.target.reset(); switchView('dashboard');})
              .catch(()=>notify('❌ تعذر الإضافة'));
        });

        document.getElementById('addChronicForm').addEventListener('submit', function(e) {
            e.preventDefault();
            if(!checkId('ch_id',true)||!checkDob('ch_dob')) return;
            rdb.ref('inbox/'+currentId).push({type:'db_chronic',date:new Date().toISOString(),payload:[
                document.getElementById('ch_name').value, document.getElementById('ch_id').value,
                document.getElementById('ch_dob').value, document.getElementById('ch_gender').value,
                document.getElementById('ch_type').value, document.getElementById('ch_notes').value, currentFamilyRow[5]
            ]}).then(()=>{notify("✅ تم إرسال بيانات المريض للإدارة للمراجعة");noteSent('إضافة مريض مزمن'); e.target.reset(); switchView('dashboard');})
              .catch(()=>notify('❌ تعذر الإضافة'));
        });

        document.getElementById('addInjuredForm').addEventListener('submit', function(e) {
            e.preventDefault();
            if(!checkId('i_id',true)||!checkDob('i_dob')) return;
            rdb.ref('inbox/'+currentId).push({type:'db_injured',date:new Date().toISOString(),payload:[
                document.getElementById('i_name').value, document.getElementById('i_id').value,
                document.getElementById('i_dob').value, document.getElementById('i_type').value,
                currentFamilyRow[5], document.getElementById('i_notes').value, "نعم"
            ]}).then(()=>{notify("✅ تم إرسال بيانات الإصابة للإدارة للمراجعة");noteSent('تسجيل إصابة'); e.target.reset(); switchView('dashboard');})
              .catch(()=>notify('❌ تعذر الإضافة'));
        });

        document.getElementById('logoutBtn').addEventListener('click', function() {
            document.getElementById('normalLoginForm').reset();


            document.getElementById('changePwdForm').reset();
            currentFamilyRow = null; currentId=''; portalNotes=[]; portalReqs=[]; sentLocal=[]; vaultKey=''; history.replaceState(null, '', location.pathname + location.search); auth.signOut();
            switchView('normalLogin');
        });
        /* ===== تحسينات الواجهة ===== */
        ['editFamilyForm','addComplaintForm','addChildForm','addChronicForm','addInjuredForm'].forEach(id=>{
            const f=document.getElementById(id);
            f.addEventListener('submit',()=>{const b=f.querySelector('button[type=submit]');if(b){b.disabled=true;setTimeout(()=>{b.disabled=false;},4000);}});
        });
        document.querySelectorAll('input[type=password]').forEach(inp=>{
            const s=document.createElement('span');s.className='pw-toggle';s.textContent='👁 إظهار كلمة المرور';
            s.onclick=()=>{const sh=inp.type==='password';inp.type=sh?'text':'password';s.textContent=sh?'🙈 إخفاء كلمة المرور':'👁 إظهار كلمة المرور';};
            inp.parentNode.appendChild(s);
        });
        renderContact();

        // ---- دوال تعديل بيانات طفل من قبل المستفيد ----
        function openEditChild(index) {
            const child = portalChildren[index];
            if(!child) return;
            document.getElementById('editChildForm').dataset.idx = index;
            document.getElementById('ec_name').value = child[0] || '';
            document.getElementById('ec_id').value = child[1] || '';
            document.getElementById('ec_id').dataset.old = child[1] || '';
            document.getElementById('ec_dob').value = fmtDob(child[2]);
            document.getElementById('ec_gender').value = child[3] || 'ذكر';
            document.getElementById('ec_notes').value = child[9] || '';
            switchView('editChild');
        }

        document.getElementById('editChildForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const idEl = document.getElementById('ec_id'), oldId = digitsOf(idEl.dataset.old || ''), newId = digitsOf(idEl.value);
            const idChanged = newId !== oldId;
            if(idChanged){
                if(newId && !checkId('ec_id',false)) return;
                if(newId && portalChildren.some(c=>digitsOf(c[1])===newId)){notify('رقم الهوية هذا مسجل مسبقاً لطفل آخر.');return;}
            }
            const idx = parseInt(document.getElementById('editChildForm').dataset.idx, 10);
            const old = portalChildren[idx] || [];
            const row = Array.from({length:10}, (_, i) => (old[i] == null ? '' : old[i]));
            row[0] = document.getElementById('ec_name').value;
            row[1] = idChanged ? idEl.value : (old[1] || '');
            row[2] = document.getElementById('ec_dob').value;
            row[3] = document.getElementById('ec_gender').value;
            row[9] = document.getElementById('ec_notes').value;
            if(!row[4]) row[4] = currentFamilyRow[1];
            if(!row[5]) row[5] = currentFamilyRow[2];
            if(!row[6]) row[6] = currentFamilyRow[5];
            // 10..12: علامة "تعديل" + هوية الطفل القديمة + اسمه القديم (للربط بالسجل الأصلي)
            rdb.ref('inbox/'+currentId).push({
                type:'db_children',
                date:new Date().toISOString(),
                payload: row.concat(['تعديل', oldId, old[0] || ''])
            }).then(()=>{
                notify("✅ تم إرسال طلب تعديل بيانات الطفل للإدارة للمراجعة");
                noteSent('تعديل بيانات طفل');
                e.target.reset();
                switchView('dashboard');
            }).catch(()=>notify('❌ تعذر إرسال الطلب'));
        });

/* ==========================================================================
   وحدة تحسينات البوابة: فلترة الجداول + إظهار كلمة المرور + إمكانية الوصول
   ========================================================================== */
const mfNorm = s => toLatin(String(s == null ? '' : s)).toLowerCase().replace(/[\u064B-\u065F\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();

/* بحث + قائمة تصفية اختيارية (حسب عمود) لأي جدول؛ يظهر الشريط فقط عند وجود 4 سجلات فأكثر */
function mfInit(tableId, selCol, selLabel, allLabel) {
    const table = document.getElementById(tableId); if (!table || !table.tBodies[0]) return;
    const wrap = table.parentElement;
    let bar = wrap.previousElementSibling && wrap.previousElementSibling.classList.contains('mf') ? wrap.previousElementSibling : null;
    if (!bar) {
        bar = document.createElement('div'); bar.className = 'mf hidden';
        bar.innerHTML = '<input type="search" placeholder="🔍 ابحث في الجدول..." aria-label="بحث في الجدول">'
            + (selCol != null ? '<select aria-label="' + selLabel + '"></select>' : '')
            + '<span class="mf-count" aria-live="polite"></span>';
        wrap.parentNode.insertBefore(bar, wrap);
        const run = () => mfApply(tableId);
        bar.querySelector('input').addEventListener('input', run);
        const s = bar.querySelector('select'); if (s) s.addEventListener('change', run);
        bar.dataset.col = selCol == null ? '' : selCol; bar.dataset.all = allLabel || 'الكل';
    }
    const rows = mfRows(table);
    bar.classList.toggle('hidden', rows.length < 4);
    const sel = bar.querySelector('select');
    if (sel) {
        const cur = sel.value, col = +bar.dataset.col, set = new Set();
        rows.forEach(tr => { const v = (tr.cells[col] ? tr.cells[col].textContent : '').trim(); if (v && v !== '-') set.add(v); });
        sel.innerHTML = '';
        const o0 = document.createElement('option'); o0.value = ''; o0.textContent = bar.dataset.all; sel.appendChild(o0);
        Array.from(set).sort((a, b) => a.localeCompare(b, 'ar')).forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
        sel.value = set.has(cur) ? cur : '';
    }
    mfApply(tableId);
}
const mfRows = table => Array.from(table.tBodies[0].rows).filter(tr => !Array.from(tr.cells).some(td => td.colSpan > 1));
function mfApply(tableId) {
    const table = document.getElementById(tableId); if (!table) return;
    const wrap = table.parentElement, bar = wrap.previousElementSibling; if (!bar || !bar.classList.contains('mf')) return;
    const q = mfNorm(bar.querySelector('input').value), sel = bar.querySelector('select'), sv = sel ? sel.value : '', col = +bar.dataset.col;
    const rows = mfRows(table); let shown = 0;
    rows.forEach(tr => {
        let ok = !q || mfNorm(tr.textContent).includes(q);
        if (ok && sv) ok = (tr.cells[col] ? tr.cells[col].textContent : '').trim() === sv;
        tr.classList.toggle('mf-hide', !ok); if (ok) shown++;
    });
    const tb = table.tBodies[0]; let em = tb.querySelector('tr.mf-empty');
    if (rows.length && !shown) { if (!em) { em = tb.insertRow(); em.className = 'mf-empty'; const td = em.insertCell(); td.colSpan = table.tHead ? table.tHead.rows[0].cells.length : 1; td.textContent = 'لا توجد نتائج مطابقة.'; } }
    else if (em) em.remove();
    bar.querySelector('.mf-count').textContent = bar.classList.contains('hidden') ? '' : (shown === rows.length ? rows.length + ' سجل' : shown + ' من ' + rows.length);
}
/* ---------- إظهار/إخفاء كلمة المرور + ربط التسميات بالحقول ---------- */
document.addEventListener('DOMContentLoaded', () => {
    ['normalPassword', 'newPassword', 'curPwd', 'newPwd2'].forEach(id => {
        const inp = document.getElementById(id); if (!inp) return;
        const w = document.createElement('div'); w.className = 'pw-wrap';
        inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
        const b = document.createElement('button'); b.type = 'button'; b.textContent = 'إظهار'; b.setAttribute('aria-label', 'إظهار كلمة المرور');
        b.addEventListener('click', () => { const show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; b.textContent = show ? 'إخفاء' : 'إظهار'; });
        w.appendChild(b);
    });
    document.querySelectorAll('.input-group').forEach(g => {
        const l = g.querySelector('label'), i = g.querySelector('input,select,textarea');
        if (l && i && i.id && !l.htmlFor) l.htmlFor = i.id;
    });
    document.getElementById('toast').setAttribute('aria-live', 'polite');
});


/* ==========================================================================
   بوابة المستفيد كلوحة تحكم + صورة الهوية + إصلاح التواريخ
   ========================================================================== */
function todayLocal() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function formatDateValue(value) {
    const p2 = n => String(n).padStart(2, '0');
    if (value === null || value === undefined || value === '') return '';
    const raw = String(value).trim(), s = toLatin(raw);
    if (/^\d+$/.test(s)) { const n = +s; if (n >= 20000 && n <= 80000) { const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000); return p2(d.getUTCDate()) + '/' + p2(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear(); } }
    let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[T ].*)?$/); if (m) return p2(m[3]) + '/' + p2(m[2]) + '/' + m[1];
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/); if (m) { let a = +m[1], b = +m[2]; if (b > 12 && a <= 12) { const x = a; a = b; b = x; } return p2(a) + '/' + p2(b) + '/' + m[3]; }
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2})$/);
    if (m) { let mo = +m[1], da = +m[2]; if (mo > 12 && da <= 12) { const x = mo; mo = da; da = x; } const yy = +m[3]; return p2(da) + '/' + p2(mo) + '/' + (yy <= (new Date().getFullYear() % 100) + 1 ? 2000 + yy : 1900 + yy); }
    return raw;
}
function smartNote(v) {
    if (v === null || v === undefined || v === '') return '';
    const s = toLatin(String(v)).trim();
    if (/^\d{5}$/.test(s) && +s >= 30000 && +s <= 70000) return formatDateValue(s);
    if (/^\d{1,2}[-\/.]\d{1,2}[-\/.](\d{2}|\d{4})$/.test(s) || /^\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2}$/.test(s)) return formatDateValue(s);
    return String(v).trim();
}

let currentTab = 'home';
const renderedPortalTabs = new Set();
const TABS = [['home', '🏠', 'الرئيسية'], ['profile', '👤', 'بياناتي'], ['family', '👶', 'الأطفال والفئات'], ['aids', '📦', 'المساعدات'], ['requests', '🧾', 'طلباتي']];
const $id = x => document.getElementById(x);

function portalRoute() {
    const key = location.hash.slice(1);
    return TABS.some(([tab]) => tab === key) ? key : null;
}
function setActive(key) {
    document.querySelectorAll('#appShell .nv').forEach(button => {
        const active = button.dataset.k === key;
        button.classList.toggle('on', active);
        if (active) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    });
}
function applyTab(name) {
    document.querySelectorAll('#dashboardSection>[data-tab]').forEach(el => {
        el.classList.toggle('tab-off', !el.dataset.tab.split(' ').includes(name));
    });
    setActive(name);
    if (renderedPortalTabs.has(name)) return;
    if (name === 'family') renderPortalChildren();
    if (name === 'aids') renderPortalAids();
    if (name === 'requests') {
        renderMyReqs();
        mfInit('myReqsTable', 2, 'تصفية حسب الحالة', 'كل الحالات');
    }
    fixDates();
    renderedPortalTabs.add(name);
}
function showTab(name, fromHistory = false) {
    if (!currentFamilyRow || !TABS.some(([tab]) => tab === name)) return;
    if (!fromHistory && portalRoute() !== name) history.pushState(null, '', '#' + name);
    currentTab = name;
    if ($id('dashboardSection').classList.contains('hidden')) switchView('dashboard');
    else applyTab(name);
    window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => showTab(portalRoute() || 'home', true));
function setAvatars() {
    const nm = (currentFamilyRow && currentFamilyRow[1] || '').trim(), ini = nm ? nm[0] : '👤';
    document.querySelectorAll('.avatar').forEach(a => { a.textContent = ini; });
}
function kpiRefresh() {
    if (!$id('kpiGrid') || !currentFamilyRow) return;
    setAvatars();
    $id('kpMembers').textContent = parseInt(toLatin(currentFamilyRow[26]), 10) || '-';
    $id('kpChildren').textContent = portalChildren.length;
    $id('kpAids').textContent = portalAids.length;
    $id('kpReqs').textContent = sentLocal.length + portalReqs.length;
    const nm = (currentFamilyRow[1] || '').trim().split(/\s+/).slice(0, 2).join(' ');
    $id('tbName').textContent = 'مرحباً ' + nm; const sub = document.querySelector('.tb-title small'); if (sub) sub.textContent = window.famCode ? 'كود الأسرة: ' + window.famCode : 'بوابة عائلة مخيم الأصدقاء الجلاء'; $id('umName').textContent = currentFamilyRow[1] || '';
}
function fixDates() {
    document.querySelectorAll('#myReqsTable tbody tr').forEach(tr => { const c = tr.cells[1]; if (c && tr.cells.length > 2) { const v = formatDateValue(c.textContent); if (v) c.textContent = v; } });
}


/* ---------- بناء الواجهة ---------- */
(function buildShell() {
    const dash = $id('dashboardSection'), kids = Array.from(dash.children);
    const find = t => kids.find(k => { const h = k.querySelector('h3,h2,.card-title'); return (h ? h.textContent : k.textContent.slice(0, 80)).includes(t); });
    const tag = (el, tab) => { if (el) el.dataset.tab = tab; };
    tag(kids.find(k => k.classList.contains('dashboard-header')), 'home'); tag($id('noticeBox'), 'home'); tag($id('lastAidBanner'), 'home');
    tag(find('ملخص'), 'profile'); tag(find('الأطفال المسجلون'), 'family'); tag(find('الأيتام'), 'family');
    tag(find('سجل كل المساعدات'), 'aids'); tag(find('طلباتي'), 'requests'); tag(find('الطلبات والإضافات'), 'home requests');
    const th = document.querySelector('#dashAidsTable thead th:last-child'); if (th) th.textContent = 'التاريخ / ملاحظات';

    const kpi = document.createElement('div'); kpi.id = 'kpiGrid'; kpi.className = 'kpi'; kpi.dataset.tab = 'home';
    kpi.innerHTML = [['profile', '👥', 'أفراد الأسرة', 'kpMembers', 't-lav'], ['family', '👶', 'الأطفال المسجلون', 'kpChildren', 't-pink'], ['aids', '📦', 'مساعدات مستلمة', 'kpAids', 't-mint'], ['requests', '🧾', 'طلباتي', 'kpReqs', 't-sky']]
        .map(a => '<button type="button" class="kp ' + a[4] + '" data-go="' + a[0] + '"><span class="s-ic">' + a[1] + '</span><span class="s-l">' + a[2] + '</span><b id="' + a[3] + '">-</b></button>').join('');
    const banner = $id('lastAidBanner'); banner.insertAdjacentElement('afterend', kpi);
    kpi.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) showTab(b.dataset.go); });


    const nav = (arr, cls) => arr.map(t => '<button type="button" class="nv" data-k="' + t[0] + '" aria-label="' + t[2] + '"><span class="ic">' + t[1] + '</span><span class="lb">' + t[2] + '</span></button>').join('');
    const shell = document.createElement('div'); shell.id = 'appShell'; shell.className = 'hidden';
    shell.innerHTML = '<aside id="rail" aria-label="القائمة الرئيسية"><div class="rail-logo">⛺</div><nav id="railNav">' + nav(TABS)
        + '<div class="rail-sep"></div>' + nav([['help', '💬', 'المساعدة والتواصل'], ['pwd', '🔒', 'كلمة المرور'], ['out', '🚪', 'تسجيل الخروج']]) + '</nav></aside>'
        + '<div id="appBody"><header id="topbar"><div class="tb-title"><b id="tbName">مرحباً</b><small>بوابة عائلة مخيم الأصدقاء الجلاء</small></div>'
        + '<div class="tb-actions"><button type="button" class="tb-btn" id="tbHelp" aria-label="المساعدة">💬</button><button type="button" class="tb-user" id="tbUser" aria-label="القائمة الشخصية"><span class="avatar"></span></button>'
        + '<div id="userMenu" class="user-menu hidden"><div class="um-name" id="umName"></div><button type="button" data-m="profile">👤 بياناتي</button><button type="button" data-m="help">💬 المساعدة والتواصل</button><button type="button" data-m="pwd">🔒 تغيير كلمة المرور</button><button type="button" data-m="out">🚪 تسجيل الخروج</button></div></div></header>'
        + '<main id="appMain"></main></div><nav id="bottomNav" aria-label="التنقل">' + nav(TABS) + '</nav>';
    dash.parentNode.insertBefore(shell, dash);
    const main = $id('appMain');
    ['dashboardSection', 'editDataSection', 'editChildSection', 'changePwdSection', 'addChildSection', 'addChronicSection', 'addInjuredSection', 'addComplaintSection', 'helpSection'].forEach(id => { const el = $id(id); if (el) main.appendChild(el); });

    const act = k => { $id('userMenu').classList.add('hidden'); if (k === 'help') switchView('help'); else if (k === 'pwd') switchView('changePwd'); else if (k === 'out') $id('logoutBtn').click(); else showTab(k); };
    shell.addEventListener('click', e => { const b = e.target.closest('.nv,[data-m]'); if (b) act(b.dataset.k || b.dataset.m); });
    $id('tbHelp').addEventListener('click', () => switchView('help'));
    $id('tbUser').addEventListener('click', e => { e.stopPropagation(); $id('userMenu').classList.toggle('hidden'); });
    document.addEventListener('click', e => { if (!e.target.closest('#userMenu')) $id('userMenu').classList.add('hidden'); });

    const _sv = switchView;
    switchView = function (id) {
        _sv(id);
        const login = id === 'normalLogin';
        $id('appShell').classList.toggle('hidden', login); document.body.classList.toggle('in-app', !login);
        if (id === 'dashboard') applyTab(currentTab); else setActive(id === 'help' ? 'help' : id === 'changePwd' ? 'pwd' : null);
    };
})();


/* ---------- رسائل الإدارة الموجّهة لهذه الأسرة ---------- */
let portalMsgs = [];
function renderMsgs() {
    const b = $id('msgBox'); if (!b) return; b.innerHTML = '';
    const acts = {edit: ['✏️ تحديث بيانات الأسرة', () => openEditForm()], addChild: ['👶 إضافة طفل', () => switchView('addChild')], complaint: ['📝 تقديم طلب', () => switchView('addComplaint')]};
    portalMsgs.slice().sort((a, c) => (c.t || 0) - (a.t || 0)).forEach(m => {
        const d = document.createElement('div'); d.className = 'msg-card';
        const h = document.createElement('div'); h.className = 'msg-h'; h.textContent = '📩 رسالة من الإدارة';
        const p = document.createElement('p'); p.textContent = m.tx || '';
        const foot = document.createElement('div'); foot.className = 'msg-foot';
        const dt = document.createElement('small'); dt.textContent = m.t ? new Date(m.t).toLocaleDateString('en-GB') : ''; foot.appendChild(dt);
        if (acts[m.act]) { const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'btn-primary'; bt.textContent = acts[m.act][0]; bt.onclick = acts[m.act][1]; foot.appendChild(bt); }
        d.appendChild(h); d.appendChild(p); d.appendChild(foot); b.appendChild(d);
    });
    document.querySelectorAll('#appShell .nv[data-k="home"] .ic').forEach(e => e.classList.toggle('has-dot', portalMsgs.length > 0));
    if (portalMsgs.length && !window.__msgToast) { window.__msgToast = 1; notify('📩 لديك رسالة من الإدارة في الصفحة الرئيسية'); }
}
(function () { const mb = document.createElement('div'); mb.id = 'msgBox'; mb.dataset.tab = 'home'; $id('noticeBox').insertAdjacentElement('beforebegin', mb); })();


function openAccountRecovery() {
    if (!window.CAMP_RECOVERY_URL) {
        notify('⚠ خدمة التفعيل لسه مش مربوطة. تواصل مع الإدارة.');
        return;
    }
    location.assign(window.CAMP_RECOVERY_URL);
}