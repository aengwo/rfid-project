const mysql = require('mysql2/promise');
require('dotenv').config();

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 8807,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'rfid_system',
};

// Mock data configuration
const USERS_COUNT = 50;
const DAYS_OF_LOGS = 30;
const ACCESS_POINTS = ['School of Science', 'School of Engineering', 'School of Medicine'];
const CAMPUS_CODES = {
    'School of Science': 'SCI',
    'School of Engineering': 'ENG',
    'School of Medicine': 'MED'
};

// Random time functions
function randomTime(start, end) {
    const startTime = start.getTime();
    const endTime = end.getTime();
    return new Date(startTime + Math.random() * (endTime - startTime));
}

function randomStatus() {
    return Math.random() > 0.05 ? 'granted' : 'denied';
}

function randomReason(status) {
    if (status === 'granted') return null;
    
    const reasons = [
        'Card expired',
        'Insufficient balance',
        'Access restricted',
        'Unregistered card',
        'Time restriction'
    ];
    
    return reasons[Math.floor(Math.random() * reasons.length)];
}

// Generate a random RFID card ID (8 character hexadecimal)
function generateRfidCardId() {
    return Array(8).fill(0).map(() => 
        Math.floor(Math.random() * 16).toString(16).toUpperCase()
    ).join('');
}

// Generate a list of student names
function generateStudentNames(count) {
    const firstNames = ['John', 'Mary', 'James', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth', 
                         'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen',
                         'Daniel', 'Nancy', 'Matthew', 'Lisa', 'Anthony', 'Margaret', 'Mark', 'Betty', 'Donald', 'Sandra',
                         'Steven', 'Ashley', 'Paul', 'Dorothy', 'Andrew', 'Kimberly', 'Joshua', 'Emily', 'Kenneth', 'Donna'];
    
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Jones', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor',
                         'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Thompson', 'Garcia', 'Martinez', 'Robinson',
                         'Clark', 'Rodriguez', 'Lewis', 'Lee', 'Walker', 'Hall', 'Allen', 'Young', 'Hernandez', 'King',
                         'Wright', 'Lopez', 'Hill', 'Scott', 'Green', 'Adams', 'Baker', 'Gonzalez', 'Nelson', 'Carter'];
    
    const names = [];
    for (let i = 0; i < count; i++) {
        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        names.push(`${firstName} ${lastName}`);
    }
    
    return names;
}

// Generate mock users data
async function generateUsers(db, count) {
    console.log(`Generating ${count} mock users...`);
    
    const names = generateStudentNames(count);
    const users = [];
    const now = new Date();
    
    for (let i = 0; i < count; i++) {
        const rfidCardId = generateRfidCardId();
        const name = names[i];
        const accessLevel = Math.floor(Math.random() * 3) + 1;
        const status = Math.random() > 0.1 ? 'active' : 'inactive';
        const balance = Math.floor(Math.random() * 10000) / 100;
        const createdAt = now;
        
        users.push([rfidCardId, name, accessLevel, status, balance, createdAt]);
    }
    
    // Insert users in batches
    try {
        const query = 'INSERT INTO users (rfidCardId, name, accessLevel, status, balance, createdAt) VALUES ?';
        await db.query(query, [users]);
        console.log(`Successfully added ${count} mock users.`);
        return users.map(user => ({ rfidCardId: user[0], name: user[1] }));
    } catch (error) {
        console.error('Error generating users:', error);
        throw error;
    }
}

