// server.js
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise'); // Use 'mysql2' with promises
const cors = require('cors');
const path = require('path');

const app = express();

// Logging middleware: logs every incoming request's method and path
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.path}`);
  next();
});

app.use(bodyParser.json());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Serve static files (like the HTML interface)
app.use(express.static(path.join(__dirname)));

// Database connection
const dbConfig = {
  host: '127.0.0.1',
  port: 8807,
  user: 'root',
  password: 'Davkik19', // Replace with your actual password or use environment variables
  database: 'rfid_system',
};

let db;

async function initializeDB() {
  const maxRetries = 3;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      // Create connection
      db = await mysql.createConnection(dbConfig);
      console.log('Connected to the database.');
      
      // Check for existing tables
      const [tables] = await db.execute(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = ?
      `, [dbConfig.database]);
      
      const tableNames = tables.map(t => t.TABLE_NAME || t.table_name);
      console.log('Existing tables:', tableNames);
      
      // We don't need to create tables if they exist with different structure
      if (!tableNames.includes('users') && !tableNames.includes('access_logs')) {
        console.log('Creating missing tables...');
        // Only create if they don't exist - otherwise, assume schema is already set up
        
        await db.execute(`
          CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            rfidCardId VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(100),
            phone VARCHAR(20),
            status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
            accessLevel INT DEFAULT 1,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            balance DECIMAL(10,2) DEFAULT 0.00
          )
        `);
        
        await db.execute(`
          CREATE TABLE IF NOT EXISTS access_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            userId INT NULL,  // Changed from NOT NULL DEFAULT 0
            rfidCardId VARCHAR(50) NOT NULL,
            accessPoint VARCHAR(100),
            status VARCHAR(20) DEFAULT 'granted',
            reason VARCHAR(100),
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            direction VARCHAR(20) DEFAULT 'entry',
            timeIn TIMESTAMP NULL,
            timeOut TIMESTAMP NULL
          )
        `);
      }
      
      console.log('Database setup complete.');
      setupDatabaseHeartbeat();
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

// Add this function and call it from initializeDB after table creation
async function updateDatabaseSchema() {
  try {
    // Modify userId to accept NULL values
    await db.execute(`
      ALTER TABLE access_logs 
      MODIFY COLUMN userId INT NULL
    `);
    console.log('Successfully updated access_logs schema to allow NULL userId');
  } catch (err) {
    console.error('Error updating schema (this might be normal if already updated):', err.message);
    // Continue anyway, as this is just an enhancement
  }
}

// Database connection heartbeat
function setupDatabaseHeartbeat() {
  const heartbeatInterval = 30000; // 30 seconds
  
  setInterval(async () => {
    if (db) {
      try {
        await db.execute('SELECT 1');
        console.log('Database heartbeat: connection alive');
      } catch (err) {
        console.error('Database connection lost, attempting to reconnect');
        try {
          db = await mysql.createConnection(dbConfig);
          console.log('Successfully reconnected to database');
        } catch (reconnectErr) {
          console.error('Failed to reconnect to database:', reconnectErr);
        }
      }
    }
  }, heartbeatInterval);
}

// Admin authentication middleware
const authenticateAdmin = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    // In a real application, you would verify the JWT token here
    // For this example, we'll use a simple token check
    if (token !== process.env.ADMIN_TOKEN) {
        return res.status(403).json({ error: 'Invalid token' });
    }
    next();
};

