﻿// ==== التحقق من تسجيل الدخول ====
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

// ==== تهيئة الداتابيز المحلية ====
const db = new Dexie('TebaLabOfflineDB');
db.version(3).stores({
    patients: 'id, name, phone',
    visits: 'visit_id, patient_id, branch_id, is_published',
    visit_tests: 'id, visit_id, test_code',
    test_results: 'id, visit_test_id',
    catalog: 'code, name, price, category',
    outbox: '++id, table_name, action, payload, timestamp'
});

let allVisits = [], visitTests = [], testsCatalog = [], testResults = [];
let selectedVisitId = null;
let currentLabBranch = localStorage.getItem('teba_current_branch') || '1'; // عزل الفروع

// ✅ دالة تغيير الفرع في المعمل
function changeLabBranch(val) {
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
// ⚙️ محرك المزامنة (Outbox) والأوفلاين
// ==========================================
async function addToOutbox(table_name, action, payload) {
    try {
        await db.outbox.add({ table_name, action, payload, timestamp: new Date().toISOString() });
        document.getElementById('syncBtn').style.display = 'flex';
    } catch(e) { console.error("Outbox Add Error", e); }
}

async function processOutbox() {
    if (!navigator.onLine) return showToast('لا يوجد اتصال بالإنترنت!', true);
    
    try {
        const pending = await db.outbox.toArray();
        if (pending.length === 0) {
            document.getElementById('syncBtn').style.display = 'none';
            return showToast('✅ لا توجد بيانات معلقة.');
        }

        const btn = document.getElementById('syncBtn');
        btn.innerText = '⏳ جاري المزامنة...';
        let successCount = 0;

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
                else if (item.table_name === 'visit_tests' && item.action === 'INSERT') {
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
                }
                else if (item.table_name === 'patients' && item.action === 'UPDATE') {
                    await _supabase.from('patients').update(item.payload).eq('id', item.payload.id).eq('tenant_id', TEBA_CONFIG.tenant.id);
                }
                else if (item.table_name === 'visits') {
                    if(item.action === 'UPDATE') {
                        await _supabase.from('visits').update(item.payload).eq('visit_id', item.payload.visit_id).eq('tenant_id', TEBA_CONFIG.tenant.id);
                    } else if (item.action === 'DELETE') {
                        const visitId = item.payload.visit_id;
                        const { data: vt } = await _supabase.from('visit_tests').select('id').eq('visit_id', visitId);
                        if(vt && vt.length > 0) { await _supabase.from('test_results').delete().in('visit_test_id', vt.map(x => x.id)); }
                        await _supabase.from('visit_tests').delete().eq('visit_id', visitId);
                        await _supabase.from('visits').delete().eq('visit_id', visitId).eq('tenant_id', TEBA_CONFIG.tenant.id);
                    }
                }

                await db.outbox.delete(item.id);
                successCount++;
            } catch (e) { console.error("Outbox item sync failed:", e); }
        }

        if (successCount > 0) showToast(`✅ تمت مزامنة ${successCount} عملية!`);
        
        const remaining = await db.outbox.count();
        if (remaining === 0) btn.style.display = 'none';
        else btn.innerText = '🔄 مزامنة البيانات';
        
        await loadData(); 
    } catch(e) {
        console.error("Outbox error:", e);
        document.getElementById('syncBtn').innerText = '🔄 مزامنة البيانات';
    }
}

window.addEventListener('online', () => { processOutbox(); });
window.addEventListener('offline', () => { showToast('⚠️ انقطع الاتصال. تم تفعيل وضع الأوفلاين.', true); });

// ==========================================
// 🔔 التنبيهات الصوتية والإشعارات (معزولة بالفرع)
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

// ✅ زرار الواتساب المباشر
function sendLabWhatsApp() {
    if (!selectedVisitId) return showToast('⚠️ اختر مريضاً أولاً', true);
    const visit = allVisits.find(v => String(v.visit_id) === String(selectedVisitId));
    if (!visit || !visit.patient) return showToast('⚠️ بيانات المريض غير متوفرة', true);
    
    const phone = visit.patient.phone;
    if (!phone) return showToast('⚠️ لا يوجد رقم تليفون مسجل لهذا المريض', true);
    
    const name = visit.patient.name;
    const visitId = visit.visit_id;
    const portalLink = TEBA_CONFIG.lab.portalUrl;
    
    const msg = `أهلاً ${name} 👋،\nنتيجة تحليلك جاهزة 🧪.\nيمكنك استلامها من خلال موقعنا عبر إدخال اسمك ورقم الزيارة (${visitId}):\n${portalLink}\n\nمعامل طيبة - د/ أحمد طه أبوندا`;
    
    window.open(`https://wa.me/2${phone.replace(/^0/, '')}?text=${encodeURIComponent(msg)}`, '_blank');
}

