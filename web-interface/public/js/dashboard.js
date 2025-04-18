// Constants
const ITEMS_PER_PAGE = 10;
const API_BASE_URL = '/api/admin';
const TOKEN_KEY = 'adminToken';
const CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]').getAttribute('content');

// State management
let currentPage = {
    users: 1,
    logs: 1
};
let totalPages = {
    users: 1,
    logs: 1
};
let currentFilters = {
    users: '',
    logs: {
        date: '',
        status: ''
    }
};

// Utility functions
function showLoading() {
    document.getElementById('loadingSpinner').style.display = 'block';
}

function hideLoading() {
    document.getElementById('loadingSpinner').style.display = 'none';
}

function showError(message) {
    const errorAlert = document.getElementById('errorAlert');
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorAlert.style.display = 'block';
    setTimeout(() => {
        errorAlert.style.display = 'none';
    }, 5000);
}

function validateRFID(uid) {
    return /^[0-9A-Fa-f]{8,14}$/.test(uid);
}

function validateName(name) {
    return name.length >= 2 && name.length <= 50;
}

// Authentication check
if (!localStorage.getItem(TOKEN_KEY)) {
    window.location.href = '/admin/login.html';
}

// API request wrapper
async function apiRequest(endpoint, options = {}) {
    const headers = {
        'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                ...headers,
                ...options.headers
            }
        });

        if (response.status === 401) {
            localStorage.removeItem(TOKEN_KEY);
            window.location.href = '/admin/login.html';
            return;
        }

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        showError(error.message);
        throw error;
    }
}

// Navigation
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = e.target.closest('.nav-link').dataset.section;
        
        // Update ARIA attributes
        document.querySelectorAll('.nav-link').forEach(l => {
            l.setAttribute('aria-selected', 'false');
            l.classList.remove('active');
        });
        e.target.closest('.nav-link').setAttribute('aria-selected', 'true');
        e.target.closest('.nav-link').classList.add('active');
        
        // Show selected section
        document.querySelectorAll('[id$="Section"]').forEach(div => {
            div.style.display = 'none';
        });
        document.getElementById(`${section}Section`).style.display = 'block';
        
        // Load section data
        if (section === 'users') {
            fetchUsers();
        } else if (section === 'logs') {
            fetchLogs();
        }
    });
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/admin/login.html';
});

// Statistics and Charts
async function fetchStatistics() {
    showLoading();
    try {
        const data = await apiRequest('/stats');
        
        document.getElementById('totalUsers').textContent = data.totalUsers;
        document.getElementById('todayAccess').textContent = data.todayAccess;
        document.getElementById('deniedAccess').textContent = data.deniedAccess;

        updateAccessChart(data.accessData);
        updateTimeChart(data.timeData);
    } catch (error) {
        showError('Failed to fetch statistics');
    } finally {
        hideLoading();
    }
}

function updateAccessChart(data) {
    const ctx = document.getElementById('accessChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Access Count',
                data: data.values,
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                }
            }
        }
    });
}

function updateTimeChart(data) {
    const ctx = document.getElementById('timeChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Access by Hour',
                data: data.values,
                backgroundColor: 'rgba(54, 162, 235, 0.5)'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                }
            }
        }
    });
}

