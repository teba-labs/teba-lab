/* =====================================================
   TEBA LABS - Admin Logic (v35 - Dynamic Indexes & Robust)
   ===================================================== */

(function(){
  'use strict';

  const ADMIN_PASSWORD = 'teba2026admin';
  const SESSION_KEY = 'teba_admin_session';

  let salesWorkbook = null;
  let pricesWorkbook = null;

  // تغيير الإصدار لضمان مسح الكاش القديم تماماً
  const DB_NAME = 'TebaAdminDB_v10'; 
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
          .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, '')
          .replace(/\s+/g, ' ').trim();
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
    if(reportName === 'topSellers') renderTopSellers();
    if(reportName === 'mostProfitable') renderMostProfitable();
    if(reportName === 'leastProfitable') renderLeastProfitable();
    if(reportName === 'needOffers') renderNeedOffers();
    if(reportName === 'lossMakers') renderLossMakers();
    
    if(window.innerWidth <= 900) document.getElementById('adminSidebar').classList.remove('open');
    
    // إجبار المتصفح على إعادة رسم الرسومات (مهم جداً للموبايل)
    setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 300);
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
  }

  // =====================================================
  // دالة مساعدة للبحث عن البيانات ديناميكياً (تتجاهل الأعمدة الفاضية)
  // =====================================================
  function getWorkbookData() {
      if (!salesWorkbook) return null;
      const sheetName = salesWorkbook.SheetNames.find(n => n.includes('المتابعة'));
      if (!sheetName) return null;
      return XLSX.utils.sheet_to_json(salesWorkbook.Sheets[sheetName], { header: 1 });
  }

  function renderOverview() {
    const data = getWorkbookData();
    if (!data) return;

    let totalRev = 0, totalExp = 0, totalCases = 0, rev2025 = 0, rev2026 = 0;
    let chartLabels = [], chartRevs = [], chartExps = [];
    let yearsFound = 0;

    ['2024', '2025', '2026'].forEach(yearStr => {
        let yearRow = data.findIndex(r => r && r.some(c => String(c).trim() === yearStr));
        if(yearRow === -1) return;
        yearsFound++;

        let headerRow = -1;
        for(let i=yearRow; i<Math.min(yearRow+10, data.length); i++) {
            if(data[i] && data[i].join(' ').includes('اجمالي الايراد الشهري')) { headerRow = i; break; }
        }
        if(headerRow === -1) return;

        let bRev=-1, bExp=-1, jRev=-1, jExp=-1, bCases=-1, jCases=-1;
        let foundBRev=0, foundBExp=0, foundCases=0;

        for(let c=0; c<data[headerRow].length; c++) {
            let txt = String(data[headerRow][c] || '').trim();
            if(txt === 'اجمالي الايراد الشهري') { if(!foundBRev){ bRev=c; foundBRev=1; } else jRev=c; }
            if(txt === 'اجمالي المصاريف الشهرية') { if(!foundBExp){ bExp=c; foundBExp=1; } else jExp=c; }
            if(txt === 'عدد الحالات') { if(!foundCases){ bCases=c; foundCases=1; } else jCases=c; }
        }

        let yearRev = 0, yearExp = 0, yearCases = 0;
        for(let r=headerRow+1; r<data.length && r<headerRow+15; r++) {
            if(!data[r]) continue;
            let bR = Number(data[r][bRev])||0, bE = Number(data[r][bExp])||0;
            let jR = Number(data[r][jRev])||0, jE = Number(data[r][jExp])||0;
            let bC = Number(data[r][bCases])||0, jC = Number(data[r][jCases])||0;

            if(bR===0 && bE===0 && jR===0 && jE===0) continue; 
            
            yearRev += (bR+jR);
            yearExp += (bE+jE);
            yearCases += (bC+jC);
        }

        totalRev += yearRev; totalExp += yearExp; totalCases += yearCases;
        chartLabels.push(yearStr); chartRevs.push(yearRev); chartExps.push(yearExp);

        if(yearStr === '2025') rev2025 = yearRev;
        if(yearStr === '2026') rev2026 = yearRev;
    });

    document.getElementById('ov-revenue').textContent = totalRev.toLocaleString('en-US') + ' ج';
    document.getElementById('ov-expenses').textContent = totalExp.toLocaleString('en-US') + ' ج';
    document.getElementById('ov-profit').textContent = (totalRev - totalExp).toLocaleString('en-US') + ' ج';
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
        alertMsg = `ℹ️ يرجى رفع ملفات إكسيل تحتوي على بيانات لسنوات متعددة.`;
    }
    alertBox.textContent = alertMsg;
    alertBox.style.display = 'block';

    const ctx = document.getElementById('overviewChart').getContext('2d');
    if (window.ovChart) window.ovChart.destroy();
    window.ovChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: chartLabels, datasets: [ { label: 'الإيرادات', data: chartRevs, backgroundColor: 'rgba(0, 255, 127, 0.7)' }, { label: 'المصروفات', data: chartExps, backgroundColor: 'rgba(248, 113, 113, 0.7)' } ] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff' } } }, scales: { y: { ticks: { color: '#a8b5a8' } }, x: { ticks: { color: '#a8b5a8' } } } }
    });
  }

  window.renderFinancialReport = function() {
    const data = getWorkbookData();
    if (!data) return;

    const selectedYear = document.getElementById('yearSelector').value;
    const selectedMonth = document.getElementById('monthSelector').value;
    const selectedBranch = document.getElementById('branchSelector').value;

    let yearRow = data.findIndex(r => r && r.some(c => String(c).trim() === selectedYear));
    if(yearRow === -1) return;

    let headerRow = -1;
    for(let i=yearRow; i<Math.min(yearRow+10, data.length); i++) {
        if(data[i] && data[i].join(' ').includes('اجمالي الايراد الشهري')) { headerRow = i; break; }
    }
    if(headerRow === -1) return;

    let bRev=-1, bExp=-1, jRev=-1, jExp=-1;
    let foundBRev=0, foundBExp=0;

    for(let c=0; c<data[headerRow].length; c++) {
        let txt = String(data[headerRow][c] || '').trim();
        if(txt === 'اجمالي الايراد الشهري') { if(!foundBRev){ bRev=c; foundBRev=1; } else jRev=c; }
        if(txt === 'اجمالي المصاريف الشهرية') { if(!foundBExp){ bExp=c; foundBExp=1; } else jExp=c; }
    }

    let totalRevenue = 0, totalExpenses = 0;
    let startMonth = selectedMonth === 'all' ? 1 : parseInt(selectedMonth);
    let endMonth = selectedMonth === 'all' ? 12 : parseInt(selectedMonth);

    let mCount = 0;
    for(let r=headerRow+1; r<data.length && mCount<12; r++) {
        if(!data[r]) continue;
        let bR = Number(data[r][bRev])||0, bE = Number(data[r][bExp])||0;
        let jR = Number(data[r][jRev])||0, jE = Number(data[r][jExp])||0;

        if(bR===0 && bE===0 && jR===0 && jE===0) continue; 

        mCount++;
        if(mCount >= startMonth && mCount <= endMonth) {
            if (selectedBranch === 'combined') { totalRevenue += (jR + bR); totalExpenses += (jE + bE); }
            else if (selectedBranch === 'jaafara') { totalRevenue += jR; totalExpenses += jE; }
            else if (selectedBranch === 'bahtim') { totalRevenue += bR; totalExpenses += bE; }
        }
    }

    document.getElementById('fin-revenue').textContent = totalRevenue.toLocaleString('en-US') + ' ج';
    document.getElementById('fin-expenses').textContent = totalExpenses.toLocaleString('en-US') + ' ج';
    document.getElementById('fin-profit').textContent = (totalRevenue - totalExpenses).toLocaleString('en-US') + ' ج';

    const ctx = document.getElementById('financeChart').getContext('2d');
    if (window.finChart) window.finChart.destroy(); 
    window.finChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: ['الإيرادات', 'المصروفات', 'صافي الربح'], datasets: [{ data: [totalRevenue, totalExpenses, (totalRevenue - totalExpenses)], backgroundColor: ['rgba(0, 255, 127, 0.5)', 'rgba(248, 113, 113, 0.5)', 'rgba(251, 191, 36, 0.5)'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#a8b5a8' } }, x: { ticks: { color: '#a8b5a8' } } } }
    });
  }

  window.renderAnnualReport = function() {
    const data = getWorkbookData();
    if (!data) return;
    
    const selectedYear = document.getElementById('annualYearSelector').value;
    const selectedBranch = document.getElementById('annualBranchSelector').value;

    let yearsData = { '2024': {r:0, e:0}, '2025': {r:0, e:0}, '2026': {r:0, e:0} };

    ['2024', '2025', '2026'].forEach(yearStr => {
        let yearRow = data.findIndex(r => r && r.some(c => String(c).trim() === yearStr));
        if(yearRow === -1) return;
        let headerRow = -1;
        for(let i=yearRow; i<Math.min(yearRow+10, data.length); i++) {
            if(data[i] && data[i].join(' ').includes('اجمالي الايراد الشهري')) { headerRow = i; break; }
        }
        if(headerRow === -1) return;

        let bRev=-1, bExp=-1, jRev=-1, jExp=-1;
        let foundBRev=0, foundBExp=0;
        for(let c=0; c<data[headerRow].length; c++) {
            let txt = String(data[headerRow][c] || '').trim();
            if(txt === 'اجمالي الايراد الشهري') { if(!foundBRev){ bRev=c; foundBRev=1; } else jRev=c; }
            if(txt === 'اجمالي المصاريف الشهرية') { if(!foundBExp){ bExp=c; foundBExp=1; } else jExp=c; }
        }

        let yRev = 0, yExp = 0;
        let mCount = 0;
        for(let r=headerRow+1; r<data.length && mCount<12; r++) {
            if(!data[r]) continue;
            let bR = Number(data[r][bRev])||0, bE = Number(data[r][bExp])||0;
            let jR = Number(data[r][jRev])||0, jE = Number(data[r][jExp])||0;
            if(bR===0 && bE===0 && jR===0 && jE===0) continue; 
            mCount++;
            
            if (selectedBranch === 'combined') { yRev += (bR + jR); yExp += (bE + jE); }
            else if (selectedBranch === 'jaafara') { yRev += jR; yExp += jE; }
            else if (selectedBranch === 'bahtim') { yRev += bR; yExp += bE; }
        }
        yearsData[yearStr] = { r: yRev, e: yExp };
    });

    let finalRev = yearsData[selectedYear].r;
    let finalExp = yearsData[selectedYear].e;
    let finalProfit = finalRev - finalExp;

    document.getElementById('annualTableBody').innerHTML = `<tr><td style="color:var(--gold);">${selectedYear}</td><td style="color:#00ff7f;">${finalRev.toLocaleString()} ج</td><td style="color:#f87171;">${finalExp.toLocaleString()} ج</td><td style="color:#fbbf24;">${finalProfit.toLocaleString()} ج</td></tr>`;
    
    let labels = ['2024', '2025', '2026'], revs = [], exps = [], profits = [];
    labels.forEach(yr => {
        revs.push(yearsData[yr].r);
        exps.push(yearsData[yr].e);
        profits.push(yearsData[yr].r - yearsData[yr].e);
    });

    const revCtx = document.getElementById('annualRevChart').getContext('2d');
    if (window.anRevChart) window.anRevChart.destroy();
    window.anRevChart = new Chart(revCtx, { type: 'bar', data: { labels: labels, datasets: [ { label: 'الإيرادات', data: revs, backgroundColor: 'rgba(0, 255, 127, 0.7)' }, { label: 'المصروفات', data: exps, backgroundColor: 'rgba(248, 113, 113, 0.7)' } ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff' } } }, scales: { y: { ticks: { color: '#a8b5a8' } }, x: { ticks: { color: '#a8b5a8' } } } } });

    const profCtx = document.getElementById('annualProfitChart').getContext('2d');
    if (window.anProfChart) window.anProfChart.destroy();
    window.anProfChart = new Chart(profCtx, { type: 'line', data: { labels: labels, datasets: [{ label: 'صافي الربح', data: profits, backgroundColor: 'rgba(251, 191, 36, 0.5)', borderColor: '#fbbf24', borderWidth: 3, fill: true, tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff' } } }, scales: { y: { ticks: { color: '#a8b5a8' } }, x: { ticks: { color: '#a8b5a8' } } } } });
  }

  window.renderCaseAnalysis = function() {
    const data = getWorkbookData();
    if (!data) return;

    const selectedYear = document.getElementById('casesYearSelector').value;
    const selectedBranch = document.getElementById('casesBranchSelector').value;

    let yearRow = data.findIndex(r => r && r.some(c => String(c).trim() === selectedYear));
    if(yearRow === -1) return;
    let headerRow = -1;
    for(let i=yearRow; i<Math.min(yearRow+10, data.length); i++) {
        if(data[i] && data[i].join(' ').includes('اجمالي الايراد الشهري')) { headerRow = i; break; }
    }
    if(headerRow === -1) return;

    let bCases=-1, jCases=-1, found=0;
    for(let c=0; c<data[headerRow].length; c++) {
        let txt = String(data[headerRow][c] || '').trim();
        if(txt === 'عدد الحالات') { if(!found){ bCases=c; found=1; } else jCases=c; }
    }

    let months = ['يناير', 'فبراير', 'مارس', 'ابريل', 'مايو', 'يونيو', 'يوليو', 'اغسطس', 'سبتمبر', 'اكتوبر', 'نوفمبر', 'ديسمبر'];
    let casesData = [];
    
    let mCount = 0;
    for(let r=headerRow+1; r<data.length && mCount<12; r++) {
        if(!data[r]) continue;
        let bC = Number(data[r][bCases])||0, jC = Number(data[r][jCases])||0;
        let bR = 0, jR = 0; // to skip empty months
        
        if(bC===0 && jC===0) continue; 

        mCount++;
        if(selectedBranch === 'combined') casesData.push(bC + jC);
        else if (selectedBranch === 'jaafara') casesData.push(jC);
        else casesData.push(bC);
    }

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

  function getTestMovementData() {
    const data = getWorkbookData();
    if (!data) return [];

    let testHeaderRow = -1;
    for (let i = 0; i < data.length; i++) {
        if (data[i] && data[i].some(c => String(c).includes('اسم التحليل'))) {
            testHeaderRow = i; break;
        }
    }
    if (testHeaderRow === -1) return [];

    let nameCol = -1, countCol = -1;
    for (let c = 0; c < data[testHeaderRow].length; c++) {
        let txt = String(data[testHeaderRow][c] || '').trim();
        if (txt === 'اسم التحليل') nameCol = c;
        if (txt.includes('عدد التكرار اخر 3 شهور') || txt === 'عدد التكرار') countCol = c;
    }
    if(nameCol === -1 || countCol === -1) return [];

    let testData = [];
    for (let i = testHeaderRow + 1; i < data.length; i++) {
        const row = data[i];
        if (row && row[nameCol] && typeof row[nameCol] === 'string' && row[nameCol].trim() !== '') {
            let count = Number(row[countCol]) || 0;
            testData.push({ name: row[nameCol].trim(), normName: normalizeText(row[nameCol]), count: count });
        }
    }
    return testData;
  }

  window.renderTopSellers = function() {
    const tbody = document.getElementById('topSellersTableBody');
    let tests = getTestMovementData();
    if(!tests || tests.length === 0) { tbody.innerHTML = '<tr><td colspan="3">لا توجد بيانات</td></tr>'; return; }
    
    tests.sort((a, b) => b.count - a.count);
    let html = '';
    tests.slice(0, 20).forEach((test, index) => {
        html += `<tr><td style="color:var(--gold);">${index + 1}</td><td style="color: var(--text); text-align:right;">${test.name}</td><td style="color: #00bfff;">${test.count}</td></tr>`;
    });
    tbody.innerHTML = html;
  }

  function getMergedData() {
      if (!pricesWorkbook) return [];
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
              if (sellPrice > 0) priceMap[normalizeText(testName)] = { cost, sellPrice };
          }
      }

      let merged = [];
      tests.forEach(t => {
          if (priceMap[t.normName]) {
              const cost = priceMap[t.normName].cost;
              const sell = priceMap[t.normName].sellPrice;
              const profitUnit = sell - cost;
              merged.push({ name: t.name, count: t.count, cost: cost, sell: sell, profitUnit: profitUnit, totalProfit: profitUnit * t.count });
          }
      });
      return merged;
  }

  window.renderMostProfitable = function() {
    const tbody = document.getElementById('mostProfitableTableBody');
    let data = getMergedData();
    if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="6">لا توجد تطابق بين الأسماء في الملفين</td></tr>'; return; }
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
    if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="6">لا توجد تطابق بين الأسماء في الملفين</td></tr>'; return; }
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
    if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="3">لا توجد تطابق بين الأسماء في الملفين</td></tr>'; return; }
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
    if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="4">لا توجد تطابق بين الأسماء في الملفين</td></tr>'; return; }
    let losers = data.filter(t => t.cost > t.sell);
    losers.sort((a, b) => a.profitUnit - b.profitUnit);
    let html = '';
    losers.forEach((test) => {
        html += `<tr><td style="color: var(--text); text-align:right;">${test.name}</td><td style="color: #00ff7f;">${test.sell} ج</td><td style="color: #f87171;">${test.cost} ج</td><td style="color: #ef4444; font-weight:bold;">${test.profitUnit} ج</td></tr>`;
    });
    tbody.innerHTML = html;
  }

  // ... (المحلل الذكي سيظل كما هو تقريباً، لكن يعتمد على الدوال الجديدة)
  window.openAIAssistant = function() {
    const modal = document.getElementById('aiModal');
    const body = document.getElementById('aiModalBody');
    modal.classList.add('show');

    if (!salesWorkbook) {
        body.innerHTML = `<p style="color:#f87171; font-weight:bold;">⚠️ ارفع الملفات أولاً.</p>`;
        return;
    }
    let insights = `<p>أهلاً يا دكتور أحمد! قمت بتحليل البيانات:</p><ul><li>جميع البيانات الحالية مبنية على ملفات الإكسيل المرفوعة، والمقارنات أصبحت دقيقة بناءً على أرقامك الفعلية.</li>`;
    insights += `</ul><p style="text-align:center; margin-top:20px; color:var(--text-muted); font-size:0.9rem;">معامل طيبة دايماً في تقدم! 🚀</p>`;
    body.innerHTML = insights;
  };

  window.closeAIAssistant = function() { document.getElementById('aiModal').classList.remove('show'); };

  if(sessionStorage.getItem(SESSION_KEY) === 'yes') showDashboard();
  const passInput = document.getElementById('adminPassword');
  if(passInput) passInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') window.checkAdminPassword(); });

})();