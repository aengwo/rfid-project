const mysql = require('mysql2/promise');
require('dotenv').config();

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 8807,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Davkik19',
    database: process.env.DB_NAME || 'rfid_system',
};

// Configuration
const USERS_TO_GENERATE = 30;

// Generate a random RFID card ID (8 character hexadecimal)
function generateRfidCardId() {
    return Array(8).fill(0).map(() => 
        Math.floor(Math.random() * 16).toString(16).toUpperCase()
    ).join('');
}

// Generate a list of realistic student names
function generateStudentNames(count) {
    const firstNames = [
        'John', 'Mary', 'James', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 
        'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 
        'Thomas', 'Sarah', 'Charles', 'Karen', 'Daniel', 'Nancy', 'Matthew', 'Lisa', 
        'Anthony', 'Margaret', 'Mark', 'Betty', 'Donald', 'Sandra', 'Steven', 'Ashley', 
        'Paul', 'Dorothy', 'Andrew', 'Kimberly', 'Joshua', 'Emily', 'Kenneth', 'Donna'
    ];
    
    const lastNames = [
        'Smith', 'Johnson', 'Williams', 'Jones', 'Brown', 'Davis', 'Miller', 'Wilson', 
        'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 
        'Thompson', 'Garcia', 'Martinez', 'Robinson', 'Clark', 'Rodriguez', 'Lewis', 'Lee', 
        'Walker', 'Hall', 'Allen', 'Young', 'Hernandez', 'King', 'Wright', 'Lopez', 
        'Hill', 'Scott', 'Green', 'Adams', 'Baker', 'Gonzalez', 'Nelson', 'Carter'
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

// Create tables if they don't exist
async function createTablesIfNotExist(connection) {
    try {
        // Check if users table exists
        const [userTables] = await connection.query("SHOW TABLES LIKE 'users'");
        if (userTables.length === 0) {
            console.log('Creating users table...');
            await connection.query(`
                CREATE TABLE users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    rfidCardId VARCHAR(8) UNIQUE NOT NULL,
                    name VARCHAR(100) NOT NULL,
                    accessLevel INT DEFAULT 1,
                    status ENUM('active', 'inactive') DEFAULT 'active',
                    balance DECIMAL(10, 2) DEFAULT 0.00,
                    createdAt TIMESTAMP NOT NULL,
                    updatedAt TIMESTAMP NOT NULL
                )
            `);
            console.log('Users table created');
        } else {
            console.log('Users table already exists');
        }

        // Check if access_logs table exists
        const [logTables] = await connection.query("SHOW TABLES LIKE 'access_logs'");
        if (logTables.length === 0) {
            console.log('Creating access_logs table...');
            await connection.query(`
                CREATE TABLE access_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    userId INT NOT NULL,
                    rfidCardId VARCHAR(8) NOT NULL,
                    accessPoint VARCHAR(50) NOT NULL,
                    direction ENUM('entry', 'exit') NOT NULL,
                    status ENUM('granted', 'denied') NOT NULL,
                    reason VARCHAR(100),
                    createdAt TIMESTAMP NOT NULL,
                    updatedAt TIMESTAMP NOT NULL,
                    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
                )
            `);
            console.log('Access logs table created');
        } else {
            console.log('Access logs table already exists');
        }
    } catch (error) {
        console.error('Error creating tables:', error);
        throw error;
    }
}

// Main function to generate users
async function generateUsers() {
    let connection;
    
    try {
        // Connect to the database
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to the database');
        
        // Create tables if they don't exist
        await createTablesIfNotExist(connection);
        
        // Check if users table already has data
        const [userCount] = await connection.query('SELECT COUNT(*) as count FROM users');
        
        if (userCount[0].count > 0) {
            console.log(`Users table already has ${userCount[0].count} records.`);
            const confirmation = await askQuestion('Do you want to delete existing users and recreate? (y/n): ');
            
            if (confirmation.toLowerCase() === 'y') {
                // First delete access_logs that depend on users
                await connection.query('TRUNCATE TABLE access_logs');
                console.log('Access logs cleared');
                
                // Then delete users
                await connection.query('TRUNCATE TABLE users');
                console.log('Users cleared');
            } else {
                console.log('Operation canceled.');
                await connection.end();
                return;
            }
        }
        
        // Generate user data
        const names = generateStudentNames(USERS_TO_GENERATE);
        const users = [];
        
        for (let i = 0; i < USERS_TO_GENERATE; i++) {
            const rfidCardId = generateRfidCardId();
            const name = names[i];
            const accessLevel = Math.floor(Math.random() * 3) + 1; // 1-3
            const status = Math.random() > 0.1 ? 'active' : 'inactive'; // 90% active
            const balance = Math.floor(Math.random() * 10000) / 100; // 0-100.00
            const now = new Date();
            
            users.push([
                rfidCardId,
                name,
                accessLevel,
                status,
                balance,
                now,
                now
            ]);
        }
        
        // Insert users
        const insertQuery = `
            INSERT INTO users 
            (rfidCardId, name, accessLevel, status, balance, createdAt, updatedAt) 
            VALUES ?
        `;
        
        await connection.query(insertQuery, [users]);
        console.log(`Successfully added ${USERS_TO_GENERATE} users`);
        
        // Close connection
        await connection.end();
        console.log('Done!');
        
    } catch (error) {
        console.error('Error generating users:', error);
        if (connection) {
            await connection.end();
        }
        process.exit(1);
    }
}

// Helper function to ask for confirmation
function askQuestion(question) {
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise(resolve => {
        readline.question(question, answer => {
            readline.close();
            resolve(answer);
        });
    });
}

// Run the script
generateUsers().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
}); 