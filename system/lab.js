// ==== التحقق من تسجيل الدخول ====
if (!localStorage.getItem('teba_tenant_id')) {
    window.location.href = 'home.html';
}

document.addEventListener("DOMContentLoaded", function() {
    if (typeof TEBA_CONFIG !== 'undefined') {
        document.title = "المعمل الذكي | " + TEBA_CONFIG.lab.name;
        const brandInfo = document.getElementById('brandInfo');
        if(brandInfo) brandInfo.innerText = "🔬 المعمل - " + TEBA_CONFIG.lab.name;
    }
});

// ==== تهيئة السحابة ====
const supabaseUrl = TEBA_CONFIG.supabase.url;
const supabaseKey = TEBA_CONFIG.supabase.key;
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// ==== تهيئة الداتابيز المحلية (متوافقة مع reception) ====
const db = new Dexie('TebaLabOfflineDB');
db.version(4).stores({
    patients: 'id, name, phone',
    visits: 'visit_id, patient_id, branch_id, is_published, hidden_in_lab, server_id',
    visit_tests: 'id, visit_id, test_code',
    test_results: 'id, visit_test_id',
    catalog: 'code, name, price, category',
    outbox: '++id, table_name, action, payload, timestamp'
});

let allVisits = [], visitTests = [], testsCatalog = [], testResults = [];
let selectedVisitId = null;
let currentLabBranch = localStorage.getItem('teba_current_branch') || '1'; 
let isSyncing = false; 

// 🔥 مخزن مؤقت لحفظ الرينجات المخصصة اللي الدكتور بيعدلها
window.customRanges = {}; 

function changeLabBranch(val) {
    const role = localStorage.getItem('teba_user_role');
    if (role !== 'admin') {
        // الموظف مش مسموح يغير الفرع
        document.getElementById('labBranch').value = currentLabBranch;
        return showToast('🔒 لا تملك صلاحية تغيير الفرع', true);
    }

    currentLabBranch = val;
    localStorage.setItem('teba_current_branch', val);
    selectedVisitId = null;
    document.getElementById('singleTestsContainer').innerHTML = '<div class="empty-msg">اختر مريضاً</div>';
    document.getElementById('profileTestsContainer').innerHTML = '<div class="empty-msg">اختر مريضاً</div>';
    document.getElementById('btnDownloadPdf').style.display = 'none';
    document.getElementById('btnPublishVisit').style.display = 'none';
    loadData();
}

// ==========================================
// ⚙️ محرك المزامنة (Outbox) - النسخة الصادقة
// ==========================================
async function addToOutbox(table_name, action, payload) {
    try {
        await db.outbox.add({ table_name, action, payload, timestamp: new Date().toISOString() });
        document.getElementById('syncBtn').style.display = 'flex';
    } catch(e) { console.error("Outbox Add Error", e); }
}

