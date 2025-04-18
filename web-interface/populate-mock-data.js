const mysql = require('mysql2/promise');
require('dotenv').config();

// Database configuration - make sure we only use env vars
const dbConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

// Configuration settings
const USERS_COUNT = 30;
const DAYS_OF_HISTORY = 30; 
const ACCESS_POINTS = ['School of Science', 'School of Engineering', 'School of Medicine'];
const LOGS_PER_DAY_MIN = 50;
const LOGS_PER_DAY_MAX = 150;

// Create tables if they don't exist
async function createTables(connection) {
    try {
        // Create database if it doesn't exist
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
        await connection.query(`USE ${dbConfig.database}`);
        
        // Create users table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                rfidCardId VARCHAR(8) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                accessLevel INT DEFAULT 1,
                status ENUM('active', 'inactive') DEFAULT 'active',
                balance DECIMAL(10, 2) DEFAULT 0.00,
                createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('Users table is ready');
        
        // Create access_logs table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS access_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                userId INT NOT NULL,
                rfidCardId VARCHAR(8) NOT NULL,
                accessPoint VARCHAR(50) NOT NULL,
                direction ENUM('entry', 'exit') NOT NULL,
                status ENUM('granted', 'denied') NOT NULL,
                reason VARCHAR(100),
                createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_rfidCardId (rfidCardId),
                INDEX idx_createdAt (createdAt),
                FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('Access logs table is ready');
    } catch (error) {
        console.error('Error creating tables:', error);
        throw error;
    }
}

// Generate random data
function generateRfidCardId() {
    return Array(8).fill(0).map(() => 
        Math.floor(Math.random() * 16).toString(16).toUpperCase()
    ).join('');
}

function generateStudentNames(count) {
    const firstNames = [
        'John', 'Mary', 'James', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 
        'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 
        'Thomas', 'Sarah', 'Charles', 'Karen', 'Daniel', 'Nancy', 'Matthew', 'Lisa'
    ];
    
    const lastNames = [
        'Smith', 'Johnson', 'Williams', 'Jones', 'Brown', 'Davis', 'Miller', 'Wilson', 
        'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin'
    ];
    
    const names = [];
    const used = new Set();
    
    while (names.length < count) {
        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        const fullName = `${firstName} ${lastName}`;
        
        if (!used.has(fullName)) {
            used.add(fullName);
            names.push(fullName);
        }
    }
    
    return names;
}

function randomTime(date) {
    const startHour = 7;
    const endHour = 22;
    const hour = startHour + Math.floor(Math.random() * (endHour - startHour));
    const minute = Math.floor(Math.random() * 60);
    const second = Math.floor(Math.random() * 60);
    
    date.setHours(hour, minute, second);
    return date;
}

function randomStatus() {
    return Math.random() > 0.05 ? 'granted' : 'denied';
}

function randomReason(status) {
    if (status === 'granted') return null;
    
    const reasons = [
        'Invalid card', 'Expired card', 'Access restriction',
        'Time restriction', 'Building closed', 'Unauthorized access level'
    ];
    
    return reasons[Math.floor(Math.random() * reasons.length)];
}

