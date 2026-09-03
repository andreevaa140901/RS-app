// config.js - Конфигурация для RS-Detailing

window.DB_CONFIG = {
    // Локальное хранилище (localStorage)
    local: {
        key: 'rs_detailing_v24'
    },
    
    // API на Reg.ru
    api: {
        url: 'https://rs-detailing-app.ru/api.php'
    }
};

console.log('✅ Конфигурация загружена');
console.log('📡 API URL:', window.DB_CONFIG.api.url);
