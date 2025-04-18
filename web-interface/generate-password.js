const bcrypt = require('bcryptjs');

// Generate a salt and hash the password
const password = 'admin123'; // Change this to your desired password
bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
        console.error('Error hashing password:', err);
        return;
    }
    console.log('Hashed password:', hash);
    console.log('\nCopy this hash to your .env file as ADMIN_PASSWORD_HASH');
}); 