async function processOutbox() {
    if (!navigator.onLine) return showToast('لا يوجد اتصال بالإنترنت!', true);
    if (isSyncing) return; 
    
    isSyncing = true;
    try {
        const pending = await db.outbox.toArray();
        if (pending.length === 0) {
            document.getElementById('syncBtn').style.display = 'none';
            isSyncing = false;
            return showToast('✅ لا توجد بيانات معلقة.');
        }

        const btn = document.getElementById('syncBtn');
        btn.innerText = '⏳ جاري المزامنة...';
        let successCount = 0;
        let failCount = 0;

        for (let item of pending) {
            try {
                if (item.table_name === 'test_results') {
                    const { error } = await _supabase.from('test_results').upsert({
                        tenant_id: TEBA_CONFIG.tenant.id,
                        visit_test_id: item.payload.visit_test_id, 
                        results_data: item.payload.results_data
                    }, { onConflict: 'visit_test_id' });
                    if (error) throw error;
                }
                else if (item.table_name === 'visit_tests') {
                    if (item.action === 'INSERT') {
                        const { data, error } = await _supabase.from('visit_tests').insert([item.payload]).select();
                        if (error) throw error;
                        if(data && data.length > 0) {
                            const oldId = item.payload.id;
                            const newId = data[0].id;
                            await db.visit_tests.update(oldId, { id: newId });
                            
                            const localResult = await db.test_results.where('visit_test_id').equals(oldId).first();
                            if(localResult) {
                                await db.test_results.update(localResult.id, { visit_test_id: newId });
                            }
                            const pendingResults = await db.outbox.where('table_name', 'test_results').toArray();
                            for(let res of pendingResults) {
                                if(res.payload.visit_test_id == oldId) {
                                    res.payload.visit_test_id = newId;
                                    await db.outbox.put(res);
                                }
                            }
                        }
                    } else if (item.action === 'DELETE') {
                        await _supabase.from('visit_tests').delete().eq('id', item.payload.id);
                        await _supabase.from('test_results').delete().eq('visit_test_id', item.payload.id);
                    }
                }
                else if (item.table_name === 'patients' && item.action === 'UPDATE') {
                    await _supabase.from('patients').update(item.payload).eq('id', item.payload.id).eq('tenant_id', TEBA_CONFIG.tenant.id);
                }
                else if (item.table_name === 'visits') {
                    if(item.action === 'UPDATE') {
                        // 🔥 استخدام server_id لو موجود، وإلا نستخدم الـ visit_id العادي
                        const localVisit = await db.visits.get(Number(item.payload.visit_id));
                        const targetId = localVisit && localVisit.server_id ? localVisit.server_id : item.payload.visit_id;
                        
                        // شيلنا published_at عشان السحابة تقبل التحديث
                        const updateData = { ...item.payload };
                        delete updateData.visit_id;
                        delete updateData.published_at;

                        const { error } = await _supabase.from('visits').update(updateData).eq('visit_id', targetId).eq('tenant_id', TEBA_CONFIG.tenant.id);
                        if (error) throw error;
                    } else if (item.action === 'DELETE') {
                        const localVisit = await db.visits.get(Number(item.payload.visit_id));
                        const targetId = localVisit && localVisit.server_id ? localVisit.server_id : item.payload.visit_id;

                        const { data: vt } = await _supabase.from('visit_tests').select('id').eq('visit_id', targetId);
                        if(vt && vt.length > 0) { await _supabase.from('test_results').delete().in('visit_test_id', vt.map(x => x.id)); }
                        await _supabase.from('visit_tests').delete().eq('visit_id', targetId);
                        await _supabase.from('visits').delete().eq('visit_id', targetId).eq('tenant_id', TEBA_CONFIG.tenant.id);
                    }
                }

                await db.outbox.delete(item.id);
                successCount++;
            } catch (e) { 
                console.error("Outbox item sync failed:", item, e); 
                failCount++;
            }
        }

        if (successCount > 0 && failCount === 0) showToast(`✅ تمت مزامنة ${successCount} عملية بنجاح!`);
        else if (successCount > 0 && failCount > 0) showToast(`⚠️ نجح ${successCount} وفشل ${failCount}.`, true);
        else if (failCount > 0) showToast(`❌ فشل مزامنة ${failCount} عملية.`, true);
        
        const remaining = await db.outbox.count();
        if (remaining === 0) btn.style.display = 'none';
        else btn.innerText = '🔄 مزامنة البيانات';
        
        await loadData(); 
    } catch(e) {
        console.error("Outbox error:", e);
        document.getElementById('syncBtn').innerText = '🔄 مزامنة البيانات';
    } finally {
        isSyncing = false; 
    }
}

window.addEventListener('online', () => { processOutbox(); });
window.addEventListener('offline', () => { showToast('⚠️ انقطع الاتصال. تم تفعيل وضع الأوفلاين.', true); });

// ==========================================
// 🔔 التنبيهات الصوتية والإشعارات
// ==========================================
const bc = new BroadcastChannel('teba_sync');
bc.onmessage = (event) => {
    if (event.data && event.data.type === 'new_order') {
        if (String(event.data.branch_id) === String(currentLabBranch)) {
            const audio = document.getElementById('notifSound');
            if (audio) { audio.play().catch(e => console.warn("المتصفح منع تشغيل الصوت", e)); }
            showToast('🔔 وصل طلب جديد من الاستقبال!', false);
            loadData();
        }
    }
};

function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.innerText = msg; 
    t.className = isError ? 'error' : '';
    t.style.display = 'block';
    setTimeout(() => { t.style.display = 'none'; }, 4000);
}

