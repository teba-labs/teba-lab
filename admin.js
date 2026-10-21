/* =====================================================
   TEBA LABS - Admin Logic (v32 - AI Fair Comparison)
   ===================================================== */

(function(){
  'use strict';

  const ADMIN_PASSWORD = 'teba2026admin';
  const SESSION_KEY = 'teba_admin_session';

  let salesWorkbook = null;
  let pricesWorkbook = null;

  // =====================================================
  // قاعدة البيانات (IndexedDB)
  // =====================================================
  const DB_NAME = 'TebaAdminDB_v7'; 
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

  function normalizeText(str) {
      if (!str) return '';
      return str.toString().trim().toLowerCase()
          .replace(/[\u064B-\u065F\u0670]/g, '')
          .replace(/[أإآٱ]/g, 'ا')
          .replace(/ى/g, 'ي')
          .replace(/ة/g, 'ه')
          .replace(/ؤ/g, 'و')
          .replace(/ئ/g, 'ي')
          .replace(/[^\u0600-\u06FF\w\s]/g, '')
          .replace(/\s+/g, ' ').trim();
  }

  // =====================================================
  // التنقل والتسجيل
  // =====================================================
  window.showReport = function(reportName){
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('report-' + reportName);
    if(target) target.classList.add('active');
    document.querySelectorAll('.admin-nav button').forEach(b => b.classList.toggle('active', b.dataset.report === reportName));
    
    if(reportName === 'overview') renderOverview();
    if(reportName === 'annual') renderAnnualReport();
    if(reportName === 'financial') renderFinancialReport();
    if(reportName === 'topSellers') renderTopSellers();
    if(reportName === 'mostProfitable') renderMostProfitable();
    if(reportName === 'leastProfitable') renderLeastProfitable();
    if(reportName === 'needOffers') renderNeedOffers();
    if(reportName === 'lossMakers') renderLossMakers();
    
    if(window.innerWidth <= 900) document.getElementById('adminSidebar').classList.remove('open');
  };

  window.toggleAdminSidebar = function(){ document.getElementById('adminSidebar').classList.toggle('open'); };

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
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => location.reload();
    }
  };

  window.handleFileUpload = function(event, type){
    const file = event.target.files[0];
    if(!file) return;
    
    const statusEl = document.getElementById(type === 'sales' ? 'uploadStatusSales' : 'uploadStatusPrices');
    statusEl.className = 'upload-status';
    statusEl.textContent = '⏳ جاري القراءة والحفظ...';

    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const arrayBuffer = e.target.result;
        await saveFileToDB(type === 'sales' ? 'salesData' : 'pricesData', arrayBuffer);
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        statusEl.className = 'upload-status success';
        statusEl.innerHTML = `✅ تم رفع وحفظ الملف بنجاح!`;
        
        if(type === 'sales') salesWorkbook = workbook;
        if(type === 'prices') pricesWorkbook = workbook;
        
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
        
        if(salesBuffer) {
            salesWorkbook = XLSX.read(salesBuffer, { type: 'array' });
            document.getElementById('uploadStatusSales').className = 'upload-status success';
            document.getElementById('uploadStatusSales').innerHTML = '✅ ملف المبيعات محمل.';
        }
        if(pricesBuffer) {
            pricesWorkbook = XLSX.read(pricesBuffer, { type: 'array' });
            document.getElementById('uploadStatusPrices').className = 'upload-status success';
            document.getElementById('uploadStatusPrices').innerHTML = '✅ ملف الأسعار محمل.';
        }
        renderAllReports();
    } catch(e) { console.log("لا توجد بيانات."); }
  }

  function renderAllReports() {
      renderOverview();
      renderFinancialReport();
      renderAnnualReport();
      renderTopSellers();
      renderMostProfitable();
      renderLeastProfitable();
      renderNeedOffers();
      renderLossMakers();
  }

  // =====================================================
  // 1. غرفة العمليات (Overview) 
  // =====================================================
  function renderOverview() {
    if (!salesWorkbook) return;
    const sheetName = salesWorkbook.SheetNames.find(n => n.includes('المتابعة'));
    if (!sheetName) return;
    
    const data = XLSX.utils.sheet_to_json(salesWorkbook.Sheets[sheetName], { header: 1 });
    
    const yearsData = [
        { year: '2024', row: data[41] }, 
        { year: '2025', row: data[58] }, 
        { year: '2026', row: data[75] }  
    ];

    let totalRev = 0, totalExp = 0, totalCases = 0;
    let rev2025 = 0, rev2026 = 0;
    let chartLabels = [];
    let chartRevs = [];
    let chartExps = [];

    yearsData.forEach(y => {
        if (!y.row) return;
        
        const bRev = Math.round(Number(y.row[0])||0), bExp = Math.round(Number(y.row[2])||0);
        const jRev = Math.round(Number(y.row[14])||0), jExp = Math.round(Number(y.row[12])||0);
        const cases = Math.round(Number(y.row[17])||0); 

        const yearRev = bRev + jRev;
        const yearExp = bExp + jExp;
        
        totalRev += yearRev;
        totalExp += yearExp;
        totalCases += cases;

        chartLabels.push(y.year);
        chartRevs.push(yearRev);
        chartExps.push(yearExp);

        if (y.year === '2025') rev2025 = yearRev;
        if (y.year === '2026') rev2026 = yearRev;
    });

    const totalProfit = totalRev - totalExp;

    document.getElementById('ov-revenue').textContent = totalRev.toLocaleString('en-US') + ' ج';
    document.getElementById('ov-expenses').textContent = totalExp.toLocaleString('en-US') + ' ج';
    document.getElementById('ov-profit').textContent = totalProfit.toLocaleString('en-US') + ' ج';
    document.getElementById('ov-cases').textContent = totalCases.toLocaleString('en-US');

    const alertBox = document.getElementById('overviewAlert');
    let alertMsg = '';
    if (rev2026 > 0 && rev2025 > 0) {
        const growth = ((rev2026 - rev2025) / rev2025) * 100;
        if (growth > 0) alertMsg = `📈 ممتاز! إيرادات 2026 أعلى من 2025 بنسبة نمو ${growth.toFixed(1)}%. استمروا على هذا الأداء.`;
        else alertMsg = `⚠️ تنبيه: إيرادات 2026 أقل من 2025 بنسبة انكماش ${Math.abs(growth).toFixed(1)}%. راجعوا خطة التسويق.`;
    } else if (rev2026 > 0) {
        alertMsg = `📊 إجمالي إيراد 2026 حتى الآن: ${rev2026.toLocaleString()} ج.`;
    } else {
        alertMsg = `ℹ️ يرجى رفع ملفات إكسيل تحتوي على بيانات لسنوات متعددة لرؤية مقارنات الأداء.`;
    }
    alertBox.textContent = alertMsg;
    alertBox.style.display = 'block';

    const ctx = document.getElementById('overviewChart').getContext('2d');
    if (window.ovChart) window.ovChart.destroy();
    window.ovChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [
                { label: 'الإيرادات', data: chartRevs, backgroundColor: 'rgba(0, 255, 127, 0.7)', borderColor: '#00ff7f', borderWidth: 1, borderRadius: 6 },
                { label: 'المصروفات', data: chartExps, backgroundColor: 'rgba(248, 113, 113, 0.7)', borderColor: '#f87171', borderWidth: 1, borderRadius: 6 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff', font: { family: 'Almarai' } } } }, scales: { y: { ticks: { color: '#a8b5a8' } }, x: { ticks: { color: '#a8b5a8' } } } }
    });
  }

  // =====================================================
  // 2. التقارير المالية (الشهري والسنوي)
  // =====================================================
  window.renderFinancialReport = function() {
    if (!salesWorkbook) return;
    const sheetName = salesWorkbook.SheetNames.find(n => n.includes('المتابعة'));
    if (!sheetName) return;

    const selectedYear = document.getElementById('yearSelector').value;
    const selectedMonth = document.getElementById('monthSelector').value;
    const selectedBranch = document.getElementById('branchSelector').value;
    const data = XLSX.utils.sheet_to_json(salesWorkbook.Sheets[sheetName], { header: 1 });

    let startRow = selectedYear === '2024' ? 29 : selectedYear === '2025' ? 46 : 63;
    let totalRevenue = 0, totalExpenses = 0;
    const getNum = (val) => Math.round(Number(val) || 0);

    const processMonth = (monthIndex) => {
        const row = data[startRow + monthIndex - 1] || [];
        const bRev = getNum(row[0]), bExp = getNum(row[2]);
        const jRev = getNum(row[14]), jExp = getNum(row[12]);
        
        if (selectedBranch === 'combined') { totalRevenue += (jRev + bRev); totalExpenses += (jExp + bExp); }
        else if (selectedBranch === 'jaafara') { totalRevenue += jRev; totalExpenses += jExp; }
        else if (selectedBranch === 'bahtim') { totalRevenue += bRev; totalExpenses += bExp; }
    };

    if (selectedMonth === 'all') { for (let i = 1; i <= 12; i++) processMonth(i); } else { processMonth(parseInt(selectedMonth)); }

    document.getElementById('fin-revenue').textContent = totalRevenue.toLocaleString('en-US') + ' ج';
    document.getElementById('fin-expenses').textContent = totalExpenses.toLocaleString('en-US') + ' ج';
    document.getElementById('fin-profit').textContent = (totalRevenue - totalExpenses).toLocaleString('en-US') + ' ج';

    const ctx = document.getElementById('financeChart').getContext('2d');
    if (window.finChart) window.finChart.destroy(); 
    window.finChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['الإيرادات', 'المصروفات', 'صافي الربح'],
            datasets: [{ label: 'بالجنيه', data: [totalRevenue, totalExpenses, (totalRevenue - totalExpenses)], backgroundColor: ['rgba(0, 255, 127, 0.5)', 'rgba(248, 113, 113, 0.5)', 'rgba(251, 191, 36, 0.5)'], borderColor: ['#00ff7f', '#f87171', '#fbbf24'], borderWidth: 2, borderRadius: 8 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#a8b5a8' } }, x: { ticks: { color: '#a8b5a8' } } } }
    });
  }

  window.renderAnnualReport = function() {
    if (!salesWorkbook) return;
    const sheetName = salesWorkbook.SheetNames.find(n => n.includes('المتابعة'));
    if (!sheetName) return;
    
    const selectedYear = document.getElementById('annualYearSelector').value;
    const selectedBranch = document.getElementById('annualBranchSelector').value;
    
    const data = XLSX.utils.sheet_to_json(salesWorkbook.Sheets[sheetName], { header: 1 });
    
    let rowIdx = selectedYear === '2024' ? 41 : selectedYear === '2025' ? 58 : 75;
    let row = data[rowIdx];
    
    let bRev = 0, bExp = 0, bProfit = 0;
    let jRev = 0, jExp = 0, jProfit = 0;
    
    if(row) {
        bRev = Math.round(Number(row[0])||0); bExp = Math.round(Number(row[2])||0); bProfit = Math.round(Number(row[4])||0);
        jRev = Math.round(Number(row[14])||0); jExp = Math.round(Number(row[12])||0); jProfit = Math.round(Number(row[10])||0);
    }
    
    let finalRev = 0, finalExp = 0, finalProfit = 0;
    
    if(selectedBranch === 'combined') {
        finalRev = bRev + jRev; finalExp = bExp + jExp; finalProfit = bProfit + jProfit;
    } else if (selectedBranch === 'jaafara') {
        finalRev = jRev; finalExp = jExp; finalProfit = jProfit;
    } else if (selectedBranch === 'bahtim') {
        finalRev = bRev; finalExp = bExp; finalProfit = bProfit;
    }

    let html = `<tr>
        <td style="color:var(--gold); font-weight:bold;">${selectedYear}</td>
        <td style="color:#00ff7f;">${finalRev.toLocaleString()} ج</td>
        <td style="color:#f87171;">${finalExp.toLocaleString()} ج</td>
        <td style="color:#fbbf24; font-weight:bold;">${finalProfit.toLocaleString()} ج</td>
    </tr>`;
    
    document.getElementById('annualTableBody').innerHTML = html;
    
    let labels = ['2024', '2025', '2026'];
    let revs = [], exps = [], profits = [];
    [41, 58, 75].forEach(idx => {
        let r = data[idx];
        if(!r) return;
        let br = Number(r[0])||0, be = Number(r[2])||0, bp = Number(r[4])||0;
        let jr = Number(r[14])||0, je = Number(r[12])||0, jp = Number(r[10])||0;
        if(selectedBranch === 'combined') { revs.push(br+jr); exps.push(be+je); profits.push(bp+jp); }
        else if (selectedBranch === 'jaafara') { revs.push(jr); exps.push(je); profits.push(jp); }
        else { revs.push(br); exps.push(be); profits.push(bp); }
    });

    const revCtx = document.getElementById('annualRevChart').getContext('2d');
    if (window.anRevChart) window.anRevChart.destroy();
    window.anRevChart = new Chart(revCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'الإيرادات', data: revs, backgroundColor: 'rgba(0, 255, 127, 0.7)', borderColor: '#00ff7f', borderWidth: 1 },
                { label: 'المصروفات', data: exps, backgroundColor: 'rgba(248, 113, 113, 0.7)', borderColor: '#f87171', borderWidth: 1 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff' } } }, scales: { y: { ticks: { color: '#a8b5a8' } }, x: { ticks: { color: '#a8b5a8' } } } }
    });

    const profCtx = document.getElementById('annualProfitChart').getContext('2d');
    if (window.anProfChart) window.anProfChart.destroy();
    window.anProfChart = new Chart(profCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{ label: 'صافي الربح', data: profits, backgroundColor: 'rgba(251, 191, 36, 0.5)', borderColor: '#fbbf24', borderWidth: 3, fill: true, tension: 0.3 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff' } } }, scales: { y: { ticks: { color: '#a8b5a8' } }, x: { ticks: { color: '#a8b5a8' } } } }
    });
  }

  // =====================================================
  // دوال مساعدة للتحاليل
  // =====================================================
  function getTestMovementData() {
    if (!salesWorkbook) return null;
    const sheetName = salesWorkbook.SheetNames.find(n => n.includes('المتابعة'));
    if (!sheetName) return null;
    const data = XLSX.utils.sheet_to_json(salesWorkbook.Sheets[sheetName], { header: 1 });
    
    let testData = [];
    let nameCol = 19, count3Col = 20;

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row && row[nameCol] && typeof row[nameCol] === 'string' && row[nameCol].trim() !== '' && row[nameCol] !== 'اسم التحليل') {
            let countVal = row[count3Col];
            let count = (typeof countVal === 'number') ? countVal : 0;
            
            testData.push({ 
                name: row[nameCol].trim(), 
                normName: normalizeText(row[nameCol]),
                count: count
            });
        }
    }
    return testData;
  }

  function renderTopSellers() {
    const tbody = document.getElementById('topSellersTableBody');
    if (!salesWorkbook) { tbody.innerHTML = ''; return; }
    
    let tests = getTestMovementData();
    if(!tests) return;

    tests.sort((a, b) => b.count - a.count);
    let html = '';
    tests.slice(0, 20).forEach((test, index) => {
        html += `<tr><td style="font-weight:bold; color:var(--gold);">${index + 1}</td><td style="color: var(--text); text-align:right;">${test.name}</td><td style="color: #00bfff; font-weight:bold;">${test.count}</td></tr>`;
    });
    tbody.innerHTML = html;
  }

  function getMergedData() {
      if (!salesWorkbook || !pricesWorkbook) return null;
      let tests = getTestMovementData();
      if (!tests) return [];

      let priceSheetName = pricesWorkbook.SheetNames.find(n => n.includes('التحاليل')) || pricesWorkbook.SheetNames[0];
      const priceData = XLSX.utils.sheet_to_json(pricesWorkbook.Sheets[priceSheetName], { header: 1 });
      
      let priceMap = {};
      for (let i = 1; i < priceData.length; i++) {
          const row = priceData[i];
          if (row && row[0]) {
              const testName = String(row[0]).trim();
              const cost = Number(row[1]) || 0;
              const sellPrice = Number(row[2]) || 0;
              if (sellPrice > 0) {
                  priceMap[normalizeText(testName)] = { cost, sellPrice };
              }
          }
      }

      let merged = [];
      tests.forEach(t => {
          if (priceMap[t.normName]) {
              const cost = priceMap[t.normName].cost;
              const sell = priceMap[t.normName].sellPrice;
              const profitUnit = sell - cost;
              merged.push({
                  name: t.name,
                  count: t.count,
                  cost: cost,
                  sell: sell,
                  profitUnit: profitUnit,
                  totalProfit: profitUnit * t.count
              });
          }
      });
      return merged;
  }

  function renderMostProfitable() {
    const tbody = document.getElementById('mostProfitableTableBody');
    if (!salesWorkbook || !pricesWorkbook) { tbody.innerHTML = ''; return; }
    
    let data = getMergedData();
    if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="6">لا توجد تطابق</td></tr>'; return; }

    data.sort((a, b) => b.totalProfit - a.totalProfit);
    let html = '';
    data.slice(0, 20).forEach((test, index) => {
        html += `<tr><td style="font-weight:bold; color:var(--gold);">${index + 1}</td><td style="color: var(--text); text-align:right;">${test.name}</td><td style="color: #00ff7f;">${test.sell} ج</td><td style="color: #f87171;">${test.cost} ج</td><td style="color: #fbbf24;">${test.profitUnit} ج</td><td style="color: #00ff7f; font-weight:bold; font-size:1.1rem;">${test.totalProfit.toLocaleString()} ج</td></tr>`;
    });
    tbody.innerHTML = html;
  }

  function renderLeastProfitable() {
    const tbody = document.getElementById('leastProfitableTableBody');
    if (!salesWorkbook || !pricesWorkbook) { tbody.innerHTML = ''; return; }
    
    let data = getMergedData();
    if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="6">لا توجد تطابق</td></tr>'; return; }

    let profitableOnly = data.filter(t => t.profitUnit > 0);
    profitableOnly.sort((a, b) => a.totalProfit - b.totalProfit);
    
    let html = '';
    profitableOnly.slice(0, 20).forEach((test, index) => {
        html += `<tr><td style="font-weight:bold; color:var(--gold);">${index + 1}</td><td style="color: var(--text); text-align:right;">${test.name}</td><td style="color: #00ff7f;">${test.sell} ج</td><td style="color: #f87171;">${test.cost} ج</td><td style="color: #fbbf24;">${test.profitUnit} ج</td><td style="color: #fbbf24; font-weight:bold; font-size:1.1rem;">${test.totalProfit.toLocaleString()} ج</td></tr>`;
    });
    tbody.innerHTML = html;
  }

  function renderNeedOffers() {
    const tbody = document.getElementById('needOffersTableBody');
    if (!salesWorkbook || !pricesWorkbook) { tbody.innerHTML = ''; return; }
    
    let data = getMergedData();
    if (!data) return;

    let needs = data.filter(t => t.count < 5 && t.sell > 0);
    needs.sort((a, b) => a.count - b.count);

    let html = '';
    needs.slice(0, 50).forEach((test) => {
        html += `<tr><td style="color: var(--text); text-align:right;">${test.name}</td><td style="color: #00ff7f;">${test.sell} ج</td><td style="color: #f87171; font-weight:bold;">${test.count} مرات</td></tr>`;
    });
    tbody.innerHTML = html;
  }

  function renderLossMakers() {
    const tbody = document.getElementById('lossMakersTableBody');
    if (!salesWorkbook || !pricesWorkbook) { tbody.innerHTML = ''; return; }
    
    let data = getMergedData();
    if (!data) return;

    let losers = data.filter(t => t.cost > t.sell);
    losers.sort((a, b) => a.profitUnit - b.profitUnit);

    let html = '';
    losers.forEach((test) => {
        html += `<tr><td style="color: var(--text); text-align:right;">${test.name}</td><td style="color: #00ff7f;">${test.sell} ج</td><td style="color: #f87171;">${test.cost} ج</td><td style="color: #ef4444; font-weight:bold;">${test.profitUnit} ج</td></tr>`;
    });
    tbody.innerHTML = html;
  }

  // =====================================================
  // 5. المحلل الذكي (AI Assistant) - تم تصحيح المقارنة
  // =====================================================
  window.openAIAssistant = function() {
    const modal = document.getElementById('aiModal');
    const body = document.getElementById('aiModalBody');
    modal.classList.add('show');

    if (!salesWorkbook) {
        body.innerHTML = `<p style="color:#f87171; font-weight:bold;">⚠️ ارفع الملفات أولاً.</p>`;
        return;
    }

    const sheetName = salesWorkbook.SheetNames.find(n => n.includes('المتابعة'));
    if (!sheetName) return;
    const data = XLSX.utils.sheet_to_json(salesWorkbook.Sheets[sheetName], { header: 1 });
    
    const yearsData = [
        { year: '2024', row: data[41] }, 
        { year: '2025', row: data[58] }, 
        { year: '2026', row: data[75] }  
    ];

    let rev25=0, rev26=0, prof25=0, prof26=0;
    let jRev26=0, bRev26=0;
    
    yearsData.forEach(y => {
        if (!y.row) return;
        const bRev = Math.round(Number(y.row[0])||0);
        const bProf = Math.round(Number(y.row[4])||0);
        const jRev = Math.round(Number(y.row[14])||0);
        const jProf = Math.round(Number(y.row[10])||0);
        
        const totalRev = bRev + jRev;
        const totalProf = bProf + jProf;
        
        if (y.year === '2025') { rev25 = totalRev; prof25 = totalProf; }
        if (y.year === '2026') { rev26 = totalRev; prof26 = totalProf; jRev26 = jRev; bRev26 = bRev; }
    });

    let months2026 = 0;
    for (let i = 63; i <= 75; i++) {
        if (data[i] && data[i][17] > 0) { months2026++; }
    }

    let insights = `<p>أهلاً يا دكتور أحمد! قمت بتحليل البيانات:</p><ul>`;

    if (rev25 > 0 && rev26 > 0) {
        if (months2026 < 12 && months2026 > 0) {
            const avgRev26 = rev26 / months2026;
            const avgRev25 = rev25 / 12;
            const avgProf26 = prof26 / months2026;
            const avgProf25 = prof25 / 12;
            
            insights += `<li style="color:#fbbf24;"><strong>ملاحظة هامة:</strong> سنة 2026 مسجلة فيها <strong>${months2026} شهور</strong> فقط. المقارنة الإجمالية مع سنة كاملة (2025) غير عادلة.</li>`;
            insights += `<li><strong>متوسط الإيراد الشهري:</strong> في 2026 هو <strong>${Math.round(avgRev26).toLocaleString()} ج</strong>، مقابل <strong>${Math.round(avgRev25).toLocaleString()} ج</strong> في 2025.</li>`;
            insights += `<li><strong>متوسط الربح الشهري:</strong> في 2026 هو <strong>${Math.round(avgProf26).toLocaleString()} ج</strong>، مقابل <strong>${Math.round(avgProf25).toLocaleString()} ج</strong> في 2025.</li>`;
            
            if (avgProf26 > avgProf25) {
                 insights += `<li><strong>الأداء المالي:</strong> بالرغم من أن 2026 لسه مكملتش، إلا إن متوسط الربح الشهري أعلى من 2025! وده مؤشر ممتاز على كفاءة المصاريف.</li>`;
            } else {
                 insights += `<li><strong>الأداء المالي:</strong> متوسط الربح الشهري لـ 2026 أقل من 2025. محتاجين نراجع خطة التسويق والمصاريف.</li>`;
            }
        } else {
            const growthRev = ((rev26 - rev25) / rev25) * 100;
            const growthProf = ((prof26 - prof25) / prof25) * 100;
            insights += `<li><strong>الأداء المالي:</strong> إيرادات 2026 تغيرت بنسبة <strong>${growthRev.toFixed(1)}%</strong>، والأرباح تغيرت بنسبة <strong>${growthProf.toFixed(1)}%</strong> مقارنة بـ 2025.</li>`;
        }
    }

    if (jRev26 > 0 && bRev26 > 0) {
        if (jRev26 > bRev26) {
            insights += `<li><strong>مقارنة الفروع:</strong> فرع الجعافرة متقدم على بهتيم بإيراد أعلى بـ <strong>${(jRev26 - bRev26).toLocaleString()} ج</strong> في 2026.</li>`;
        } else {
            insights += `<li><strong>مقارنة الفروع:</strong> فرع بهتيم متقدم على الجعافرة بإيراد أعلى بـ <strong>${(bRev26 - jRev26).toLocaleString()} ج</strong> في 2026.</li>`;
        }
    }

    if (pricesWorkbook) {
        let merged = getMergedData();
        if (merged && merged.length > 0) {
            let topProfit = [...merged].sort((a,b) => b.totalProfit - a.totalProfit)[0];
            let topSeller = [...merged].sort((a,b) => b.count - a.count)[0];
            let losers = merged.filter(t => t.cost > t.sell);

            if (topProfit) {
                insights += `<li><strong>نجم الأرباح:</strong> تحليل <strong>${topProfit.name}</strong> هو أكتر تحليل بيجيبلك ربح، دخللك حوالي <strong>${topProfit.totalProfit.toLocaleString()} ج</strong>.</li>`;
            }
            if (topSeller) {
                insights += `<li><strong>التحليل الأكثر شعبية:</strong> تحليل <strong>${topSeller.name}</strong> هو الأكثر طلباً (${topSeller.count} مرة).</li>`;
            }
            if (losers.length > 0) {
                insights += `<li><strong>تنبيه خسارة:</strong> في <strong>${losers.length} تحاليل</strong> سعرها أقل من تكلفتها. راجع تقرير "التحاليل الخاسرة".</li>`;
            }
        }
    } else {
        insights += `<li style="color:#fbbf24;">💡 عشان أقدر أحلل الأرباح، محتاج ترفع "ملف الأسعار" كمان.</li>`;
    }

    insights += `</ul><p style="text-align:center; margin-top:20px; color:var(--text-muted); font-size:0.9rem;">معامل طيبة دايماً في تقدم! 🚀</p>`;
    body.innerHTML = insights;
  };

  window.closeAIAssistant = function() {
    document.getElementById('aiModal').classList.remove('show');
  };

  if(sessionStorage.getItem(SESSION_KEY) === 'yes') showDashboard();
  const passInput = document.getElementById('adminPassword');
  if(passInput) passInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') window.checkAdminPassword(); });

})();