document.addEventListener("wheel", function(event){
    if(document.activeElement.type === "number" || document.activeElement.type === "text"){ document.activeElement.blur(); }
});

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    }
});

// ==========================================
// 🧠 دوال ذكية للرينجات (مع دعم الرينج المخصص)
// ==========================================
function getSmartRange(param, patient, selectedPhase = null, savedData = {}) {
    // ✅ الأولوية للرينج المخصص اللي إحنا حفظناه (للمريض ده بس)
    if (savedData && savedData[param.name] && savedData[param.name].customRange) {
        return savedData[param.name].customRange;
    }

    let ageInYears = parseFloat(patient.age) || 0;
    if (patient.age_type === 'Months') ageInYears = ageInYears / 12;
    if (patient.age_type === 'Days') ageInYears = ageInYears / 365;
    
    if (ageInYears <= 12 && param.ref_child) {
        let childRange = (typeof param.ref_child === 'object' && param.ref_child !== null) ? param.ref_child.range : param.ref_child;
        if (childRange && childRange !== '-' && childRange !== 'N/A') return childRange;
    }

    let rawRange = patient.gender === 'female' ? param.ref_female : param.ref_male;
    if (typeof rawRange === 'object' && rawRange !== null) { rawRange = rawRange.range; }
    
    if (!rawRange || rawRange === '-' || rawRange === 'N/A') rawRange = param.reference_range || '-';
    
    if (selectedPhase && typeof rawRange === 'string' && rawRange.includes(selectedPhase)) {
        let parts = rawRange.split('|').map(p => p.trim());
        let match = parts.find(p => p.toLowerCase().startsWith(selectedPhase.toLowerCase()));
        if (match) { return match.substring(match.indexOf(':') + 1).trim(); }
    }
    return rawRange;
}

function renderPhaseSelector(vtId, param, patient, savedData) {
    if (patient.gender !== 'female') return '';
    let rawRange = param.ref_female || '';
    if (typeof rawRange === 'object' && rawRange !== null) { rawRange = rawRange.range || ''; }
    if (typeof rawRange !== 'string') rawRange = '';

    const phases = ['Follicular', 'Midcycle', 'Ovulatory', 'Luteal', 'Pregnant', 'Postmenopausal', 'Prostate'];
    let availablePhases = phases.filter(p => rawRange.toLowerCase().includes(p.toLowerCase()));
    
    if (availablePhases.length > 0) {
        const savedPhase = savedData[param.name]?.phase || availablePhases[0];
        let opts = availablePhases.map(p => `<option value="${p}" ${savedPhase === p ? 'selected' : ''}>${p}</option>`).join('');
        return `<select class="phase-selector" id="phase_${vtId}_${param.name}" onchange="updateRangeUI('${vtId}', '${param.name}', '${param.ref_male}', '${rawRange}', ${patient.age}, '${patient.age_type}', '${patient.gender}')">${opts}</select>`;
    }
    return '';
}

window.updateRangeUI = function(vtId, paramName, refMale, refFemale, age, ageType, gender) {
    const phaseSelect = document.getElementById(`phase_${vtId}_${paramName}`);
    const selectedPhase = phaseSelect ? phaseSelect.value : null;
    const patient = { age: age, age_type: ageType, gender: gender };
    const param = { name: paramName, ref_male: refMale, ref_female: refFemale };
    const newRange = getSmartRange(param, patient, selectedPhase);
    const rangeLabel = document.getElementById(`range_text_${vtId}_${paramName}`);
    if (rangeLabel) rangeLabel.innerText = newRange;
};

