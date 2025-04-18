require('dotenv').config();
const { sequelize, User } = require('./models');

async function addUsers() {
    try {
        await sequelize.authenticate();
        console.log('Database connection established successfully.');

        // Add Davis
        await User.create({
            rfidCardId: '94DAC101',
            name: 'Davis',
            status: 'active',
            accessLevel: 1,
            balance: 0.00
        });
        console.log('Added Davis');

        // Add Owen
        await User.create({
            rfidCardId: 'A7D04302',
            name: 'Owen',
            status: 'active',
            accessLevel: 1,
            balance: 0.00
        });
        console.log('Added Owen');

        console.log('Users added successfully');
    } catch (error) {
        console.error('Error adding users:', error);
    } finally {
        await sequelize.close();
    }
}

addUsers(); 