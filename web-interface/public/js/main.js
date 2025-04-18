// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Handle contact form submission
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form data
            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData.entries());

            // Show loading state
            const submitButton = contactForm.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            submitButton.disabled = true;
            submitButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Sending...';

            // Send form data to server
            fetch('/contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            })
            .then(response => response.json())
            .then(data => {
                // Show success message
                const alertDiv = document.createElement('div');
                alertDiv.className = 'alert alert-success mt-3';
                alertDiv.textContent = 'Thank you for your message! We will get back to you soon.';
                contactForm.appendChild(alertDiv);

                // Reset form
                contactForm.reset();

                // Remove alert after 5 seconds
                setTimeout(() => {
                    alertDiv.remove();
                }, 5000);
            })
            .catch(error => {
                // Show error message
                const alertDiv = document.createElement('div');
                alertDiv.className = 'alert alert-danger mt-3';
                alertDiv.textContent = 'Sorry, there was an error sending your message. Please try again later.';
                contactForm.appendChild(alertDiv);

                // Remove alert after 5 seconds
                setTimeout(() => {
                    alertDiv.remove();
                }, 5000);
            })
            .finally(() => {
                // Reset button state
                submitButton.disabled = false;
                submitButton.textContent = originalText;
            });
        });
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Add fade-in animation to sections when they come into view
    const sections = document.querySelectorAll('section');
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    sections.forEach(section => {
        observer.observe(section);
    });

    // Handle FAQ accordion
    const faqAccordion = document.getElementById('faqAccordion');
    if (faqAccordion) {
        const accordionButtons = faqAccordion.querySelectorAll('.accordion-button');
        accordionButtons.forEach(button => {
            button.addEventListener('click', function() {
                // Close other open accordion items
                accordionButtons.forEach(otherButton => {
                    if (otherButton !== this && !otherButton.classList.contains('collapsed')) {
                        otherButton.click();
                    }
                });
            });
        });
    }

    // Add active class to current navigation item
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        }
    });

    // Mobile menu toggle
    const navbarToggler = document.querySelector('.navbar-toggler');
    const navbarCollapse = document.querySelector('.navbar-collapse');
    if (navbarToggler && navbarCollapse) {
        navbarToggler.addEventListener('click', function() {
            navbarCollapse.classList.toggle('show');
        });

        // Close mobile menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!navbarCollapse.contains(e.target) && !navbarToggler.contains(e.target)) {
                navbarCollapse.classList.remove('show');
            }
        });
    }
}); 