// ==========================================
// 📥 جلب البيانات
// ==========================================
async function loadData() {
    try {
        if (navigator.onLine) {
            // 1. جلب الكتالوج
            const { data: catalog } = await _supabase.from('tests_catalog').select('*').eq('tenant_id', TEBA_CONFIG.tenant.id);
            if (catalog) {
                if (catalog.length === 0) {
                    await db.catalog.clear();
                } else {
                    await db.catalog.clear();
                    await db.catalog.bulkPut(catalog.map(t => ({ id: t.id, code: t.code, name: t.name, price: t.price, category: t.category || 'أخرى', parameters: t.parameters, test_type: t.test_type, unit: t.unit })));
                }
            }

            // 2. جلب الزيارات
            const { data: visits } = await _supabase.from('visits')
                .select('*')
                .eq('tenant_id', TEBA_CONFIG.tenant.id)
                .eq('branch_id', currentLabBranch) 
                .order('visit_id', { ascending: false })
                .limit(100);
            
            if (visits && visits.length > 0) {
                for (let v of visits) {
                    const localV = await db.visits.get(Number(v.visit_id));
                    // الحفاظ على الخصائص المحلية (زي hidden_in_lab)
                    if (localV && localV.hidden_in_lab === true) { v.hidden_in_lab = true; }
                    // 🔥 ربط السحابي بالمحلي
                    v.server_id = v.visit_id; 
                }

                const visitIds = visits.map(v => v.visit_id);
                const patientIds = [...new Set(visits.map(v => v.patient_id))];
                
                const { data: patients } = await _supabase.from('patients').select('*').in('id', patientIds);
                const { data: vt } = await _supabase.from('visit_tests').select('*').in('visit_id', visitIds);
                const vtIds = vt ? vt.map(v => v.id) : [];
                
                let results = [];
                if (vtIds.length > 0) {
                    const { data: res } = await _supabase.from('test_results').select('*').in('visit_test_id', vtIds);
                    results = res || [];
                }
                
                try { if (patients) await db.patients.bulkPut(patients); } catch(e) {}
                try { if (visits) await db.visits.bulkPut(visits); } catch(e) {}
                try { if (vt) await db.visit_tests.bulkPut(vt); } catch(e) {}
                try { if (results) await db.test_results.bulkPut(results); } catch(e) {}
            }
        }

        testsCatalog = await db.catalog.toArray();
        
        const allLocalVisits = await db.visits.toArray();
        let localVisits = allLocalVisits.filter(v => String(v.branch_id) === String(currentLabBranch) && v.hidden_in_lab !== true);
        localVisits.sort((a, b) => Number(b.visit_id) - Number(a.visit_id));
        localVisits = localVisits.slice(0, 100);

        allVisits = [];
        for (let v of localVisits) {
            const p = await db.patients.get(v.patient_id) || { name: 'غير معروف', age: 0, age_type: 'Years', gender: 'male', doctor_name: '-' };
            allVisits.push({ ...v, patient: p });
        }

        visitTests = await db.visit_tests.toArray();
        testResults = await db.test_results.toArray();

        renderPatients();
        populateSelectors(); 
        checkSyncStatus();

        const urlParams = new URLSearchParams(window.location.search);
        const urlVisitId = urlParams.get('visit_id');
        if (urlVisitId && allVisits.find(v => v.visit_id == urlVisitId)) { selectPatient(urlVisitId); }

    } catch(e) {
        console.error("Load Data Error:", e);
    }
}

async function checkSyncStatus() {
    const pending = await db.outbox.count();
    if(pending > 0) document.getElementById('syncBtn').style.display = 'flex';
    else document.getElementById('syncBtn').style.display = 'none';
}

setInterval(() => {
    if (navigator.onLine && !isSyncing) {
        processOutbox();
    }
}, 60000);// ==========================================
// 🖥️ واجهة المستخدم
// ==========================================
function renderPatients() {
    const list = document.getElementById('patientList');
    if (allVisits.length === 0) return list.innerHTML = '<div class="empty-msg">لا توجد زيارات لهذا الفرع</div>';
    
    list.innerHTML = allVisits.map(v => {
        let ageStr = v.patient.age + ' سنة';
        if(v.patient.age_type === 'Months') ageStr = v.patient.age + ' شهر';
        if(v.patient.age_type === 'Days') ageStr = v.patient.age + ' يوم';
        const pubBadge = v.is_published ? `<span class="badge-published">تم النشر</span>` : '';
        const paddedId = String(v.visit_id).padStart(4, '0');
        
        return `
        <div class="patient-card ${String(v.visit_id) === String(selectedVisitId) ? 'active' : ''}" onclick="selectPatient('${v.visit_id}')">
            ${pubBadge}
            <div class="p-name">${v.patient.name}</div>
            <div class="p-meta"><span>زيارة #${paddedId}</span><span>${v.patient.gender === 'male' ? 'ذكر' : 'أنثى'} • ${ageStr}</span></div>
            <div class="card-actions">
                <button class="btn-card-action btn-card-edit" onclick="event.stopPropagation(); openEditPatientModal('${v.visit_id}')">✏️ تعديل</button>
                <button class="btn-card-action btn-card-del" onclick="event.stopPropagation(); hideFromLabQueue('${v.visit_id}')">🗑️ إخفاء</button>
            </div>
        </div>
    `}).join('');
}

// ✅ دالة الإخفاء (تختفي من الشاشة فوراً وتبعت للسحابة)
async function hideFromLabQueue(visitId) {
    if(!confirm('هل أنت متأكد من إخفاء هذه الحالة من طابور المعمل؟ (لن تُحذف نهائياً من النظام)')) return;
    try {
        const v = await db.visits.get(Number(visitId));
        if (v) {
            v.hidden_in_lab = true;
            await db.visits.put(v);
            
            // بنبعت الـ visit_id المحلي، والمزامنة هتعرف تجيب الـ server_id
            await addToOutbox('visits', 'UPDATE', { visit_id: parseInt(visitId), hidden_in_lab: true });
            
            allVisits = allVisits.filter(visit => String(visit.visit_id) !== String(visitId));
            renderPatients();
            
            if (String(selectedVisitId) === String(visitId)) { 
                selectedVisitId = null; 
                document.getElementById('singleTestsContainer').innerHTML = '<div class="empty-msg">اختر مريضاً</div>';
                document.getElementById('profileTestsContainer').innerHTML = '<div class="empty-msg">اختر مريضاً</div>';
                document.getElementById('btnPublishVisit').style.display = 'none';
                document.getElementById('btnDownloadPdf').style.display = 'none';
            }
            showToast('🙈 تم إخفاء الحالة من الطابور');
            if (navigator.onLine) processOutbox();
        }
    } catch (e) {
        console.error("Error hiding visit:", e);
        showToast('❌ حدث خطأ أثناء الإخفاء', true);
    }
}

