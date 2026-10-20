/* =====================================================
   TEBA LABS - Admin Logic (v22 - IndexedDB Permanent)
   ===================================================== */

(function(){
  'use strict';

  const ADMIN_PASSWORD = 'teba2026admin';
  const SESSION_KEY = 'teba_admin_session';

  // متغيرات الملفات
  let salesWorkbook = null;
  let pricesWorkbook = null;

  // =====================================================
  // إعدادات قاعدة البيانات (IndexedDB) للحفظ الدائم
  // =====================================================
  const DB_NAME = 'TebaAdminDB';
  const STORE_NAME = 'files';
  
  function openDB() {
      return new Promise((resolve, reject) => {
          const request = indexedDB.open(DB_NAME, 1);
          request.onupgradeneeded = e => e.target.result.createObjectStore(STORE_NAME);
          request.onsuccess = e => resolve(e.target.result);
          request.onerror = e => reject(e.target.error);
      });
  }

  async function saveFileToDB(key, base64) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put(base64, key);
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

  // دالة ذكية لتوحيد النصوص العربية
  function normalizeArabic(str) {
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
    
    if(reportName === 'annual') renderAnnualReport();
    if(reportName === 'financial') renderFinancialReport();
    if(reportName === 'topSellers') renderTopSellers();
    if(reportName === 'mostProfitable') renderMostProfitable();
    if(reportName === 'needOffers') renderNeedOffers();
    
    if(window.innerWidth <= 900) document.getElementById('adminSidebar').classList.remove('open');
  };

  window.toggleAdminSidebar = function(){ document.getElementById('adminSidebar').classList.toggle('open'); };

  async function showDashboard(){
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'flex';
    window.showReport('upload');
    await loadSavedDataFromDB(); // استرجاع الملفات من الذاكرة الدائمة
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

  // =====================================================
  // الرفع والحفظ الدائم
  // =====================================================
  window.handleFileUpload = function(event, type){
    const file = event.target.files[0];
    if(!file) return;
    
    const statusEl = document.getElementById(type === 'sales' ? 'uploadStatusSales' : 'uploadStatusPrices');
    statusEl.className = 'upload-status';
    statusEl.textContent = '⏳ جاري القراءة والحفظ...';

    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        
        // تحويل لـ Base64 للحفظ
        const base64 = btoa(data.reduce((data, byte) => data + String.fromCharCode(byte), ''));
        
        // حفظ في الذاكرة الدائمة
        await saveFileToDB(type === 'sales' ? 'salesData' : 'pricesData', base64);
        
        // قراءة الملف للعرض
        const workbook = XLSX.read(data, { type: 'array' });
        
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
        const salesB64 = await getFileFromDB('salesData');
        const pricesB64 = await getFileFromDB('pricesData');
        
        if(salesB64) {
            const binaryString = atob(salesB64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            salesWorkbook = XLSX.read(bytes.buffer, { type: 'array' });
            
            document.getElementById('uploadStatusSales').className = 'upload-status success';
            document.getElementById('uploadStatusSales').innerHTML = '✅ ملف المبيعات محمل من الذاكرة.';
        }
        
        if(pricesB64) {
            const binaryString = atob(pricesB64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            pricesWorkbook = XLSX.read(bytes.buffer, { type: 'array' });
            
            document.getElementById('uploadStatusPrices').className = 'upload-status success';
            document.getElementById('uploadStatusPrices').innerHTML = '✅ ملف الأسعار محمل من الذاكرة.';
        }
        
        renderAllReports();
    } catch(e) {
        console.log("لا توجد بيانات محفوظة مسبقاً.");
    }
  }

  function renderAllReports() {
      renderFinancialReport();
      renderAnnualReport();
      renderTopSellers();
      renderMostProfitable();
      renderNeedOffers();
  }

  // =====================================================
  // دوال التقارير (نفس الشغل اللي ظبط في v21)
  // =====================================================
  window.renderFinancialReport = function() {
    try {
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

      const ctx = document.getElementById('financeChart');
      if(ctx) {
          if (window.myChart) window.myChart.destroy(); 
          window.myChart = new Chart(ctx.getContext('2d'), {
              type: 'bar',
              data: {
                  labels: ['الإيرادات', 'المصروفات', 'صافي الربح'],
                  datasets: [{
                      label: `${selectedBranch} - ${selectedYear}`,
                      data: [totalRevenue, totalExpenses, (totalRevenue - totalExpenses)],
                      backgroundColor: ['rgba(0, 255, 127, 0.5)', 'rgba(248, 113, 113, 0.5)', 'rgba(251, 191, 36, 0.5)'],
                      borderColor: ['#00ff7f', '#f87171', '#fbbf24'],
                      borderWidth: 2, borderRadius: 8
                  }]
              },
              options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#a8b5a8' } }, x: { ticks: { color: '#a8b5a8' } } } }
          });
      }
    } catch (e) { console.error(e); }
  };

  window.renderAnnualReport = function() {
    try {
      if (!salesWorkbook) return;
      const sheetName = salesWorkbook.SheetNames.find(n => n.includes('المتابعة'));
      if (!sheetName) return;

      const data = XLSX.utils.sheet_to_json(salesWorkbook.Sheets[sheetName], { header: 1 });
      const yearsData = [ { year: '2024', row: data[41] }, { year: '2025', row: data[58] }, { year: '2026', row: data[75] } ];
      let jHTML = '', bHTML = '';
      yearsData.forEach(y => {
          if (!y.row) return;
          const bRev = Math.round(Number(y.row[0])||0), bExp = Math.round(Number(y.row[2])||0), bProfit = Math.round(Number(y.row[4])||0);
          const jRev = Math.round(Number(y.row[14])||0), jExp = Math.round(Number(y.row[12])||0), jProfit = Math.round(Number(y.row[10])||0);
          jHTML += `<tr><td style="color:var(--gold); font-weight:bold;">${y.year}</td><td style="color:#00ff7f;">${jRev.toLocaleString()} ج</td><td style="color:#f87171;">${jExp.toLocaleString()} ج</td><td style="color:#fbbf24; font-weight:bold;">${jProfit.toLocaleString()} ج</td></tr>`;
          bHTML += `<tr><td style="color:var(--gold); font-weight:bold;">${y.year}</td><td style="color:#00ff7f;">${bRev.toLocaleString()} ج</td><td style="color:#f87171;">${bExp.toLocaleString()} ج</td><td style="color:#fbbf24; font-weight:bold;">${bProfit.toLocaleString()} ج</td></tr>`;
      });
      document.getElementById('annualTableJaafara').innerHTML = jHTML;
      document.getElementById('annualTableBahtim').innerHTML = bHTML;
    } catch (e) { console.error(e); }
  };

  window.renderTopSellers = function() {
    try {
      const tbody = document.getElementById('topSellersTableBody');
      if (!salesWorkbook) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#f87171; padding:20px;">⚠️ يرجى رفع ملف المبيعات أولاً</td></tr>';
          return;
      }
      const sheetName = salesWorkbook.SheetNames.find(n => n.includes('المتابعة'));
      if (!sheetName) return;
      const data = XLSX.utils.sheet_to_json(salesWorkbook.Sheets[sheetName], { header: 1 });
      let topSellers = [];
      
      let nameCol = 17, countCol = 18, count3Col = 19;
      for (let r = 0; r < Math.min(10, data.length); r++) {
          if (!data[r]) continue;
          for (let c = 0; c < data[r].length; c++) {
              let cellText = String(data[r][c] || '').trim();
              if (cellText === 'اسم التحليل') nameCol = c;
              if (cellText === 'عدد التكرار' && countCol === 18) countCol = c;
              if (cellText === 'عدد التكرار اخر 3 شهور') count3Col = c;
          }
      }

      for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (row && row[nameCol] && typeof row[nameCol] === 'string' && row[nameCol].trim() !== '' && row[nameCol] !== 'اسم التحليل') {
              topSellers.push({ name: row[nameCol].trim(), count: Number(row[countCol]) || 0, count3: Number(row[count3Col]) || 0 });
          }
      }
      topSellers.sort((a, b) => b.count - a.count);
      let html = '';
      topSellers.slice(0, 20).forEach((test, index) => {
          html += `<tr><td style="font-weight:bold; color:var(--gold);">${index + 1}</td><td style="color: var(--text); text-align:right;">${test.name}</td><td style="color: #00ff7f; font-weight:bold;">${test.count}</td><td style="color: #00bfff;">${test.count3}</td></tr>`;
      });
      tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center;">لا توجد بيانات</td></tr>';
    } catch (e) { console.error(e); }
  };

  window.renderMostProfitable = function() {
    try {
      const tbody = document.getElementById('mostProfitableTableBody');
      if (!salesWorkbook || !pricesWorkbook) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#f87171; padding:20px;">⚠️ يرجى رفع (ملف المبيعات) و (ملف الأسعار) أولاً</td></tr>';
          return;
      }
      const salesSheetName = salesWorkbook.SheetNames.find(n => n.includes('المتابعة'));
      const salesData = XLSX.utils.sheet_to_json(salesWorkbook.Sheets[salesSheetName], { header: 1 });
      let frequencyMap = {};
      for (let i = 1; i < salesData.length; i++) {
          const row = salesData[i];
          if (row && row[17] && typeof row[17] === 'string' && row[17].trim() !== '' && row[17] !== 'اسم التحليل') {
              const normName = normalizeArabic(row[17]);
              frequencyMap[normName] = { count: Number(row[18]) || 0 };
          }
      }

      let priceSheetName = pricesWorkbook.SheetNames.find(n => n.includes('التحاليل')) || pricesWorkbook.SheetNames[0];
      const priceData = XLSX.utils.sheet_to_json(pricesWorkbook.Sheets[priceSheetName], { header: 1 });
      
      let profitableTests = [];
      for (let i = 1; i < priceData.length; i++) {
          const row = priceData[i];
          if (row && row[0]) {
              const testName = String(row[0]).trim();
              const cost = Number(row[1]) || 0;
              const sellPrice = Number(row[2]) || 0;
              if (sellPrice > 0 && cost > 0) {
                  const profitPerTest = sellPrice - cost;
                  const normTestName = normalizeArabic(testName);
                  const frequency = frequencyMap[normTestName] ? frequencyMap[normTestName].count : 0;
                  const totalProfit = profitPerTest * frequency;
                  profitableTests.push({ name: testName, sell: sellPrice, cost: cost, profitUnit: profitPerTest, frequency: frequency, totalProfit: totalProfit });
              }
          }
      }
      profitableTests.sort((a, b) => b.totalProfit - a.totalProfit);
      let html = '';
      profitableTests.slice(0, 20).forEach((test, index) => {
          html += `<tr><td style="font-weight:bold; color:var(--gold);">${index + 1}</td><td style="color: var(--text); text-align:right;">${test.name}</td><td style="color: #00ff7f;">${test.sell} ج</td><td style="color: #f87171;">${test.cost} ج</td><td style="color: #fbbf24;">${test.profitUnit} ج</td><td style="color: #00ff7f; font-weight:bold; font-size:1.1rem;">${test.totalProfit.toLocaleString()} ج</td></tr>`;
      });
      tbody.innerHTML = html || '<tr><td colspan="6" style="text-align:center;">لا توجد بيانات كافية</td></tr>';
    } catch (e) { console.error(e); }
  };

  window.renderNeedOffers = function() {
    try {
      const tbody = document.getElementById('needOffersTableBody');
      if (!salesWorkbook || !pricesWorkbook) {
          tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#f87171; padding:20px;">⚠️ يرجى رفع (ملف المبيعات) و (ملف الأسعار) أولاً</td></tr>';
          return;
      }
      const salesSheetName = salesWorkbook.SheetNames.find(n => n.includes('المتابعة'));
      const salesData = XLSX.utils.sheet_to_json(salesWorkbook.Sheets[salesSheetName], { header: 1 });
      let frequencyMap = {};
      for (let i = 1; i < salesData.length; i++) {
          const row = salesData[i];
          if (row && row[17] && typeof row[17] === 'string' && row[17].trim() !== '' && row[17] !== 'اسم التحليل') {
              const normName = normalizeArabic(row[17]);
              frequencyMap[normName] = { count3: Number(row[19]) || 0 };
          }
      }
      let priceSheetName = pricesWorkbook.SheetNames.find(n => n.includes('التحاليل')) || pricesWorkbook.SheetNames[0];
      const priceData = XLSX.utils.sheet_to_json(pricesWorkbook.Sheets[priceSheetName], { header: 1 });
      let needOffers = [];
      for (let i = 1; i < priceData.length; i++) {
          const row = priceData[i];
          if (row && row[0]) {
              const testName = String(row[0]).trim();
              const sellPrice = Number(row[2]) || 0;
              if (sellPrice > 0) {
                  const normTestName = normalizeArabic(testName);
                  const freq3 = frequencyMap[normTestName] ? frequencyMap[normTestName].count3 : 0;
                  if (freq3 < 5) { needOffers.push({ name: testName, sell: sellPrice, freq3: freq3 }); }
              }
          }
      }
      needOffers.sort((a, b) => a.freq3 - b.freq3);
      let html = '';
      needOffers.slice(0, 50).forEach((test) => { 
          html += `<tr><td style="color: var(--text); text-align:right;">${test.name}</td><td style="color: #00ff7f;">${test.sell} ج</td><td style="color: #f87171; font-weight:bold;">${test.freq3} مرات</td></tr>`;
      });
      tbody.innerHTML = html || '<tr><td colspan="3" style="text-align:center;">كل التحاليل مبيعتها كويسة!</td></tr>';
    } catch (e) { console.error(e); }
  };

  if(sessionStorage.getItem(SESSION_KEY) === 'yes') showDashboard();
  const passInput = document.getElementById('adminPassword');
  if(passInput) passInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') window.checkAdminPassword(); });

})();
