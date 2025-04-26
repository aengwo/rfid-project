// Check authentication
if (!localStorage.getItem('adminToken')) {
    window.location.href = 'http://localhost:3000/admin/login.html';
}

// Navigation
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = e.target.dataset.section;
        document.querySelectorAll('[id$="Section"]').forEach(div => {
            div.style.display = 'none';
        });
        document.getElementById(`${section}Section`).style.display = 'block';
    });
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    window.location.href = 'http://localhost:3000/admin/login.html';
});

// Fetch and display statistics
async function fetchStatistics() {
    try {
        const response = await fetch('/api/admin/stats', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        const data = await response.json();
        
        document.getElementById('totalUsers').textContent = data.totalUsers;
        document.getElementById('todayAccess').textContent = data.todayAccess;
        document.getElementById('deniedAccess').textContent = data.deniedAccess;

        // Update charts
        updateAccessChart(data.accessData);
        updateTimeChart(data.timeData);
    } catch (error) {
        console.error('Error fetching statistics:', error);
    }
}

// Add user functionality
document.getElementById('saveUserBtn').addEventListener('click', async () => {
    const uid = document.getElementById('uid').value;
    const name = document.getElementById('name').value;

    try {
        const response = await fetch('/api/admin/add_user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify({ uid, name })
        });

        if (response.ok) {
            alert('User added successfully');
            document.getElementById('addUserModal').classList.remove('show');
            document.body.classList.remove('modal-open');
            document.querySelector('.modal-backdrop').remove();
            fetchUsers();
        } else {
            alert('Failed to add user');
        }
    } catch (error) {
        console.error('Error adding user:', error);
        alert('Error adding user');
    }
});

// Initialize dashboard
fetchStatistics();
fetchUsers();
fetchLogs();

// Update charts every 5 minutes
setInterval(fetchStatistics, 300000); 