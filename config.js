// قراءة الـ tenant_id من المتصفح (لو المعمل مسجل دخول)، أو استخدام معامل طيبة كافتراضي
const _currentTenantId = localStorage.getItem('teba_tenant_id') || "0981e62c-c33d-46c4-8919-2f9fbb0946f6";
const _currentTenantName = localStorage.getItem('teba_tenant_name') || "معامل طيبة";

const TEBA_CONFIG = {
    tenant: {
        id: _currentTenantId,
        name: _currentTenantName
    },
    lab: {
        name: _currentTenantName,
        nameEn: "TEBA LABS", 
        doctor: "د/ أحمد طه أبوندا", 
        phone: "01123702062",
        whatsapp: "201099003494",
        address: "شبين القناطر، القليوبية",
        // لينك بوابة المريض عشان يتبعت في رسالة الواتساب الذكية
        portalUrl: window.location.origin + window.location.pathname.replace(/\/system\/.*|\/dashboard\/.*|\/index.html/g, '') + "/index.html#results" 
    },
    supabase: {
        url: "https://hgqwpykeazuzceeiumjg.supabase.co",
        key: "sb_publishable_7FzS_dDxTF7bObMLJfI_sQ_6ac410OO"
    },
    auth: {
        employeePassword: "123", 
        doctorPassword: "999",
        sessionTimeout: 2 * 60 * 60 * 1000 // ساعتين
    }
};