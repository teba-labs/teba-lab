/* =====================================================
   TEBA LABS - Admin Logic (v124 - SaaS Multi-Tenant)
   ===================================================== */

(function(){
  'use strict';

  const supabaseUrl = TEBA_CONFIG.supabase.url;
  const supabaseKey = TEBA_CONFIG.supabase.key;
  const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

  /* ============= SECURITY CONSTANTS ============= */
  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const BACKUP_VERSION = 'v124';

  let salesWorkbook = null;
  let pricesWorkbook = null;
  let detailedWorkbook2025 = null;
  let detailedWorkbook2026 = null;

  /* ============= THEME LOGIC ============= */
  window.toggleAdminTheme = function() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('teba_admin_theme', isLight ? 'light' : 'dark');
    document.getElementById('adminThemeToggle').textContent = isLight ? '🌙' : '☀️';
    updateChartsTheme();
  };

  function initTheme() {
    const savedTheme = localStorage.getItem('teba_admin_theme');
    const btn = document.getElementById('adminThemeToggle');
    if (savedTheme === 'light') {
      document.body.classList.add('light-mode');
      if (btn) btn.textContent = '🌙';
    } else {
      if (btn) btn.textContent = '☀️';
    }
  }

  function updateChartsTheme() {
    // تحديث الرسوم البيانية لو موجودة
  }

  /* ============= NEW: FINANCIAL LEDGER LOGIC ============= */
  window.saveDailyFinance = async function(type) {
    let branchId, amount, itemName, typeAr;

    if (type === 'revenue') {
        branchId = document.getElementById('dailyRevBranch').value;
        amount = parseFloat(document.getElementById('dailyRevAmount').value);
        itemName = document.getElementById('dailyRevNotes').value || 'تحصيل إيراد';
        typeAr = 'إيراد / تحصيل';
    } else if (type === 'expense_daily') {
        branchId = document.getElementById('dailyExpBranch').value;
        amount = parseFloat(document.getElementById('dailyExpAmount').value);
        itemName = document.getElementById('dailyExpItem').value;
        typeAr = 'مصروف يومي';
    } else if (type === 'expense_fixed') {
        branchId = document.getElementById('fixedExpBranch').value;
        amount = parseFloat(document.getElementById('fixedExpAmount').value);
        itemName = document.getElementById('fixedExpItem').value;
        typeAr = 'مصروف ثابت';
    }

    if (!amount || isNaN(amount) || amount <= 0) return alert('يرجى إدخال مبلغ صحيح');
    if (!itemName) return alert('يرجى إدخال البند / البيان');

    showLoading('جاري حفظ الحركة المالية...');

    try {
        const { error } = await _supabase.from('financial_ledger').insert([{
            tenant_id: TEBA_CONFIG.tenant.id,
            branch_id: parseInt(branchId),
            type: type,
            item_name: itemName,
            amount: amount,
            created_at: new Date().toISOString()
        }]);

        if (error) throw error;

        alert(`✅ تم تسجيل (${typeAr}) بقيمة ${amount} ج.م بنجاح!`);
        
        // تصفير الخانات
        if(type === 'revenue') { document.getElementById('dailyRevAmount').value = ''; document.getElementById('dailyRevNotes').value = ''; }
        if(type === 'expense_daily') { document.getElementById('dailyExpAmount').value = ''; document.getElementById('dailyExpItem').value = ''; }
        if(type === 'expense_fixed') { document.getElementById('fixedExpAmount').value = ''; document.getElementById('fixedExpItem').value = ''; }
        
        // تحديث الجدول والإحصائيات
        loadFinancialLedger();
        renderLiveStats(); 

    } catch (err) {
        console.error(err);
        alert('❌ حدث خطأ أثناء الحفظ: ' + err.message);
    } finally {
        hideLoading();
    }
  };

  window.loadFinancialLedger = async function() {
    const tbody = document.getElementById('financialLedgerBody');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">جاري التحميل...</td></tr>';

    try {
        const { data, error } = await _supabase.from('financial_ledger')
            .select('*')
            .eq('tenant_id', TEBA_CONFIG.tenant.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">لا توجد حركات مالية مسجلة.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(row => {
            let typeColor = row.type === 'revenue' ? '#10b981' : '#ef4444';
            let typeLabel = row.type === 'revenue' ? '💵 إيراد' : (row.type === 'expense_fixed' ? '🏢 ثابت' : '🛒 يومي');
            let branchName = row.branch_id === 1 ? 'الجعافرة' : 'بهتيم';
            let dateStr = new Date(row.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });

            return `
                <tr>
                    <td style="direction:ltr; text-align:right;">${dateStr}</td>
                    <td style="color:${typeColor}; font-weight:bold;">${typeLabel}</td>
                    <td>${branchName}</td>
                    <td style="text-align:right;">${row.item_name}</td>
                    <td style="color:${typeColor}; font-weight:bold;">${row.amount} ج</td>
                    <td style="color:var(--text-muted);">Doctor</td>
                </tr>
            `;
        }).join('');
    } catch(err) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">خطأ في تحميل السجل</td></tr>';
    }
  };
  
  // استدعاء السجل أول ما نفتح اللوحة
  window.onload = function() {
      initTheme();
      // لو التاب المالي هو الافتراضي
      setTimeout(() => { if(document.getElementById('report-dailyFinance').classList.contains('active')) loadFinancialLedger(); }, 1000);
  };  /* ============= REPORT NAVIGATION ============= */
  window.showReport = function(reportName){
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('report-' + reportName); if(target) target.classList.add('active');
    document.querySelectorAll('.admin-nav button').forEach(b => b.classList.toggle('active', b.dataset.report === reportName));
    
    if(reportName === 'dailyFinance') loadFinancialLedger();
    if(reportName === 'reconciliation') renderReconciliation();
    if(reportName === 'live') renderLiveStats();
    if(reportName === 'overview') renderOverview();
    if(reportName === 'annual') renderAnnualReport();
    if(reportName === 'financial') renderFinancialReport();
    if(reportName === 'cases') renderCaseAnalysis();
    if(reportName === 'expenseBreakdown') renderExpenseBreakdown();
    if(reportName === 'bcg') renderBCGMatrix();
    if(reportName === 'monthlyPlan') renderMonthlyPlan();
    if(reportName === 'topSellers') renderTopSellers();
    if(reportName === 'mostProfitable') renderMostProfitable();
    if(reportName === 'leastProfitable') renderLeastProfitable();
    if(reportName === 'needOffers') renderNeedOffers();
    if(reportName === 'lossMakers') renderLossMakers();
    if(reportName === 'security') updateStorageIndicator();
    
    if(window.innerWidth <= 900) { 
        const sidebar = document.getElementById('adminSidebar'); 
        const overlay = document.getElementById('mobileOverlay'); 
        if(sidebar) sidebar.classList.remove('open'); 
        if(overlay) overlay.classList.remove('show'); 
    }
    if (_chartResizeTimer) clearTimeout(_chartResizeTimer);
    _chartResizeTimer = setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 200);
  };

  window.toggleAdminSidebar = function(){ 
      const sidebar = document.getElementById('adminSidebar'); 
      const overlay = document.getElementById('mobileOverlay'); 
      sidebar.classList.toggle('open'); 
      if(sidebar.classList.contains('open')){ overlay.classList.add('show'); } 
      else { overlay.classList.remove('show'); } 
  };

  async function showDashboard(){
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'flex';
    await loadSavedDataFromDB(); 
    updateLastUpdatedUI(); 
    window.showReport('dailyFinance'); // نبدأ بتاب المالية
    if ('requestIdleCallback' in window) requestIdleCallback(() => updateStorageIndicator(), { timeout: 2000 }); 
    else setTimeout(updateStorageIndicator, 1500);
  }

  // ==== لوجيك الدخول الجديد (محمي بـ Supabase Auth & Roles) ====
  window.checkAdminPassword = async function(){
    const emailInput = document.getElementById('adminEmail');
    const passInput = document.getElementById('adminPassword');
    const error = document.getElementById('loginError'); 
    const btn = document.querySelector('.login-box button');
    
    if (!emailInput || !passInput || !error) return;
    
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري التحقق...'; }
    error.textContent = '';

    try {
      const { data: authData, error: authError } = await _supabase.auth.signInWithPassword({
        email: emailInput.value.trim(),
        password: passInput.value
      });

      if (authError) throw new Error('الإيميل أو الباسورد غير صحيح');

      const { data: userData, error: userError } = await _supabase
          .from('users')
          .select('role, tenant_id')
          .eq('id', authData.user.id)
          .single();

      if (userError || !userData) {
          await _supabase.auth.signOut();
          throw new Error('لا يوجد صلاحيات مسجلة لهذا الحساب.');
      }

      if (userData.role !== 'admin' && userData.role !== 'owner') {
          await _supabase.auth.signOut();
          throw new Error('🔒 عذراً، هذا الحساب ليس لديه صلاحية الدخول للوحة التحكم.');
      }

      if(userData.tenant_id !== TEBA_CONFIG.tenant.id) {
          await _supabase.auth.signOut();
          throw new Error('🔒 هذا الحساب يتبع لمعمل آخر.');
      }

      localStorage.setItem('teba_tenant_id', userData.tenant_id);
      localStorage.setItem('teba_user_role', userData.role);

      passInput.value = ''; 

    } catch(err) {
      error.textContent = '❌ ' + err.message;
      passInput.value = '';
      setTimeout(() => { error.textContent = ''; }, 4000);
    } finally { 
      if (btn) { btn.disabled = false; btn.textContent = 'دخول آمن'; } 
    }
  };

  window.logoutAdmin = async function(){ 
    await _supabase.auth.signOut(); 
  };

  /* =====================================================
     LIVE STATS (تحديث عشان يقرا المالية اللايف)
     ===================================================== */
  async function getBranchLiveStats(branchId) {
      const today = new Date(); today.setHours(0,0,0,0); const todayISO = today.toISOString();
      
      // 1. جلب زيارات اليوم
      let query = _supabase.from('visits').select('visit_id, paid_amount, is_published').eq('tenant_id', TEBA_CONFIG.tenant.id).gte('visit_date', todayISO);
      if (branchId) query = query.eq('branch_id', branchId);
      const { data: visits, error: vErr } = await query;
      
      if (vErr) throw vErr;

      const casesCount = visits ? visits.length : 0;
      // الإيراد هنا (اللي اتحصله في الاستقبال من الزيارات نفسها)
      const visRev = visits ? visits.reduce((sum, v) => sum + parseFloat(v.paid_amount || 0), 0) : 0;
      const pubCount = visits ? visits.filter(v => v.is_published === true).length : 0; 
      
      const vIds = visits ? visits.map(v => v.visit_id) : [];
      
      let testsCount = 0, pendingCount = 0;
      if (vIds.length > 0) {
          const { data: vt, error: vtErr } = await _supabase.from('visit_tests').select('id').eq('tenant_id', TEBA_CONFIG.tenant.id).in('visit_id', vIds);
          if (vtErr) throw vtErr;
          
          testsCount = vt ? vt.length : 0;
          const vtIds = vt ? vt.map(v => v.id) : [];
          
          if (vtIds.length > 0) {
              const { data: res, error: resErr } = await _supabase.from('test_results').select('visit_test_id').eq('tenant_id', TEBA_CONFIG.tenant.id).in('visit_test_id', vtIds);
              if (resErr) throw resErr;
              
              const resIds = new Set((res||[]).map(r => r.visit_test_id));
              pendingCount = vtIds.filter(id => !resIds.has(id)).length;
          }
      }

      // 2. جلب المالية اللايف (التحصيل والمصاريف) من جدول financial_ledger
      let finQuery = _supabase.from('financial_ledger').select('amount, type').eq('tenant_id', TEBA_CONFIG.tenant.id).gte('created_at', todayISO);
      if (branchId) finQuery = finQuery.eq('branch_id', branchId);
      const { data: finData, error: finErr } = await finQuery;
      
      let liveRev = visRev;
      let liveExp = 0;
      
      if (!finErr && finData) {
          finData.forEach(f => {
              if (f.type === 'revenue') liveRev += parseFloat(f.amount);
              else liveExp += parseFloat(f.amount);
          });
      }
      
      return { cases: casesCount, rev: liveRev, exp: liveExp, tests: testsCount, pending: pendingCount, published: pubCount };
  }

  window.renderLiveStats = async function() {
      ['all','j','b'].forEach(p => {
          ['cases','tests','rev','exp','pending','published'].forEach(m => {
              const el = document.getElementById(`live-${m}-${p}`); if(el) el.innerText = '...';
          });
      });

      try {
          const [statsAll, statsJ, statsB] = await Promise.all([
              getBranchLiveStats(null),
              getBranchLiveStats(1),
              getBranchLiveStats(2)
          ]);

          const updateDOM = (prefix, data) => {
              const elC = document.getElementById(`live-cases-${prefix}`); if(elC) elC.innerText = data.cases;
              const elT = document.getElementById(`live-tests-${prefix}`); if(elT) elT.innerText = data.tests;
              const elR = document.getElementById(`live-rev-${prefix}`); if(elR) elR.innerText = data.rev.toLocaleString() + ' ج';
              const elE = document.getElementById(`live-exp-${prefix}`); if(elE) elE.innerText = data.exp.toLocaleString() + ' ج';
              const elP = document.getElementById(`live-pending-${prefix}`); if(elP) elP.innerText = data.pending;
              const elPub = document.getElementById(`live-published-${prefix}`); if(elPub) elPub.innerText = data.published;
          };

          updateDOM('all', statsAll);
          updateDOM('j', statsJ);
          updateDOM('b', statsB);

      } catch(err) {
          console.error("Live Stats Error:", err);
          ['all','j','b'].forEach(p => {
              ['cases','tests','rev','exp','pending','published'].forEach(m => {
                  const el = document.getElementById(`live-${m}-${p}`); if(el) el.innerText = '!';
              });
          });
      }
  };  /* =====================================================
     UTILITIES & FILE UPLOADS
     ===================================================== */
  function showLoading(msg) {
    let el = document.getElementById('globalLoading');
    if (!el) { el = document.createElement('div'); el.id = 'globalLoading'; el.className = 'loading-overlay'; el.innerHTML = '<div class="loading-box"><div class="loading-spinner"></div><div class="loading-text"></div></div>'; document.body.appendChild(el); }
    el.querySelector('.loading-text').textContent = msg || 'جاري التحميل...'; el.classList.add('show');
  }
  
  function hideLoading() { 
      const el = document.getElementById('globalLoading'); 
      if (el) el.classList.remove('show'); 
  }

  function validateFile(file) {
    if (!file) return { ok: false, msg: '❌ لم يتم اختيار ملف' };
    const allowed = ['.csv', '.xlsx', '.xls'];
    const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (allowed.indexOf(ext) === -1) return { ok: false, msg: '❌ نوع الملف غير مدعوم (' + ext + ')' };
    if (file.size > MAX_FILE_SIZE) return { ok: false, msg: '❌ حجم الملف أكبر من 20MB' };
    if (file.size === 0) return { ok: false, msg: '❌ الملف فارغ' };
    return { ok: true };
  }

  const DB_NAME = 'TebaAdminDB_v16';
  const STORE_NAME = 'files';

  function openDB() { 
      return new Promise((resolve, reject) => { 
          const request = indexedDB.open(DB_NAME, 1); 
          request.onupgradeneeded = e => e.target.result.createObjectStore(STORE_NAME); 
          request.onsuccess = e => resolve(e.target.result); 
          request.onerror = e => reject(e.target.error); 
      }); 
  }

  async function saveFileToDB(key, arrayBuffer) { 
      const db = await openDB(); 
      return new Promise((resolve, reject) => { 
          const tx = db.transaction(STORE_NAME, 'readwrite'); 
          tx.objectStore(STORE_NAME).put(arrayBuffer, key); 
          tx.oncomplete = () => resolve(); 
          tx.onerror = () => reject(tx.error); 
      }); 
  }

  async function getFileFromDB(key) { 
      const db = await openDB(); 
      return new Promise((resolve, reject) => { 
          const tx = db.transaction(STORE_NAME, 'readonly'); 
          const req = tx.objectStore(STORE_NAME).get(key); 
          req.onsuccess = () => resolve(req.result); 
          req.onerror = () => reject(req.error); 
      }); 
  }

  window.handleFileUpload = async function(event, type){
    const file = event.target.files[0]; if (!file) return;
    const statusMap = { sales: 'uploadStatusSales', prices: 'uploadStatusPrices', detail2025: 'uploadStatusDetail2025', detail2026: 'uploadStatusDetail2026' };
    const dbKeyMap = { sales: 'salesData', prices: 'pricesData', detail2025: 'detail2025Data', detail2026: 'detail2026Data' };
    const statusEl = document.getElementById(statusMap[type]); if (!statusEl) return;
    
    const v = validateFile(file); 
    if (!v.ok) { statusEl.className = 'upload-status error'; statusEl.textContent = v.msg; event.target.value = ''; return; }
    
    statusEl.className = 'upload-status'; statusEl.textContent = '⏳ جاري القراءة والحفظ...'; showLoading('جاري رفع ' + file.name);
    
    const reader = new FileReader();
    reader.onload = async function(e){
      try {
        const arrayBuffer = e.target.result; 
        await saveFileToDB(dbKeyMap[type], arrayBuffer); 
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        statusEl.className = 'upload-status success'; statusEl.innerHTML = '✅ تم رفع وحفظ الملف بنجاح!';
        if(type === 'sales') salesWorkbook = workbook; 
        if(type === 'prices') pricesWorkbook = workbook;
        if(type === 'detail2025') detailedWorkbook2025 = workbook; 
        if(type === 'detail2026') detailedWorkbook2026 = workbook;
        
        localStorage.setItem('teba_last_upload_date', Date.now()); 
        updateLastUpdatedUI(); 
        updateStorageIndicator(); 
        hideLoading();
      } catch (err) { 
          statusEl.className = 'upload-status error'; statusEl.textContent = '❌ خطأ: ' + err.message; 
          hideLoading(); 
      }
    };
    reader.onerror = function(){ statusEl.className = 'upload-status error'; statusEl.textContent = '❌ فشل قراءة الملف'; hideLoading(); }; 
    reader.readAsArrayBuffer(file);
  };

  async function loadSavedDataFromDB() {
    showLoading('جاري تحميل البيانات المحفوظة...');
    try {
      const [salesBuffer, pricesBuffer, detail2025Buffer, detail2026Buffer] = await Promise.all([ getFileFromDB('salesData'), getFileFromDB('pricesData'), getFileFromDB('detail2025Data'), getFileFromDB('detail2026Data') ]);
      if(salesBuffer) { salesWorkbook = XLSX.read(salesBuffer, { type: 'array' }); const el = document.getElementById('uploadStatusSales'); if (el) { el.className = 'upload-status success'; el.innerHTML = '✅ ملف المبيعات محمل.'; } }
      if(pricesBuffer) { pricesWorkbook = XLSX.read(pricesBuffer, { type: 'array' }); const el = document.getElementById('uploadStatusPrices'); if (el) { el.className = 'upload-status success'; el.innerHTML = '✅ ملف الأسعار محمل.'; } }
      if(detail2025Buffer) { detailedWorkbook2025 = XLSX.read(detail2025Buffer, { type: 'array' }); const el = document.getElementById('uploadStatusDetail2025'); if (el) { el.className = 'upload-status success'; el.innerHTML = '✅ تفصيل 2025 محمل.'; } }
      if(detail2026Buffer) { detailedWorkbook2026 = XLSX.read(detail2026Buffer, { type: 'array' }); const el = document.getElementById('uploadStatusDetail2026'); if (el) { el.className = 'upload-status success'; el.innerHTML = '✅ تفصيل 2026 محمل.'; } }
      hideLoading();
    } catch(e) { hideLoading(); console.log("لا توجد بيانات محفوظة.", e); }
  }

  function updateLastUpdatedUI() {
    const el = document.getElementById('lastUpdatedText'); if (!el) return;
    const ts = localStorage.getItem('teba_last_upload_date');
    if (!ts) { el.innerHTML = '📅 آخر تحديث: لم يتم الرفع'; return; }
    const date = new Date(parseInt(ts, 10));
    el.innerHTML = `📅 آخر تحديث: ${date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}`;
  }

  async function updateStorageIndicator() {
    try {
      if (!navigator.storage || !navigator.storage.estimate) return;
      const est = await navigator.storage.estimate();
      const used = est.usage || 0; const quota = est.quota || (60 * 1024 * 1024);
      const pct = Math.min(100, (used / quota) * 100);
      const fillClass = 'storage-bar-fill' + (pct > 80 ? ' danger' : pct > 60 ? ' warning' : '');
      const textContent = (used/1024/1024).toFixed(2) + ' MB / ' + (quota/1024/1024).toFixed(0) + ' MB (' + pct.toFixed(1) + '%)';
      const bar = document.getElementById('storageBar'); const txt = document.getElementById('storageText');
      if (bar) { bar.style.width = pct.toFixed(1) + '%'; bar.className = fillClass; }
      if (txt) txt.textContent = textContent;
      const barSec = document.getElementById('storageBarSec'); const txtSec = document.getElementById('storageTextSec');
      if (barSec) { barSec.style.width = pct.toFixed(1) + '%'; barSec.className = fillClass; }
      if (txtSec) txtSec.textContent = textContent;
    } catch(e) {}
  }

  /* =====================================================
     BACKUP & SECURITY
     ===================================================== */
  window.exportBackup = async function() {
    showLoading('جاري تصدير النسخة...');
    try {
      const backup = { version: BACKUP_VERSION, timestamp: new Date().toISOString(), files: {}, settings: {} };
      const db = await openDB(); const tx = db.transaction(STORE_NAME, 'readonly'); const store = tx.objectStore(STORE_NAME);
      const keys = ['salesData', 'pricesData', 'detail2025Data', 'detail2026Data'];
      for (const k of keys) {
        const buf = await new Promise((res, rej) => { const r = store.get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        if (buf) { const bytes = new Uint8Array(buf); let bin = ''; for (let j = 0; j < bytes.length; j++) bin += String.fromCharCode(bytes[j]); backup.files[k] = btoa(bin); }
      }
      backup.settings.lastUpload = localStorage.getItem('teba_last_upload_date');
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'teba-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); URL.revokeObjectURL(url);
      hideLoading(); alert('✅ تم تصدير النسخة الاحتياطية');
    } catch(e) { hideLoading(); alert('❌ خطأ: ' + e.message); }
  };

  window.importBackup = function() {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async function(e) {
      const file = e.target.files[0]; if (!file) return;
      if (!confirm('⚠️ الاستيراد هيستبدل كل البيانات الحالية. متأكد؟')) return;
      showLoading('جاري استيراد النسخة...');
      try {
        const text = await file.text(); const backup = JSON.parse(text);
        if (!backup.version || !backup.files) throw new Error('ملف غير صالح');
        const db = await openDB(); const tx = db.transaction(STORE_NAME, 'readwrite'); const store = tx.objectStore(STORE_NAME); store.clear();
        for (const [k, b64] of Object.entries(backup.files)) { const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j); store.put(arr.buffer, k); }
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
        if (backup.settings && backup.settings.lastUpload) localStorage.setItem('teba_last_upload_date', backup.settings.lastUpload);
        hideLoading(); alert('✅ تم الاستيراد. الصفحة هتعيد التحميل.'); setTimeout(() => location.reload(), 500);
      } catch(e) { hideLoading(); alert('❌ خطأ: ' + e.message); }
    };
    input.click();
  };

  window.clearData = async function() {
    if (!confirm('⚠️ مسح كل البيانات المحفوظة نهائياً؟')) return;
    if (!confirm('تأكيد نهائي: مفيش رجوع. متأكد 100%؟')) return;
    showLoading('جاري مسح البيانات...');
    try {
      salesWorkbook = null; pricesWorkbook = null; detailedWorkbook2025 = null; detailedWorkbook2026 = null;
      localStorage.removeItem('teba_last_upload_date');
      const db = await openDB(); const tx = db.transaction(STORE_NAME, 'readwrite'); tx.objectStore(STORE_NAME).clear();
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
      hideLoading(); alert('✅ تم مسح كل البيانات'); location.reload();
    } catch(e) { hideLoading(); alert('❌ خطأ: ' + e.message); }
  };

  window.changeAdminPassword = async function() {
    const newPwd = prompt('كلمة المرور الجديدة (8+ أحرف، حروف وأرقام):'); if (!newPwd) return;
    const confirmPwd = prompt('أكد كلمة المرور:'); if (newPwd !== confirmPwd) { alert('❌ مش متطابقتين'); return; }
    
    showLoading('جاري تحديث كلمة المرور...');
    try {
      const { error } = await _supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      hideLoading(); alert('✅ تم تغيير كلمة المرور بنجاح!');
    } catch(err) {
      hideLoading(); alert('❌ خطأ: ' + err.message);
    }
  };

  /* ============= INIT & PWA ============= */
  initTheme();
  
  _supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) { showDashboard(); }
  });

  _supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') { showDashboard(); }
    else if (event === 'SIGNED_OUT') { location.reload(); }
  });

  const passInput = document.getElementById('adminPassword');
  if(passInput) passInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') window.checkAdminPassword(); });
  const emailInput = document.getElementById('adminEmail');
  if(emailInput) emailInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') window.checkAdminPassword(); });

  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    const installBtn = document.getElementById('pwaInstallBtn');
    if (installBtn) installBtn.style.display = 'inline-flex'; 
  });

  window.installPWA = async function() {
    if (!deferredPrompt) { alert('التطبيق مثبت بالفعل أو متصفحك لا يدعم هذه الميزة.'); return; }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') { const installBtn = document.getElementById('pwaInstallBtn'); if (installBtn) installBtn.style.display = 'none'; }
    deferredPrompt = null;
  };

})();