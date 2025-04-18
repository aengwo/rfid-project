// Script to update the access_logs table
const mysql = require('mysql2/promise');

async function main() {
    let connection;
    try {
        console.log('Connecting to database...');
        
        // Create connection with the correct port from logs
        connection = await mysql.createConnection({
            host: 'localhost',
            port: 8807,
            user: 'root',
            password: process.env.DB_PASSWORD || 'Davkik19', // From the logs, using the same password
            database: 'rfid_system'
        });
        
        console.log('Connected to database');
        console.log('Altering access_logs table...');
        
        // Check if columns already exist
        const [columns] = await connection.execute(`
            SHOW COLUMNS FROM access_logs 
            WHERE Field IN ('timeIn', 'timeOut')
        `);
        
        if (columns.length === 2) {
            console.log('Columns timeIn and timeOut already exist in the table');
            return;
        }
        
        // Add columns if they don't exist
        await connection.execute(`
            ALTER TABLE access_logs 
            ADD COLUMN timeIn DATETIME NULL,
            ADD COLUMN timeOut DATETIME NULL
        `);
        
        console.log('Successfully added timeIn and timeOut columns to access_logs table');
    } catch (error) {
        console.error('Error updating access_logs table:', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('Database connection closed');
        }
    }
}

main(); 