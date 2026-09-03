// src/core/DataManager.js
// Работает через API на Reg.ru

class DataManager {
    constructor() {
        this.isReady = false;
        this.syncEnabled = false;
        this.pendingSync = [];
        this.isSyncing = false;
        this.apiUrl = '';
    }

    async initialize() {
        console.log('[DataManager] Инициализация...');
        
        if (window.DB_CONFIG && window.DB_CONFIG.api) {
            this.apiUrl = window.DB_CONFIG.api.url;
            console.log('[DataManager] 📡 API URL:', this.apiUrl);
        } else {
            console.warn('[DataManager] ⚠️ API URL не найден');
            this.syncEnabled = false;
            this.isReady = true;
            return;
        }
        
        try {
            const connected = await this.testConnection();
            if (connected) {
                this.syncEnabled = true;
                console.log('[DataManager] ✅ Синхронизация через API включена');
            } else {
                this.syncEnabled = false;
                console.warn('[DataManager] ⚠️ API недоступен');
            }
        } catch (error) {
            console.warn('[DataManager] ⚠️ Ошибка подключения к API:', error.message);
            this.syncEnabled = false;
        }
        
        this.isReady = true;
        console.log('[DataManager] ✅ Инициализация завершена');
    }

    async testConnection() {
        try {
            const response = await fetch(this.apiUrl + '?action=test');
            const result = await response.json();
            if (result && result.connected) {
                console.log('[DataManager] ✅ API доступен, версия MySQL:', result.version);
                return true;
            }
            return false;
        } catch (error) {
            console.error('[DataManager] ❌ Ошибка теста API:', error.message);
            return false;
        }
    }

    async saveData(data) {
        this.saveLocal(data);
        
        if (this.syncEnabled && this.apiUrl) {
            this.queueSync(data);
        } else {
            console.warn('[DataManager] ⚠️ Синхронизация отключена');
        }
    }

    saveLocal(data) {
        try {
            const key = window.DB_CONFIG?.local?.key || 'rs_detailing_v24';
            localStorage.setItem(key, JSON.stringify(data));
            console.log('[DataManager] ✅ Данные сохранены локально');
        } catch (error) {
            console.error('[DataManager] ❌ Ошибка сохранения локально:', error);
        }
    }

    queueSync(data) {
        this.pendingSync.push({
            data: data,
            timestamp: Date.now()
        });
        
        if (!this.isSyncing) {
            this.processSync();
        }
    }

    async processSync() {
        if (this.isSyncing || this.pendingSync.length === 0) return;
        
        this.isSyncing = true;
        console.log('[DataManager] 🔄 Синхронизация с Reg.ru через API...');
        
        try {
            const item = this.pendingSync.shift();
            await this.syncToExternalDB(item.data);
            console.log('[DataManager] ✅ Синхронизация успешна');
        } catch (error) {
            console.warn('[DataManager] ⚠️ Ошибка синхронизации:', error.message);
            if (this.pendingSync.length > 0) {
                setTimeout(() => this.processSync(), 5000);
            }
        } finally {
            this.isSyncing = false;
            if (this.pendingSync.length > 0) {
                setTimeout(() => this.processSync(), 1000);
            }
        }
    }

    async syncToExternalDB(data) {
        if (!this.apiUrl) {
            throw new Error('API URL не установлен');
        }

        try {
            const response = await fetch(this.apiUrl + '?action=save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ data: data })
            });
            
            const result = await response.json();
            
            if (result && result.success) {
                console.log('[DataManager] ✅ Данные синхронизированы через API');
                return true;
            } else {
                throw new Error(result?.message || 'Ошибка синхронизации');
            }
        } catch (error) {
            console.error('[DataManager] ❌ Ошибка синхронизации через API:', error.message);
            throw error;
        }
    }

    async loadData() {
        if (!this.apiUrl) {
            throw new Error('API URL не установлен');
        }

        try {
            const response = await fetch(this.apiUrl + '?action=load');
            const result = await response.json();
            if (result && !result.error) {
                console.log('[DataManager] ✅ Данные загружены из БД');
                return result;
            } else {
                throw new Error(result?.error || 'Ошибка загрузки данных');
            }
        } catch (error) {
            console.error('[DataManager] ❌ Ошибка загрузки данных:', error.message);
            throw error;
        }
    }

    getStatus() {
        return {
            isReady: this.isReady,
            syncEnabled: this.syncEnabled,
            pendingCount: this.pendingSync.length,
            isSyncing: this.isSyncing,
            apiUrl: this.apiUrl
        };
    }
}

// Регистрируем в глобальном объекте
if (typeof window !== 'undefined') {
    window.DataManager = DataManager;
    console.log('✅ DataManager зарегистрирован в window');
}

export default DataManager;
