require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
    'rfid_system',  // database name
    'root',         // username
    'Davkik19',     // password
    {
        host: 'localhost',
        port: 8807,
        dialect: 'mysql',
        logging: false
    }
);

async function checkDatabase() {
    try {
        // Test connection
        await sequelize.authenticate();
        console.log('Successfully connected to the database.');

        // Get all tables
        const [results] = await sequelize.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'rfid_system';
        `);
        
        console.log('\nTables in rfid_system database:');
        console.log('-----------------------------');
        if (results.length === 0) {
            console.log('No tables found in the database.');
        } else {
            results.forEach(result => {
                console.log(result.TABLE_NAME);
            });
        }
    } catch (error) {
        if (error.name === 'SequelizeConnectionError') {
            console.error('Failed to connect to the database. Please check if:');
            console.error('1. MySQL is running on port 8807');
            console.error('2. The database rfid_system exists');
            console.error('3. The credentials are correct (username: root, password: Davkik19)');
            console.error('\nError details:', error.message);
        } else {
            console.error('Error:', error.message);
        }
    } finally {
        await sequelize.close();
    }
}

checkDatabase(); 