# RFID Security System Web Interface

A modern web interface for managing an RFID-based security system. This application provides real-time monitoring, user management, and access control features.

## Features

- Real-time access monitoring
- User management (add, remove, and view users)
- Access logs with filtering and export capabilities
- Secure admin authentication
- Responsive dashboard with statistics and charts
- Modern UI with Bootstrap 5

## Prerequisites

- Node.js (v14 or higher)
- MySQL (v8.0 or higher)
- npm or yarn package manager

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/rfid-security-system.git
cd rfid-security-system/web-interface
```

2. Install dependencies:
```bash
npm install
```

3. Create a copy of the environment variables file:
```bash
cp .env.example .env
```

4. Update the `.env` file with your configuration:
- Set your database credentials
- Change the JWT secret
- Update admin credentials
- Configure allowed origins

5. Create the database and tables:
```sql
CREATE DATABASE rfid_system;
USE rfid_system;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uid VARCHAR(14) NOT NULL UNIQUE,
    name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE access_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uid VARCHAR(14) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accessGranted BOOLEAN NOT NULL,
    FOREIGN KEY (uid) REFERENCES users(uid)
);
```

## Running the Application

1. Start the development server:
```bash
npm run dev
```

2. Access the application:
- Main interface: http://localhost:3000
- Admin login: http://localhost:3000/admin/login.html
- Admin dashboard: http://localhost:3000/admin/dashboard.html

Default admin credentials:
- Username: admin
- Password: admin123

**Note:** Make sure to change the default admin credentials in production.

## Security Considerations

1. Change the default admin credentials
2. Use a strong JWT secret
3. Configure CORS properly in production
4. Use HTTPS in production
5. Regularly update dependencies
6. Keep your database credentials secure

## Development

- The application uses Express.js for the backend
- Frontend is built with Bootstrap 5 and vanilla JavaScript
- Charts are created using Chart.js
- Authentication is handled with JWT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 