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

async function analyzeAccessLogs() {
    try {
        await sequelize.authenticate();
        
        // Get the most frequently used UIDs
        const [results] = await sequelize.query(`
            SELECT uid, userName, COUNT(*) as accessCount
            FROM access_logs
            GROUP BY uid, userName
            ORDER BY accessCount DESC
            LIMIT 2;
        `);
        
        console.log('\nMost frequently used RFID cards:');
        console.log('-----------------------------');
        
        if (results.length === 0) {
            console.log('No access logs found in the database.');
        } else {
            results.forEach((log, index) => {
                console.log(`#${index + 1} RFID Card:`);
                console.log(`UID: ${log.uid}`);
                console.log(`User Name: ${log.userName}`);
                console.log(`Access Count: ${log.accessCount}`);
                console.log('-----------------------------');
            });
        }

        // Get detailed logs for these UIDs
        if (results.length > 0) {
            console.log('\nRecent access logs for these cards:');
            console.log('-----------------------------------');
            
            for (const result of results) {
                const [logs] = await sequelize.query(`
                    SELECT *
                    FROM access_logs
                    WHERE uid = ?
                    ORDER BY id DESC
                    LIMIT 5;
                `, { replacements: [result.uid] });

                console.log(`\nRecent access logs for UID: ${result.uid}`);
                logs.forEach(log => {
                    console.log(`ID: ${log.id}`);
                    console.log(`User Name: ${log.userName}`);
                    console.log('-----------------------------');
                });
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await sequelize.close();
    }
}

analyzeAccessLogs(); 