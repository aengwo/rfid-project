const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/database');

class User extends Model {
    static init(sequelize) {
        super.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false
            },
            rfidCardId: {
                type: DataTypes.STRING(8),
                allowNull: false,
                unique: true,
                validate: {
                    is: /^[A-F0-9]{8}$/ // 8-character hexadecimal
                }
            },
            email: {
                type: DataTypes.STRING,
                allowNull: true,
                validate: {
                    isEmail: true
                }
            },
            phone: {
                type: DataTypes.STRING,
                allowNull: true
            },
            status: {
                type: DataTypes.ENUM('active', 'inactive'),
                allowNull: false,
                defaultValue: 'active'
            },
            accessLevel: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 1,
                validate: {
                    min: 1,
                    max: 3
                }
            },
            balance: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: false,
                defaultValue: 0.00
            },
            createdAt: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            },
            updatedAt: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            }
        }, {
            sequelize,
            modelName: 'User',
            tableName: 'users',
            timestamps: true
        });
    }

    static associate(models) {
        this.hasMany(models.AccessLog, { foreignKey: 'userId' });
        this.hasMany(models.Transaction, { foreignKey: 'userId' });
    }
}

module.exports = User; 