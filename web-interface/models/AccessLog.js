const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/database');

class AccessLog extends Model {
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
            rfidCardId: {
                type: DataTypes.STRING(8),
                allowNull: false
            },
            accessPoint: {
                type: DataTypes.STRING,
                allowNull: false
            },
            direction: {
                type: DataTypes.ENUM('entry', 'exit'),
                allowNull: true,
                defaultValue: 'entry'
            },
            status: {
                type: DataTypes.ENUM('granted', 'denied'),
                allowNull: false
            },
            reason: {
                type: DataTypes.STRING,
                allowNull: true
            },
            timeIn: {
                type: DataTypes.DATE,
                allowNull: true
            },
            timeOut: {
                type: DataTypes.DATE,
                allowNull: true
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
            modelName: 'AccessLog',
            tableName: 'access_logs',
            timestamps: true
        });
    }

    static associate(models) {
        this.belongsTo(models.User, {
            foreignKey: 'userId',
            as: 'user'
        });
    }
}

module.exports = AccessLog; 