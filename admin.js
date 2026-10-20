/* =====================================================
   TEBA LABS - Admin Logic (v19 - All 3 Reports)
   ===================================================== */

(function(){
  'use strict';

  const ADMIN_PASSWORD = 'teba2026admin';
  const SESSION_KEY = 'teba_admin_session';

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

  function showDashboard(){
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'flex';
    window.showReport('upload');
    loadSavedData();
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

  window.clearData = function() {
    if(confirm('هل أنت متأكد من مسح البيانات المحفوظة؟')) {
      localStorage.removeItem('teba_sales_data');
      localStorage.removeItem('teba_prices_data');
      location.reload();
    }
  };

  window.handleFileUpload = function(event, type){
    const file = event.target.files[0];
    if(!file) return;
    
    const statusEl = document.getElementById(type === 'sales' ? 'uploadStatusSales' : 'uploadStatusPrices');
    statusEl.className = 'upload-status';
    statusEl.textContent = '⏳ جاري القراءة...';

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const base64 = btoa(data.reduce((data, byte) => data + String.fromCharCode(byte), ''));
        localStorage.setItem(type === 'sales' ? 'teba_sales_data' : 'teba_prices_data', base64);

        const workbook = XLSX.read(data, { type: 'array' });
        
        statusEl.className = 'upload-status success';
        statusEl.innerHTML = `✅ تم رفع الملف بنجاح!`;
        
        if(type === 'sales') window.salesWorkbook = workbook;
        if(type === 'prices') window.pricesWorkbook = workbook;
        
        renderAllReports();
        
      } catch (error) {
        statusEl.className = 'upload-status error';
        statusEl.textContent = '❌ حدث خطأ: ' + error.message;
      }
    };
    reader.readAsArrayBuffer(file);
  };

  function loadSavedData() {
    const salesB64 = localStorage.getItem('teba_sales_data');
    const pricesB64 = localStorage.getItem('teba_prices_data');
    
    if(salesB64) {
        window.salesWorkbook = XLSX.read(salesB64, { type: 'base64' });
        document.getElementById('uploadStatusSales').className = 'upload-status success';
        document.getElementById('uploadStatusSales').innerHTML = '✅ ملف المبيعات محمل.';
    }
    if(pricesB64) {
        window.pricesWorkbook = XLSX.read(pricesB64, { type: 'base64' });
        document.getElementById('uploadStatusPrices').className = 'upload-status success';
        document.getElementById('uploadStatusPrices').innerHTML = '✅ ملف الأسعار محمل.';
    }
    renderAllReports();
  }

  function renderAllReports() {
      renderFinancialReport();
      renderAnnualReport();
      renderTopSellers();
      renderMostProfitable();
      renderNeedOffers();
  }

  window.renderFinancialReport = function() {
    try {
      if (!window.salesWorkbook || !window.salesWorkbook.Sheets['المتابعة السنوية']) return;
      const selectedYear = document.getElementById('yearSelector').value;
      const selectedMonth = document.getElementById('monthSelector').value;
      const selectedBranch = document.getElementById('branchSelector').value;
      const ws = window.salesWorkbook.Sheets['المتابعة السنوية'];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

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
      if (!window.salesWorkbook || !window.salesWorkbook.Sheets['المتابعة السنوية']) return;
      const data = XLSX.utils.sheet_to_json(window.salesWorkbook.Sheets['المتابعة السنوية'], { header: 1 });
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
      if (!window.salesWorkbook) return;
      const data = XLSX.utils.sheet_to_json(window.salesWorkbook.Sheets['المتابعة السنوية'], { header: 1 });
      let topSellers = [];
      for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (row && row[17] && typeof row[17] === 'string' && row[17].trim() !== '' && row[17] !== 'اسم التحليل') {
              topSellers.push({ name: row[17].trim(), count: Number(row[18]) || 0, count3: Number(row[19]) || 0 });
          }
      }
      topSellers.sort((a, b) => b.count - a.count);
      let html = '';
      topSellers.slice(0, 20).forEach((test, index) => {
          html += `<tr><td style="font-weight:bold; color:var(--gold);">${index + 1}</td><td style="color: var(--text); text-align:right;">${test.name}</td><td style="color: #00ff7f; font-weight:bold;">${test.count}</td><td style="color: #00bfff;">${test.count3}</td></tr>`;
      });
      document.getElementById('topSellersTableBody').innerHTML = html || '<tr><td colspan="4">لا توجد بيانات</td></tr>';
    } catch (e) { console.error(e); }
  };

  window.renderMostProfitable = function() {
    try {
      if (!window.salesWorkbook || !window.pricesWorkbook) return;
      const salesData = XLSX.utils.sheet_to_json(window.salesWorkbook.Sheets['المتابعة السنوية'], { header: 1 });
      let frequencyMap = {};
      for (let i = 1; i < salesData.length; i++) {
          const row = salesData[i];
          if (row && row[17] && typeof row[17] === 'string' && row[17].trim() !== '' && row[17] !== 'اسم التحليل') {
              frequencyMap[row[17].trim()] = { count: Number(row[18]) || 0 };
          }
      }
      let priceSheet = window.pricesWorkbook.Sheets[window.pricesWorkbook.SheetNames[1]] || window.pricesWorkbook.Sheets[window.pricesWorkbook.SheetNames[0]];
      const priceData = XLSX.utils.sheet_to_json(priceSheet, { header: 1 });
      let profitableTests = [];
      for (let i = 1; i < priceData.length; i++) {
          const row = priceData[i];
          if (row && row[0]) {
              const testName = String(row[0]).trim();
              const cost = Number(row[1]) || 0;
              const sellPrice = Number(row[2]) || 0;
              if (sellPrice > 0 && cost > 0) {
                  const profitPerTest = sellPrice - cost;
                  const frequency = frequencyMap[testName] ? frequencyMap[testName].count : 0;
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
      document.getElementById('mostProfitableTableBody').innerHTML = html || '<tr><td colspan="6">لا توجد بيانات كافية</td></tr>';
    } catch (e) { console.error(e); }
  };

  window.renderNeedOffers = function() {
    try {
      if (!window.salesWorkbook || !window.pricesWorkbook) return;
      const salesData = XLSX.utils.sheet_to_json(window.salesWorkbook.Sheets['المتابعة السنوية'], { header: 1 });
      let frequencyMap = {};
      for (let i = 1; i < salesData.length; i++) {
          const row = salesData[i];
          if (row && row[17] && typeof row[17] === 'string' && row[17].trim() !== '' && row[17] !== 'اسم التحليل') {
              frequencyMap[row[17].trim()] = { count3: Number(row[19]) || 0 };
          }
      }
      let priceSheet = window.pricesWorkbook.Sheets[window.pricesWorkbook.SheetNames[1]] || window.pricesWorkbook.Sheets[window.pricesWorkbook.SheetNames[0]];
      const priceData = XLSX.utils.sheet_to_json(priceSheet, { header: 1 });
      let needOffers = [];
      for (let i = 1; i < priceData.length; i++) {
          const row = priceData[i];
          if (row && row[0]) {
              const testName = String(row[0]).trim();
              const sellPrice = Number(row[2]) || 0;
              if (sellPrice > 0) {
                  const freq3 = frequencyMap[testName] ? frequencyMap[testName].count3 : 0;
                  if (freq3 < 5) { needOffers.push({ name: testName, sell: sellPrice, freq3: freq3 }); }
              }
          }
      }
      needOffers.sort((a, b) => a.freq3 - b.freq3);
      let html = '';
      needOffers.slice(0, 50).forEach((test) => {
          html += `<tr><td style="color: var(--text); text-align:right;">${test.name}</td><td style="color: #00ff7f;">${test.sell} ج</td><td style="color: #f87171; font-weight:bold;">${test.freq3} مرات</td></tr>`;
      });
      document.getElementById('needOffersTableBody').innerHTML = html || '<tr><td colspan="3">كل التحاليل مبيعتها كويسة!</td></tr>';
    } catch (e) { console.error(e); }
  };

  if(sessionStorage.getItem(SESSION_KEY) === 'yes') showDashboard();
  const passInput = document.getElementById('adminPassword');
  if(passInput) passInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') window.checkAdminPassword(); });

})();