// ✅ دالة النشر (بتحدث الحالة وتبعت للسحابة)
async function publishVisit() {
    if (!selectedVisitId) return;
    try {
        const visit = await db.visits.get(Number(selectedVisitId));
        if (visit) {
            visit.is_published = true;
            await db.visits.put(visit);
            
            // شيلنا published_at عشان السحابة تقبل
            const payload = { visit_id: parseInt(selectedVisitId), is_published: true };
            await addToOutbox('visits', 'UPDATE', payload);
            
            showToast('✅ جاري النشر...', false);
            if (navigator.onLine) processOutbox();
            
            selectPatient(selectedVisitId); // تحديث الشاشة عشان يظهر بادج "تم النشر"
        }
    } catch(e) { 
        console.error("Publish Error:", e);
        showToast('❌ حدث خطأ أثناء النشر', true); 
    }
}

// ==========================================
// 📝 المودالات وتسجيل النتائج (مع إصلاح تعديل الرينج)
// ==========================================
function openSingleResultModal(vtId, testCode){
    const catalogItem = testsCatalog.find(c => c.code === testCode) || { name: testCode, code: testCode, parameters: [] };
    const result = testResults.find(r => String(r.visit_test_id) === String(vtId));
    const savedData = result ? result.results_data : {};
    
    const val = savedData['result']?.value || '';
    const p = getSmartParams(catalogItem)[0] || {};
    const unit = p.unit || catalogItem.unit || '-';
    const visit = allVisits.find(v => String(v.visit_id) === String(selectedVisitId));
    const patient = visit ? visit.patient : { age: 0, age_type: 'Years', gender: 'male' };
    
    const range = getSmartRange(p, patient, null, savedData);

    document.getElementById('singleModalTitle').innerText = `🧪 تسجيل نتيجة: ${catalogItem.name}`;
    const area = document.getElementById('singleResultArea');
    
    area.innerHTML = `
        <div class="test-item">
            <div class="test-body">
                <div class="input-group">
                    <label>
                        <span>النتيجة</span>
                        <span class="range-info" id="range_container_${vtId}_result">
                            <span id="range_text_${vtId}_result">${range}</span> ${unit}
                            <button type="button" class="btn-edit-range" onclick="enableRangeEdit('${vtId}', 'result', true)" title="تعديل الرينج لهذه الحالة" style="background:none; border:none; cursor:pointer;">✏️</button>
                        </span>
                    </label>
                    <input type="text" id="res_${vtId}_simple" value="${val}" placeholder="أدخل النتيجة هنا..." style="font-size: 1.5rem; padding: 15px;" onkeydown="handleEnter(event, this, '${vtId}', false)">
                </div>
            </div>
        </div>
    `;

    const btn = document.getElementById('btnSaveSingleResult');
    btn.onclick = () => saveSingleResult(vtId);
    
    document.getElementById('singleResultModal').style.display = 'flex';
    setTimeout(() => { const i = area.querySelector('input'); if(i) i.focus(); }, 100);
}

// ✅ إصلاح جوهري: تفعيل زرار تعديل الرينج وحفظ القيمة
window.enableRangeEdit = function(vtId, paramName, isSingle = false) {
    const container = document.getElementById(`range_container_${vtId}_${paramName}`);
    const currentRange = document.getElementById(`range_text_${vtId}_${paramName}`).innerText;
    
    container.innerHTML = `<input type="text" id="custom_range_${vtId}_${paramName}" class="range-input-custom" value="${currentRange}" placeholder="Range" style="width:100px; padding:2px; font-size:12px; border:1px solid var(--primary); border-radius:4px;">`;
    
    const input = document.getElementById(`custom_range_${vtId}_${paramName}`);
    input.focus();
    input.select();
    
    input.onblur = function() {
        if (this.value.trim() === '') return; 
        // 🔥 حفظ القيمة في المخزن المؤقت عشان متضيعش
        window.customRanges[`${vtId}_${paramName}`] = this.value.trim();
        container.innerHTML = `<span id="range_text_${vtId}_${paramName}">${this.value}</span> <button type="button" class="btn-edit-range" onclick="enableRangeEdit('${vtId}', '${paramName}', ${isSingle})" title="تعديل الرينج" style="background:none; border:none; cursor:pointer;">✏️</button>`;
    };
    input.onkeydown = function(e) { if(e.key === 'Enter') this.blur(); };
}

