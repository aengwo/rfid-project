const { sequelize, testConnection } = require('../config/database');
const User = require('./User');
const AccessLog = require('./AccessLog');
const Transaction = require('./transaction');

// Initialize models
User.init(sequelize);
AccessLog.init(sequelize);
Transaction.init(sequelize);

// Define associations
User.associate({ AccessLog, Transaction });
AccessLog.associate({ User });
Transaction.associate({ User });

// Test connection and sync database
testConnection()
    .then(async () => {
        console.log('Database connection established');
        
        // Check if access_logs table exists and get its current state
        const [tables] = await sequelize.query("SHOW TABLES LIKE 'access_logs'");
        const tableExists = tables.length > 0;
        
        if (tableExists) {
            console.log('access_logs table exists');
            // Get current row count
            const [count] = await sequelize.query("SELECT COUNT(*) as count FROM access_logs");
            console.log(`Current access logs count: ${count[0].count}`);
            
            // Just sync without altering
            await sequelize.sync();
            console.log('Database tables synchronized (preserved existing data)');
        } else {
            console.log('access_logs table does not exist, creating it');
            // Create the table
            await sequelize.sync({ alter: true });
            console.log('New access_logs table created');
        }
        
        // Verify the final state
        const [finalCount] = await sequelize.query("SELECT COUNT(*) as count FROM access_logs");
        console.log(`Final access logs count: ${finalCount[0].count}`);
    })
    .catch(err => {
        console.error('Error during database setup:', err);
    });

module.exports = {
    sequelize,
    User,
    AccessLog,
    Transaction
}; 