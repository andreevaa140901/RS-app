// config.js - Конфигурация для RS-Detailing

window.DB_CONFIG = {
    local: {
        key: 'rs_detailing_v24'
    },
    api: {
        url: 'https://rs-detailing-app.ru/api.php'
    }
};

console.log('✅ Конфигурация загружена');
console.log('📡 API URL:', window.DB_CONFIG.api.url);
