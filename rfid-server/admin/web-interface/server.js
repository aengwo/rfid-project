const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Database connection
const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 8807,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'rfid_system',
};

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
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign(
            { username, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.json({ token });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Admin statistics endpoint
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
    try {
        const [usersCount] = await db.execute('SELECT COUNT(*) as count FROM users');
        const [todayAccess] = await db.execute(`
            SELECT COUNT(*) as count 
            FROM access_logs 
            WHERE DATE(timestamp) = CURDATE()
        `);
        const [deniedAccess] = await db.execute(`
            SELECT COUNT(*) as count 
            FROM access_logs 
            WHERE accessGranted = 0 AND DATE(timestamp) = CURDATE()
        `);
        const [accessData] = await db.execute(`
            SELECT DATE(timestamp) as date, COUNT(*) as count 
            FROM access_logs 
            GROUP BY DATE(timestamp) 
            ORDER BY date DESC 
            LIMIT 7
        `);
        const [timeData] = await db.execute(`
            SELECT HOUR(timestamp) as hour, COUNT(*) as count 
            FROM access_logs 
            WHERE DATE(timestamp) = CURDATE() 
            GROUP BY HOUR(timestamp)
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
    try {
        const [users] = await db.execute(`
            SELECT u.*, MAX(l.timestamp) as lastAccess 
            FROM users u 
            LEFT JOIN access_logs l ON u.uid = l.uid 
            GROUP BY u.uid
        `);
        res.json(users);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/admin/add_user', authenticateAdmin, async (req, res) => {
    const { uid, name } = req.body;
    try {
        await db.execute('INSERT INTO users (uid, name) VALUES (?, ?)', [uid, name]);
        res.json({ status: 'success' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ error: 'UID already exists' });
        } else {
            console.error('Error adding user:', err);
            res.status(500).json({ error: 'Database error' });
        }
    }
});

app.get('/api/admin/logs', authenticateAdmin, async (req, res) => {
    try {
        const [logs] = await db.execute(`
            SELECT l.*, u.name 
            FROM access_logs l 
            LEFT JOIN users u ON l.uid = u.uid 
            ORDER BY l.timestamp DESC 
            LIMIT 100
        `);
        res.json(logs);
    } catch (err) {
        console.error('Error fetching logs:', err);
        res.status(500).json({ error: 'Database error' });
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
    const { uid, userName, timestamp, accessGranted } = req.body;
    const sql = 'INSERT INTO access_logs (uid, userName, timestamp, accessGranted) VALUES (?, ?, ?, ?)';
    try {
        const [result] = await db.execute(sql, [uid, userName, timestamp, accessGranted]);
        res.json({ status: 'success', id: result.insertId });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
initializeDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}); 