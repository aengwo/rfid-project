require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'mysql',
        logging: console.log
    }
);

async function queryRFIDCards() {
    try {
        await sequelize.authenticate();
        console.log('Database connection established successfully.');

        const [results] = await sequelize.query(`
            SELECT id, name, rfidCardId, status, accessLevel 
            FROM Users 
            ORDER BY id ASC
        `);
        
        console.log('RFID Cards in Database:');
        console.log('----------------------');
        results.forEach(user => {
            console.log(`ID: ${user.id}`);
            console.log(`Name: ${user.name}`);
            console.log(`RFID Card ID: ${user.rfidCardId}`);
            console.log(`Status: ${user.status}`);
            console.log(`Access Level: ${user.accessLevel}`);
            console.log('----------------------');
        });
    } catch (error) {
        console.error('Error querying database:', error);
    } finally {
        await sequelize.close();
    }
}

queryRFIDCards(); 