/* =====================================================
   TEBA LABS - Admin Logic (v42 - Fixed Responsive)
   ===================================================== */

(function(){
  'use strict';

  const ADMIN_PASSWORD = 'teba2026admin';
  const SESSION_KEY = 'teba_admin_session';

  let salesWorkbook = null;
  let pricesWorkbook = null;
  let detailedWorkbook2025 = null;
  let detailedWorkbook2026 = null;

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

  function num(v) {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
          const n = parseFloat(v);
          return isNaN(n) ? 0 : n;
      }
      return 0;
  }

  window.showReport = function(reportName){
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('report-' + reportName);
    if(target) target.classList.add('active');
    document.querySelectorAll('.admin-nav button').forEach(b => b.classList.toggle('active', b.dataset.report === reportName));
    
    if(reportName === 'overview') renderOverview();
    if(reportName === 'annual') renderAnnualReport();
    if(reportName === 'financial') renderFinancialReport();
    if(reportName === 'cases') renderCaseAnalysis();
    if(reportName === 'expenseBreakdown') renderExpenseBreakdown();
    if(reportName === 'topSellers') renderTopSellers();
    if(reportName === 'mostProfitable') renderMostProfitable();
    if(reportName === 'leastProfitable') renderLeastProfitable();
    if(reportName === 'needOffers') renderNeedOffers();
    if(reportName === 'lossMakers') renderLossMakers();
    
    if(window.innerWidth <= 900) {
        const sidebar = document.getElementById('adminSidebar');
        const overlay = document.getElementById('mobileOverlay');
        if(sidebar) sidebar.classList.remove('open');
        if(overlay) overlay.classList.remove('show');
    }
    
    setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 300);
  };

  window.toggleAdminSidebar = function(){
      const sidebar = document.getElementById('adminSidebar');
      const overlay = document.getElementById('mobileOverlay');
      
      sidebar.classList.toggle('open');
      
      if(sidebar.classList.contains('open')){
          overlay.classList.add('show');
      } else {
          overlay.classList.remove('show');
      }
  };

  async function showDashboard(){
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'flex';
    await loadSavedDataFromDB();
    window.showReport('overview');
  }

  window.checkAdminPassword = function(){
    const input = document.getElementById('adminPassword');
    const error = document.getElementById('loginError');
    if(input.value === ADMIN_PASSWORD){
      sessionStorage.setItem(SESSION_KEY, 'yes');
      showDashboard();
    } else {
      error.textContent = '❌ كلمة المرور غير صحيحة';
      input.value = '';
      setTimeout(() => { error.textContent = ''; }, 3000);
    }
  };

  window.logoutAdmin = function(){ sessionStorage.removeItem(SESSION_KEY); location.reload(); };

  window.clearData = async function() {
    if(confirm('هل أنت متأكد من مسح البيانات المحفوظة نهائياً؟')) {
      salesWorkbook = null;
      pricesWorkbook = null;
      detailedWorkbook2025 = null;
      detailedWorkbook2026 = null;
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => location.reload();
    }
  };

  window.handleFileUpload = function(event, type){
    const file = event.target.files[0];
    if(!file) return;
    
    const statusMap = {
      sales: 'uploadStatusSales',
      prices: 'uploadStatusPrices',
      detail2025: 'uploadStatusDetail2025',
      detail2026: 'uploadStatusDetail2026'
    };
    const dbKeyMap = {
      sales: 'salesData',
      prices: 'pricesData',
      detail2025: 'detail2025Data',
      detail2026: 'detail2026Data'
    };
    
    const statusEl = document.getElementById(statusMap[type]);
    if (!statusEl) return;
    
    statusEl.className = 'upload-status';
    statusEl.textContent = '⏳ جاري القراءة والحفظ...';

    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const arrayBuffer = e.target.result;
        await saveFileToDB(dbKeyMap[type], arrayBuffer);
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        statusEl.className = 'upload-status success';
        statusEl.innerHTML = `✅ تم رفع وحفظ الملف بنجاح!`;
        
        if(type === 'sales') salesWorkbook = workbook;
        if(type === 'prices') pricesWorkbook = workbook;
        if(type === 'detail2025') detailedWorkbook2025 = workbook;
        if(type === 'detail2026') detailedWorkbook2026 = workbook;
        
        renderAllReports();
      } catch (error) {
        statusEl.className = 'upload-status error';
        statusEl.textContent = '❌ حدث خطأ: ' + error.message;
      }
    };
    reader.readAsArrayBuffer(file);
  };

  async function loadSavedDataFromDB() {
    try {
        const salesBuffer = await getFileFromDB('salesData');
        const pricesBuffer = await getFileFromDB('pricesData');
        const detail2025Buffer = await getFileFromDB('detail2025Data');
        const detail2026Buffer = await getFileFromDB('detail2026Data');
        
        if(salesBuffer) {
            salesWorkbook = XLSX.read(salesBuffer, { type: 'array' });
            const el = document.getElementById('uploadStatusSales');
            if (el) { el.className = 'upload-status success'; el.innerHTML = '✅ ملف المبيعات محمل.'; }
        }
        if(pricesBuffer) {
            pricesWorkbook = XLSX.read(pricesBuffer, { type: 'array' });
            const el = document.getElementById('uploadStatusPrices');
            if (el) { el.className = 'upload-status success'; el.innerHTML = '✅ ملف الأسعار محمل.'; }
        }
        if(detail2025Buffer) {
            detailedWorkbook2025 = XLSX.read(detail2025Buffer, { type: 'array' });
            const el = document.getElementById('uploadStatusDetail2025');
            if (el) { el.className = 'upload-status success'; el.innerHTML = '✅ تفصيل 2025 محمل.'; }
        }
        if(detail2026Buffer) {
            detailedWorkbook2026 = XLSX.read(detail2026Buffer, { type: 'array' });
            const el = document.getElementById('uploadStatusDetail2026');
            if (el) { el.className = 'upload-status success'; el.innerHTML = '✅ تفصيل 2026 محمل.'; }
        }
        renderAllReports();
    } catch(e) { console.log("لا توجد بيانات محفوظة."); }
  }

  function renderAllReports() {
      renderOverview();
      renderFinancialReport();
      renderAnnualReport();
      renderCaseAnalysis();
      renderTopSellers();
      renderMostProfitable();
      renderLeastProfitable();
      renderNeedOffers();
      renderLossMakers();
      renderExpenseBreakdown();
  }

  function getSheetData(sheetKey) {
      if (!salesWorkbook) return [];
      const sheetName = salesWorkbook.SheetNames.find(n => n.includes(sheetKey));
      if (!sheetName) return [];
      return XLSX.utils.sheet_to_json(salesWorkbook.Sheets[sheetName], { header: 1, defval: "" });
  }

  function extractYearData(year, branch) {
      const annualData = getSheetData('السنوية');
      let totalRev = 0, totalExp = 0;
      
      for(let i=1; i<annualData.length; i++) {
          let row = annualData[i];
          if (!row) continue;
          if (String(row[5]) === String(year) && row[4] === branch) {
              totalRev += Number(row[3]) || 0;
              totalExp += Number(row[2]) || 0;
          }
      }
      return { rev: totalRev, exp: totalExp };
  }

  function extractMonthData(year, month, branch) {
      const monthlyData = getSheetData('الشهرية');
      let totalRev = 0, totalExp = 0, totalCases = 0;
      
      for(let i=1; i<monthlyData.length; i++) {
          let row = monthlyData[i];
          if (!row) continue;
          if (String(row[7]) === String(year) && row[6] === branch) {
              if (month === 'all' || String(row[4]) === String(month)) {
                  if (row[4] !== 'التقفيل' && row[4] !== '') {
                      totalRev += Number(row[3]) || 0;
                      totalExp += Number(row[2]) || 0;
                      totalCases += Number(row[5]) || 0;
                  }
              }
          }
      }
      return { rev: totalRev, exp: totalExp, cases: totalCases };
  }

  function renderOverview() {
    let totalRevAll = 0, totalExpAll = 0, totalCasesAll = 0;
    let chartLabels = [], chartRevs = [], chartExps = [];
    let rev2025 = 0, rev2026 = 0;

    ['2024', '2025', '2026'].forEach(year => {
        let combinedRev = 0, combinedExp = 0, combinedCases = 0;
        ['الجعافرة', 'بهتيم'].forEach(branch => {
            let r = extractYearData(year, branch);
            combinedRev += r.rev;
            combinedExp += r.exp;
            
            let m = extractMonthData(year, 'all', branch);
            combinedCases += m.cases;
        });

        totalRevAll += combinedRev;
        totalExpAll += combinedExp;
        totalCasesAll += combinedCases;
        
        chartLabels.push(year);
        chartRevs.push(combinedRev);
        chartExps.push(combinedExp);
        
        if (year === '2025') rev2025 = combinedRev;
        if (year === '2026') rev2026 = combinedRev;
    });

    const ovRev = document.getElementById('ov-revenue');
    const ovExp = document.getElementById('ov-expenses');
    const ovProf = document.getElementById('ov-profit');
    const ovCases = document.getElementById('ov-cases');
    if (ovRev) ovRev.textContent = totalRevAll.toLocaleString('en-US') + ' ج';
    if (ovExp) ovExp.textContent = totalExpAll.toLocaleString('en-US') + ' ج';
    if (ovProf) ovProf.textContent = (totalRevAll - totalExpAll).toLocaleString('en-US') + ' ج';
    if (ovCases) ovCases.textContent = totalCasesAll.toLocaleString('en-US');

    const alertBox = document.getElementById('overviewAlert');
    if (alertBox) {
        let alertMsg = '';
        if (rev2026 > 0 && rev2025 > 0) {
            const growth = ((rev2026 - rev2025) / rev2025) * 100;
            if (growth > 0) alertMsg = `📈 ممتاز! إيرادات 2026 أعلى من 2025 بنسبة نمو ${growth.toFixed(1)}%.`;
            else alertMsg = `⚠️ تنبيه: إيرادات 2026 أقل من 2025 بنسبة انكماش ${Math.abs(growth).toFixed(1)}%.`;
        } else if (rev2026 > 0) {
            alertMsg = `📊 إجمالي إيراد 2026 حتى الآن: ${rev2026.toLocaleString()} ج.`;
        } else {
            alertMsg = `ℹ️ يرجى رفع ملفات إكسيل تحتوي على بيانات لسنوات متعددة.`;
        }
        alertBox.textContent = alertMsg;
        alertBox.style.display = 'block';
    }

    const ctx = document.getElementById('overviewChart').getContext('2d');
    if (window.ovChart) window.ovChart.destroy();
    window.ovChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: chartLabels, datasets: [ { label: 'الإيرادات', data: chartRevs, backgroundColor: 'rgba(0, 255, 127, 0.7)' }, { label: 'المصروفات', data: chartExps, backgroundColor: 'rgba(248, 113, 113, 0.7)' } ] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff' } } }, scales: { y: { ticks: { color: '#a8b5a8' } }, x: { ticks: { color: '#a8b5a8' } } } }
    });
  }

  window.renderFinancialReport = function() {
    const selectedYear = document.getElementById('yearSelector').value;
    const selectedMonth = document.getElementById('monthSelector').value;
    const selectedBranch = document.getElementById('branchSelector').value;

    let totalRev = 0, totalExp = 0;
    let branchesToProcess = selectedBranch === 'combined' ? ['الجعافرة', 'بهتيم'] : [selectedBranch === 'jaafara' ? 'الجعافرة' : 'بهتيم'];

    branchesToProcess.forEach(b => {
        let res = extractMonthData(selectedYear, selectedMonth, b);
        totalRev += res.rev;
        totalExp += res.exp;
    });

    document.getElementById('fin-revenue').textContent = totalRev.toLocaleString('en-US') + ' ج';
    document.getElementById('fin-expenses').textContent = totalExp.toLocaleString('en-US') + ' ج';
    document.getElementById('fin-profit').textContent = (totalRev - totalExp).toLocaleString('en-US') + ' ج';

    const ctx = document.getElementById('financeChart').getContext('2d');
    if (window.finChart) window.finChart.destroy(); 
    window.finChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: ['الإيرادات', 'المصروفات', 'صافي الربح'], datasets: [{ data: [totalRev, totalExp, (totalRev - totalExp)], backgroundColor: ['rgba(0, 255, 127, 0.5)', 'rgba(248, 113, 113, 0.5)', 'rgba(251, 191, 36, 0.5)'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#a8b5a8' } }, x: { ticks: { color: '#a8b5a8' } } } }
    });
  }

  window.renderAnnualReport = function() {
    const selectedYear = document.getElementById('annualYearSelector').value;
    const selectedBranch = document.getElementById('annualBranchSelector').value;

    let finalRev = 0, finalExp = 0;
    let branchesToProcess = selectedBranch === 'combined' ? ['الجعافرة', 'بهتيم'] : [selectedBranch === 'jaafara' ? 'الجعافرة' : 'بهتيم'];
    
    branchesToProcess.forEach(b => {
        let res = extractYearData(selectedYear, b);
        finalRev += res.rev;
        finalExp += res.exp;
    });

    document.getElementById('annualTableBody').innerHTML = `<tr><td style="color:var(--gold);">${selectedYear}</td><td style="color:#00ff7f;">${finalRev.toLocaleString()} ج</td><td style="color:#f87171;">${finalExp.toLocaleString()} ج</td><td style="color:#fbbf24;">${(finalRev - finalExp).toLocaleString()} ج</td></tr>`;
    
    let labels = ['2024', '2025', '2026'], revs = [], exps = [], profits = [];
    labels.forEach(yr => {
        let yRev = 0, yExp = 0;
        branchesToProcess.forEach(b => {
            let r = extractYearData(yr, b);
            yRev += r.rev; yExp += r.exp;
        });
        revs.push(yRev); exps.push(yExp); profits.push(yRev - yExp);
    });

    const revCtx = document.getElementById('annualRevChart').getContext('2d');
    if (window.anRevChart) window.anRevChart.destroy();
    window.anRevChart = new Chart(revCtx, { type: 'bar', data: { labels: labels, datasets: [ { label: 'الإيرادات', data: revs, backgroundColor: 'rgba(0, 255, 127, 0.7)' }, { label: 'المصروفات', data: exps, backgroundColor: 'rgba(248, 113, 113, 0.7)' } ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff' } } }, scales: { y: { ticks: { color: '#a8b5a8' } }, x: { ticks: { color: '#a8b5a8' } } } } });

    const profCtx = document.getElementById('annualProfitChart').getContext('2d');
    if (window.anProfChart) window.anProfChart.destroy();
    window.anProfChart = new Chart(profCtx, { type: 'line', data: { labels: labels, datasets: [{ label: 'صافي الربح', data: profits, backgroundColor: 'rgba(251, 191, 36, 0.5)', borderColor: '#fbbf24', borderWidth: 3, fill: true, tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff' } } }, scales: { y: { ticks: { color: '#a8b5a8' } }, x: { ticks: { color: '#a8b5a8' } } } } });
  }

  window.renderCaseAnalysis = function() {
    const selectedYear = document.getElementById('casesYearSelector').value;
    const selectedBranch = document.getElementById('casesBranchSelector').value;

    let months = ['يناير', 'فبراير', 'مارس', 'ابريل', 'مايو', 'يونيو', 'يوليو', 'اغسطس', 'سبتمبر', 'اكتوبر', 'نوفمبر', 'ديسمبر'];
    let casesData = Array(12).fill(0);
    
    let branchesToProcess = selectedBranch === 'combined' ? ['الجعافرة', 'بهتيم'] : [selectedBranch === 'jaafara' ? 'الجعافرة' : 'بهتيم'];
    
    branchesToProcess.forEach(b => {
        for(let m=1; m<=12; m++) {
            let res = extractMonthData(selectedYear, m, b);
            casesData[m-1] += res.cases;
        }
    });

    let maxCases = -1, maxMonth = '';
    let minCases = Infinity, minMonth = '';
    
    casesData.forEach((c, idx) => {
        if (c > 0) { 
            if (c > maxCases) { maxCases = c; maxMonth = months[idx]; }
            if (c < minCases) { minCases = c; minMonth = months[idx]; }
        }
    });

    const alertBox = document.getElementById('casesAlert');
    if(maxCases !== -1) {
        alertBox.innerHTML = `📈 <strong>أكثر شهر زحمة:</strong> شهر <strong>${maxMonth}</strong> بعدد <strong>${maxCases} حالة</strong>.<br>
                              📉 <strong>أكثر شهر بنام فيه:</strong> شهر <strong>${minMonth}</strong> بعدد <strong>${minCases} حالة</strong>.<br>
                              💡 <em>نصيحة: ظبط العروض في الشهور الهادية عشان تحرك السوق.</em>`;
        alertBox.style.display = 'block';
    } else {
        alertBox.textContent = 'لا توجد بيانات كافية لعرض تحليل الحالات.';
        alertBox.style.display = 'block';
    }

    const ctx = document.getElementById('casesChart').getContext('2d');
    if (window.casesChartInst) window.casesChartInst.destroy();
    window.casesChartInst = new Chart(ctx, {
        type: 'bar',
        data: { labels: months, datasets: [{ label: 'عدد الحالات', data: casesData, backgroundColor: 'rgba(0, 191, 255, 0.7)', borderColor: '#00bfff', borderWidth: 2, borderRadius: 8 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#a8b5a8' } }, x: { ticks: { color: '#a8b5a8' } } } }
    });
  }

  // ========== Expense Breakdown Functions ==========

  function extractExpenseBreakdown(year, month, branch) {
      const wb = year === '2025' ? detailedWorkbook2025 : year === '2026' ? detailedWorkbook2026 : null;
      if (!wb) return null;
      
      const monthsAr = ['يناير', 'فبراير', 'مارس', 'ابريل', 'مايو', 'يونيو', 'يوليو', 'اغسطس', 'سبتمبر', 'اكتوبر', 'نوفمبر', 'ديسمبر'];
      const monthName = monthsAr[parseInt(month) - 1];
      
      let sheetName = null;
      for (const name of wb.SheetNames) {
          const trimmed = name.trim();
          if (trimmed.includes(monthName) && trimmed.includes(String(year))) {
              sheetName = name;
              break;
          }
          if (year === '2025' && month === '10' && trimmed.includes('اكتوبر') && trimmed.includes('205')) {
              sheetName = name;
              break;
          }
      }
      
      if (!sheetName) return null;
      
      const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
      
      const branchKey = branch === 'الجعافرة' ? 'الجعافرة' : 'بهتيم';
      let branchStart = -1;
      for (let i = 0; i < data.length; i++) {
          if (data[i] && data[i][0] && String(data[i][0]).includes('معامل طيبة') && String(data[i][0]).includes(branchKey)) {
              branchStart = i;
              break;
          }
      }
      
      if (branchStart === -1) return null;
      
      let branchEnd = data.length;
      if (branch === 'الجعافرة') {
          for (let i = branchStart + 1; i < data.length; i++) {
              if (data[i] && data[i][0] && String(data[i][0]).includes('معامل طيبة') && String(data[i][0]).includes('بهتيم')) {
                  branchEnd = i;
                  break;
              }
          }
      }
      
      let fixedStart = -1;
      for (let i = branchStart; i < branchEnd; i++) {
          if (data[i] && data[i][0] && String(data[i][0]).trim() === 'بيان المصروفات الثابتة') {
              fixedStart = i;
              break;
          }
      }
      
      let chemicals = 0;
      let salaries = 0;
      const misc = {};
      
      if (fixedStart !== -1) {
          for (let i = fixedStart + 2; i < Math.min(fixedStart + 10, branchEnd); i++) {
              const row = data[i];
              if (!row) break;
              
              const gStr = row[6] ? String(row[6]).trim() : '';
              const iStr = row[8] ? String(row[8]).trim() : '';
              if (gStr === 'الاجمالي' || iStr === 'الاجمالي') break;
              
              const eVal = num(row[4]);
              if (eVal > 0) chemicals += eVal;
              
              const fVal = num(row[5]);
              if (fVal > 0 && gStr) {
                  misc[gStr] = (misc[gStr] || 0) + fVal;
              }
              
              const hVal = num(row[7]);
              if (hVal > 0 && iStr) {
                  salaries += hVal;
              }
          }
      } else {
          let specialStart = -1;
          for (let i = branchStart; i < branchEnd; i++) {
              if (data[i] && data[i][0] && String(data[i][0]).includes('المرتبات+الايجار')) {
                  specialStart = i;
                  break;
              }
          }
          
          if (specialStart === -1) return null;
          
          for (let i = specialStart + 1; i < Math.min(specialStart + 12, branchEnd); i++) {
              const row = data[i];
              if (!row) break;
              
              const aLabel = row[0] ? String(row[0]).trim() : '';
              const bVal = num(row[1]);
              const cVal = num(row[2]);
              
              if (aLabel === 'اجمالي مرتبات' || aLabel === 'اجمالي') break;
              
              if (cVal > 0) chemicals += cVal;
              
              if (bVal > 0 && aLabel) {
                  if (aLabel.includes('ايجار') || aLabel.includes('إيجار')) {
                      misc['ايجار'] = (misc['ايجار'] || 0) + bVal;
                  } else if (aLabel.includes('كهربا')) {
                      misc['كهربا'] = (misc['كهربا'] || 0) + bVal;
                  } else if (aLabel.includes('مياة') || aLabel.includes('مياه')) {
                      misc['مياة'] = (misc['مياة'] || 0) + bVal;
                  } else if (aLabel.includes('د/') || aLabel.includes('ا/')) {
                      salaries += bVal;
                  } else {
                      misc[aLabel] = (misc[aLabel] || 0) + bVal;
                  }
              }
          }
      }
      
      return { chemicals, salaries, misc };
  }

  window.renderExpenseBreakdown = function() {
      const yearEl = document.getElementById('expenseYearSelector');
      const monthEl = document.getElementById('expenseMonthSelector');
      if (!yearEl || !monthEl) return;
      
      const year = yearEl.value;
      const month = monthEl.value;
      
      const alertBox = document.getElementById('expenseAlert');
      if (alertBox) {
          if (!detailedWorkbook2025 && !detailedWorkbook2026) {
              alertBox.innerHTML = `⚠️ لازم ترفع ملفات التفصيل (2025 و/أو 2026) عشان تشوف تفصيل المصاريف.`;
              alertBox.style.display = 'block';
          } else if (year === '2025' && !detailedWorkbook2025) {
              alertBox.innerHTML = `⚠️ مفيش ملف تفصيل 2025 مرفوع.`;
              alertBox.style.display = 'block';
          } else if (year === '2026' && !detailedWorkbook2026) {
              alertBox.innerHTML = `⚠️ مفيش ملف تفصيل 2026 مرفوع.`;
              alertBox.style.display = 'block';
          } else {
              alertBox.style.display = 'none';
          }
      }
      
      const branches = [
          { name: 'الجعافرة', canvasId: 'expensePieJaafara', chartVar: 'expensePieJaafaraChart' },
          { name: 'بهتيم', canvasId: 'expensePieBahtim', chartVar: 'expensePieBahtimChart' }
      ];
      
      const tableData = {};
      
      branches.forEach(b => {
          const breakdown = extractExpenseBreakdown(year, month, b.name);
          const canvas = document.getElementById(b.canvasId);
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          
          if (window[b.chartVar]) window[b.chartVar].destroy();
          
          if (!breakdown) {
              window[b.chartVar] = new Chart(ctx, {
                  type: 'doughnut',
                  data: { labels: ['لا توجد بيانات'], datasets: [{ data: [1], backgroundColor: ['#475569'] }] },
                  options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff' } } } }
              });
              tableData[b.name] = { cats: [], total: 0 };
              return;
          }
          
          const cats = [];
          if (breakdown.salaries > 0) cats.push({ name: 'مرتبات', value: breakdown.salaries, color: '#22c55e' });
          if (breakdown.chemicals > 0) cats.push({ name: 'كيماويات', value: breakdown.chemicals, color: '#00bfff' });
          
          const miscColors = {
              'ايجار': '#fbbf24',
              'كهربا': '#f87171',
              'مياة': '#a78bfa',
              'مياه': '#a78bfa',
              'صيانة': '#f472b6',
              'مطبوعات': '#fb923c',
              'مروحة': '#94a3b8',
              'صيانة اجهزة': '#f472b6'
          };
          
          if (breakdown.misc) {
              Object.keys(breakdown.misc).forEach(k => {
                  if (breakdown.misc[k] > 0) {
                      cats.push({ name: k, value: breakdown.misc[k], color: miscColors[k] || '#64748b' });
                  }
              });
          }
          
          const monthly = extractMonthData(year, month, b.name);
          const fixedSum = cats.reduce((a,c) => a + c.value, 0);
          const daily = Math.max(0, monthly.exp - fixedSum);
          if (daily > 0) cats.push({ name: 'مصاريف يومية', value: daily, color: '#64748b' });
          
          tableData[b.name] = { cats, total: monthly.exp };
          
          window[b.chartVar] = new Chart(ctx, {
              type: 'doughnut',
              data: {
                  labels: cats.map(c => c.name),
                  datasets: [{
                      data: cats.map(c => c.value),
                      backgroundColor: cats.map(c => c.color),
                      borderColor: '#0f172a',
                      borderWidth: 2
                  }]
              },
              options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                      legend: {
                          position: 'bottom',
                          labels: { color: '#fff', font: { size: 12 }, padding: 10 }
                      },
                      tooltip: {
                          callbacks: {
                              label: (ctx) => {
                                  const v = ctx.parsed;
                                  const total = ctx.dataset.data.reduce((a,b) => a+b, 0);
                                  const pct = total > 0 ? (v / total * 100).toFixed(1) : 0;
                                  return `${ctx.label}: ${v.toLocaleString()} ج (${pct}%)`;
                              }
                          }
                      }
                  }
              }
          });
      });
      
      const tbody = document.getElementById('expenseBreakdownTableBody');
      if (tbody) {
          const allCatNames = new Set();
          Object.values(tableData).forEach(d => {
              (d.cats || []).forEach(c => allCatNames.add(c.name));
          });
          
          let html = '';
          Array.from(allCatNames).forEach(catName => {
              const jVal = (tableData['الجعافرة']?.cats || []).find(c => c.name === catName)?.value || 0;
              const bVal = (tableData['بهتيم']?.cats || []).find(c => c.name === catName)?.value || 0;
              const total = jVal + bVal;
              html += `<tr>
                  <td style="text-align:right; color:var(--text);">${catName}</td>
                  <td style="color:#00ff7f;">${jVal.toLocaleString()} ج</td>
                  <td style="color:#fbbf24;">${bVal.toLocaleString()} ج</td>
                  <td style="color:#00bfff; font-weight:bold;">${total.toLocaleString()} ج</td>
              </tr>`;
          });
          html += `<tr style="background:rgba(0,255,127,0.1); font-weight:bold;">
              <td style="text-align:right; color:var(--primary-glow);">الإجمالي</td>
              <td style="color:#00ff7f;">${(tableData['الجعافرة']?.total || 0).toLocaleString()} ج</td>
              <td style="color:#fbbf24;">${(tableData['بهتيم']?.total || 0).toLocaleString()} ج</td>
              <td style="color:#00bfff;">${((tableData['الجعافرة']?.total || 0) + (tableData['بهتيم']?.total || 0)).toLocaleString()} ج</td>
          </tr>`;
          tbody.innerHTML = html;
      }
  };

  // ========== Marketing & Sales ==========

  function getTestMovementData() {
    const data = getSheetData('تكرار التحاليل');
    let testData = [];
    for (let i = 2; i < data.length; i++) {
        const row = data[i];
        if (row && row[0] && typeof row[0] === 'string' && row[0].trim() !== '') {
            let count = Number(row[2]) || Number(row[1]) || 0;
            testData.push({ name: row[0].trim(), count: count });
        }
    }
    return testData;
  }

  window.renderTopSellers = function() {
    const tbody = document.getElementById('topSellersTableBody');
    let tests = getTestMovementData();
    if(!tests || tests.length === 0) { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px;">لا توجد بيانات</td></tr>'; return; }
    
    tests.sort((a, b) => b.count - a.count);
    let html = '';
    tests.slice(0, 20).forEach((test, index) => {
        html += `<tr><td style="color:var(--gold);">${index + 1}</td><td style="color: var(--text); text-align:right;">${test.name}</td><td style="color: #00bfff; font-weight:bold;">${test.count}</td></tr>`;
    });
    tbody.innerHTML = html;
  }

  function getMergedData() {
      if (!pricesWorkbook) return [];
      let tests = getTestMovementData();
      if (!tests || tests.length === 0) return [];

      let priceSheetName = pricesWorkbook.SheetNames.find(n => n.includes('التحاليل')) || pricesWorkbook.SheetNames[0];
      const priceData = XLSX.utils.sheet_to_json(pricesWorkbook.Sheets[priceSheetName], { header: 1, defval: "" });
      
      let priceMap = {};
      for (let i = 1; i < priceData.length; i++) {
          const row = priceData[i];
          if (row && row[0]) {
              const testName = String(row[0]).trim().toLowerCase();
              const cost = Number(row[1]) || 0;
              const sellPrice = Number(row[2]) || 0;
              if (sellPrice > 0) priceMap[testName] = { cost, sellPrice };
          }
      }

      let merged = [];
      tests.forEach(t => {
          let searchName = t.name.trim().toLowerCase();
          if (priceMap[searchName]) {
              const cost = priceMap[searchName].cost;
              const sell = priceMap[searchName].sellPrice;
              const profitUnit = sell - cost;
              merged.push({ name: t.name, count: t.count, cost: cost, sell: sell, profitUnit: profitUnit, totalProfit: profitUnit * t.count });
          }
      });
      return merged;
  }

  window.renderMostProfitable = function() {
    const tbody = document.getElementById('mostProfitableTableBody');
    let data = getMergedData();
    if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">لا توجد تطابق بين الأسماء في الملفين</td></tr>'; return; }
    data.sort((a, b) => b.totalProfit - a.totalProfit);
    let html = '';
    data.slice(0, 20).forEach((test, index) => {
        html += `<tr><td style="color:var(--gold);">${index + 1}</td><td style="color: var(--text); text-align:right;">${test.name}</td><td style="color: #00ff7f;">${test.sell} ج</td><td style="color: #f87171;">${test.cost} ج</td><td style="color: #fbbf24;">${test.profitUnit} ج</td><td style="color: #00ff7f; font-weight:bold;">${test.totalProfit.toLocaleString()} ج</td></tr>`;
    });
    tbody.innerHTML = html;
  }

  window.renderLeastProfitable = function() {
    const tbody = document.getElementById('leastProfitableTableBody');
    let data = getMergedData();
    if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">لا توجد تطابق بين الأسماء في الملفين</td></tr>'; return; }
    let profitableOnly = data.filter(t => t.profitUnit > 0);
    profitableOnly.sort((a, b) => a.totalProfit - b.totalProfit);
    let html = '';
    profitableOnly.slice(0, 20).forEach((test, index) => {
        html += `<tr><td style="color:var(--gold);">${index + 1}</td><td style="color: var(--text); text-align:right;">${test.name}</td><td style="color: #00ff7f;">${test.sell} ج</td><td style="color: #f87171;">${test.cost} ج</td><td style="color: #fbbf24;">${test.profitUnit} ج</td><td style="color: #fbbf24; font-weight:bold;">${test.totalProfit.toLocaleString()} ج</td></tr>`;
    });
    tbody.innerHTML = html;
  }

  window.renderNeedOffers = function() {
    const tbody = document.getElementById('needOffersTableBody');
    let data = getMergedData();
    if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px;">لا توجد تطابق بين الأسماء في الملفين</td></tr>'; return; }
    let needs = data.filter(t => t.count < 5 && t.sell > 0);
    needs.sort((a, b) => a.count - b.count);
    let html = '';
    needs.slice(0, 50).forEach((test) => {
        html += `<tr><td style="color: var(--text); text-align:right;">${test.name}</td><td style="color: #00ff7f;">${test.sell} ج</td><td style="color: #f87171; font-weight:bold;">${test.count} مرات</td></tr>`;
    });
    tbody.innerHTML = html;
  }

  window.renderLossMakers = function() {
    const tbody = document.getElementById('lossMakersTableBody');
    let data = getMergedData();
    if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">لا توجد تطابق بين الأسماء في الملفين</td></tr>'; return; }
    let losers = data.filter(t => t.cost > t.sell);
    losers.sort((a, b) => a.profitUnit - b.profitUnit);
    let html = '';
    losers.forEach((test) => {
        html += `<tr><td style="color: var(--text); text-align:right;">${test.name}</td><td style="color: #00ff7f;">${test.sell} ج</td><td style="color: #f87171;">${test.cost} ج</td><td style="color: #ef4444; font-weight:bold;">${test.profitUnit} ج</td></tr>`;
    });
    tbody.innerHTML = html;
  }

  // ========== AI Assistant ==========

  window.openAIAssistant = function() {
    const modal = document.getElementById('aiModal');
    const body = document.getElementById('aiModalBody');
    modal.classList.add('show');
    if (!salesWorkbook) {
        body.innerHTML = `<p style="color:#f87171; font-weight:bold;">⚠️ ارفع الملفات أولاً.</p>`;
        return;
    }
    
    let insights = `<h3 style="color:var(--primary-glow); margin-bottom:15px;">🧠 تحليل سريع لبياناتك</h3>`;
    
    if (detailedWorkbook2026 || detailedWorkbook2025) {
        let latestYear = detailedWorkbook2026 ? '2026' : '2025';
        let latestMonth = detailedWorkbook2026 ? '9' : '12';
        let monthName = ['يناير','فبراير','مارس','ابريل','مايو','يونيو','يوليو','اغسطس','سبتمبر','اكتوبر','نوفمبر','ديسمبر'][parseInt(latestMonth)-1];
        
        insights += `<p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:15px;">بناءً على بيانات <strong>${monthName} ${latestYear}</strong>:</p>`;
        
        ['الجعافرة', 'بهتيم'].forEach(branch => {
            const breakdown = extractExpenseBreakdown(latestYear, latestMonth, branch);
            if (breakdown) {
                const allCats = [
                    { name: 'مرتبات', value: breakdown.salaries || 0 },
                    { name: 'كيماويات', value: breakdown.chemicals || 0 },
                    ...Object.keys(breakdown.misc || {}).map(k => ({ name: k, value: breakdown.misc[k] }))
                ].filter(c => c.value > 0).sort((a,b) => b.value - a.value);
                
                if (allCats.length > 0) {
                    const top = allCats[0];
                    insights += `<div style="background:rgba(251,191,36,0.1); border-right:3px solid #fbbf24; padding:12px; border-radius:8px; margin-bottom:10px;">
                        <strong style="color:var(--gold);">🏥 فرع ${branch}:</strong> أكبر بند مصاريف هو <span style="color:#fbbf24; font-weight:bold;">${top.name}</span> بقيمة ${top.value.toLocaleString()} ج.
                    </div>`;
                }
            }
        });
    } else {
        insights += `<p style="color:var(--text-muted);">ℹ️ ارفع ملفات التفصيل (2025 و/أو 2026) عشان تحصل على تحليل أعمق للمصاريف.</p>`;
    }
    
    insights += `<p style="text-align:center; margin-top:25px; color:var(--text-muted); font-size:0.9rem; border-top:1px solid var(--border); padding-top:15px;">معامل طيبة دايماً في تقدم! 🚀</p>`;
    body.innerHTML = insights;
  };

  window.closeAIAssistant = function() { document.getElementById('aiModal').classList.remove('show'); };

  // ========== Resize Handler (يصلح مشاكل الشاشة) ==========
  
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    const currentWidth = window.innerWidth;
    if (lastWidth !== currentWidth) {
      if (currentWidth > 900) {
        const sidebar = document.getElementById('adminSidebar');
        const overlay = document.getElementById('mobileOverlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('show');
      }
      lastWidth = currentWidth;
    }
  });

  // ========== Init ==========
  
  if(sessionStorage.getItem(SESSION_KEY) === 'yes') showDashboard();
  const passInput = document.getElementById('adminPassword');
  if(passInput) passInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') window.checkAdminPassword(); });

})();