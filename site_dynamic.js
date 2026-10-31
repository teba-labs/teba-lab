/* =====================================================
   TEBA LABS - Dynamic Site Settings (v1.0)
   هذا الملف يقرأ البيانات من السحابة ويحدث الموقع
   ===================================================== */

(function() {
    // 1. تهيئة الاتصال بالسحابة
    const supabaseUrl = TEBA_CONFIG.supabase.url;
    const supabaseKey = TEBA_CONFIG.supabase.key;
    const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

    async function loadSiteData() {
        // 2. سحب الإعدادات (الاسم، الأرقام، إلخ)
        const { data: settings } = await _supabase.from('site_settings').select('*').eq('id', 1).single();
        
        if (settings) {
            // تحديث اسم المعمل
            document.querySelectorAll('.dyn-lab-name').forEach(el => el.textContent = settings.lab_name);
            
            // تحديث اسم الدكتور
            document.querySelectorAll('.dyn-doctor-name').forEach(el => el.textContent = settings.doctor_name);
            document.querySelectorAll('.dyn-doctor-text').forEach(el => el.textContent = 'إشراف ' + settings.doctor_name);

            // تحديث العنوان
            document.querySelectorAll('.dyn-address').forEach(el => el.textContent = settings.address);

            // تحديث التليفون
            document.querySelectorAll('.dyn-phone').forEach(el => {
                el.textContent = '📞 ' + settings.phone;
                if (el.tagName === 'A') el.href = 'tel:' + settings.phone;
            });

            // تحديث روابط الواتساب
            document.querySelectorAll('.dyn-wa-link').forEach(el => {
                if (el.tagName === 'A') el.href = 'https://wa.me/' + settings.whatsapp;
            });

            // تحديث رابط الفيسبوك
            document.querySelectorAll('.dyn-fb-link').forEach(el => {
                if (el.tagName === 'A') el.href = settings.facebook_url;
            });
        }

        // 3. سحب العرض النشط حالياً
        const today = new Date().toISOString().split('T')[0];
        const { data: offers } = await _supabase.from('offers')
            .select('*')
            .eq('is_active', true)
            .lte('start_date', today)
            .gte('end_date', today)
            .order('created_at', { ascending: false })
            .limit(1);

        const offerActiveBox = document.getElementById('offerActive');
        const offerExpiredBox = document.getElementById('offerExpired');

        if (offers && offers.length > 0) {
            const activeOffer = offers[0];
            
            // تحديث صندوق العروض في قسم العروض
            if (document.getElementById('offerPct')) document.getElementById('offerPct').textContent = activeOffer.discount_pct + '%';
            if (document.getElementById('offerTitle')) document.getElementById('offerTitle').textContent = activeOffer.title;
            if (document.getElementById('offerDesc')) document.getElementById('offerDesc').textContent = activeOffer.description;
            if (document.getElementById('offerPeriod')) {
                const endDate = new Date(activeOffer.end_date).toLocaleDateString('ar-EG', { month: 'long', day: 'numeric', year: 'numeric' });
                document.getElementById('offerPeriod').textContent = '📅 ينتهي في ' + endDate;
            }
            
            // تحديث النافذة المنبثقة (Popup)
            const popupDiscount = document.querySelector('.dyn-popup-discount');
            if (popupDiscount) popupDiscount.textContent = activeOffer.discount_pct + '%';

            if (offerActiveBox) offerActiveBox.style.display = 'block';
            if (offerExpiredBox) offerExpiredBox.style.display = 'none';

        } else {
            // لو مفيش عرض شغال
            if (offerActiveBox) offerActiveBox.style.display = 'none';
            if (offerExpiredBox) offerExpiredBox.style.display = 'block';
        }
    }

    // تشغيل الدالة بمجرد تحميل الصفحة
    document.addEventListener('DOMContentLoaded', loadSiteData);
})();