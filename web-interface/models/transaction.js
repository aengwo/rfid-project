const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/database');

class Transaction extends Model {
    static init(sequelize) {
        super.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            userId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                }
            },
            type: {
                type: DataTypes.ENUM('deposit', 'withdrawal', 'service_payment'),
                allowNull: false
            },
            amount: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: false
            },
            description: {
                type: DataTypes.STRING,
                allowNull: false
            },
            mpesaReference: {
                type: DataTypes.STRING,
                allowNull: true
            },
            status: {
                type: DataTypes.ENUM('pending', 'completed', 'failed'),
                allowNull: false,
                defaultValue: 'pending'
            }
        }, {
            sequelize,
            modelName: 'Transaction',
            tableName: 'transactions',
            timestamps: true
        });
    }

    static associate(models) {
        this.belongsTo(models.User, { 
            foreignKey: 'userId',
            onDelete: 'CASCADE'
        });
    }
}

module.exports = Transaction; 