function openProfileResultModal(vtId, testCode) {
    const catalogItem = testsCatalog.find(c => c.code === testCode) || { name: testCode, code: testCode, parameters: [] };
    const params = getSmartParams(catalogItem);
    const result = testResults.find(r => String(r.visit_test_id) === String(vtId));
    const savedData = result ? result.results_data : {};
    
    const visit = allVisits.find(v => String(v.visit_id) === String(selectedVisitId));
    const patient = visit ? visit.patient : { age: 0, age_type: 'Years', gender: 'male' };

    document.getElementById('profileModalTitle').innerText = `🧬 تسجيل نتائج: ${catalogItem.name}`;
    const area = document.getElementById('profileResultsArea');
    
    let inputsHtml = '';
    params.forEach(param => {
        const val = savedData[param.name]?.value || '';
        const unit = param.unit || param.units || '';
        const range = getSmartRange(param, patient, savedData[param.name]?.phase || null, savedData);
        const isCalc = param.is_calc === true || param.is_calculated === true;
        const readonly = isCalc ? 'readonly' : '';
        const calcClass = isCalc ? 'input-calc' : '';
        const phaseSelectorHtml = renderPhaseSelector(vtId, param, patient, savedData);
        
        let inputElement = `<input type="text" inputmode="decimal" class="${calcClass}" id="res_${vtId}_${param.name}" value="${val}" placeholder="..." ${readonly} oninput="triggerCalc('${vtId}', '${testCode}')" onkeydown="handleEnter(event, this, '${vtId}', true); handleArrowKeys(event, this)">`;
        
        if (param.type === 'dropdown' && param.options && Array.isArray(param.options)) {
            let opts = `<option value="">-- اختر --</option>` + param.options.map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('');
            inputElement = `<select class="${calcClass}" id="res_${vtId}_${param.name}" onchange="triggerCalc('${vtId}', '${testCode}')" onkeydown="handleArrowKeys(event, this)">${opts}</select>`;
        }

        inputsHtml += `
            <div class="input-group">
                ${phaseSelectorHtml}
                <label>
                    <span>${param.label || param.name}</span>
                    <span class="range-info" id="range_container_${vtId}_${param.name}">
                        <span id="range_text_${vtId}_${param.name}">${range}</span> ${unit}
                        <button type="button" class="btn-edit-range" onclick="enableRangeEdit('${vtId}', '${param.name}', false)" title="تعديل الرينج لهذه الحالة" style="background:none; border:none; cursor:pointer;">✏️</button>
                    </span>
                </label>
                ${inputElement}
            </div>
        `;
    });

    area.innerHTML = `<div class="test-item"><div class="test-body">${inputsHtml}</div></div>`;
    
    const btn = document.getElementById('btnSaveProfileResult');
    btn.onclick = () => saveProfileResult(vtId, testCode);
    
    document.getElementById('profileResultModal').style.display = 'flex';
    setTimeout(() => { const i = area.querySelector('input:not([readonly]), select'); if(i) i.focus(); }, 100);
}

function openResultModal(vtId, isProfile, testCode) {
    if (isProfile) openProfileResultModal(vtId, testCode);
    else openSingleResultModal(vtId, testCode);
}

// ==========================================
// ⌨️ تحسين الـ UX للكيبورد (Enter والأسهم)
// ==========================================
function handleEnter(e, el, vtId, isProfile) {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (!isProfile) {
            const saveBtn = document.getElementById('btnSaveSingleResult');
            if (saveBtn) saveBtn.click();
        } else {
            let form = el.closest('.modal-body');
            if (!form) return;
            let inputs = Array.from(form.querySelectorAll('input:not([readonly]), select'));
            let index = inputs.indexOf(el);
            if (index > -1 && index < inputs.length - 1) { inputs[index + 1].focus(); } 
            else { const saveBtn = form.parentElement.querySelector('.btn-save-test'); if (saveBtn) saveBtn.focus(); }
        }
    }
}

function handleArrowKeys(e, el) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        let form = el.closest('.modal-body');
        if (!form) return;
        let inputs = Array.from(form.querySelectorAll('input:not([readonly]), select'));
        let index = inputs.indexOf(el);
        
        if (e.key === 'ArrowDown' && index < inputs.length - 1) { inputs[index + 1].focus(); } 
        else if (e.key === 'ArrowUp' && index > 0) { inputs[index - 1].focus(); }
    }
}

// ==========================================
// 💾 حفظ النتائج (مع حفظ الرينج المخصص)
// ==========================================
async function saveSingleResult(vtId) {
    const input = document.getElementById(`res_${vtId}_simple`);
    if (!input || input.value.trim() === '') return showToast('⚠️ أدخل النتيجة أولاً', true);
    
    let resultsData = { 'result': { value: input.value.trim() } };
    const customRange = window.customRanges[`${vtId}_result`];
    if (customRange) {
        resultsData['result'].customRange = customRange;
    }
    
    await saveResultToCloud(vtId, resultsData);
    document.getElementById('singleResultModal').style.display = 'none';
    renderOrderedTests();
}

