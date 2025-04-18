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

// Configuration settings
const DAYS_OF_HISTORY = 30; // Generate logs for the past 30 days
const ACCESS_POINTS = ['School of Science', 'School of Engineering', 'School of Medicine'];
const ACCESS_DIRECTIONS = ['entry', 'exit'];
const LOGS_PER_DAY_MIN = 50; // Minimum logs per day
const LOGS_PER_DAY_MAX = 150; // Maximum logs per day

// Random time functions
function randomTime(date) {
    // Business hours between 7:00 AM and 10:00 PM
    const startHour = 7;
    const endHour = 22;
    const hour = startHour + Math.floor(Math.random() * (endHour - startHour));
    const minute = Math.floor(Math.random() * 60);
    const second = Math.floor(Math.random() * 60);
    
    date.setHours(hour, minute, second);
    return date;
}

function randomStatus() {
    // 95% of accesses are granted, 5% denied
    return Math.random() > 0.05 ? 'granted' : 'denied';
}

function randomReason(status) {
    if (status === 'granted') return null;
    
    const reasons = [
        'Invalid card',
        'Expired card',
        'Access restriction',
        'Time restriction',
        'Building closed',
        'Unauthorized access level'
    ];
    
    return reasons[Math.floor(Math.random() * reasons.length)];
}

// Generate mock access logs
async function generateAccessLogs() {
    let connection;
    
    try {
        // Connect to the database
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to the database');
        
        // Get existing users from the database
        const [users] = await connection.query('SELECT id, rfidCardId, name FROM users');
        
        if (users.length === 0) {
            console.error('No users found in the database. Please add users first.');
            return;
        }
        
        console.log(`Found ${users.length} users`);
        
        // Check if access_logs table has data
        const [existingLogs] = await connection.query('SELECT COUNT(*) AS count FROM access_logs');
        
        if (existingLogs[0].count > 0) {
            console.log(`Table already has ${existingLogs[0].count} records.`);
            const confirmation = await askQuestion('Do you want to delete existing logs and recreate? (y/n): ');
            
            if (confirmation.toLowerCase() === 'y') {
                await connection.query('TRUNCATE TABLE access_logs');
                console.log('Existing logs deleted.');
            } else {
                console.log('Operation canceled.');
                await connection.end();
                return;
            }
        }
        
        const logs = [];
        const today = new Date();
        
        // Track which users are in which buildings (for creating matching entry/exit pairs)
        const usersInBuildings = {};
        
        // Generate logs for each day in the past DAYS_OF_HISTORY days
        for (let day = 0; day < DAYS_OF_HISTORY; day++) {
            const currentDate = new Date();
            currentDate.setDate(today.getDate() - (DAYS_OF_HISTORY - day));
            currentDate.setHours(0, 0, 0, 0);
            
            // Reset the users in buildings tracking for each new day
            for (const user of users) {
                usersInBuildings[user.rfidCardId] = {};
            }
            
            // Randomly distribute logs throughout the day
            const logsForThisDay = Math.floor(Math.random() * (LOGS_PER_DAY_MAX - LOGS_PER_DAY_MIN)) + LOGS_PER_DAY_MIN;
            console.log(`Generating ${logsForThisDay} logs for ${currentDate.toISOString().split('T')[0]}`);
            
            const dayLogs = [];
            
            for (let i = 0; i < logsForThisDay; i++) {
                // Select a random user
                const user = users[Math.floor(Math.random() * users.length)];
                
                // Select a random access point
                const accessPoint = ACCESS_POINTS[Math.floor(Math.random() * ACCESS_POINTS.length)];
                
                // Determine direction (entry/exit)
                // If the user is already in this building, they should exit
                // Otherwise, they should enter
                let direction;
                if (usersInBuildings[user.rfidCardId][accessPoint]) {
                    direction = 'exit';
                    usersInBuildings[user.rfidCardId][accessPoint] = false;
                } else {
                    direction = 'entry';
                    usersInBuildings[user.rfidCardId][accessPoint] = true;
                }
                
                // Generate a random time for this day
                const timestamp = randomTime(new Date(currentDate));
                
                // Determine if access was granted or denied
                const status = randomStatus();
                const reason = randomReason(status);
                
                // If access is denied, don't mark them as inside the building
                if (status === 'denied' && direction === 'entry') {
                    usersInBuildings[user.rfidCardId][accessPoint] = false;
                }
                
                dayLogs.push({
                    userId: user.id,
                    rfidCardId: user.rfidCardId,
                    accessPoint,
                    direction,
                    status,
                    reason,
                    timestamp
                });
            }
            
            // Sort the day logs by timestamp
            dayLogs.sort((a, b) => a.timestamp - b.timestamp);
            
            // Add the sorted logs to the main logs array
            logs.push(...dayLogs);
        }
        
        // Make sure all users have left buildings on the last day
        // Also make sure all days have some data for better visualization
        
        // Insert logs in batches
        const batchSize = 500;
        let insertCount = 0;
        
        for (let i = 0; i < logs.length; i += batchSize) {
            const batch = logs.slice(i, Math.min(i + batchSize, logs.length));
            
            const values = batch.map(log => [
                log.userId,
                log.rfidCardId,
                log.accessPoint,
                log.direction,
                log.status,
                log.reason,
                log.timestamp,
                log.timestamp // updatedAt same as createdAt
            ]);
            
            await connection.query(
                'INSERT INTO access_logs (userId, rfidCardId, accessPoint, direction, status, reason, createdAt, updatedAt) VALUES ?',
                [values]
            );
            
            insertCount += batch.length;
            console.log(`Inserted ${insertCount}/${logs.length} logs`);
        }
        
        console.log(`Successfully added ${logs.length} mock access logs`);
        
        // Close the database connection
        await connection.end();
        console.log('Done!');
        
    } catch (error) {
        console.error('Error generating access logs:', error);
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
generateAccessLogs().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
}); 