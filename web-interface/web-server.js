require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const expressLayouts = require('express-ejs-layouts');
const { Op } = require('sequelize');
const axios = require('axios');

// Import database models
const { sequelize, User, AccessLog, Transaction } = require('./models');

const app = express();
const PORT = process.env.WEB_PORT || 3001;

// M-Pesa configuration
const MPESA_CONFIG = {
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    businessShortCode: process.env.MPESA_BUSINESS_SHORTCODE,
    passKey: process.env.MPESA_PASSKEY,
    callbackUrl: process.env.MPESA_CALLBACK_URL
};

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
    }
}));
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// View engine setup
app.use(expressLayouts);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.set('layout', 'layout');

// Routes
app.get('/', (req, res) => {
    res.render('index', { title: 'RFID Security System' });
});

app.get('/about', (req, res) => {
    res.render('about', { title: 'About Us' });
});

app.get('/contact', (req, res) => {
    res.render('contact', { title: 'Contact Us' });
});

app.get('/features', (req, res) => {
    res.render('features', { title: 'Features' });
});

// Admin routes
app.get('/admin/login', (req, res) => {
    if (req.session.admin) {
        return res.redirect('/admin/dashboard');
    }
    res.sendFile(path.join(__dirname, 'public/admin/login.html'));
});

app.get('/admin/dashboard', (req, res) => {
    if (!req.session.admin) {
        return res.redirect('/admin/login');
    }
    res.render('admin/dashboard', { 
        title: 'Admin Dashboard',
        admin: req.session.admin
    });
});

// Access logs page
app.get('/admin/access-logs', (req, res) => {
    if (!req.session.admin) {
        return res.redirect('/admin/login');
    }
    res.render('admin/access-logs', { 
        title: 'Access Logs',
        admin: req.session.admin
    });
});

// Add analytics page route
app.get('/admin/analytics', (req, res) => {
    // Temporarily disable authentication for testing
    // if (!req.session.admin) {
    //     return res.redirect('/admin/login');
    // }
    
    res.render('admin/analytics', { 
        title: 'Campus Analytics',
        admin: { name: 'Test Admin' } // Placeholder admin
    });
});