async function saveProfileResult(vtId, testCode) {
    const catalogItem = testsCatalog.find(c => c.code === testCode);
    const params = getSmartParams(catalogItem);
    
    triggerCalc(vtId, testCode);

    let resultsData = {};
    params.forEach(param => {
        const input = document.getElementById(`res_${vtId}_${param.name}`);
        const phaseSelect = document.getElementById(`phase_${vtId}_${param.name}`);
        
        if (input && input.value.trim() !== '') {
            resultsData[param.name] = { value: input.value.trim() };
            if (phaseSelect) resultsData[param.name].phase = phaseSelect.value;
            
            const customRange = window.customRanges[`${vtId}_${param.name}`];
            if (customRange) {
                resultsData[param.name].customRange = customRange;
            }
        }
    });

    if (Object.keys(resultsData).length === 0) return showToast('⚠️ لم يتم إدخال أي نتائج', true);

    await saveResultToCloud(vtId, resultsData);
    document.getElementById('profileResultModal').style.display = 'none';
    renderOrderedTests();
}

async function saveResultToCloud(visitTestId, resultsData) {
    try {
        const vt = visitTests.find(v => String(v.id) === String(visitTestId));
        const payload = {
            tenant_id: TEBA_CONFIG.tenant.id, 
            visit_test_id: vt.id, 
            results_data: resultsData
        };

        let existing = await db.test_results.where('visit_test_id').equals(vt.id).first();
        if(existing) {
            await db.test_results.update(existing.id, { results_data: resultsData });
        } else {
            await db.test_results.put({ id: String(Date.now()), visit_test_id: vt.id, results_data: resultsData });
        }

        await addToOutbox('test_results', 'UPSERT', payload);
        showToast('✅ تم الحفظ محلياً!');
        
        const existingIndex = testResults.findIndex(r => String(r.visit_test_id) === String(visitTestId));
        if (existingIndex > -1) testResults[existingIndex].results_data = resultsData;
        else testResults.push({ visit_test_id: visitTestId, results_data: resultsData });
        
        if (navigator.onLine) processOutbox();
    } catch (e) {
        showToast('❌ حدث خطأ أثناء الحفظ', true);
        console.error(e);
    }
}

// ==========================================
// 🧮 الحسابات
// ==========================================
function triggerCalc(visitTestId, testCode) {
    const catalogItem = testsCatalog.find(c => c.code === testCode);
    if (!catalogItem) return;
    const params = getSmartParams(catalogItem);
    let vals = {};
    params.forEach(p => {
        const input = document.getElementById(`res_${visitTestId}_${p.name}`);
        if (input && input.value.trim() !== '') {
            let parsed = parseFloat(input.value);
            if (!isNaN(parsed)) vals[p.name] = parsed;
        }
    });
    
    let hba1c = vals['HbA1c'] || vals['HbA1C'] || vals['HBA1C'];
    if (hba1c !== undefined) {
        let eagInput = document.getElementById(`res_${visitTestId}_eAG`);
        if (eagInput) { let eagVal = (28.7 * hba1c) - 46.7; eagInput.value = eagVal.toFixed(1); vals['eAG'] = eagVal; }
    }
    params.forEach(p => {
        if (p.name.toLowerCase() === 'eag') return;
        let calcVal = null; let formula = p.formula;
        if (formula) {
            try {
                let evalStr = formula; let hasAllVars = true;
                let vars = formula.match(/[a-zA-Z_]+/g) || [];
                vars = vars.filter(v => v !== 'Math' && v !== 'min' && v !== 'max');
                for (let v of vars) {
                    let valToUse = undefined;
                    for (let key in vals) { if (key.toLowerCase() === v.toLowerCase()) { valToUse = vals[key]; break; } }
                    if (valToUse === undefined) { hasAllVars = false; break; }
                    evalStr = evalStr.replace(new RegExp('\\b' + v + '\\b', 'g'), valToUse);
                }
                if (hasAllVars) calcVal = Function('"use strict";return (' + evalStr + ')')();
            } catch(e) {}
        }
        if (calcVal !== null && isFinite(calcVal) && calcVal >= 0) {
            const input = document.getElementById(`res_${visitTestId}_${p.name}`);
            if (input) input.value = parseFloat(calcVal.toFixed(1));
        }
    });
}

// ==========================================
// ✏️ التعديل والحذف
// ==========================================
function openEditPatientModal(visitId) {
    const v = allVisits.find(x => String(x.visit_id) === String(visitId));
    if(!v || !v.patient) return;
    document.getElementById('editVisitId').value = v.visit_id;
    document.getElementById('editVisitIdDisplay').value = String(v.visit_id).padStart(4, '0');
    document.getElementById('editPatientId').value = v.patient.id;
    document.getElementById('editPName').value = v.patient.name;
    document.getElementById('editPPhone').value = v.patient.phone || '';
    document.getElementById('editPDoctor').value = v.patient.doctor_name || '';
    document.getElementById('editPAge').value = v.patient.age || 30;
    document.getElementById('editPAgeType').value = v.patient.age_type || 'Years';
    document.getElementById('editPGender').value = v.patient.gender || 'male';
    document.getElementById('editPBranch').value = v.branch_id || 1;
    document.getElementById('editPatientModal').style.display = 'flex';
}