// ==========================================
// 📥 جلب البيانات (أونلاين وأوفلاين) - معزول بالفرع
// ==========================================
async function loadData() {
    try {
        if (navigator.onLine) {
            const { data: catalog } = await _supabase.from('tests_catalog').select('*').eq('tenant_id', TEBA_CONFIG.tenant.id);
            if (catalog) {
                if (catalog.length === 0) {
                    await db.catalog.clear();
                } else {
                    await db.catalog.clear();
                    await db.catalog.bulkPut(catalog.map(t => ({ id: t.id, code: t.code, name: t.name, price: t.price, category: t.category || 'أخرى', parameters: t.parameters, test_type: t.test_type, unit: t.unit })));
                }
            }

            const { data: visits } = await _supabase.from('visits')
                .select('*')
                .eq('tenant_id', TEBA_CONFIG.tenant.id)
                .eq('branch_id', currentLabBranch) 
                .order('visit_id', { ascending: false })
                .limit(100);
            
            if (visits && visits.length > 0) {
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
        
        // ✅ التعديل: فلترة الحالات المخفية من طابور المعمل فقط (UI Filtering)
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
}// ==========================================
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
        
        return `
        <div class="patient-card ${String(v.visit_id) === String(selectedVisitId) ? 'active' : ''}" onclick="selectPatient('${v.visit_id}')">
            ${pubBadge}
            <div class="p-name">${v.patient.name}</div>
            <div class="p-meta"><span>زيارة #${v.visit_id}</span><span>${v.patient.gender === 'male' ? 'ذكر' : 'أنثى'} • ${ageStr}</span></div>
            <div class="card-actions">
                <button class="btn-card-action btn-card-edit" onclick="event.stopPropagation(); openEditPatientModal('${v.visit_id}')">✏️ تعديل</button>
                <button class="btn-card-action btn-card-del" onclick="event.stopPropagation(); hideFromLabQueue('${v.visit_id}')">🗑️ إخفاء</button>
            </div>
        </div>
    `}).join('');
}

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
            <div class="ordered-test-row">
                <div>
                    <span class="ordered-test-name">${catalogItem.name}</span>
                    <span class="ordered-test-code">(${catalogItem.code})</span>
                </div>
                <button class="${btnClass}" onclick="openResultModal('${vt.id}', ${isProfile}, '${vt.test_code}')">
                    ${btnText}
                </button>
            </div>
        `;

        if (isProfile) profilesHtml += rowHtml;
        else singlesHtml += rowHtml;
    });

    singleContainer.innerHTML = singlesHtml || '<div class="empty-msg">لا توجد تحاليل فردية مطلوبة</div>';
    profileContainer.innerHTML = profilesHtml || '<div class="empty-msg">لا توجد بروفايلات مطلوبة</div>';
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
// 📝 المودالات وتسجيل النتائج (مع تعديل الرينج)
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
    
    // ✅ قراءة الرينج (سواء المخصص أو الذكي)
    const range = getSmartRange(p, patient, null, savedData);

    document.getElementById('singleModalTitle').innerText = `🧪 تسجيل نتيجة: ${catalogItem.name}`;
    const area = document.getElementById('singleResultArea');
    
    // ✅ إضافة زرار تعديل الرينج ✏️ في التحليل الفردي
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

// ✅ تعديل دالة الرينج عشان تخدم الـ Single والـ Profile
window.enableRangeEdit = function(vtId, paramName, isSingle = false) {
    const container = document.getElementById(`range_container_${vtId}_${paramName}`);
    const currentRange = document.getElementById(`range_text_${vtId}_${paramName}`).innerText;
    container.innerHTML = `<input type="text" id="custom_range_${vtId}_${paramName}" class="range-input-custom" value="${currentRange}" placeholder="Range" style="width:100px; padding:2px; font-size:12px;">`;
    const input = document.getElementById(`custom_range_${vtId}_${paramName}`);
    input.focus();
    input.select();
    
    // لو المستخدم ساب الحقل، نرجع النص تاني
    input.onblur = function() {
        if (this.value.trim() === '') return; 
        container.innerHTML = `<span id="range_text_${vtId}_${paramName}">${this.value}</span> <button type="button" class="btn-edit-range" onclick="enableRangeEdit('${vtId}', '${paramName}', ${isSingle})" title="تعديل الرينج" style="background:none; border:none; cursor:pointer;">✏️</button>`;
    };
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
        
        // ✅ إضافة أسهم الكيبورد للتنقل بين الحقول
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
            // لو Single: Enter بيحفظ ويقفل
            const saveBtn = document.getElementById('btnSaveSingleResult');
            if (saveBtn) saveBtn.click();
        } else {
            // لو Profile: Enter بينقل للحقل اللي بعده، ولو آخر حقل يروح لزرار الحفظ
            let form = el.closest('.modal-body');
            if (!form) return;
            let inputs = Array.from(form.querySelectorAll('input:not([readonly]), select'));
            let index = inputs.indexOf(el);
            if (index > -1 && index < inputs.length - 1) { 
                inputs[index + 1].focus(); 
            } else { 
                const saveBtn = form.parentElement.querySelector('.btn-save-test'); 
                if (saveBtn) saveBtn.focus(); 
            }
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
        
        if (e.key === 'ArrowDown' && index < inputs.length - 1) {
            inputs[index + 1].focus();
        } else if (e.key === 'ArrowUp' && index > 0) {
            inputs[index - 1].focus();
        }
    }
}// ==========================================
// 💾 حفظ النتائج (أوفلاين + مزامنة + رينج مخصص)
// ==========================================
async function saveSingleResult(vtId) {
    const input = document.getElementById(`res_${vtId}_simple`);
    if (!input || input.value.trim() === '') return showToast('⚠️ أدخل النتيجة أولاً', true);
    
    let resultsData = { 'result': { value: input.value.trim() } };
    
    // ✅ حفظ الرينج المخصص للتحليل الفردي لو اتعدل
    const customRangeInput = document.getElementById(`custom_range_${vtId}_result`);
    if (customRangeInput && customRangeInput.value.trim() !== '') {
        resultsData['result'].customRange = customRangeInput.value.trim();
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
        const customRangeInput = document.getElementById(`custom_range_${vtId}_${param.name}`);
        
        if (input && input.value.trim() !== '') {
            resultsData[param.name] = { value: input.value.trim() };
            if (phaseSelect) resultsData[param.name].phase = phaseSelect.value;
            if (customRangeInput && customRangeInput.value.trim() !== '') {
                resultsData[param.name].customRange = customRangeInput.value.trim();
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
// 🧮 الحسابات والتنقل
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
// ✏️ التعديل والحذف والإخفاء والنشر
// ==========================================
function openEditPatientModal(visitId) {
    const v = allVisits.find(x => String(x.visit_id) === String(visitId));
    if(!v || !v.patient) return;
    document.getElementById('editVisitId').value = v.visit_id;
    document.getElementById('editVisitIdDisplay').value = v.visit_id;
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

// ✅ دالة الإخفاء من طابور المعمل (بدون حذف من الداتابيز)
async function hideFromLabQueue(visitId) {
    if(!confirm('هل أنت متأكد من إخفاء هذه الحالة من طابور المعمل؟ (لن تُحذف نهائياً من النظام)')) return;
    try {
        // إضافة علامة hidden_in_lab = true في الداتابيز المحلية
        await db.visits.update(parseInt(visitId), { hidden_in_lab: true });
        
        showToast('🙈 تم إخفاء الحالة من طابور المعمل');
        if (String(selectedVisitId) === String(visitId)) { selectedVisitId = null; renderOrderedTests(); }
        
        await loadData(); // إعادة تحميل البيانات عشان الفلتر يطبق
    } catch(e) { 
        console.error(e);
        showToast('❌ حدث خطأ أثناء الإخفاء', true);
    }
}

// ✅ زرار النشر المحدث
async function publishVisit() {
    if (!selectedVisitId) return;
    try {
        const payload = { visit_id: parseInt(selectedVisitId), is_published: true, published_at: new Date().toISOString() };
        
        // تحديث محلي
        await db.visits.update(parseInt(selectedVisitId), { is_published: true, published_at: new Date().toISOString() });
        // إضافة للمزامنة
        await addToOutbox('visits', 'UPDATE', payload);
        
        selectPatient(selectedVisitId); 
        showToast(`✅ تم نشر النتيجة بنجاح في بوابة المريض`);
        if (navigator.onLine) processOutbox();
    } catch (err) { alert('خطأ أثناء النشر: ' + err.message); }
}

// ==========================================
// 🖨️ الطباعة و PDF (ممنوع اللمس - زي ما هو)
// ==========================================
function getHeaderHtml(visit, reqDate, printDate) {
    let ageStr = visit.patient.age + ' Years';
    if(visit.patient.age_type === 'Months') ageStr = visit.patient.age + ' Months';
    if(visit.patient.age_type === 'Days') ageStr = visit.patient.age + ' Days';
    
    return `
        <div class="print-header">
            <div class="print-header-left">
                <h1>${TEBA_CONFIG.lab.nameEn || 'TEBA LABS'}</h1>
                <p style="font-size: 15px;">For Medical Analyzes</p>
                <p>${TEBA_CONFIG.lab.doctor || ''}</p>
            </div>
            <div class="print-header-right"><img src="../header.png" alt="Logo" onerror="this.style.display='none'"></div>
        </div>
        <div style="display: flex; justify-content: space-between; border: 1.5px solid #000; padding: 10px 15px; border-radius: 4px; background: #fff; font-size: 13px; margin-bottom: 20px;">
            <div style="width: 50%; display: flex; flex-direction: column; gap: 5px;">
                <div><strong style="color: #000; display: inline-block; width: 100px;">Patient:</strong> <span style="font-weight: bold;">${visit.patient.name || 'Unknown'}</span></div>
                <div><strong style="color: #000; display: inline-block; width: 100px;">Age/Gender:</strong> <span style="font-weight: bold;">${ageStr} / ${visit.patient.gender}</span></div>
                <div><strong style="color: #000; display: inline-block; width: 100px;">Referred By:</strong> <span style="font-weight: bold;">${visit.patient.doctor_name || '---'}</span></div>
            </div>
            <div style="width: 50%; display: flex; flex-direction: column; gap: 5px; text-align: right; border-left: 1.5px solid #000; padding-left: 15px;">
                <div><strong style="color: #000; display: inline-block; width: 100px;">Visit ID:</strong> <span style="font-weight: bold;">${visit.visit_id}</span></div>
                <div><strong style="color: #000; display: inline-block; width: 100px;">Request Date:</strong> <span style="font-weight: bold;">${reqDate}</span></div>
                <div><strong style="color: #000; display: inline-block; width: 100px;">Print Date:</strong> <span style="font-weight: bold;">${printDate}</span></div>
            </div>
        </div>
    `;
}

function getFooterHtml() {
    return `
        <div class="print-footer">
            <div class="print-footer-phones"><p>📞 01123702062</p><p>📱 01099003494</p></div>
            <div class="print-footer-addresses"><p>الفرع الأول: الجعافرة - الطريق العمومي - أعلى صيدلية الصحابة</p><p>الفرع الثاني: بهتيم - مساكن اسكو - أمام مدرسة ابن الخطاب - عيادة د. محمد رمضان</p></div>
        </div>
    `;
}

function openPrintModal() {
    if (!selectedVisitId) return alert('اختر مريضاً أولاً!');
    const visit = allVisits.find(v => String(v.visit_id) === String(selectedVisitId));
    const vTests = visitTests.filter(vt => String(vt.visit_id) === String(selectedVisitId));
    
    if(!visit) return;
    
    const reqDate = visit.visit_date ? new Date(visit.visit_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const printDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const printArea = document.getElementById('print-area');
    printArea.innerHTML = '';
    
    let singlesRows = ''; let profilesData = []; 
    
    function getStateHtml(val, range) {
        if (!val || !range) return '';
        const num = parseFloat(val); const match = range.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
        let color = '#000'; let text = '';
        if (!isNaN(num) && match) {
            const min = parseFloat(match[1]), max = parseFloat(match[2]);
            if (num < min) { text = 'Low'; color = '#d32f2f'; }
            else if (num > max) { text = 'High'; color = '#d32f2f'; }
            else { text = 'Normal'; color = '#2e7d32'; }
        }
        if (text) return `<span style="border: 1px solid #000; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; color: ${color}; display: inline-block;">${text}</span>`;
        return '';
    }
    
    vTests.forEach(vt => {
        const catalogItem = testsCatalog.find(c => c.code === vt.test_code) || { name: vt.test_code, code: vt.test_code, parameters: [] };
        const result = testResults.find(r => String(r.visit_test_id) === String(vt.id));
        const savedData = result ? result.results_data : {};
        const params = getSmartParams(catalogItem);
        const isProfile = isProfileTest(catalogItem);
        let hasTestData = false; let testRows = '';
        
        if (isProfile) {
            params.forEach(param => {
                const val = savedData[param.name]?.value; const phase = savedData[param.name]?.phase; 
                if (val) {
                    hasTestData = true;
                    const range = getSmartRange(param, visit.patient, phase, savedData);
                    const unit = param.unit || param.units || '-';
                    const flagStr = getStateHtml(val, range);
                    let displayParamName = param.label || param.name;
                    if (phase) displayParamName += ` (${phase})`;
                    testRows += `<tr><td style="border-bottom: 1px solid #ccc; padding: 8px 6px;">${displayParamName}</td><td style="border-bottom: 1px solid #ccc; padding: 8px 6px; text-align:center; font-weight:bold; color: #000;">${val}</td><td style="border-bottom: 1px solid #ccc; padding: 8px 6px; text-align:center;">${flagStr}</td><td style="border-bottom: 1px solid #ccc; padding: 8px 6px; text-align:center;">${unit}</td><td style="border-bottom: 1px solid #ccc; padding: 8px 6px; text-align:center;">${range}</td></tr>`;
                }
            });
            if (hasTestData) profilesData.push({ name: catalogItem.name, rows: testRows }); 
            else profilesData.push({ name: catalogItem.name, rows: `<tr><td colspan="5" style="text-align:center; padding: 20px; color: #666;">لا توجد نتائج محفوظة.</td></tr>` });
        } else {
            const val = savedData['result']?.value;
            if (val) {
                const p = params[0] || {};
                const range = getSmartRange(p, visit.patient, null, savedData);
                const unit = p.unit || catalogItem.unit || '-';
                const flagStr = getStateHtml(val, range);
                singlesRows += `<tr><td style="border-bottom: 1px solid #ccc; padding: 8px 6px;">${catalogItem.name}</td><td style="border-bottom: 1px solid #ccc; padding: 8px 6px; text-align:center; font-weight:bold; color: #000;">${val}</td><td style="border-bottom: 1px solid #ccc; padding: 8px 6px; text-align:center;">${flagStr}</td><td style="border-bottom: 1px solid #ccc; padding: 8px 6px; text-align:center;">${unit}</td><td style="border-bottom: 1px solid #ccc; padding: 8px 6px; text-align:center;">${range}</td></tr>`;
            }
        }
    });

    let htmlContent = '';
    if (singlesRows !== '') { htmlContent += `<div class="print-page">${getHeaderHtml(visit, reqDate, printDate)}<div style="margin-bottom: 25px;"><h3 style="margin: 0 0 10px 0; background: #eee; padding: 8px 12px; border-left: 4px solid #000; font-size: 15px; text-transform: uppercase; color: #000;">SINGLE TESTS</h3><table style="width: 100%; border-collapse: collapse; font-size: 13px;"><thead><tr style="background: #000; color: #fff;"><th style="padding: 8px 6px; text-align:left;">Test Name</th><th style="padding: 8px 6px; text-align:center;">Result</th><th style="padding: 8px 6px; text-align:center;">State</th><th style="padding: 8px 6px; text-align:center;">Unit</th><th style="padding: 8px 6px; text-align:center;">Ref. Range</th></tr></thead><tbody>${singlesRows}</tbody></table></div>${getFooterHtml()}</div>`; }
    profilesData.forEach(profile => { htmlContent += `<div class="print-page">${getHeaderHtml(visit, reqDate, printDate)}<div style="margin-bottom: 25px;"><h3 style="margin: 0 0 10px 0; background: #eee; padding: 8px 12px; border-left: 4px solid #000; font-size: 15px; text-transform: uppercase; color: #000;">${profile.name}</h3><table style="width: 100%; border-collapse: collapse; font-size: 13px;"><thead><tr style="background: #000; color: #fff;"><th style="padding: 8px 6px; text-align:left;">Test Name</th><th style="padding: 8px 6px; text-align:center;">Result</th><th style="padding: 8px 6px; text-align:center;">State</th><th style="padding: 8px 6px; text-align:center;">Unit</th><th style="padding: 8px 6px; text-align:center;">Ref. Range</th></tr></thead><tbody>${profile.rows}</tbody></table></div>${getFooterHtml()}</div>`; });
    
    if (htmlContent === '') { htmlContent += `<div class="print-page">${getHeaderHtml(visit, reqDate, printDate)}<p style="text-align:center; font-weight:bold; margin-top:50px;">No results recorded.</p>${getFooterHtml()}</div>`; }

    printArea.innerHTML = htmlContent;
    document.getElementById('printModal').style.display = 'flex';
}

function downloadPDF() {
    if (!selectedVisitId) return alert('اختر مريضاً أولاً!');
    openPrintModal(); 
    const element = document.getElementById('print-area');
    const opt = { margin: 0, filename: `Report_Visit_${selectedVisitId}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, scrollY: 0 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
    const btn = document.getElementById('btnDownloadPdf'); const originalText = btn.innerHTML; btn.innerHTML = '⏳ جاري التحميل...';
    html2pdf().set(opt).from(element).save().then(() => { btn.innerHTML = originalText; }).catch(err => { console.error(err); alert('حدث خطأ أثناء التحميل'); btn.innerHTML = originalText; });
}

// ==========================================
// 🚀 التشغيل عند فتح الصفحة
// ==========================================
window.onload = async () => { 
    const branchSelector = document.getElementById('labBranch');
    if (branchSelector) branchSelector.value = currentLabBranch;

    await loadData(); 
    checkSyncStatus();
};