// User Management
async function fetchUsers() {
    showLoading();
    try {
        const response = await apiRequest(`/users?page=${currentPage.users}&search=${currentFilters.users}`);
        const usersTable = document.getElementById('usersTable').getElementsByTagName('tbody')[0];
        usersTable.innerHTML = '';

        response.users.forEach(user => {
            const row = usersTable.insertRow();
            row.innerHTML = `
                <td>${user.uid}</td>
                <td>${user.name}</td>
                <td>${user.lastAccess || 'Never'}</td>
                <td>
                    <button class="btn btn-sm btn-danger delete-user" data-uid="${user.uid}">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
        });

        updatePagination('users', response.totalPages);
    } catch (error) {
        showError('Failed to fetch users');
    } finally {
        hideLoading();
    }
}

// User search
document.getElementById('userSearch').addEventListener('input', debounce((e) => {
    currentFilters.users = e.target.value;
    currentPage.users = 1;
    fetchUsers();
}, 300));

// Add user functionality
document.getElementById('saveUserBtn').addEventListener('click', async () => {
    const form = document.getElementById('addUserForm');
    const uid = document.getElementById('uid').value;
    const name = document.getElementById('name').value;
    
    if (!validateRFID(uid)) {
        document.getElementById('uid').classList.add('is-invalid');
        return;
    }
    
    if (!validateName(name)) {
        document.getElementById('name').classList.add('is-invalid');
        return;
    }
    
    showLoading();
    try {
        await apiRequest('/add_user', {
            method: 'POST',
            body: JSON.stringify({ uid, name })
        });
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('addUserModal'));
        modal.hide();
        
        form.reset();
        fetchUsers();
        showSuccess('User added successfully');
    } catch (error) {
        showError('Failed to add user: ' + error.message);
    } finally {
        hideLoading();
    }
});

// Delete user
document.addEventListener('click', async (e) => {
    if (e.target.closest('.delete-user')) {
        const uid = e.target.closest('.delete-user').dataset.uid;
        const modal = new bootstrap.Modal(document.getElementById('deleteUserModal'));
        modal.show();
        
        document.getElementById('confirmDeleteBtn').onclick = async () => {
            showLoading();
            try {
                await apiRequest(`/delete_user/${uid}`, {
                    method: 'DELETE'
                });
                
                modal.hide();
                fetchUsers();
                showSuccess('User deleted successfully');
            } catch (error) {
                showError('Failed to delete user');
            } finally {
                hideLoading();
            }
        };
    }
});

// Access Logs
async function fetchLogs() {
    showLoading();
    try {
        const response = await apiRequest(
            `/logs?page=${currentPage.logs}&date=${currentFilters.logs.date}&status=${currentFilters.logs.status}`
        );
        
        const logsTable = document.getElementById('logsTable').getElementsByTagName('tbody')[0];
        logsTable.innerHTML = '';

        response.logs.forEach(log => {
            const row = logsTable.insertRow();
            row.innerHTML = `
                <td>${log.uid}</td>
                <td>${log.name}</td>
                <td>${new Date(log.timestamp).toLocaleString()}</td>
                <td>
                    <span class="badge ${log.status === 'granted' ? 'bg-success' : 'bg-danger'}">
                        ${log.status}
                    </span>
                </td>
            `;
        });

        updatePagination('logs', response.totalPages);
    } catch (error) {
        showError('Failed to fetch logs');
    } finally {
        hideLoading();
    }
}

// Log filters
document.getElementById('dateFilter').addEventListener('change', (e) => {
    currentFilters.logs.date = e.target.value;
    currentPage.logs = 1;
    fetchLogs();
});

document.getElementById('statusFilter').addEventListener('change', (e) => {
    currentFilters.logs.status = e.target.value;
    currentPage.logs = 1;
    fetchLogs();
});

// Export logs
document.getElementById('exportLogs').addEventListener('click', async () => {
    showLoading();
    try {
        const response = await apiRequest('/export_logs');
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `access_logs_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        showError('Failed to export logs');
    } finally {
        hideLoading();
    }
});

// Pagination
function updatePagination(type, totalPages) {
    const pagination = document.getElementById(`${type}Pagination`);
    pagination.innerHTML = '';

    for (let i = 1; i <= totalPages; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === currentPage[type] ? 'active' : ''}`;
        li.innerHTML = `
            <a class="page-link" href="#" data-page="${i}">${i}</a>
        `;
        pagination.appendChild(li);
    }

    pagination.addEventListener('click', (e) => {
        if (e.target.classList.contains('page-link')) {
            e.preventDefault();
            currentPage[type] = parseInt(e.target.dataset.page);
            if (type === 'users') {
                fetchUsers();
            } else {
                fetchLogs();
            }
        }
    });
}

// Utility function for debouncing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    // Initialize all modals
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        new bootstrap.Modal(modal);
    });
    
    fetchStatistics();
    fetchUsers();
    fetchLogs();
    
    // Update statistics every 5 minutes
    setInterval(fetchStatistics, 300000);
}); 