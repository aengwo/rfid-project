document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const errorAlert = document.getElementById('errorAlert');
    const errorMessage = document.getElementById('errorMessage');
    const loginBtn = document.getElementById('loginBtn');
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');

    // Toggle password visibility
    togglePassword.addEventListener('click', function() {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        this.querySelector('i').classList.toggle('bi-eye');
        this.querySelector('i').classList.toggle('bi-eye-slash');
    });

    // Handle form submission
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Show loading state
        loginBtn.disabled = true;
        loginBtn.querySelector('.spinner-border').classList.remove('d-none');
        
        try {
            const formData = {
                username: document.getElementById('username').value,
                password: document.getElementById('password').value
            };

            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                // Login successful, redirect to dashboard
                window.location.href = '/admin/dashboard';
            } else {
                // Show error message
                errorMessage.textContent = data.error || 'Invalid credentials';
                errorAlert.style.display = 'block';
            }
        } catch (error) {
            console.error('Login error:', error);
            errorMessage.textContent = 'An error occurred during login. Please try again.';
            errorAlert.style.display = 'block';
        } finally {
            // Reset loading state
            loginBtn.disabled = false;
            loginBtn.querySelector('.spinner-border').classList.add('d-none');
        }
    });

    // Form validation
    loginForm.addEventListener('input', function(e) {
        const input = e.target;
        if (input.checkValidity()) {
            input.classList.remove('is-invalid');
        } else {
            input.classList.add('is-invalid');
        }
    });
}); 