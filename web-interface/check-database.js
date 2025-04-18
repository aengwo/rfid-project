const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkDatabase() {
    let connection;
    
    try {
        // Connect to the database using values from .env
        console.log('Attempting to connect with:', {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 8807,
            user: process.env.DB_USER || 'root',
            database: process.env.DB_NAME || 'rfid_system',
            password: process.env.DB_PASSWORD ? '******' : '(not set)'
        });
        
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 8807,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'rfid_system'
        });
        
        console.log('Successfully connected to the database');
        
        // List all tables
        const [tables] = await connection.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = ?`, 
            [process.env.DB_NAME || 'rfid_system']
        );
        
        console.log('\nTables in the database:');
        console.log('------------------------');
        
        if (tables.length === 0) {
            console.log('No tables found');
        } else {
            tables.forEach(table => {
                console.log(`- ${table.TABLE_NAME}`);
            });
        }
        
        // Check specific tables
        console.log('\nChecking tables structure:');
        console.log('------------------------');
        
        // Check users table
        try {
            const [userColumns] = await connection.query('DESCRIBE users');
            console.log('\nUsers table structure:');
            userColumns.forEach(col => {
                console.log(`- ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : ''} ${col.Key === 'PRI' ? 'PRIMARY KEY' : ''}`);
            });
            
            // Count users
            const [userCount] = await connection.query('SELECT COUNT(*) as count FROM users');
            console.log(`Total users: ${userCount[0].count}`);
        } catch (e) {
            console.log('Users table does not exist or cannot be accessed');
        }
        
        // Check access_logs table
        try {
            const [logColumns] = await connection.query('DESCRIBE access_logs');
            console.log('\nAccess_logs table structure:');
            logColumns.forEach(col => {
                console.log(`- ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : ''} ${col.Key === 'PRI' ? 'PRIMARY KEY' : ''}`);
            });
            
            // Count logs
            const [logCount] = await connection.query('SELECT COUNT(*) as count FROM access_logs');
            console.log(`Total access logs: ${logCount[0].count}`);
        } catch (e) {
            console.log('Access_logs table does not exist or cannot be accessed');
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('\nDatabase connection closed');
        }
    }
}

checkDatabase().catch(err => {
    console.error('Unhandled error:', err);
}); 