// Generate users and access logs
async function populateMockData() {
    let connection;
    
    try {
        // First connect without database to create it if needed
        console.log('Connecting to database server...');
        const tempConfig = { ...dbConfig };
        delete tempConfig.database;
        
        connection = await mysql.createConnection(tempConfig);
        
        // Create database and tables
        await createTables(connection);
        
        // Clear existing data
        console.log('Clearing existing data...');
        await connection.query('DELETE FROM access_logs');
        await connection.query('DELETE FROM users');
        
        // Generate users
        console.log(`Generating ${USERS_COUNT} users...`);
        const names = generateStudentNames(USERS_COUNT);
        const users = [];
        const now = new Date();
        
        for (let i = 0; i < USERS_COUNT; i++) {
            const rfidCardId = generateRfidCardId();
            const name = names[i];
            const accessLevel = Math.floor(Math.random() * 3) + 1; // 1-3
            const status = Math.random() > 0.1 ? 'active' : 'inactive'; // 90% active
            const balance = Math.floor(Math.random() * 10000) / 100; // 0-100.00
            
            users.push([rfidCardId, name, accessLevel, status, balance, now, now]);
        }
        
        // Insert users
        await connection.query(
            'INSERT INTO users (rfidCardId, name, accessLevel, status, balance, createdAt, updatedAt) VALUES ?',
            [users]
        );
        console.log(`Added ${USERS_COUNT} users`);
        
        // Get inserted users with their IDs
        const [insertedUsers] = await connection.query(
            'SELECT id, rfidCardId, name FROM users'
        );
        
        // Generate access logs
        console.log('Generating access logs...');
        const logs = [];
        const today = new Date();
        
        // Track which users are in which buildings
        const usersInBuildings = {};
        
        for (const user of insertedUsers) {
            usersInBuildings[user.rfidCardId] = {};
        }
        
        // Generate logs for each day
        for (let day = 0; day < DAYS_OF_HISTORY; day++) {
            const currentDate = new Date();
            currentDate.setDate(today.getDate() - (DAYS_OF_HISTORY - day));
            currentDate.setHours(0, 0, 0, 0);
            
            // Reset building tracking each day
            for (const user of insertedUsers) {
                usersInBuildings[user.rfidCardId] = {};
            }
            
            // Generate random number of logs per day
            const logsForDay = Math.floor(Math.random() * (LOGS_PER_DAY_MAX - LOGS_PER_DAY_MIN)) + LOGS_PER_DAY_MIN;
            console.log(`Generating ${logsForDay} logs for ${currentDate.toISOString().split('T')[0]}`);
            
            const dayLogs = [];
            
            for (let i = 0; i < logsForDay; i++) {
                // Select a random user
                const user = insertedUsers[Math.floor(Math.random() * insertedUsers.length)];
                
                // Select a random access point
                const accessPoint = ACCESS_POINTS[Math.floor(Math.random() * ACCESS_POINTS.length)];
                
                // Determine direction (entry/exit)
                let direction;
                if (usersInBuildings[user.rfidCardId][accessPoint]) {
                    direction = 'exit';
                    usersInBuildings[user.rfidCardId][accessPoint] = false;
                } else {
                    direction = 'entry';
                    usersInBuildings[user.rfidCardId][accessPoint] = true;
                }
                
                // Random time for this day
                const timestamp = randomTime(new Date(currentDate));
                
                // Determine status and reason
                const status = randomStatus();
                const reason = randomReason(status);
                
                // If access is denied on entry, don't mark as inside
                if (status === 'denied' && direction === 'entry') {
                    usersInBuildings[user.rfidCardId][accessPoint] = false;
                }
                
                dayLogs.push([
                    user.id,
                    user.rfidCardId,
                    accessPoint,
                    direction,
                    status,
                    reason,
                    timestamp,
                    timestamp
                ]);
            }
            
            // Sort day logs by timestamp and add to main logs array
            dayLogs.sort((a, b) => a[6] - b[6]);
            logs.push(...dayLogs);
        }
        
        // Insert logs in batches
        const batchSize = 500;
        for (let i = 0; i < logs.length; i += batchSize) {
            const batch = logs.slice(i, Math.min(i + batchSize, logs.length));
            await connection.query(
                'INSERT INTO access_logs (userId, rfidCardId, accessPoint, direction, status, reason, createdAt, updatedAt) VALUES ?',
                [batch]
            );
            console.log(`Inserted ${Math.min(i + batchSize, logs.length)}/${logs.length} logs`);
        }
        
        // Display summary
        const [userCount] = await connection.query('SELECT COUNT(*) as count FROM users');
        const [logCount] = await connection.query('SELECT COUNT(*) as count FROM access_logs');
        
        console.log('\n--- Summary ---');
        console.log(`Total users: ${userCount[0].count}`);
        console.log(`Total access logs: ${logCount[0].count}`);
        console.log('Mock data generation complete!');
        
    } catch (error) {
        console.error('Error generating mock data:', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('Database connection closed');
        }
    }
}

// Run the script
populateMockData().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
}); 