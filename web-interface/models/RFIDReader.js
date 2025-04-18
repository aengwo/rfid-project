const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RFIDReader = sequelize.define('RFIDReader', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    location: {
        type: DataTypes.STRING,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive', 'maintenance'),
        defaultValue: 'active'
    },
    lastSeen: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    timestamps: true
});

module.exports = RFIDReader; 