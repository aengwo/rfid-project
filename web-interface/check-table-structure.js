require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
    'rfid_system',
    'root',
    'Davkik19',
    {
        host: 'localhost',
        port: 8807,
        dialect: 'mysql',
        logging: false
    }
);

async function checkTableStructure() {
    try {
        await sequelize.authenticate();
        
        const [columns] = await sequelize.query(`
            SHOW COLUMNS FROM users;
        `);
        
        console.log('\nUsers Table Structure:');
        console.log('-------------------');
        columns.forEach(column => {
            console.log(`Column: ${column.Field}`);
            console.log(`Type: ${column.Type}`);
            console.log(`Null: ${column.Null}`);
            console.log(`Key: ${column.Key}`);
            console.log(`Default: ${column.Default}`);
            console.log(`Extra: ${column.Extra}`);
            console.log('-------------------');
        });
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await sequelize.close();
    }
}

checkTableStructure(); 