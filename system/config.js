// =====================================================
// TEBA LABS - Configuration File (v2.0 - SaaS Ready)
// =====================================================
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
        portalUrl: "https://teba-labs.github.io/teba-lab/index.html" 
    },
    supabase: {
        url: "https://khjzoleiuiipyodpkieg.supabase.co",
        key: "sb_publishable_2Q7SPvruXJar3gvOxtvl5w_p4CVDfcU"
    },
    settings: {
        sessionTimeout: 2 * 60 * 60 * 1000 
    }
};