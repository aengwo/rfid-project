// Script to update sample access logs with timeIn and timeOut data
const mysql = require('mysql2/promise');

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
        
        // Count existing logs
        const [countResult] = await connection.execute(`
            SELECT COUNT(*) as count FROM access_logs
        `);
        
        const logsCount = countResult[0].count;
        console.log(`Found ${logsCount} access logs`);
        
        if (logsCount === 0) {
            console.log('No access logs to update');
            return;
        }
        
        // Get all access logs
        const [logs] = await connection.execute(`
            SELECT id, rfidCardId, createdAt, direction FROM access_logs 
            ORDER BY rfidCardId, createdAt
        `);
        
        console.log(`Processing ${logs.length} access logs...`);
        
        // Group logs by rfidCardId
        const groupedLogs = {};
        for (const log of logs) {
            // Create groups of entry and exit logs
            if (!log.rfidCardId) continue;
            
            if (!groupedLogs[log.rfidCardId]) {
                groupedLogs[log.rfidCardId] = [];
            }
            
            groupedLogs[log.rfidCardId].push(log);
        }
        
        // For each access log
        for (const log of logs) {
            // Generate random timeIn based on createdAt
            const timeIn = new Date(log.createdAt);
            
            // If direction is entry, set timeIn to createdAt
            if (log.direction === 'entry' || Math.random() > 0.5) {
                // For entry logs or random logs, set timeIn to the current timestamp
                await connection.execute(`
                    UPDATE access_logs SET timeIn = ? WHERE id = ?
                `, [timeIn, log.id]);
                
                // 50% chance to also have a timeOut 15-120 minutes later
                if (Math.random() > 0.5) {
                    const timeOut = new Date(timeIn.getTime() + (15 + Math.random() * 105) * 60000);
                    await connection.execute(`
                        UPDATE access_logs SET timeOut = ? WHERE id = ?
                    `, [timeOut, log.id]);
                }
            }
            else if (log.direction === 'exit') {
                // For exit logs, try to find the corresponding entry and set timeOut
                // This is just for sample data, so we'll randomly set timeOut to something recent
                const timeOut = new Date(log.createdAt);
                await connection.execute(`
                    UPDATE access_logs SET timeOut = ? WHERE id = ?
                `, [timeOut, log.id]);
            }
        }
        
        console.log('Successfully updated access logs with sample timeIn and timeOut data');
    } catch (error) {
        console.error('Error updating access logs:', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('Database connection closed');
        }
    }
}

main(); 