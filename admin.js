/* =====================================================
   TEBA LABS - Admin Logic (v17 - TRUE FIX)
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
      localStorage.removeItem('teba_excel_data');
      location.reload();
    }
  };

  window.handleFileUpload = function(event){
    const file = event.target.files[0];
    if(file) processFile(file);
  };

  function processFile(file){
    const status = document.getElementById('uploadStatus');
    status.className = 'upload-status';
    status.textContent = '⏳ جاري قراءة الملف...';

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        
        const base64 = btoa(data.reduce((data, byte) => data + String.fromCharCode(byte), ''));
        try { localStorage.setItem('teba_excel_data', base64); } catch(err) {}

        const workbook = XLSX.read(data, { type: 'array' });
        
        status.className = 'upload-status success';
        status.innerHTML = `✅ تم قراءة الملف بنجاح!<br><small>(البيانات محفوظة)</small>`;
        
        window.uploadedWorkbook = workbook; 
        renderFinancialReport();
        renderAnnualReport();
        
      } catch (error) {
        status.className = 'upload-status error';
        status.textContent = '❌ حدث خطأ: ' + error.message;
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function loadSavedData() {
    const base64 = localStorage.getItem('teba_excel_data');
    if(!base64) return;
    try {
        const workbook = XLSX.read(base64, { type: 'base64' });
        window.uploadedWorkbook = workbook;
        renderFinancialReport();
        renderAnnualReport();
        document.getElementById('uploadStatus').className = 'upload-status success';
        document.getElementById('uploadStatus').innerHTML = '✅ تم تحميل البيانات المحفوظة سابقاً.';
    } catch(err) { console.error("خطأ في التحميل:", err); }
  }

  window.renderFinancialReport = function() {
    try {
      if (!window.uploadedWorkbook) return;

      const selectedYear = document.getElementById('yearSelector').value;
      const selectedMonth = document.getElementById('monthSelector').value;
      const selectedBranch = document.getElementById('branchSelector').value;
      
      const sheetName = 'المتابعة السنوية';
      if (!window.uploadedWorkbook.Sheets[sheetName]) return;

      const ws = window.uploadedWorkbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

      let startRow = 0;
      if (selectedYear === '2024') startRow = 29; // صف 30
      else if (selectedYear === '2025') startRow = 46; // صف 47
      else if (selectedYear === '2026') startRow = 63; // صف 64

      let totalRevenue = 0;
      let totalExpenses = 0;

      const getNum = (val) => {
          if (typeof val === 'number') return Math.round(val);
          if (typeof val === 'string') {
              const parsed = parseFloat(val.replace(/,/g, ''));
              return isNaN(parsed) ? 0 : Math.round(parsed);
          }
          return 0;
      };

      const processMonth = (monthIndex) => {
          const row = data[startRow + monthIndex - 1] || [];
          
          // بهتيم: الإيراد (Index 0)، المصاريف (Index 2)
          const bRev = getNum(row[0]); 
          const bExp = getNum(row[2]); 
          
          // الجعافرة: الإيراد (Index 14)، المصاريف (Index 12)
          const jRev = getNum(row[14]); 
          const jExp = getNum(row[12]); 

          if (selectedBranch === 'combined') {
              totalRevenue += (jRev + bRev);
              totalExpenses += (jExp + bExp);
          } else if (selectedBranch === 'jaafara') {
              totalRevenue += jRev;
              totalExpenses += jExp;
          } else if (selectedBranch === 'bahtim') {
              totalRevenue += bRev;
              totalExpenses += bExp;
          }
      };

      if (selectedMonth === 'all') {
          for (let i = 1; i <= 12; i++) processMonth(i);
      } else {
          processMonth(parseInt(selectedMonth));
      }

      const netProfit = totalRevenue - totalExpenses;
      let branchName = 'إجمالي الفرعين';
      if (selectedBranch === 'jaafara') branchName = 'الجعافرة';
      if (selectedBranch === 'bahtim') branchName = 'بهتيم';

      document.getElementById('fin-revenue').textContent = totalRevenue.toLocaleString('en-US') + ' ج';
      document.getElementById('fin-expenses').textContent = totalExpenses.toLocaleString('en-US') + ' ج';
      document.getElementById('fin-profit').textContent = netProfit.toLocaleString('en-US') + ' ج';

      const ctx = document.getElementById('financeChart').getContext('2d');
      if (window.myChart) window.myChart.destroy(); 

      window.myChart = new Chart(ctx, {
          type: 'bar',
          data: {
              labels: ['الإيرادات', 'المصروفات', 'صافي الربح'],
              datasets: [{
                  label: `${branchName} - ${selectedYear}`,
                  data: [totalRevenue, totalExpenses, netProfit],
                  backgroundColor: ['rgba(0, 255, 127, 0.5)', 'rgba(248, 113, 113, 0.5)', 'rgba(251, 191, 36, 0.5)'],
                  borderColor: ['#00ff7f', '#f87171', '#fbbf24'],
                  borderWidth: 2,
                  borderRadius: 8
              }]
          },
          options: {
              responsive: true,
              plugins: { legend: { display: true, labels: { color: '#fff', font: { family: 'Almarai' } } } },
              scales: {
                  y: { ticks: { color: '#a8b5a8' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                  x: { ticks: { color: '#a8b5a8' }, grid: { display: false } }
              }
          }
      });
    } catch (error) { console.error("خطأ في التقرير الشهري:", error); }
  }

  window.renderAnnualReport = function() {
    try {
      if (!window.uploadedWorkbook) return;

      const sheetName = 'المتابعة السنوية';
      if (!window.uploadedWorkbook.Sheets[sheetName]) return;

      const ws = window.uploadedWorkbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

      // صفوف الإجماليات
      const yearsData = [
          { year: '2024', row: data[41] }, // صف 42
          { year: '2025', row: data[58] }, // صف 59
          { year: '2026', row: data[75] }  // صف 76
      ];

      let jaafaraHTML = '';
      let bahtimHTML = '';

      let revData = { jaafara: [], bahtim: [] };
      let profitData = { jaafara: [], bahtim: [] };

      yearsData.forEach(y => {
          if (!y.row) return;
          
          // بهتيم: الإيراد (0)، المصاريف (2)، الربح (4)
          const bRev = Math.round(Number(y.row[0]) || 0);
          const bExp = Math.round(Number(y.row[2]) || 0);
          const bProfit = Math.round(Number(y.row[4]) || 0);

          // الجعافرة: الإيراد (14)، المصاريف (12)، الربح (10)
          const jRev = Math.round(Number(y.row[14]) || 0);
          const jExp = Math.round(Number(y.row[12]) || 0);
          const jProfit = Math.round(Number(y.row[10]) || 0);

          revData.jaafara.push(jRev);
          revData.bahtim.push(bRev);
          profitData.jaafara.push(jProfit);
          profitData.bahtim.push(bProfit);

          jaafaraHTML += `
            <tr>
              <td style="font-weight:bold; color:var(--gold);">${y.year}</td>
              <td style="color: #00ff7f;">${jRev.toLocaleString('en-US')} ج</td>
              <td style="color: #f87171;">${jExp.toLocaleString('en-US')} ج</td>
              <td style="color: #fbbf24; font-weight:bold;">${jProfit.toLocaleString('en-US')} ج</td>
            </tr>`;

          bahtimHTML += `
            <tr>
              <td style="font-weight:bold; color:var(--gold);">${y.year}</td>
              <td style="color: #00ff7f;">${bRev.toLocaleString('en-US')} ج</td>
              <td style="color: #f87171;">${bExp.toLocaleString('en-US')} ج</td>
              <td style="color: #fbbf24; font-weight:bold;">${bProfit.toLocaleString('en-US')} ج</td>
            </tr>`;
      });

      document.getElementById('annualTableJaafara').innerHTML = jaafaraHTML;
      document.getElementById('annualTableBahtim').innerHTML = bahtimHTML;

      const revCtx = document.getElementById('annualRevChart').getContext('2d');
      if (window.revChart) window.revChart.destroy(); 
      window.revChart = new Chart(revCtx, {
          type: 'bar',
          data: {
              labels: ['2024', '2025', '2026'],
              datasets: [
                  { label: 'الجعافرة', data: revData.jaafara, backgroundColor: 'rgba(0, 255, 127, 0.7)', borderColor: '#00ff7f', borderWidth: 1 },
                  { label: 'بهتيم', data: revData.bahtim, backgroundColor: 'rgba(0, 191, 255, 0.7)', borderColor: '#00bfff', borderWidth: 1 }
              ]
          },
          options: { responsive: true, plugins: { legend: { labels: { color: '#fff' } } }, scales: { y: { ticks: { color: '#a8b5a8' } }, x: { ticks: { color: '#a8b5a8' } } } }
      });

      const profitCtx = document.getElementById('annualProfitChart').getContext('2d');
      if (window.profitChart) window.profitChart.destroy(); 
      window.profitChart = new Chart(profitCtx, {
          type: 'bar',
          data: {
              labels: ['2024', '2025', '2026'],
              datasets: [
                  { label: 'الجعافرة', data: profitData.jaafara, backgroundColor: 'rgba(251, 191, 36, 0.7)', borderColor: '#fbbf24', borderWidth: 1 },
                  { label: 'بهتيم', data: profitData.bahtim, backgroundColor: 'rgba(248, 113, 113, 0.7)', borderColor: '#f87171', borderWidth: 1 }
              ]
          },
          options: { responsive: true, plugins: { legend: { labels: { color: '#fff' } } }, scales: { y: { ticks: { color: '#a8b5a8' } }, x: { ticks: { color: '#a8b5a8' } } } }
      });

    } catch (error) { console.error("خطأ في التقرير السنوي:", error); }
  }

  if(sessionStorage.getItem(SESSION_KEY) === 'yes') showDashboard();
  
  const passInput = document.getElementById('adminPassword');
  if(passInput) passInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') window.checkAdminPassword(); });

  const uploadZone = document.getElementById('uploadZone');
  if(uploadZone){
    ['dragenter','dragover'].forEach(evt => uploadZone.addEventListener(evt, e => { e.preventDefault(); uploadZone.classList.add('dragover'); }));
    ['dragleave','drop'].forEach(evt => uploadZone.addEventListener(evt, e => { e.preventDefault(); uploadZone.classList.remove('dragover'); }));
    uploadZone.addEventListener('drop', e => {
      const file = e.dataTransfer.files[0];
      if(file) processFile(file);
    });
  }

})();