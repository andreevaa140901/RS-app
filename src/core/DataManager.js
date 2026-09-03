// src/core/DataManager.js

class DataManager {
    constructor() {
        this.isReady = false;
        this.syncEnabled = false;
        this.pendingSync = [];
        this.isSyncing = false;
    }

    async initialize() {
        console.log('[DataManager] Инициализация...');
        
        if (window.DB_CONFIG && window.DB_CONFIG.external) {
            try {
                await this.connectToExternalDB();
                this.syncEnabled = true;
                console.log('[DataManager] ✅ Внешняя БД подключена');
            } catch (error) {
                console.warn('[DataManager] ⚠️ Внешняя БД недоступна:', error.message);
                this.syncEnabled = false;
            }
        }
        
        this.isReady = true;
        console.log('[DataManager] ✅ Инициализация завершена');
    }

    async connectToExternalDB() {
        return new Promise((resolve, reject) => {
            try {
                const config = window.DB_CONFIG.external;
                
                if (window.mysql2) {
                    const connection = window.mysql2.createConnection({
                        host: config.host,
                        port: config.port || 3306,
                        user: config.user,
                        password: config.password,
                        database: config.database,
                        connectTimeout: 5000
                    });
                    
                    connection.connect((err) => {
                        if (err) {
                            reject(err);
                        } else {
                            window.externalDB = connection;
                            this.createTablesIfNotExist(connection);
                            resolve(connection);
                        }
                    });
                } else {
                    reject(new Error('mysql2 не загружен'));
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    async createTablesIfNotExist(connection) {
        console.log('[DataManager] Проверка таблиц...');
        
        const tables = [
            {
                name: 'clients',
                sql: `CREATE TABLE IF NOT EXISTS clients (
                    id VARCHAR(20) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    phone VARCHAR(20) NOT NULL,
                    total_spent DECIMAL(12,2) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )`
            },
            {
                name: 'cars',
                sql: `CREATE TABLE IF NOT EXISTS cars (
                    id VARCHAR(20) PRIMARY KEY,
                    client_id VARCHAR(20) NOT NULL,
                    brand VARCHAR(100) NOT NULL,
                    model VARCHAR(100) NOT NULL,
                    plate VARCHAR(20),
                    body_type VARCHAR(50),
                    is_frequent BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )`
            },
            {
                name: 'bookings',
                sql: `CREATE TABLE IF NOT EXISTS bookings (
                    id VARCHAR(20) PRIMARY KEY,
                    client_id VARCHAR(20) NOT NULL,
                    car_id VARCHAR(20) NOT NULL,
                    service_ids TEXT,
                    date DATE NOT NULL,
                    time VARCHAR(10) NOT NULL,
                    phone VARCHAR(20),
                    price DECIMAL(12,2) NOT NULL,
                    discount_applied BOOLEAN DEFAULT FALSE,
                    discount_percent DECIMAL(5,2) DEFAULT 0,
                    discount_amount DECIMAL(12,2) DEFAULT 0,
                    final_price DECIMAL(12,2) NOT NULL,
                    status VARCHAR(20) DEFAULT 'new',
                    box_number INT DEFAULT 1,
                    duration INT DEFAULT 30,
                    staff_ids TEXT,
                    completed_at TIMESTAMP,
                    no_show_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )`
            },
            {
                name: 'services',
                sql: `CREATE TABLE IF NOT EXISTS services (
                    id VARCHAR(20) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    category VARCHAR(100),
                    light_price DECIMAL(10,2) DEFAULT 0,
                    suv_price DECIMAL(10,2) DEFAULT 0,
                    jeep_price DECIMAL(10,2) DEFAULT 0,
                    minibus_price DECIMAL(10,2) DEFAULT 0,
                    duration INT DEFAULT 30,
                    chemicals TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )`
            },
            {
                name: 'recommendations',
                sql: `CREATE TABLE IF NOT EXISTS recommendations (
                    id VARCHAR(20) PRIMARY KEY,
                    car_id VARCHAR(20) NOT NULL,
                    text TEXT NOT NULL,
                    date DATE,
                    status VARCHAR(20) DEFAULT 'active',
                    completed_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )`
            },
            {
                name: 'inventory',
                sql: `CREATE TABLE IF NOT EXISTS inventory (
                    id VARCHAR(20) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    stock DECIMAL(12,2) NOT NULL,
                    unit VARCHAR(20),
                    min_stock DECIMAL(12,2),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )`
            },
            {
                name: 'staff',
                sql: `CREATE TABLE IF NOT EXISTS staff (
                    id VARCHAR(20) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    role VARCHAR(50),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )`
            }
        ];

        for (const table of tables) {
            connection.query(table.sql, (err) => {
                if (err) {
                    console.warn(`[DataManager] ⚠️ Ошибка создания таблицы ${table.name}:`, err.message);
                } else {
                    console.log(`[DataManager] ✅ Таблица ${table.name} готова`);
                }
            });
        }
    }

    async saveData(data) {
        this.saveLocal(data);
        
        if (this.syncEnabled && window.externalDB) {
            this.queueSync(data);
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
        console.log('[DataManager] 🔄 Синхронизация с Reg.ru...');
        
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
        if (!window.externalDB) {
            throw new Error('Нет подключения к внешней БД');
        }

        const connection = window.externalDB;
        
        if (data.clients && data.clients.length > 0) {
            for (const client of data.clients) {
                await this.upsertClient(connection, client);
            }
        }

        if (data.cars && data.cars.length > 0) {
            for (const car of data.cars) {
                await this.upsertCar(connection, car);
            }
        }

        if (data.bookings && data.bookings.length > 0) {
            for (const booking of data.bookings) {
                await this.upsertBooking(connection, booking);
            }
        }
    }

    upsertClient(connection, client) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO clients (id, name, phone, total_spent) 
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    name = VALUES(name),
                    phone = VALUES(phone),
                    total_spent = VALUES(total_spent)
            `;
            
            connection.query(sql, [
                String(client.id),
                client.name || 'Клиент',
                client.phone || '',
                client.total_spent || 0
            ], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    upsertCar(connection, car) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO cars (id, client_id, brand, model, plate, body_type, is_frequent)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    client_id = VALUES(client_id),
                    brand = VALUES(brand),
                    model = VALUES(model),
                    plate = VALUES(plate),
                    body_type = VALUES(body_type),
                    is_frequent = VALUES(is_frequent)
            `;
            
            connection.query(sql, [
                String(car.id),
                String(car.client_id),
                car.brand || '',
                car.model || '',
                car.plate || '',
                car.body_type || '',
                car.is_frequent || false
            ], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    upsertBooking(connection, booking) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO bookings (
                    id, client_id, car_id, service_ids, date, time, phone,
                    price, discount_applied, discount_percent, discount_amount,
                    final_price, status, box_number, duration, staff_ids,
                    completed_at, no_show_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    staff_ids = VALUES(staff_ids),
                    completed_at = VALUES(completed_at),
                    no_show_at = VALUES(no_show_at)
            `;
            
            connection.query(sql, [
                String(booking.id),
                String(booking.client_id),
                String(booking.car_id),
                JSON.stringify(booking.service_ids || [booking.service_id]),
                booking.date || new Date().toISOString().split('T')[0],
                booking.time || '09:00',
                booking.phone || '',
                booking.price || 0,
                booking.discount_applied || false,
                booking.discount_percent || 0,
                booking.discount_amount || 0,
                booking.final_price || booking.price || 0,
                booking.status || 'new',
                booking.box_number || 1,
                booking.duration || 30,
                booking.staff_ids ? JSON.stringify(booking.staff_ids) : null,
                booking.completed_at || null,
                booking.no_show_at || null
            ], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    getStatus() {
        return {
            isReady: this.isReady,
            syncEnabled: this.syncEnabled,
            pendingCount: this.pendingSync.length,
            isSyncing: this.isSyncing
        };
    }
}

if (typeof window !== 'undefined') {
    window.DataManager = DataManager;
}
