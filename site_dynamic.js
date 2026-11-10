/* =====================================================
   TEBA LABS - Dynamic Site Settings (v130 - SaaS)
   ===================================================== */

(function() {
    // تأكيد وجود الإعدادات
    if (typeof TEBA_CONFIG === 'undefined') {
        console.error("TEBA_CONFIG is missing in site_dynamic.js");
        return;
    }

    const supabaseUrl = TEBA_CONFIG.supabase.url;
    const supabaseKey = TEBA_CONFIG.supabase.key;
    const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

    async function loadSiteData() {
        try {
            // 1. سحب الإعدادات (الاسم، الأرقام، العنوان) بناءً على الـ Tenant
            const { data: settings, error } = await _supabase
                .from('site_settings')
                .select('*')
                .eq('tenant_id', TEBA_CONFIG.tenant.id)
                .single();
            
            if (!error && settings) {
                document.querySelectorAll('.dyn-lab-name').forEach(el => el.textContent = settings.lab_name || 'معامل طيبة');
                document.querySelectorAll('.dyn-doctor-name').forEach(el => el.textContent = settings.doctor_name || 'د/ أحمد طه أبوندا');
                document.querySelectorAll('.dyn-doctor-text').forEach(el => el.textContent = 'إشراف ' + (settings.doctor_name || 'د/ أحمد طه أبوندا'));
                document.querySelectorAll('.dyn-address').forEach(el => el.textContent = settings.address || 'الصحابة، شبين القناطر، القليوبية');

                document.querySelectorAll('.dyn-phone').forEach(el => {
                    el.textContent = '📞 ' + (settings.phone || '01123702062');
                    if (el.tagName === 'A') el.href = 'tel:' + (settings.phone || '01123702062');
                });

                document.querySelectorAll('.dyn-wa-link').forEach(el => {
                    if (el.tagName === 'A') el.href = 'https://wa.me/' + (settings.whatsapp || '201099003494');
                });

                document.querySelectorAll('.dyn-fb-link').forEach(el => {
                    if (el.tagName === 'A') el.href = settings.facebook_url || '#';
                });
            }

            // 2. سحب العرض النشط حالياً
            const today = new Date().toISOString().split('T')[0];
            const { data: offers, error: offerError } = await _supabase.from('offers')
                .select('*')
                .eq('tenant_id', TEBA_CONFIG.tenant.id)
                .eq('is_active', true)
                .lte('start_date', today)
                .gte('end_date', today)
                .order('created_at', { ascending: false })
                .limit(1);

            const offerActiveBox = document.getElementById('offerActive');
            const offerExpiredBox = document.getElementById('offerExpired');

            if (!offerError && offers && offers.length > 0) {
                const activeOffer = offers[0];
                if (document.getElementById('offerPct')) document.getElementById('offerPct').textContent = activeOffer.discount_pct + '%';
                if (document.getElementById('offerTitle')) document.getElementById('offerTitle').textContent = activeOffer.title;
                if (document.getElementById('offerDesc')) document.getElementById('offerDesc').textContent = activeOffer.description;
                if (document.getElementById('offerPeriod')) {
                    const endDate = new Date(activeOffer.end_date).toLocaleDateString('ar-EG', { month: 'long', day: 'numeric', year: 'numeric' });
                    document.getElementById('offerPeriod').textContent = '📅 ينتهي في ' + endDate;
                }
                const popupDiscount = document.querySelector('.dyn-popup-discount');
                if (popupDiscount) popupDiscount.textContent = activeOffer.discount_pct + '%';

                if (offerActiveBox) offerActiveBox.style.display = 'block';
                if (offerExpiredBox) offerExpiredBox.style.display = 'none';
            } else {
                if (offerActiveBox) offerActiveBox.style.display = 'none';
                if (offerExpiredBox) offerExpiredBox.style.display = 'block';
            }
        } catch(e) {
            console.warn("Error loading dynamic site data:", e);
        }
    }

    document.addEventListener('DOMContentLoaded', loadSiteData);
})();