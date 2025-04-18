// Script to simulate live campus population
const mysql = require('mysql2/promise');

// Configuration
const ACCESS_POINTS = ['School of Science', 'School of Engineering', 'School of Medicine'];
const SIMULATION_INTERVAL = 10000; // 10 seconds between updates
const MAX_STUDENTS_PER_LOCATION = 1500; // Maximum number of students per building
const MIN_STUDENTS_PER_LOCATION = 800;  // Minimum number of students per building

// Store current state
const currentPopulation = {
    'School of Science': 0,
    'School of Engineering': 0,
    'School of Medicine': 0
};

// Cache of active student rfidCardIds
let activeStudents = [];

async function main() {
    let connection;
    
    try {
        console.log('Connecting to database...');
        
        // Create connection with the correct port
        connection = await mysql.createConnection({
            host: 'localhost',
            port: 8807,
            user: 'root',
            password: process.env.DB_PASSWORD || 'Davkik19',
            database: 'rfid_system'
        });
        
        console.log('Connected to database');
        
        // Get a list of valid rfidCardIds to use in our simulation
        const [users] = await connection.execute(`
            SELECT rfidCardId FROM users WHERE status = 'active' LIMIT 100
        `);
        
        if (users.length === 0) {
            console.error('No active users found. Please ensure you have users in the database.');
            return;
        }
        
        activeStudents = users.map(user => user.rfidCardId);
        console.log(`Found ${activeStudents.length} active students for simulation`);
        
        // Initialize the current population for each location
        for (const location of ACCESS_POINTS) {
            currentPopulation[location] = Math.floor(
                Math.random() * (MAX_STUDENTS_PER_LOCATION - MIN_STUDENTS_PER_LOCATION) + MIN_STUDENTS_PER_LOCATION
            );
            console.log(`Initial population at ${location}: ${currentPopulation[location]}`);
        }
        
        // Run simulation in intervals
        console.log('Starting live population simulation...');
        
        // First, run the simulation once
        await runSimulation(connection);
        
        // Then set up the interval for continuous updates
        const interval = setInterval(async () => {
            try {
                await runSimulation(connection);
            } catch (error) {
                console.error('Error during simulation:', error);
                clearInterval(interval);
                if (connection) {
                    await connection.end();
                    console.log('Database connection closed due to error');
                }
            }
        }, SIMULATION_INTERVAL);
        
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            console.log('Stopping simulation...');
            clearInterval(interval);
            if (connection) {
                await connection.end();
                console.log('Database connection closed');
            }
            process.exit(0);
        });
        
    } catch (error) {
        console.error('Error in main function:', error);
        if (connection) {
            await connection.end();
            console.log('Database connection closed due to error');
        }
    }
}

async function runSimulation(connection) {
    for (const location of ACCESS_POINTS) {
        // Determine if we need to add or remove students to reach our target
        const targetPopulation = Math.floor(
            Math.random() * (MAX_STUDENTS_PER_LOCATION - MIN_STUDENTS_PER_LOCATION) + MIN_STUDENTS_PER_LOCATION
        );
        
        // How many entries or exits do we need?
        const populationDiff = targetPopulation - currentPopulation[location];
        
        if (populationDiff !== 0) {
            console.log(`${location}: Current: ${currentPopulation[location]}, Target: ${targetPopulation}, Diff: ${populationDiff}`);
            
            if (populationDiff > 0) {
                // We need more entries
                await processEntries(connection, location, populationDiff);
            } else {
                // We need more exits
                await processExits(connection, location, Math.abs(populationDiff));
            }
            
            // Update our current population
            currentPopulation[location] = targetPopulation;
        }
    }
    
    // Log current population counts
    console.log('Current population counts:');
    for (const location of ACCESS_POINTS) {
        console.log(`- ${location}: ${currentPopulation[location]}`);
    }
}

async function processEntries(connection, location, count) {
    try {
        // Process entries in batches for efficiency
        const batchSize = 10;
        let processedCount = 0;
        
        while (processedCount < count) {
            const batchCount = Math.min(batchSize, count - processedCount);
            const entries = [];
            
            for (let i = 0; i < batchCount; i++) {
                // Pick a random student
                const rfidCardId = activeStudents[Math.floor(Math.random() * activeStudents.length)];
                
                // Find the user ID
                const [userResults] = await connection.execute(`
                    SELECT id FROM users WHERE rfidCardId = ?
                `, [rfidCardId]);
                
                const userId = userResults.length > 0 ? userResults[0].id : 0;
                const now = new Date();
                
                entries.push([userId, rfidCardId, location, 'entry', 'granted', now, now, now]);
            }
            
            // Insert the batch of entries
            if (entries.length > 0) {
                await connection.query(`
                    INSERT INTO access_logs 
                    (userId, rfidCardId, accessPoint, direction, status, timeIn, createdAt, updatedAt) 
                    VALUES ?
                `, [entries]);
                
                processedCount += entries.length;
            }
        }
        
        console.log(`Added ${processedCount} entries to ${location}`);
    } catch (error) {
        console.error(`Error processing entries for ${location}:`, error);
        throw error;
    }
}

async function processExits(connection, location, count) {
    try {
        // Find the most recent entries that don't have exits yet
        // Using a different approach for the LIMIT parameter
        let query = `
            SELECT id, rfidCardId, userId, timeIn 
            FROM access_logs 
            WHERE accessPoint = ? AND timeOut IS NULL AND direction = 'entry'
            ORDER BY createdAt DESC
        `;
        const [allEntries] = await connection.execute(query, [location]);
        
        // Manually limit the number of entries to process
        const entries = allEntries.slice(0, count);
        
        // For each entry, add a timeOut
        for (const entry of entries) {
            const now = new Date();
            
            // Update the existing record with a timeOut
            await connection.execute(`
                UPDATE access_logs 
                SET timeOut = ?
                WHERE id = ?
            `, [now, entry.id]);
            
            // Add an exit record
            await connection.execute(`
                INSERT INTO access_logs 
                (userId, rfidCardId, accessPoint, direction, status, timeOut, createdAt, updatedAt) 
                VALUES (?, ?, ?, 'exit', 'granted', ?, ?, ?)
            `, [entry.userId, entry.rfidCardId, location, now, now, now]);
        }
        
        console.log(`Added ${entries.length} exits from ${location}`);
    } catch (error) {
        console.error(`Error processing exits for ${location}:`, error);
        throw error;
    }
}

// Start the simulation
main(); 