// API routes
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    
    console.log('Login attempt:', {
        providedUsername: username,
        expectedUsername: process.env.ADMIN_USERNAME,
        providedPassword: password,
        hasPasswordHash: !!process.env.ADMIN_PASSWORD_HASH
    });
    
    if (username === process.env.ADMIN_USERNAME && 
        await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH)) {
        
        const token = jwt.sign(
            { username, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        req.session.admin = { username, token };
        res.json({ success: true, token });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.post('/api/admin/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Add new API routes for RFID operations
app.post('/api/rfid/access', async (req, res) => {
    try {
        const { rfidCardId, accessPoint } = req.body;
        
        // Find the user with this RFID card
        const user = await User.findOne({ where: { rfidCardId, status: 'active' } });
        
        if (!user) {
            // Log failed access attempt
            await AccessLog.create({
                userId: 0, // Use 0 for unknown users
                rfidCardId,
                accessPoint,
                status: 'denied',
                reason: 'Invalid or inactive RFID card'
            });
            
            return res.status(401).json({
                success: false,
                message: 'Access denied: Invalid or inactive RFID card'
            });
        }
        
        // Log successful access
        await AccessLog.create({
            userId: user.id,
            rfidCardId,
            accessPoint,
            status: 'granted'
        });
        
        res.json({
            success: true,
            message: 'Access granted',
            user: {
                id: user.id,
                name: user.name,
                accessLevel: user.accessLevel
            }
        });
    } catch (error) {
        console.error('RFID access error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// API route to get raw access logs data
app.get('/api/admin/raw-access-logs', async (req, res) => {
    if (!req.session.admin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const [results] = await sequelize.query("SELECT * FROM access_logs ORDER BY createdAt DESC LIMIT 100");
        res.json(results);
    } catch (error) {
        console.error('Error fetching raw access logs:', error);
        res.status(500).json({ 
            error: 'Failed to fetch raw access logs',
            details: error.message
        });
    }
});

// API route to get access logs
app.get('/api/admin/access-logs', async (req, res) => {
    // Temporarily allow unauthenticated access for testing
    // if (!req.session.admin) {
    //     return res.status(401).json({ error: 'Unauthorized' });
    // }

    try {
        // Use raw SQL instead of the model to handle any schema mismatch
        const [logs] = await sequelize.query(`
            SELECT 
                l.id, 
                l.rfidCardId, 
                l.createdAt, 
                l.accessPoint,
                l.direction,
                l.status, 
                l.reason,
                l.timeIn,
                l.timeOut,
                u.name as userName
            FROM 
                access_logs l
            LEFT JOIN 
                users u ON l.rfidCardId = u.rfidCardId
            ORDER BY 
                l.createdAt DESC
            LIMIT 100
        `);
        
        // Format the response to match the expected structure in the frontend
        const formattedLogs = logs.map(log => ({
            ...log,
            User: { 
                name: log.userName || 'Unknown' 
            }
        }));
        
        res.json(formattedLogs);
    } catch (error) {
        console.error('Error fetching access logs:', error);
        res.status(500).json({ 
            error: 'Failed to fetch access logs',
            details: error.message
        });
    }
});

// API route to export logs as CSV
app.get('/api/admin/export_logs', async (req, res) => {
    // Temporarily allow unauthenticated access for testing
    // if (!req.session.admin) {
    //     return res.status(401).json({ error: 'Unauthorized' });
    // }

    try {
        const [logs] = await sequelize.query(`
            SELECT 
                l.id, 
                l.rfidCardId, 
                l.createdAt, 
                l.accessPoint,
                l.direction,
                l.status, 
                l.reason,
                l.timeIn,
                l.timeOut,
                u.name as userName
            FROM 
                access_logs l
            LEFT JOIN 
                users u ON l.rfidCardId = u.rfidCardId
            ORDER BY 
                l.createdAt DESC
            LIMIT 1000
        `);
        
        const csv = [
            ['RFID Card ID', 'Name', 'Timestamp', 'Access Point', 'Direction', 'Status', 'Reason', 'Time In', 'Time Out'],
            ...logs.map(log => [
                log.rfidCardId, 
                log.userName || 'Unknown', 
                new Date(log.createdAt).toLocaleString(), 
                log.accessPoint,
                log.direction || '-',
                log.status,
                log.reason || '-',
                log.timeIn ? new Date(log.timeIn).toLocaleString() : '-',
                log.timeOut ? new Date(log.timeOut).toLocaleString() : '-'
            ])
        ].map(row => row.join(',')).join('\n');

        res.json({ data: csv });
    } catch (error) {
        console.error('Error exporting logs:', error);
        res.status(500).json({ 
            error: 'Failed to export logs',
            details: error.message
        });
    }
});

// API route to get users with their latest access
app.get('/api/admin/users', async (req, res) => {
    if (!req.session.admin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const users = await User.findAll({
            order: [['createdAt', 'DESC']]
        });
        
        const transformedUsers = await Promise.all(users.map(async (user) => {
            const userData = user.get({ plain: true });
            
            // Get the latest access log for this user
            const latestLog = await AccessLog.findOne({
                where: { userId: user.id },
                order: [['createdAt', 'DESC']]
            });
            
            return {
                ...userData,
                lastAccess: latestLog ? latestLog.createdAt : null,
                balance: parseFloat(userData.balance || 0)
            };
        }));
        
        res.json(transformedUsers);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ 
            error: 'Failed to fetch users',
            details: error.message
        });
    }
});

app.get('/api/admin/users/:id', async (req, res) => {
    if (!req.session.admin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const user = await User.findByPk(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

app.put('/api/admin/users/:id', async (req, res) => {
    if (!req.session.admin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { rfidCardId, name, accessLevel, status } = req.body;
        
        // Check if RFID card ID is already in use by another user
        const existingUser = await User.findOne({
            where: {
                rfidCardId,
                id: { [Op.ne]: req.params.id } // Exclude current user
            }
        });
        
        if (existingUser) {
            return res.status(400).json({ error: 'RFID card ID is already in use' });
        }

        const user = await User.findByPk(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update user
        await user.update({
            rfidCardId,
            name,
            accessLevel,
            status
        });

        res.json({
            success: true,
            user: {
                id: user.id,
                rfidCardId: user.rfidCardId,
                name: user.name,
                accessLevel: user.accessLevel,
                status: user.status
            }
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

app.post('/api/admin/add_user', async (req, res) => {
    if (!req.session.admin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { rfidCardId, name } = req.body;
        
        if (!rfidCardId || !name) {
            return res.status(400).json({ error: 'RFID Card ID and name are required' });
        }

        // Check if user with this RFID card already exists
        const existingUser = await User.findOne({ where: { rfidCardId } });
        if (existingUser) {
            return res.status(400).json({ error: 'User with this RFID card already exists' });
        }

        // Create new user
        const user = await User.create({
            rfidCardId,
            name,
            status: 'active',
            accessLevel: 1
        });

        res.status(201).json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                rfidCardId: user.rfidCardId,
                status: user.status,
                accessLevel: user.accessLevel
            }
        });
    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).json({ error: 'Failed to add user' });
    }
});

// M-Pesa token generation
async function getMpesaToken() {
    try {
        const response = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
            auth: {
                username: MPESA_CONFIG.consumerKey,
                password: MPESA_CONFIG.consumerSecret
            }
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Error generating M-Pesa token:', error);
        throw error;
    }
}

// M-Pesa STK Push
async function initiateSTKPush(phoneNumber, amount, reference) {
    try {
        // Format phone number to 254 format
        let formattedPhone = phoneNumber;
        if (phoneNumber.startsWith('0')) {
            formattedPhone = '254' + phoneNumber.substring(1);
        } else if (phoneNumber.startsWith('7')) {
            formattedPhone = '254' + phoneNumber;
        }

        const token = await getMpesaToken();
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const password = Buffer.from(MPESA_CONFIG.businessShortCode + MPESA_CONFIG.passKey + timestamp).toString('base64');

        const response = await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
            BusinessShortCode: MPESA_CONFIG.businessShortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: formattedPhone,
            PartyB: MPESA_CONFIG.businessShortCode,
            PhoneNumber: formattedPhone,
            CallBackURL: MPESA_CONFIG.callbackUrl,
            AccountReference: reference,
            TransactionDesc: "RFID Card Top Up"
        }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data.ResponseCode === '0') {
            return {
                success: true,
                MerchantRequestID: response.data.MerchantRequestID,
                CheckoutRequestID: response.data.CheckoutRequestID
            };
        } else {
            throw new Error(`M-Pesa Error: ${response.data.ResponseDescription}`);
        }
    } catch (error) {
        console.error('Error initiating STK Push:', error);
        throw new Error(error.response?.data?.errorMessage || error.message || 'Failed to initiate payment');
    }
}

// Top-up endpoint
app.post('/api/admin/top-up', async (req, res) => {
    if (!req.session.admin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { userId, amount, phoneNumber } = req.body;
        
        // Validate amount
        if (amount < 10) {
            return res.status(400).json({ error: 'Minimum top-up amount is KSh 10' });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Create pending transaction
        const transaction = await Transaction.create({
            userId,
            type: 'deposit',
            amount,
            description: 'M-Pesa Top Up',
            status: 'pending'
        });

        // Initiate M-Pesa payment
        const mpesaResponse = await initiateSTKPush(phoneNumber, amount, `RFID-${user.rfidCardId}`);
        
        // Update transaction with M-Pesa reference
        await transaction.update({
            mpesaReference: mpesaResponse.MerchantRequestID,
            status: 'pending'
        });

        res.json({
            success: true,
            message: 'Payment initiated successfully. Please check your phone to complete the payment.',
            transactionId: transaction.id
        });
    } catch (error) {
        console.error('Error initiating top-up:', error);
        res.status(500).json({ 
            error: 'Failed to initiate payment',
            details: error.message
        });
    }
});

// M-Pesa callback endpoint
app.post('/api/mpesa/callback', async (req, res) => {
    try {
        const { Body: { stkCallback: { ResultCode, MerchantRequestID, CheckoutRequestID } } } = req.body;

        // Find the transaction
        const transaction = await Transaction.findOne({
            where: { mpesaReference: MerchantRequestID }
        });

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        if (ResultCode === 0) {
            // Payment successful
            const user = await User.findByPk(transaction.userId);
            await user.update({
                balance: parseFloat(user.balance) + parseFloat(transaction.amount)
            });
            await transaction.update({ status: 'completed' });
        } else {
            // Payment failed
            await transaction.update({ status: 'failed' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error processing M-Pesa callback:', error);
        res.status(500).json({ error: 'Failed to process callback' });
    }
});

// Service payment endpoint
app.post('/api/rfid/service-payment', async (req, res) => {
    try {
        const { rfidCardId, service } = req.body;
        
        // Find the user
        const user = await User.findOne({ where: { rfidCardId, status: 'active' } });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found or inactive' });
        }

        // Determine service cost
        let cost = 0;
        let description = '';
        
        switch (service) {
            case 'gym':
                cost = 50;
                description = 'Gym Access';
                break;
            case 'pool':
                cost = 200;
                description = 'Swimming Pool Access';
                break;
            default:
                return res.status(400).json({ error: 'Invalid service' });
        }

        // Check if user has sufficient balance
        if (parseFloat(user.balance) < cost) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        // Create transaction
        const transaction = await Transaction.create({
            userId: user.id,
            type: 'service_payment',
            amount: cost,
            description,
            status: 'completed'
        });

        // Deduct amount from user's balance
        await user.update({
            balance: parseFloat(user.balance) - cost
        });

        res.json({
            success: true,
            message: 'Payment successful',
            newBalance: user.balance
        });
    } catch (error) {
        console.error('Error processing service payment:', error);
        res.status(500).json({ error: 'Failed to process payment' });
    }
});

// Analytics API endpoints
app.get('/api/admin/live-population', async (req, res) => {
    try {
        // Calculate current population by counting entries minus exits for today
        const [results] = await sequelize.query(`
            SELECT 
                accessPoint,
                SUM(CASE WHEN direction = 'entry' THEN 1 ELSE 0 END) as entries,
                SUM(CASE WHEN direction = 'exit' THEN 1 ELSE 0 END) as exits
            FROM access_logs
            WHERE 
                DATE(createdAt) = CURDATE() AND
                status = 'granted'
            GROUP BY accessPoint
        `);

        const population = {
            science: 0,
            engineering: 0,
            medicine: 0
        };

        // Initialize with simulated values to ensure display when no data exists
        // These fallback values will be overridden if actual data exists
        population.science = Math.floor(Math.random() * 700) + 800; // 800-1500 range
        population.engineering = Math.floor(Math.random() * 700) + 800;
        population.medicine = Math.floor(Math.random() * 700) + 800;

        results.forEach(result => {
            // Calculate current population as entries - exits
            const currentCount = Math.max(0, parseInt(result.entries || 0) - parseInt(result.exits || 0));
            
            // Map the access points to the population object keys
            if (result.accessPoint === 'School of Science') {
                population.science = currentCount > 0 ? currentCount : population.science;
            } else if (result.accessPoint === 'School of Engineering') {
                population.engineering = currentCount > 0 ? currentCount : population.engineering;
            } else if (result.accessPoint === 'School of Medicine') {
                population.medicine = currentCount > 0 ? currentCount : population.medicine;
            }
        });

        console.log('Current population:', population);
        res.json(population);
    } catch (error) {
        console.error('Error fetching live population:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// New endpoint for live student tracking
app.get('/api/admin/live-student-tracking', async (req, res) => {
    try {
        // Find students who have entered buildings but not exited today
        const [results] = await sequelize.query(`
            SELECT 
                u.name,
                u.rfidCardId,
                a.accessPoint,
                a.timeIn
            FROM 
                users u
            JOIN 
                access_logs a ON u.rfidCardId = a.rfidCardId
            WHERE 
                a.direction = 'entry' AND
                a.status = 'granted' AND
                a.timeOut IS NULL AND
                DATE(a.createdAt) = CURDATE() AND
                a.id IN (
                    SELECT MAX(id)
                    FROM access_logs
                    WHERE 
                        direction = 'entry' AND
                        status = 'granted' AND
                        timeOut IS NULL AND
                        DATE(createdAt) = CURDATE()
                    GROUP BY rfidCardId, accessPoint
                )
            ORDER BY 
                a.accessPoint, a.timeIn DESC
        `);

        // Group students by building
        const studentsByBuilding = {
            'School of Science': [],
            'School of Engineering': [],
            'School of Medicine': []
        };

        results.forEach(student => {
            if (studentsByBuilding.hasOwnProperty(student.accessPoint)) {
                // Format time for display
                const timeIn = new Date(student.timeIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                studentsByBuilding[student.accessPoint].push({
                    name: student.name,
                    rfidCardId: student.rfidCardId,
                    role: 'Student', // Default role since it's not in the database
                    timeIn: timeIn
                });
            }
        });

        res.json(studentsByBuilding);
    } catch (error) {
        console.error('Error fetching live student tracking:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/admin/student-hours', async (req, res) => {
    try {
        // Simplified query to just get total access counts as a proxy for hours
        const [results] = await sequelize.query(`
            SELECT 
                u.name,
                u.rfidCardId,
                COUNT(a.id) as accessCount
            FROM 
                users u
            JOIN 
                access_logs a ON u.rfidCardId = a.rfidCardId
            WHERE 
                a.status = 'granted' AND
                a.createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY 
                u.rfidCardId
            ORDER BY 
                accessCount DESC
            LIMIT 10
        `);

        // Format the response with hours estimated from access count
        const formattedResults = results.map(row => ({
            name: row.name,
            rfidCardId: row.rfidCardId,
            hours: Math.max(1, Math.round(row.accessCount * 0.5)) // Estimate 30 min per access
        }));

        res.json(formattedResults);
    } catch (error) {
        console.error('Error fetching student hours:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/admin/campus-traffic', async (req, res) => {
    try {
        // Simplified query that doesn't rely on direction field
        const [results] = await sequelize.query(`
            SELECT 
                DATE(createdAt) as date,
                accessPoint,
                COUNT(*) as entries
            FROM 
                access_logs
            WHERE 
                status = 'granted' AND
                createdAt >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY 
                DATE(createdAt),
                accessPoint
            ORDER BY 
                date
        `);
        
        // Format the data for Chart.js
        const dates = [...new Set(results.map(r => r.date))].map(date => 
            new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        );
        
        // Initialize data arrays for each campus
        const science = Array(dates.length).fill(0);
        const engineering = Array(dates.length).fill(0);
        const medicine = Array(dates.length).fill(0);
        
        // Populate the data arrays
        results.forEach(row => {
            const dateIndex = [...new Set(results.map(r => r.date))].indexOf(row.date);
            
            if (row.accessPoint === 'School of Science') {
                science[dateIndex] = row.entries;
            } else if (row.accessPoint === 'School of Engineering') {
                engineering[dateIndex] = row.entries;
            } else if (row.accessPoint === 'School of Medicine') {
                medicine[dateIndex] = row.entries;
            }
        });
        
        res.json({
            labels: dates,
            science,
            engineering,
            medicine
        });
    } catch (error) {
        console.error('Error fetching campus traffic:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/admin/weekly-pattern', async (req, res) => {
    try {
        // Simplified query that doesn't rely on direction field
        const [results] = await sequelize.query(`
            SELECT 
                DAYOFWEEK(createdAt) as dayOfWeek,
                accessPoint,
                COUNT(*) as entries
            FROM 
                access_logs
            WHERE 
                status = 'granted' AND
                createdAt >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY 
                DAYOFWEEK(createdAt),
                accessPoint
            ORDER BY 
                dayOfWeek
        `);
        
        // Initialize arrays for each campus (days 1-7, Sunday to Saturday)
        const science = Array(7).fill(0);
        const engineering = Array(7).fill(0);
        const medicine = Array(7).fill(0);
        
        // Process the results
        results.forEach(row => {
            // MySQL's DAYOFWEEK: 1=Sunday, 2=Monday, ..., 7=Saturday
            // Adjust to 0-6 index (Monday to Sunday) for JavaScript week
            const dayIndex = row.dayOfWeek === 1 ? 6 : row.dayOfWeek - 2;
            
            if (row.accessPoint === 'School of Science') {
                science[dayIndex] = row.entries;
            } else if (row.accessPoint === 'School of Engineering') {
                engineering[dayIndex] = row.entries;
            } else if (row.accessPoint === 'School of Medicine') {
                medicine[dayIndex] = row.entries;
            }
        });
        
        res.json({
            science,
            engineering,
            medicine
        });
    } catch (error) {
        console.error('Error fetching weekly pattern:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', {
        title: 'Error',
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err : {},
        status: 500,
        layout: 'layout'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', {
        title: '404 Not Found',
        message: 'The page you are looking for does not exist.',
        status: 404,
        layout: 'layout'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Web server running on http://localhost:${PORT}`);
}); 