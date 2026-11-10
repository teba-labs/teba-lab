// =====================================================
// TEBA LABS - Configuration File (v130 - SaaS Stable)
// =====================================================
const _currentTenantId = localStorage.getItem('teba_tenant_id') || "0981e62c-c33d-46c4-8919-2f9fbb0946f6";
const _currentTenantName = localStorage.getItem('teba_tenant_name') || "معامل طيبة";
const _currentLogoUrl = localStorage.getItem('teba_logo_url') || "";

const TEBA_CONFIG = {
    tenant: { 
        id: _currentTenantId, 
        name: _currentTenantName,
        logo: _currentLogoUrl
    },
    lab: {
        name: _currentTenantName, 
        nameEn: "TEBA LABS", 
        doctor: "د/ أحمد طه أبوندا",
        phone: "01123702062", 
        whatsapp: "201099003494", 
        address: "شبين القناطر، القليوبية",
        portalUrl: "https://teba-labs.github.io/teba-lab/index.html" 
    },
    supabase: {
        url: "https://khjzoleiuiipyodpkieg.supabase.co",
        key: "sb_publishable_2Q7SPvruXJar3gvOxtvl5w_p4CVDfcU"
    },
    settings: { 
        sessionTimeout: 2 * 60 * 60 * 1000 // ساعتين
    }
};

// تحديث الواجهة أوتوماتيك بالاسم واللوجو في أي صفحة
document.addEventListener("DOMContentLoaded", () => {
    // تحديث عنوان الصفحة
    if (typeof TEBA_CONFIG !== 'undefined' && TEBA_CONFIG.lab.name) {
        document.title = TEBA_CONFIG.lab.name;
    }
    
    // تحديث أي عنصر يحمل كلاس dyn-lab-name
    document.querySelectorAll('.dyn-lab-name').forEach(el => el.textContent = TEBA_CONFIG.lab.name);
    
    // تحديث اللوجو لو موجود في المتصفح
    if(TEBA_CONFIG.tenant.logo) {
        const logos = document.querySelectorAll('.dyn-logo');
        logos.forEach(logoImg => {
            logoImg.src = TEBA_CONFIG.tenant.logo;
            logoImg.style.display = 'block';
        });
    }
});