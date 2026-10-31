/* =====================================================
   TEBA LABS - Patient Portal (v2.2 - Final)
   ===================================================== */

const supabaseUrl = TEBA_CONFIG.supabase.url;
const supabaseKey = TEBA_CONFIG.supabase.key;
const _supabasePortal = supabase.createClient(supabaseUrl, supabaseKey);

async function fetchPatientResult() {
    const name = document.getElementById('rName').value.trim();
    const visitId = document.getElementById('rId').value.trim();

    if (!name || !visitId) {
        alert('يرجى إدخال الاسم ورقم الزيارة');
        return;
    }

    const modal = document.getElementById('resultModal');
    const printArea = document.getElementById('print-area');
    printArea.innerHTML = '<p style="text-align:center; padding:50px; font-size:1.2rem; color:#666;">⏳ جاري البحث عن النتيجة...</p>';
    modal.style.display = 'block';

    try {
        // استدعاء الدالة الآمنة من السحابة
        const { data: results, error: rpcErr } = await _supabasePortal.rpc('get_secure_patient_results', {
            p_name: name,
            p_visit_id: parseInt(visitId)
        });

        if (rpcErr) throw new Error('تفاصيل الخطأ: ' + rpcErr.message);
        if (!results || results.length === 0) throw new Error('لم يتم العثور على نتيجة مطابقة. تأكد من الاسم ورقم الزيارة أو أن النتيجة لم يتم نشرها بعد.');

        const patientInfo = results[0];
        const testsData = results; 

        // بناء شكل التقرير
        let reportHtml = `
            <div style="border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <img src="header.png" alt="TEBA LABS" style="max-height: 80px; object-fit: contain;" onerror="this.style.display='none'">
                </div>
                <div style="text-align: left; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                    <p style="margin: 2px 0; font-size: 14px;"><strong>Patient:</strong> ${patientInfo.name}</p>
                    <p style="margin: 2px 0; font-size: 14px;"><strong>Age/Gender:</strong> ${patientInfo.age} ${patientInfo.age_type} / ${patientInfo.gender === 'male' ? 'Male' : 'Female'}</p>
                    <p style="margin: 2px 0; font-size: 14px;"><strong>Visit ID:</strong> ${patientInfo.visit_id}</p>
                    <p style="margin: 2px 0; font-size: 14px;"><strong>Date:</strong> ${new Date(patientInfo.visit_date).toLocaleDateString('en-GB')}</p>
                </div>
            </div>
        `;

        const groupedTests = {};
        testsData.forEach(row => {
            if (!groupedTests[row.test_code]) {
                groupedTests[row.test_code] = {
                    name: row.test_name,
                    params: row.parameters || [],
                    results: row.results_data || {}
                };
            }
        });

        for (const code in groupedTests) {
            const test = groupedTests[code];
            reportHtml += `
                <div style="margin-bottom: 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                    <h3 style="background: #eee; padding: 8px; border-right: 4px solid #000; font-size: 16px; margin-bottom: 10px;">${test.name}</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr style="background: #000; color: #fff;">
                                <th style="padding: 6px; text-align: right;">Test Name</th>
                                <th style="padding: 6px; text-align: center;">Result</th>
                                <th style="padding: 6px; text-align: center;">Unit</th>
                                <th style="padding: 6px; text-align: center;">Ref. Range</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            test.params.forEach(p => {
                const val = test.results[p.name]?.value || '';
                const range = (patientInfo.gender === 'female' ? p.ref_female : p.ref_male) || '-';
                
                let displayVal = val;
                let rowStyle = '';
                
                if (!val) {
                    displayVal = '<span style="color:#dc2626; font-weight:bold;">Under Processing</span>';
                    rowStyle = 'background-color: #fef2f2;';
                }

                reportHtml += `
                    <tr style="${rowStyle}">
                        <td style="padding: 6px; border-bottom: 1px solid #ddd;">${p.label || p.name}</td>
                        <td style="padding: 6px; border-bottom: 1px solid #ddd; text-align: center; font-weight: bold;">${displayVal}</td>
                        <td style="padding: 6px; border-bottom: 1px solid #ddd; text-align: center;">${p.unit || '-'}</td>
                        <td style="padding: 6px; border-bottom: 1px solid #ddd; text-align: center;">${range}</td>
                    </tr>
                `;
            });

            reportHtml += `</tbody></table></div>`;
        }

        reportHtml += `
            <div style="margin-top: 40px; border-top: 1px solid #000; padding-top: 10px; text-align: center; font-size: 12px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                <p style="margin: 4px 0; font-weight: bold; color: #000;">معامل طيبة - د/ أحمد طه أبوندا</p>
                <p style="margin: 4px 0; color: #333;">Tel: 01123702062 | WhatsApp: 01099003494</p>
            </div>
        `;

        printArea.innerHTML = reportHtml;

    } catch (err) {
        printArea.innerHTML = `<p style="text-align:center; padding:50px; font-size:1.2rem; color:#dc2626; font-weight:bold;">❌ ${err.message}</p>`;
    }
}

function downloadPDF() {
    const element = document.getElementById('print-area');
    const opt = {
        margin: 10,
        filename: `Teba_Result_${new Date().toISOString().slice(0,10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
}