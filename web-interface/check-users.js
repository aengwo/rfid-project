const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'mysql',
        logging: false
    }
);

async function checkUsers() {
    try {
        await sequelize.authenticate();
        
        const [users] = await sequelize.query(`
            SELECT id, name, rfidCardId, status, accessLevel, createdAt, updatedAt
            FROM users
            ORDER BY id ASC;
        `);
        
        console.log('\nAll Users in Database:');
        console.log('-------------------');
        if (users.length === 0) {
            console.log('No users found in the database.');
        } else {
            users.forEach(user => {
                console.log(`ID: ${user.id}`);
                console.log(`Name: ${user.name}`);
                console.log(`RFID Card ID: ${user.rfidCardId}`);
                console.log(`Status: ${user.status}`);
                console.log(`Access Level: ${user.accessLevel}`);
                console.log(`Created: ${user.createdAt}`);
                console.log(`Updated: ${user.updatedAt}`);
                console.log('-------------------');
            });
        }
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await sequelize.close();
    }
}

checkUsers(); 