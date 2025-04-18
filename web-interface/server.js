// Load environment variables
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();

// Set up EJS as the template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// For EJS layouts
app.use(require('express-ejs-layouts'));
app.set('layout', 'layout');  // default layout

// Middleware
app.use(bodyParser.json());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Database connection
const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 8807,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Davkik19',
    database: process.env.DB_NAME || 'rfid_system',
};

console.log('Database configuration:', { 
    ...dbConfig, 
    password: dbConfig.password ? '******' : '(not set)' 
});

let db;

async function initializeDB() {
    const maxRetries = 3;
    let retries = 0;
    
    while (retries < maxRetries) {
        try {
            db = await mysql.createConnection(dbConfig);
            console.log('Connected to the database.');
            return;
        } catch (err) {
            console.error(`Database connection attempt ${retries + 1} failed:`, err);
            retries++;
            if (retries === maxRetries) {
                console.error('Max retries reached. Exiting...');
                process.exit(1);
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

// Admin authentication middleware
const authenticateAdmin = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid token' });
    }
};

// Admin login endpoint
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    
    const user = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
    if (user[0].length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user[0][0].password);
    if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
        { id: user[0][0].id, username: user[0][0].username, role: user[0][0].role },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    res.json({ token });
});

// Admin statistics endpoint - temporarily allowing unauthenticated access for testing
app.get('/api/admin/stats', async (req, res) => {
    try {
        const [usersCount] = await db.execute('SELECT COUNT(*) as count FROM users');
        const [todayAccess] = await db.execute(`
            SELECT COUNT(*) as count 
            FROM access_logs 
            WHERE DATE(createdAt) = CURDATE()
        `);
        const [deniedAccess] = await db.execute(`
            SELECT COUNT(*) as count 
            FROM access_logs 
            WHERE status = 'denied' AND DATE(createdAt) = CURDATE()
        `);
        const [accessData] = await db.execute(`
            SELECT DATE(createdAt) as date, COUNT(*) as count 
            FROM access_logs 
            GROUP BY DATE(createdAt) 
            ORDER BY date DESC 
            LIMIT 7
        `);
        const [timeData] = await db.execute(`
            SELECT HOUR(createdAt) as hour, COUNT(*) as count 
            FROM access_logs 
            WHERE DATE(createdAt) = CURDATE() 
            GROUP BY HOUR(createdAt)
        `);

        res.json({
            totalUsers: usersCount[0].count,
            todayAccess: todayAccess[0].count,
            deniedAccess: deniedAccess[0].count,
            accessData: accessData,
            timeData: timeData
        });
    } catch (err) {
        console.error('Error fetching statistics:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Admin user management endpoints
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const search = req.query.search || '';
    const itemsPerPage = 10;

    const [users] = await db.execute(`
        SELECT u.*, MAX(l.createdAt) as lastAccess 
        FROM users u 
        LEFT JOIN access_logs l ON u.rfidCardId = l.rfidCardId 
        GROUP BY u.id
    `);

    const filteredUsers = users.filter(user => 
        user.name.toLowerCase().includes(search.toLowerCase()) ||
        user.rfidCardId.toLowerCase().includes(search.toLowerCase())
    );

    const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const paginatedUsers = filteredUsers.slice(startIndex, startIndex + itemsPerPage);

    res.json({
        users: paginatedUsers,
        totalPages
    });
});

app.post('/api/admin/add_user', authenticateAdmin, async (req, res) => {
    const { uid, name } = req.body;
    
    if (!uid || !name) {
        return res.status(400).json({ error: 'UID and name are required' });
    }

    const [existingUser] = await db.execute('SELECT * FROM users WHERE uid = ?', [uid]);
    if (existingUser.length > 0) {
        return res.status(400).json({ error: 'User with this UID already exists' });
    }

    const [result] = await db.execute('INSERT INTO users (uid, name) VALUES (?, ?)', [uid, name]);
    res.status(201).json({ status: 'success', id: result.insertId });
});

app.delete('/api/admin/delete_user/:uid', authenticateAdmin, async (req, res) => {
    const { uid } = req.params;
    
    const [result] = await db.execute('DELETE FROM users WHERE uid = ?', [uid]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ message: 'User deleted successfully' });
});

app.get('/api/admin/logs', authenticateAdmin, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const date = req.query.date;
    const status = req.query.status;
    const itemsPerPage = 10;

    let [logs] = await db.execute(`
        SELECT l.*, u.name 
        FROM access_logs l 
        LEFT JOIN users u ON l.rfidCardId = u.rfidCardId 
        ORDER BY l.createdAt DESC 
        LIMIT 100
    `);

    if (date) {
        logs = logs.filter(log => 
            new Date(log.createdAt).toDateString() === new Date(date).toDateString()
        );
    }

    if (status) {
        logs = logs.filter(log => log.status === status);
    }

    const totalPages = Math.ceil(logs.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const paginatedLogs = logs.slice(startIndex, startIndex + itemsPerPage);

    res.json({
        logs: paginatedLogs,
        totalPages
    });
});

app.get('/api/admin/export_logs', async (req, res) => {
    try {
        const [logs] = await db.execute(`
            SELECT l.*, u.name 
            FROM access_logs l 
            LEFT JOIN users u ON l.rfidCardId = u.rfidCardId 
            ORDER BY l.createdAt DESC 
            LIMIT 1000
        `);

        const csv = [
            ['RFID Card ID', 'Name', 'Timestamp', 'Access Point', 'Status', 'Reason'],
            ...logs.map(log => [
                log.rfidCardId, 
                log.name || 'Unknown', 
                log.createdAt, 
                log.accessPoint,
                log.status,
                log.reason || '-'
            ])
        ].map(row => row.join(',')).join('\n');

        res.json({ data: csv });
    } catch (error) {
        console.error('Error exporting logs:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Access logs endpoint - temporarily allow unauthenticated access for testing
app.get('/api/admin/access-logs', async (req, res) => {
    try {
        console.log('Fetching access logs...');
        
        const [logs] = await db.execute(`
            SELECT 
                l.id, 
                l.rfidCardId, 
                l.createdAt, 
                l.accessPoint, 
                l.direction,
                l.status, 
                l.reason,
                u.name as userName
            FROM 
                access_logs l
            LEFT JOIN 
                users u ON l.rfidCardId = u.rfidCardId
            ORDER BY 
                l.createdAt DESC
            LIMIT 50
        `);
        
        console.log(`Found ${logs.length} logs`);
        
        // Format the response to match the expected structure in the frontend
        const formattedLogs = logs.map(log => ({
            ...log,
            User: { name: log.userName || 'Unknown' }
        }));
        
        res.json(formattedLogs);
        
    } catch (error) {
        console.error('Error fetching access logs:', error);
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// RFID endpoints
app.get('/api/user/:uid', async (req, res) => {
    const uid = req.params.uid;
    const sql = 'SELECT name FROM users WHERE uid = ?';
    try {
        const [results] = await db.execute(sql, [uid]);
        if (results.length > 0) {
            res.json({ name: results[0].name });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/log', async (req, res) => {
    const { rfidCardId, userName, accessPoint, status, reason } = req.body;
    const sql = 'INSERT INTO access_logs (rfidCardId, accessPoint, status, reason) VALUES (?, ?, ?, ?)';
    try {
        const [result] = await db.execute(sql, [rfidCardId, accessPoint, status, reason]);
        res.json({ status: 'success', id: result.insertId });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Analytics API endpoints
app.get('/api/admin/live-population', async (req, res) => {
    try {
        // Get current population by counting users who have entered but not exited each building
        const [results] = await db.execute(`
            SELECT 
                accessPoint,
                SUM(CASE WHEN direction = 'entry' THEN 1 ELSE -1 END) as currentCount
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

        results.forEach(result => {
            // Map the access points to the population object keys
            if (result.accessPoint === 'School of Science') {
                population.science = Math.max(0, result.currentCount || 0);
            } else if (result.accessPoint === 'School of Engineering') {
                population.engineering = Math.max(0, result.currentCount || 0);
            } else if (result.accessPoint === 'School of Medicine') {
                population.medicine = Math.max(0, result.currentCount || 0);
            }
        });

        res.json(population);
    } catch (error) {
        console.error('Error fetching live population:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/admin/student-hours', async (req, res) => {
    try {
        // Calculate total hours spent by each student in the past 30 days
        const [results] = await db.execute(`
            SELECT 
                u.name,
                u.rfidCardId,
                SUM(
                    TIMESTAMPDIFF(HOUR, 
                        entry.createdAt, 
                        IFNULL(exit.createdAt, NOW())
                    )
                ) as totalHours
            FROM 
                users u
            JOIN 
                access_logs entry ON u.rfidCardId = entry.rfidCardId
            LEFT JOIN 
                access_logs exit ON 
                    entry.rfidCardId = exit.rfidCardId AND
                    entry.accessPoint = exit.accessPoint AND
                    exit.direction = 'exit' AND
                    exit.createdAt > entry.createdAt AND
                    DATE(exit.createdAt) = DATE(entry.createdAt)
            WHERE 
                entry.direction = 'entry' AND
                entry.status = 'granted' AND
                entry.createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY 
                u.rfidCardId
            ORDER BY 
                totalHours DESC
            LIMIT 10
        `);

        // Format the response
        const formattedResults = results.map(row => ({
            name: row.name,
            rfidCardId: row.rfidCardId,
            hours: Math.round(row.totalHours * 10) / 10 // Round to one decimal place
        }));

        res.json(formattedResults);
    } catch (error) {
        console.error('Error fetching student hours:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/admin/campus-traffic', async (req, res) => {
    try {
        // Get daily traffic for each campus over the past 7 days
        const [results] = await db.execute(`
            SELECT 
                DATE(createdAt) as date,
                accessPoint,
                COUNT(*) as entries
            FROM 
                access_logs
            WHERE 
                direction = 'entry' AND
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
        // Get weekly visit patterns by day of week for each campus
        const [results] = await db.execute(`
            SELECT 
                DAYOFWEEK(createdAt) as dayOfWeek,
                accessPoint,
                COUNT(*) as entries
            FROM 
                access_logs
            WHERE 
                direction = 'entry' AND
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

// Admin routes
app.get('/admin/dashboard', async (req, res) => {
    // if (!req.session.adminId) {
    //     return res.redirect('/admin/login');
    // }
    
    try {
        // const [admins] = await db.execute('SELECT * FROM admins WHERE id = ?', [req.session.adminId]);
        // if (admins.length === 0) {
        //     req.session.adminId = null;
        //     return res.redirect('/admin/login');
        // }
        
        res.render('admin/dashboard', { 
            title: 'Admin Dashboard',
            admin: { name: 'Test Admin' }, // Placeholder admin
            isAdmin: true
        });
    } catch (err) {
        console.error('Error loading admin dashboard:', err);
        res.status(500).render('error', { message: 'Database error' });
    }
});

app.get('/admin/access-logs', async (req, res) => {
    // if (!req.session.adminId) {
    //     return res.redirect('/admin/login');
    // }
    
    res.render('admin/access-logs', { 
        title: 'Access Logs',
        admin: { name: 'Test Admin' }, // Placeholder admin
        isAdmin: true
    });
});

app.get('/admin/analytics', async (req, res) => {
    // if (!req.session.adminId) {
    //     return res.redirect('/admin/login');
    // }
    
    res.render('admin/analytics', { 
        title: 'Campus Analytics',
        admin: { name: 'Test Admin' }, // Placeholder admin
        isAdmin: true
    });
});

// Start server
const PORT = process.env.PORT || 3000;
initializeDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}); 