// Admin login endpoint
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    // In a real application, you would verify against a database
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        // In a real application, you would generate a JWT token here
        res.json({ token: process.env.ADMIN_TOKEN });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Update the /api/admin/stats endpoint
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
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
    try {
        const [users] = await db.execute(`
            SELECT u.*, MAX(l.createdAt) as lastAccess 
            FROM users u 
            LEFT JOIN access_logs l ON u.rfidCardId = l.rfidCardId 
            GROUP BY u.rfidCardId
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
        await db.execute('INSERT INTO users (rfidCardId, name) VALUES (?, ?)', [uid, name]);
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

// Update the /api/admin/logs endpoint
app.get('/api/admin/logs', authenticateAdmin, async (req, res) => {
    try {
        const [logs] = await db.execute(`
            SELECT l.*, u.name 
            FROM access_logs l 
            LEFT JOIN users u ON l.rfidCardId = u.rfidCardId 
            ORDER BY l.createdAt DESC 
            LIMIT 100
        `);
        res.json(logs);
    } catch (err) {
        console.error('Error fetching logs:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Endpoint to get user by UID
app.get('/api/user/:uid', async (req, res) => {
  const uid = req.params.uid.toUpperCase(); // Ensure consistent case
  console.log(`Looking up user with UID: ${uid}`);
  
  try {
    // Check database connection first
    if (!db) {
      console.error('Database connection is not established');
      return res.status(500).json({ error: 'Database connection not established' });
    }
    
    // Check connection state and attempt reconnection if needed
    try {
      // Test the connection with a simple query
      await db.execute('SELECT 1');
    } catch (connErr) {
      console.log('Database connection lost, attempting to reconnect...');
      try {
        db = await mysql.createConnection(dbConfig);
        console.log('Successfully reconnected to database');
      } catch (reconnectErr) {
        console.error('Failed to reconnect to database:', reconnectErr);
        return res.status(500).json({ error: 'Database connection failed' });
      }
    }
    
    // Use the correct column names based on your actual database structure
    const sql = 'SELECT id, name, status, accessLevel, balance FROM users WHERE rfidCardId = ?';
    console.log(`Executing query: ${sql} with params: [${uid}]`);
    
    const [results] = await db.execute(sql, [uid]);
    console.log(`Query results:`, results);
    
    if (results.length > 0) {
      console.log(`User found: ${results[0].name}`);
      
      // Check if status is "active" instead of using an authorized field
      const authorized = results[0].status === 'active';
      
      // Include more information in the response
      res.json({ 
        name: results[0].name,
        authorized: authorized,
        accessLevel: results[0].accessLevel,
        balance: results[0].balance
      });
      
      // Log this access in the /api/user/:uid endpoint
      try {
        const timestamp = new Date().toISOString();
        const accessPoint = req.query.accessPoint || 'Unknown';
        const direction = req.query.direction || 'entry';
        
        // Use the actual user ID from the results
        await db.execute(
          'INSERT INTO access_logs (rfidCardId, userId, accessPoint, status, createdAt, updatedAt, direction) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [uid, results[0].id, accessPoint, authorized ? 'granted' : 'denied', timestamp, timestamp, direction]
        );
        console.log(`Access logged successfully for user: ${results[0].name} at ${accessPoint}`);
      } catch (logErr) {
        console.error('Error logging access:', logErr);
        // Continue execution even if logging fails
      }
    } else {
      console.log(`User not found with UID: ${uid}`);
      res.status(404).json({ error: 'User not found' });
    }
  } catch (err) {
    console.error('Database error details:', err.message);
    console.error('Database error stack:', err.stack);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// Update the /api/log endpoint
app.post('/api/log', async (req, res) => {
  const { uid, userId, timestamp, accessGranted } = req.body;
  
  // Validate required parameters
  if (!uid) {
    return res.status(400).json({ status: 'error', message: 'UID is required' });
  }
  
  try {
    // First, look up the user ID from the rfidCardId
    const [userResults] = await db.execute('SELECT id FROM users WHERE rfidCardId = ?', [uid]);
    
    // Set user ID from lookup results or null
    const actualUserId = userResults.length > 0 ? userResults[0].id : null;
    
    // Prepare other parameters
    const safeTimestamp = timestamp || new Date().toISOString();
    const status = accessGranted ? 'granted' : 'denied';
    const accessPoint = req.body.accessPoint || 'Unknown';
    const direction = req.body.direction || 'entry';
    
    // Insert with the actual user ID
    const sql = 'INSERT INTO access_logs (rfidCardId, userId, accessPoint, status, createdAt, updatedAt, direction) VALUES (?, ?, ?, ?, ?, ?, ?)';
    const [result] = await db.execute(sql, [uid, actualUserId, accessPoint, status, safeTimestamp, safeTimestamp, direction]);
    
    res.json({ status: 'success', id: result.insertId });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Endpoint to add a new user
app.post('/api/add_user', async (req, res) => {
  const { uid, name } = req.body;
  const sql = 'INSERT INTO users (rfidCardId, name) VALUES (?, ?)';
  
  try {
    const [result] = await db.execute(sql, [uid, name]);
    res.json({ status: 'success' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'UID already exists' });
    } else {
      console.error('Database error:', err);
      res.status(500).json({ error: 'Database error' });
    }
  }
});

// Endpoint to update an existing user
app.put('/api/update_user', async (req, res) => {
  const { uid, name } = req.body;
  const sql = 'UPDATE users SET name = ? WHERE rfidCardId = ?';
  
  try {
    const [result] = await db.execute(sql, [name, uid]);
    
    if (result.affectedRows > 0) {
      res.json({ status: 'success' });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Endpoint to serve the home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Express error handler caught:', err);
  res.status(500).json({
    error: 'Server error',
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
});

// Make sure to initialize the database before starting server
initializeDB()
  .then(() => {
    const PORT = 3000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running on port ${PORT} and listening on all interfaces`);
    });
  })
  .catch(err => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
