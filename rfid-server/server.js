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
app.use(cors());

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

(async function initializeDB() {
  try {
    db = await mysql.createConnection(dbConfig);
    console.log('Connected to the database.');
  } catch (err) {
    console.error('Database connection failed:', err);
    process.exit(1);
  }
})();

// Endpoint to get user by UID
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

// Endpoint to log access attempts
app.post('/api/log', async (req, res) => {
  const { uid, userName, timestamp } = req.body;
  const sql = 'INSERT INTO access_logs (uid, userName, timestamp) VALUES (?, ?, ?)';
  try {
    const [result] = await db.execute(sql, [uid, userName, timestamp]);
    res.json({ status: 'success', id: result.insertId });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Endpoint to add a new user
app.post('/api/add_user', async (req, res) => {
  const { uid, name } = req.body;
  const sql = 'INSERT INTO users (uid, name) VALUES (?, ?)';
  try {
    await db.execute(sql, [uid, name]);
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

// Endpoint to update user name by UID
app.put('/api/update_user', async (req, res) => {
  const { uid, name } = req.body;
  const sql = 'UPDATE users SET name = ? WHERE uid = ?';
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

// Start the server
const PORT = 3000; // You can change the port if needed
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
