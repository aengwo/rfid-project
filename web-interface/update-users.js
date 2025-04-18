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

async function updateUserNames() {
    try {
        await sequelize.authenticate();
        
        // Update first user (94DAC101)
        await sequelize.query(`
            UPDATE access_logs
            SET userName = 'Davis'
            WHERE uid = '94DAC101';
        `);
        
        // Update second user (A7D04302)
        await sequelize.query(`
            UPDATE access_logs
            SET userName = 'Owen'
            WHERE uid = 'A7D04302';
        `);
        
        console.log('User names updated successfully!');
        
        // Verify the updates
        const [results] = await sequelize.query(`
            SELECT uid, userName, COUNT(*) as accessCount
            FROM access_logs
            WHERE uid IN ('94DAC101', 'A7D04302')
            GROUP BY uid, userName
            ORDER BY accessCount DESC;
        `);
        
        console.log('\nUpdated User Information:');
        console.log('------------------------');
        results.forEach((log, index) => {
            console.log(`#${index + 1} RFID Card:`);
            console.log(`UID: ${log.uid}`);
            console.log(`User Name: ${log.userName}`);
            console.log(`Access Count: ${log.accessCount}`);
            console.log('------------------------');
        });
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await sequelize.close();
    }
}

updateUserNames(); 