async function savePatientEdit() {
    const pId = document.getElementById('editPatientId').value;
    const vId = document.getElementById('editVisitId').value;
    const name = document.getElementById('editPName').value.trim();
    const phone = document.getElementById('editPPhone').value.trim();
    const doctor = document.getElementById('editPDoctor').value.trim();
    const age = parseInt(document.getElementById('editPAge').value) || 0;
    const ageType = document.getElementById('editPAgeType').value;
    const gender = document.getElementById('editPGender').value;
    const branchId = parseInt(document.getElementById('editPBranch').value);

    if(!name) return showToast('⚠️ اسم المريض مطلوب', true);
    const btn = document.querySelector('#editPatientModal .btn-save-test');
    btn.innerText = '⏳ جاري الحفظ...'; btn.disabled = true;

    try {
        const pPayload = { id: pId, name, phone, doctor_name: doctor, age, age_type: ageType, gender };
        await db.patients.update(pId, pPayload);
        await addToOutbox('patients', 'UPDATE', pPayload);

        const vPayload = { visit_id: parseInt(vId), branch_id: branchId };
        await db.visits.update(parseInt(vId), { branch_id: branchId });
        await addToOutbox('visits', 'UPDATE', vPayload);

        showToast('✅ تم تعديل البيانات محلياً');
        document.getElementById('editPatientModal').style.display = 'none';
        
        if (navigator.onLine) processOutbox();
        await loadData(); 
        if (String(selectedVisitId) === String(vId)) selectPatient(vId);
    } catch(e) {
        showToast('❌ حدث خطأ: ' + e.message, true);
    } finally {
        btn.innerText = '💾 حفظ التعديلات'; btn.disabled = false;
    }
}

// ==========================================
// 🔬 عرض وإضافة التحاليل
// ==========================================
function populateSelectors() {
    const singleSelect = document.getElementById('singleTestSelect');
    const profileSelect = document.getElementById('profileTestSelect');
    
    const singles = testsCatalog.filter(t => !isProfileTest(t)).sort((a,b) => a.name.localeCompare(b.name));
    const profiles = testsCatalog.filter(t => isProfileTest(t)).sort((a,b) => a.name.localeCompare(b.name));

    singleSelect.innerHTML = `<option value="">-- اختر تحليلاً لإضافته للطلب --</option>` + 
        singles.map(t => `<option value="${t.code}">${t.name} (${t.code})</option>`).join('');
        
    profileSelect.innerHTML = `<option value="">-- اختر بروفايل لإضافته للطلب --</option>` + 
        profiles.map(t => `<option value="${t.code}">${t.name} (${t.code})</option>`).join('');

    singleSelect.onchange = () => { if(singleSelect.value) addTestFromSelect('single'); };
    profileSelect.onchange = () => { if(profileSelect.value) addTestFromSelect('profile'); };
}

function isProfileTest(catalogItem) {
    if (!catalogItem) return false;
    if (catalogItem.test_type === 'Profile') return true;
    let params = catalogItem.parameters;
    if (typeof params === 'string') {
        try { params = JSON.parse(params); } catch(e) { params = []; }
    }
    if (!Array.isArray(params)) params = [];
    return params.length > 1 || (params.length === 1 && params[0].name !== 'Result');
}

function getSmartParams(catalogItem) {
    let params = catalogItem.parameters;
    if (typeof params === 'string') {
        try { params = JSON.parse(params); } catch(e) { params = []; }
    }
    if (!Array.isArray(params)) params = [];
    else params = JSON.parse(JSON.stringify(params)); 

    const isLipid = (catalogItem.name && catalogItem.name.toUpperCase().includes('LIPID')) || catalogItem.code === '109';
    if (isLipid) {
        params = params.filter(p => !p.name.toLowerCase().includes('ldl'));
        params.push({ name: 'LDL', label: 'LDL (Calc)', unit: 'mg/dL', ref_male: '< 130', ref_female: '< 130', is_calc: true, formula: "CHO - HDL - (TRIG / 5)" });
    }
    return params;
}