// Generate mock access logs for each user
async function generateAccessLogs(db, users) {
    console.log('Generating access logs...');
    
    const logs = [];
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - DAYS_OF_LOGS);
    
    // Track which users are currently "in" a building
    const currentlyInBuilding = {};
    
    for (const user of users) {
        // Each user will have random access logs over the past DAYS_OF_LOGS days
        const logsPerUser = Math.floor(Math.random() * 50) + 10; // Between 10-60 logs per user
        
        for (let i = 0; i < logsPerUser; i++) {
            // Random day within the past DAYS_OF_LOGS days
            const logDate = new Date(startDate);
            logDate.setDate(startDate.getDate() + Math.floor(Math.random() * DAYS_OF_LOGS));
            
            // If it's today, make sure the time is before now
            if (logDate.getDate() === today.getDate() && 
                logDate.getMonth() === today.getMonth() && 
                logDate.getFullYear() === today.getFullYear()) {
                logDate.setHours(Math.floor(Math.random() * today.getHours()));
            } else {
                // Random time between 7am and 10pm
                const startHour = 7;
                const endHour = 22;
                logDate.setHours(startHour + Math.floor(Math.random() * (endHour - startHour)));
            }
            
            logDate.setMinutes(Math.floor(Math.random() * 60));
            
            // Pick a random access point
            const accessPoint = ACCESS_POINTS[Math.floor(Math.random() * ACCESS_POINTS.length)];
            
            // Calculate if this is entry or exit
            // If the user is already in the building, they must exit
            // If they're not in the building, they must enter
            let direction;
            const userKey = `${user.rfidCardId}-${accessPoint}`;
            
            if (currentlyInBuilding[userKey]) {
                direction = 'exit';
                delete currentlyInBuilding[userKey];
            } else {
                direction = 'entry';
                // Only mark as in the building if this log is for today
                if (logDate.toDateString() === today.toDateString()) {
                    currentlyInBuilding[userKey] = true;
                }
            }
            
            // Determine status (granted/denied) and reason if denied
            const status = randomStatus();
            const reason = randomReason(status);
            
            // Create the log entry
            const log = [
                user.rfidCardId,
                logDate,
                accessPoint,
                direction,
                status,
                reason
            ];
            
            logs.push(log);
        }
    }
    
    // Sort logs by timestamp
    logs.sort((a, b) => a[1] - b[1]);
    
    // Insert logs in batches
    try {
        const batchSize = 1000;
        for (let i = 0; i < logs.length; i += batchSize) {
            const batch = logs.slice(i, i + batchSize);
            const query = 'INSERT INTO access_logs (rfidCardId, createdAt, accessPoint, direction, status, reason) VALUES ?';
            await db.query(query, [batch]);
        }
        
        console.log(`Successfully added ${logs.length} mock access logs.`);
        return currentlyInBuilding;
    } catch (error) {
        console.error('Error generating access logs:', error);
        throw error;
    }
}

// Main function to generate all mock data
async function generateMockData() {
    let connection;
    
    try {
        // Connect to the database
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to the database');
        
        // Drop existing tables if they exist
        console.log('Dropping existing tables...');
        await connection.query('DROP TABLE IF EXISTS access_logs');
        await connection.query('DROP TABLE IF EXISTS users');
        
        // Check if users and access_logs tables exist, create them if not
        await createTablesIfNotExist(connection);
        
        // Generate mock users
        const users = await generateUsers(connection, USERS_COUNT);
        
        // Generate mock access logs
        const currentlyInBuilding = await generateAccessLogs(connection, users);
        
        console.log('Mock data generation completed successfully');
        console.log('Users currently in buildings:', Object.keys(currentlyInBuilding).length);
        
        // Close the database connection
        await connection.end();
    } catch (error) {
        console.error('Error generating mock data:', error);
        if (connection) {
            await connection.end();
        }
        process.exit(1);
    }
}

// Create tables if they don't exist
async function createTablesIfNotExist(connection) {
    // Create users table if it doesn't exist
    await connection.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            rfidCardId VARCHAR(8) UNIQUE NOT NULL,
            name VARCHAR(100) NOT NULL,
            accessLevel INT DEFAULT 1,
            status ENUM('active', 'inactive') DEFAULT 'active',
            balance DECIMAL(10, 2) DEFAULT 0.00,
            createdAt TIMESTAMP NOT NULL
        )
    `);
    console.log('Users table is ready');
    
    // Create access_logs table if it doesn't exist
    await connection.query(`
        CREATE TABLE IF NOT EXISTS access_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            rfidCardId VARCHAR(8) NOT NULL,
            createdAt TIMESTAMP NOT NULL,
            accessPoint VARCHAR(50) NOT NULL,
            direction ENUM('entry', 'exit') NOT NULL,
            status ENUM('granted', 'denied') NOT NULL,
            reason VARCHAR(100),
            FOREIGN KEY (rfidCardId) REFERENCES users(rfidCardId) ON DELETE CASCADE
        )
    `);
    console.log('Access logs table is ready');
}

// Run the script
generateMockData().then(() => {
    console.log('Script completed');
    process.exit(0);
}); 