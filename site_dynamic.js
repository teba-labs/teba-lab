/* =====================================================
   TEBA LABS - Dynamic Site Settings (v123 - SaaS)
   ===================================================== */

(function() {
    const supabaseUrl = TEBA_CONFIG.supabase.url;
    const supabaseKey = TEBA_CONFIG.supabase.key;
    const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

    async function loadSiteData() {
        // سحب الإعدادات (الاسم، الأرقام، إلخ) بناءً على الـ Tenant
        const { data: settings } = await _supabase.from('site_settings').select('*').eq('tenant_id', TEBA_CONFIG.tenant.id).single();
        
        if (settings) {
            document.querySelectorAll('.dyn-lab-name').forEach(el => el.textContent = settings.lab_name);
            document.querySelectorAll('.dyn-doctor-name').forEach(el => el.textContent = settings.doctor_name);
            document.querySelectorAll('.dyn-doctor-text').forEach(el => el.textContent = 'إشراف ' + settings.doctor_name);
            document.querySelectorAll('.dyn-address').forEach(el => el.textContent = settings.address);

            document.querySelectorAll('.dyn-phone').forEach(el => {
                el.textContent = '📞 ' + settings.phone;
                if (el.tagName === 'A') el.href = 'tel:' + settings.phone;
            });

            document.querySelectorAll('.dyn-wa-link').forEach(el => {
                if (el.tagName === 'A') el.href = 'https://wa.me/' + settings.whatsapp;
            });

            document.querySelectorAll('.dyn-fb-link').forEach(el => {
                if (el.tagName === 'A') el.href = settings.facebook_url;
            });
        }

        // سحب العرض النشط حالياً
        const today = new Date().toISOString().split('T')[0];
        const { data: offers } = await _supabase.from('offers')
            .select('*')
            .eq('tenant_id', TEBA_CONFIG.tenant.id)
            .eq('is_active', true)
            .lte('start_date', today)
            .gte('end_date', today)
            .order('created_at', { ascending: false })
            .limit(1);

        const offerActiveBox = document.getElementById('offerActive');
        const offerExpiredBox = document.getElementById('offerExpired');

        if (offers && offers.length > 0) {
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
    }

    document.addEventListener('DOMContentLoaded', loadSiteData);
})();