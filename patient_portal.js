/* =====================================================
   TEBA LABS - Patient Portal (v2.4 - Print Fix)
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
        const { data: results, error: rpcErr } = await _supabasePortal.rpc('get_secure_patient_results', {
            p_name: name,
            p_visit_id: parseInt(visitId)
        });

        if (rpcErr) {
            console.error("Supabase RPC Error:", rpcErr);
            throw new Error('حدث خطأ في الاتصال بقاعدة البيانات. يرجى المحاولة لاحقاً.');
        }
        
        if (!results || results.length === 0) {
            throw new Error('لم يتم العثور على نتيجة مطابقة. تأكد من الاسم ورقم الزيارة أو أن النتيجة لم يتم نشرها بعد.');
        }

        const patientInfo = results[0];
        const testsData = results; 

        // ✅ إجبار الألوان على الأسود والأبيض عشان تظهر في الـ PDF
        let reportHtml = `
            <div style="color: #000 !important; background: #fff !important; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; width: 100%;">
                <div style="border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <img src="header.png" alt="TEBA LABS" style="max-height: 80px; object-fit: contain;" onerror="this.style.display='none'">
                    </div>
                    <div style="text-align: left;">
                        <p style="margin: 2px 0; font-size: 14px; color: #000 !important;"><strong>Patient:</strong> <span style="color: #000 !important;">${patientInfo.name}</span></p>
                        <p style="margin: 2px 0; font-size: 14px; color: #000 !important;"><strong>Age/Gender:</strong> <span style="color: #000 !important;">${patientInfo.age} ${patientInfo.age_type} / ${patientInfo.gender === 'male' ? 'Male' : 'Female'}</span></p>
                        <p style="margin: 2px 0; font-size: 14px; color: #000 !important;"><strong>Visit ID:</strong> <span style="color: #000 !important;">${patientInfo.visit_id}</span></p>
                        <p style="margin: 2px 0; font-size: 14px; color: #000 !important;"><strong>Date:</strong> <span style="color: #000 !important;">${new Date(patientInfo.visit_date).toLocaleDateString('en-GB')}</span></p>
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
                <div style="margin-bottom: 20px;">
                    <h3 style="background: #eee !important; color: #000 !important; padding: 8px; border-right: 4px solid #000; font-size: 16px; margin-bottom: 10px;">${test.name}</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #000 !important;">
                        <thead>
                            <tr style="background: #000 !important; color: #fff !important;">
                                <th style="padding: 6px; text-align: right; color: #fff !important;">Test Name</th>
                                <th style="padding: 6px; text-align: center; color: #fff !important;">Result</th>
                                <th style="padding: 6px; text-align: center; color: #fff !important;">Unit</th>
                                <th style="padding: 6px; text-align: center; color: #fff !important;">Ref. Range</th>
                            </tr>
                        </thead>
                        <tbody style="color: #000 !important;">
            `;

            test.params.forEach(p => {
                const val = test.results[p.name]?.value || '';
                const range = (patientInfo.gender === 'female' ? p.ref_female : p.ref_male) || '-';
                
                let displayVal = val;
                let rowStyle = 'color: #000 !important;';
                
                if (!val) {
                    displayVal = '<span style="color:#dc2626 !important; font-weight:bold;">Under Processing</span>';
                    rowStyle = 'background-color: #fef2f2; color: #000 !important;';
                }

                reportHtml += `
                    <tr style="${rowStyle}">
                        <td style="padding: 6px; border-bottom: 1px solid #ddd; color: #000 !important;">${p.label || p.name}</td>
                        <td style="padding: 6px; border-bottom: 1px solid #ddd; text-align: center; font-weight: bold; color: #000 !important;">${displayVal}</td>
                        <td style="padding: 6px; border-bottom: 1px solid #ddd; text-align: center; color: #000 !important;">${p.unit || '-'}</td>
                        <td style="padding: 6px; border-bottom: 1px solid #ddd; text-align: center; color: #000 !important;">${range}</td>
                    </tr>
                `;
            });

            reportHtml += `</tbody></table></div>`;
        }

        reportHtml += `
                <div style="margin-top: 40px; border-top: 1px solid #000; padding-top: 10px; text-align: center; font-size: 12px;">
                    <p style="margin: 4px 0; font-weight: bold; color: #000 !important;">معامل طيبة - د/ أحمد طه أبوندا</p>
                    <p style="margin: 4px 0; color: #333 !important;">Tel: 01123702062 | WhatsApp: 01099003494</p>
                </div>
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
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }, // ✅ خلفية بيضاء
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
}