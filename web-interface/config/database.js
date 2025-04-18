const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'mysql',
        logging: console.log,
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        }
    }
);

// Test the connection
async function testConnection() {
    try {
        await sequelize.authenticate();
        console.log('Database connection has been established successfully.');
        
        // Sync all models
        await sequelize.sync({ alter: true });
        console.log('Database tables synchronized successfully.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
}

// Don't automatically test connection on require
// testConnection();

module.exports = {
    sequelize,
    testConnection
}; 