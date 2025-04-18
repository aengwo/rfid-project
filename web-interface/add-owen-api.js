const fetch = require('node-fetch');

async function addOwen() {
    try {
        // First login as admin
        const loginResponse = await fetch('http://localhost:3001/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: 'admin',
                password: 'admin123'  // Using the default password from .env
            })
        });

        const loginData = await loginResponse.json();
        
        if (!loginData.success) {
            throw new Error('Failed to login as admin');
        }

        // Add Owen using the API
        const addUserResponse = await fetch('http://localhost:3001/api/admin/add_user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${loginData.token}`
            },
            body: JSON.stringify({
                name: 'Owen',
                rfidCardId: 'A7D04302'
            })
        });

        const addUserData = await addUserResponse.json();
        
        if (addUserData.success) {
            console.log('Owen added successfully!');
            console.log('User details:', addUserData.user);
        } else {
            console.error('Failed to add Owen:', addUserData.error);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

addOwen(); 