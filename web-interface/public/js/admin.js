// Handle top-up initiation
document.getElementById('initiateTopUpBtn').addEventListener('click', async function() {
    const formData = new FormData(document.getElementById('topUpForm'));
    const data = {
        userId: formData.get('userId'),
        amount: parseFloat(formData.get('amount')),
        phoneNumber: formData.get('phoneNumber')
    };

    // Disable the button and show loading state
    const button = this;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';

    try {
        const response = await fetch('/api/admin/top-up', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            if (result.success) {
                document.getElementById('topUpModal').querySelector('.btn-close').click();
                successToast.querySelector('.toast-body').textContent = result.message;
                successToast.show();
                loadUsers(); // Reload the users table
            } else {
                errorToastMessage.textContent = result.message || 'Failed to initiate payment';
                errorToast.show();
            }
        } else {
            errorToastMessage.textContent = result.details || result.error || 'Failed to initiate payment';
            errorToast.show();
        }
    } catch (error) {
        errorToastMessage.textContent = 'Network error occurred. Please try again.';
        errorToast.show();
    } finally {
        // Re-enable the button
        button.disabled = false;
        button.innerHTML = 'Initiate Payment';
    }
}); 