function renderOrderedTests() {
    const singleContainer = document.getElementById('singleTestsContainer');
    const profileContainer = document.getElementById('profileTestsContainer');

    if (!selectedVisitId) {
        singleContainer.innerHTML = '<div class="empty-msg">اختر مريضاً</div>';
        profileContainer.innerHTML = '<div class="empty-msg">اختر مريضاً</div>';
        return;
    }

    const vTests = visitTests.filter(vt => String(vt.visit_id) === String(selectedVisitId));
    
    if (vTests.length === 0) {
        singleContainer.innerHTML = '<div class="empty-msg">لا توجد تحاليل مطلوبة</div>';
        profileContainer.innerHTML = '<div class="empty-msg">لا توجد تحاليل مطلوبة</div>';
        return;
    }

    let singlesHtml = '';
    let profilesHtml = '';

    vTests.forEach(vt => {
        const catalogItem = testsCatalog.find(c => c.code === vt.test_code) || { name: vt.test_code, code: vt.test_code, parameters: [] };
        const isProfile = isProfileTest(catalogItem);
        const result = testResults.find(r => String(r.visit_test_id) === String(vt.id));
        const hasResult = result && result.results_data && Object.keys(result.results_data).length > 0;
        
        const btnClass = hasResult ? 'btn-result done' : 'btn-result';
        const btnText = hasResult ? '👁️ عرض/تعديل' : '▶ Result';

        const rowHtml = `
            <div class="ordered-test-row" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <span class="ordered-test-name">${catalogItem.name}</span>
                    <span class="ordered-test-code">(${catalogItem.code})</span>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <button class="${btnClass}" onclick="openResultModal('${vt.id}', ${isProfile}, '${vt.test_code}')">
                        ${btnText}
                    </button>
                    <button onclick="removeTestFromOrder('${vt.id}')" style="background:rgba(239,68,68,0.1); color:var(--danger); border:none; border-radius:8px; padding:8px 12px; cursor:pointer; font-size:1rem;" title="حذف التحليل من الطلب">🗑️</button>
                </div>
            </div>
        `;

        if (isProfile) profilesHtml += rowHtml;
        else singlesHtml += rowHtml;
    });

    singleContainer.innerHTML = singlesHtml || '<div class="empty-msg">لا توجد تحاليل فردية مطلوبة</div>';
    profileContainer.innerHTML = profilesHtml || '<div class="empty-msg">لا توجد بروفايلات مطلوبة</div>';
}

// 🔥 دالة حذف التحليل الغلط
async function removeTestFromOrder(vtId) {
    if (!confirm('هل أنت متأكد من حذف هذا التحليل من الطلب؟')) return;
    try {
        await db.visit_tests.delete(vtId);
        await db.test_results.where('visit_test_id').equals(vtId).delete();
        
        await addToOutbox('visit_tests', 'DELETE', { id: vtId });
        
        showToast('🗑️ تم حذف التحليل من الطلب');
        
        await loadData();
        if (navigator.onLine) processOutbox();
    } catch (e) {
        console.error("Error removing test:", e);
        showToast('❌ حدث خطأ أثناء حذف التحليل', true);
    }
}

async function addTestFromSelect(type) {
    if (!selectedVisitId) {
        showToast('⚠️ اختر مريضاً أولاً', true);
        document.getElementById(type === 'single' ? 'singleTestSelect' : 'profileTestSelect').value = '';
        return;
    }
    
    const selectEl = type === 'single' ? document.getElementById('singleTestSelect') : document.getElementById('profileTestSelect');
    const testCode = selectEl.value;
    if (!testCode) return;

    const exists = visitTests.find(v => String(v.visit_id) === String(selectedVisitId) && v.test_code === testCode);
    if (exists) {
        showToast('⚠️ هذا التحليل موجود بالفعل في الطلب', true);
        selectEl.value = '';
        return;
    }

    try {
        const newTestId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
        const payload = { 
            id: newTestId, 
            tenant_id: TEBA_CONFIG.tenant.id, 
            visit_id: selectedVisitId, 
            test_code: testCode, 
            price_at_time: 0
        };

        await db.visit_tests.put(payload);
        await addToOutbox('visit_tests', 'INSERT', payload);
        
        visitTests.push(payload);
        selectEl.value = '';
        showToast('✅ تم إضافة التحليل محلياً');
        renderOrderedTests(); 
        
        if (navigator.onLine) processOutbox();
    } catch (err) {
        showToast('❌ خطأ في الإضافة: ' + err.message, true);
        selectEl.value = '';
    }
}

function selectPatient(visitId) {
    selectedVisitId = visitId;
    renderPatients();
    renderOrderedTests(); 
    
    document.getElementById('btnDownloadPdf').style.display = 'block';
    const visitObj = allVisits.find(v => String(v.visit_id) === String(visitId));
    const btnPub = document.getElementById('btnPublishVisit');
    if(btnPub) {
        btnPub.style.display = 'block';
        btnPub.innerHTML = visitObj.is_published ? '🔄 تحديث النشر' : '🌐 نشر الزيارة';
    }
}

// ==========================================
// 🚀 التشغيل عند فتح الصفحة
// ==========================================
window.onload = async () => { 
    const role = localStorage.getItem('teba_user_role');
    if (role !== 'admin') {
        document.getElementById('labBranch').style.display = 'none'; // إخفاء اختيار الفرع للموظف
    }
    
    document.getElementById('labBranch').value = currentLabBranch;
    await loadData(); 
    checkSyncStatus();
};