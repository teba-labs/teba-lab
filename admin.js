/* =====================================================
   TEBA LABS - Admin Logic (v21 - Ultimate Mobile Fix)
   ===================================================== */

(function(){
  'use strict';

  const ADMIN_PASSWORD = 'teba2026admin';
  const SESSION_KEY = 'teba_admin_session';

  // تخزين الملفات في الذاكرة (مش بنحفظ في المتصفح عشان الفون ميمسحهاش)
  let salesWorkbook = null;
  let pricesWorkbook = null;

  // دالة ذكية لتوحيد النصوص العربية عشان نطابق الأسماء
  function normalizeArabic(str) {
      if (!str) return '';
      return str.toString().trim().toLowerCase()
          .replace(/[\u064B-\u065F\u0670]/g, '') // شيل التشكيل
          .replace(/[أإآٱ]/g, 'ا')
          .replace(/ى/g, 'ي')
          .replace(/ة/g, 'ه')
          .replace(/ؤ/g, 'و')
          .replace(/ئ/g, 'ي')
          .replace(/[^\u0600-\u06FF\w\s]/g, '') // شيل الرموز
          .replace(/\s+/g, ' ').trim();
  }

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
    if(confirm('هل أنت متأكد من مسح البيانات؟')) {
      salesWorkbook = null;
      pricesWorkbook = null;
      location.reload();
    }
  };

  window.handleFileUpload = function(event, type){
    const file = event.target.files[0];
    if(!file) return;
    
    const statusEl = document.getElementById(type === 'sales' ? 'uploadStatusSales' : 'uploadStatusPrices');
    statusEl.className = 'upload-status';
    statusEl.textContent = '⏳ جاري القراءة (استنى ثواني)...';

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        statusEl.className = 'upload-status success';
        statusEl.innerHTML = `✅ تم رفع الملف بنجاح!`;
        
        if(type === 'sales') salesWorkbook = workbook;
        if(type === 'prices') pricesWorkbook = workbook;
        
        // تحديث التقارير فوراً
        renderAllReports();
        
      } catch (error) {
        statusEl.className = 'upload-status error';
        statusEl.textContent = '❌ حدث خطأ: ' + error.message;
      }
    };
    reader.readAsArrayBuffer(file);
  };

  function renderAllReports() {
      renderFinancialReport();
      renderAnnualReport();
      renderTopSellers();
      renderMostProfitable();
      renderNeedOffers();
  }

  // =====================================================
  // التقارير المالية (شغالة زي الفل)
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

  // =====================================================
  // 1. الأكثر مبيعاً
  // =====================================================
  window.renderTopSellers = function() {
    try {
      const tbody = document.getElementById('topSellersTableBody');
      if (!salesWorkbook) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#f87171; padding:20px;">⚠️ يرجى رفع ملف المبيعات أولاً من صفحة (رفع ملفات الإكسيل)</td></tr>';
          return;
      }
      
      const sheetName = salesWorkbook.SheetNames.find(n => n.includes('المتابعة'));
      if (!sheetName) return;

      const data = XLSX.utils.sheet_to_json(salesWorkbook.Sheets[sheetName], { header: 1 });
      let topSellers = [];
      
      // بنلف على الشيت ونمسك الأعمدة اللي فيها اسم التحليل (هنبحث عنه بالاسم مش بالرقم عشان نضمن)
      let nameColIndex = -1, countColIndex = -1, count3ColIndex = -1;
      
      // البحث عن العناوين في أول 10 صفوف
      for (let r = 0; r < Math.min(10, data.length); r++) {
          if (!data[r]) continue;
          for (let c = 0; c < data[r].length; c++) {
              let cellText = String(data[r][c] || '').trim();
              if (cellText === 'اسم التحليل') nameColIndex = c;
              if (cellText === 'عدد التكرار' && countColIndex === -1) countColIndex = c; // أول عمود
              if (cellText === 'عدد التكرار اخر 3 شهور') count3ColIndex = c;
          }
          if (nameColIndex !== -1 && countColIndex !== -1) break;
      }

      // لو ملقيناش العناوين، هنستخدم الأرقام الافتراضية بتاعتنا
      if (nameColIndex === -1) nameColIndex = 17;
      if (countColIndex === -1) countColIndex = 18;
      if (count3ColIndex === -1) count3ColIndex = 19;

      for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (row && row[nameColIndex] && typeof row[nameColIndex] === 'string' && row[nameColIndex].trim() !== '') {
              const testName = row[nameColIndex].trim();
              if (testName !== 'اسم التحليل') {
                  topSellers.push({ 
                      name: testName, 
                      count: Number(row[countColIndex]) || 0, 
                      count3: Number(row[count3ColIndex]) || 0 
                  });
              }
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

  // =====================================================
  // 2. الأكثر ربحاً
  // =====================================================
  window.renderMostProfitable = function() {
    try {
      const tbody = document.getElementById('mostProfitableTableBody');
      if (!salesWorkbook || !pricesWorkbook) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#f87171; padding:20px;">⚠️ يرجى رفع (ملف المبيعات) و (ملف الأسعار) أولاً</td></tr>';
          return;
      }

      // 1. تجهيز خريطة التكرار من ملف المبيعات
      const salesSheetName = salesWorkbook.SheetNames.find(n => n.includes('المتابعة'));
      const salesData = XLSX.utils.sheet_to_json(salesWorkbook.Sheets[salesSheetName], { header: 1 });
      let frequencyMap = {};
      
      for (let i = 1; i < salesData.length; i++) {
          const row = salesData[i];
          if (row && row[17] && typeof row[17] === 'string' && row[17].trim() !== '' && row[17] !== 'اسم التحليل') {
              // بنحفظ الاسم بعد توحيد الحروف
              const normName = normalizeArabic(row[17]);
              frequencyMap[normName] = { count: Number(row[18]) || 0 };
          }
      }

      // 2. قراءة الأسعار من ملف الأسعار
      // بنجرب نجيب شيت "التحاليل (2)" أو أول شيت
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
                  
                  // بنحول اسم التحليل عشان نطابقه
                  const normTestName = normalizeArabic(testName);
                  const frequency = frequencyMap[normTestName] ? frequencyMap[normTestName].count : 0;
                  
                  const totalProfit = profitPerTest * frequency;

                  profitableTests.push({
                      name: testName,
                      sell: sellPrice,
                      cost: cost,
                      profitUnit: profitPerTest,
                      frequency: frequency,
                      totalProfit: totalProfit
                  });
              }
          }
      }

      profitableTests.sort((a, b) => b.totalProfit - a.totalProfit);

      let html = '';
      profitableTests.slice(0, 20).forEach((test, index) => {
          html += `
            <tr>
              <td style="font-weight:bold; color:var(--gold);">${index + 1}</td>
              <td style="color: var(--text); text-align:right;">${test.name}</td>
              <td style="color: #00ff7f;">${test.sell} ج</td>
              <td style="color: #f87171;">${test.cost} ج</td>
              <td style="color: #fbbf24;">${test.profitUnit} ج</td>
              <td style="color: #00ff7f; font-weight:bold; font-size:1.1rem;">${test.totalProfit.toLocaleString()} ج</td>
            </tr>
          `;
      });
      tbody.innerHTML = html || '<tr><td colspan="6" style="text-align:center;">لا توجد بيانات كافية (تأكد من وجود أسماء متطابقة بين الملفين)</td></tr>';

    } catch (e) { console.error(e); }
  };

  // =====================================================
  // 3. محتاجة عروض
  // =====================================================
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
                  
                  // لو اتعمل أقل من 5 مرات في آخر 3 شهور، يبقى محتاج عرض
                  if (freq3 < 5) {
                      needOffers.push({
                          name: testName,
                          sell: sellPrice,
                          freq3: freq3
                      });
                  }
              }
          }
      }

      needOffers.sort((a, b) => a.freq3 - b.freq3);

      let html = '';
      needOffers.slice(0, 50).forEach((test) => { 
          html += `
            <tr>
              <td style="color: var(--text); text-align:right;">${test.name}</td>
              <td style="color: #00ff7f;">${test.sell} ج</td>
              <td style="color: #f87171; font-weight:bold;">${test.freq3} مرات</td>
            </tr>
          `;
      });
      tbody.innerHTML = html || '<tr><td colspan="3" style="text-align:center;">كل التحاليل مبيعتها كويسة!</td></tr>';

    } catch (e) { console.error(e); }
  };

  if(sessionStorage.getItem(SESSION_KEY) === 'yes') showDashboard();
  const passInput = document.getElementById('adminPassword');
  if(passInput) passInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') window.checkAdminPassword(); });

})();
