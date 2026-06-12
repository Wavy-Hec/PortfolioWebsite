const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ===== Codec mode (MGS2 green-phosphor theme) =====
const themeToggle = document.getElementById('theme-toggle');
const heroPortrait = document.querySelector('.home-img img');

function applyTheme(codec) {
    if (codec) {
        document.documentElement.dataset.theme = 'codec';
    } else {
        delete document.documentElement.dataset.theme;
    }
    if (themeToggle) themeToggle.setAttribute('aria-pressed', String(codec));
    if (heroPortrait) heroPortrait.src = codec ? 'raiden-dither-green.png' : 'raiden-dither.png';
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = codec ? '#081209' : '#eaf0fb';
    try { localStorage.setItem('theme', codec ? 'codec' : 'light'); } catch (e) {}
    window.dispatchEvent(new CustomEvent('themechange'));
}

// Sync button/portrait with the pre-paint theme set in <head>
applyTheme(document.documentElement.dataset.theme === 'codec');

themeToggle.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme !== 'codec');
});

// Konami code: ! alert + codec ring + toggle codec mode
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiPos = 0;
document.addEventListener('keydown', (e) => {
    konamiPos = (e.key === KONAMI[konamiPos]) ? konamiPos + 1 : (e.key === KONAMI[0] ? 1 : 0);
    if (konamiPos === KONAMI.length) {
        konamiPos = 0;
        const alertMark = document.createElement('div');
        alertMark.className = 'mgs-alert';
        alertMark.textContent = '!';
        alertMark.setAttribute('aria-hidden', 'true');
        document.body.appendChild(alertMark);
        setTimeout(() => alertMark.remove(), 1600);
        playCodecRing();
        setTimeout(() => applyTheme(document.documentElement.dataset.theme !== 'codec'), 350);
    }
});

// Short two-tone codec ring (WebAudio, no assets)
function playCodecRing() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const beep = (t, freq, dur) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.05, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + dur);
        };
        const t0 = ctx.currentTime;
        [0, 0.12, 0.32, 0.44].forEach((off, i) => beep(t0 + off, i % 2 ? 1245 : 1660, 0.09));
    } catch (e) {}
}

// Typing Animation
const typingText = document.querySelector('.typing-animation');
const roles = ['Graduate Researcher', 'RL Specialist', 'Computer Vision Engineer', 'VLM Researcher', 'Locomotion Researcher', 'Robotics Engineer'];
let roleIndex = 0;
let charIndex = 0;
let isDeleting = false;

function typeWriter() {
    const currentRole = roles[roleIndex];

    if (isDeleting) {
        typingText.textContent = currentRole.substring(0, charIndex - 1);
        charIndex--;

        if (charIndex === 0) {
            isDeleting = false;
            roleIndex = (roleIndex + 1) % roles.length;
        }
    } else {
        typingText.textContent = currentRole.substring(0, charIndex + 1);
        charIndex++;

        if (charIndex === currentRole.length) {
            isDeleting = true;
            setTimeout(typeWriter, 2000);
            return;
        }
    }

    setTimeout(typeWriter, isDeleting ? 80 : 120);
}

// Start typing animation when page loads (static text under reduced motion)
document.addEventListener('DOMContentLoaded', () => {
    if (prefersReducedMotion) {
        typingText.textContent = roles[0];
    } else {
        setTimeout(typeWriter, 1000);
    }
    
    // Remove empty chips
    document.querySelectorAll('.chips span').forEach(span => {
        if (span.textContent.trim() === '') {
            span.remove();
        }
    });
});

// Mobile Menu Toggle
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const nav = document.querySelector('nav');

mobileMenuToggle.addEventListener('click', () => {
    nav.classList.toggle('active');
    mobileMenuToggle.setAttribute('aria-expanded', nav.classList.contains('active'));

    // Change icon based on menu state
    const icon = mobileMenuToggle.querySelector('i');
    if (nav.classList.contains('active')) {
        icon.classList.remove('fa-bars');
        icon.classList.add('fa-times');
    } else {
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
    }
});

// Close mobile menu when clicking on nav links
document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', () => {
        nav.classList.remove('active');
        mobileMenuToggle.setAttribute('aria-expanded', 'false');
        const icon = mobileMenuToggle.querySelector('i');
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
    });
});

// Smooth Scrolling for Navigation Links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        const targetSection = document.querySelector(targetId);
        
        if (targetSection) {
            const headerHeight = document.querySelector('header').offsetHeight;
            const targetPosition = targetSection.offsetTop - headerHeight;
            
            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });
        }
    });
});

// Header Background on Scroll and Scroll Progress
const header = document.querySelector('header');
const scrollProgress = document.getElementById('scroll-progress');
let lastScrollTop = 0;

function handleHeaderScroll() {
    const scrollTop = window.pageYOffset;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercent = (scrollTop / docHeight) * 100;

    // Update scroll progress bar
    scrollProgress.style.width = scrollPercent + '%';

    // Hide/show header on scroll
    if (scrollTop > lastScrollTop && scrollTop > 200) {
        header.style.transform = 'translateY(-100%)';
    } else {
        header.style.transform = 'translateY(0)';
    }

    lastScrollTop = scrollTop;
}

// Single rAF-throttled scroll listener (avoids layout thrash on every scroll event)
let scrollTicking = false;
window.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
        scrollTicking = false;
        handleHeaderScroll();
        updateActiveNavLink();
    });
});

// Scroll-triggered Animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, observerOptions);

// Add animation class to elements and observe them
document.addEventListener('DOMContentLoaded', () => {
    const animatedElements = document.querySelectorAll('.work, .about, .skills, .projects, .experience, .resume, .beyond, .contact');
    
    animatedElements.forEach(el => {
        el.classList.add('fade-in');
        observer.observe(el);
    });
    
    // Animate skill items with delay
    const skillItems = document.querySelectorAll('.skill-item');
    skillItems.forEach((item, index) => {
        item.style.animationDelay = `${index * 0.1}s`;
    });
    
    // Animate project cards with delay
    const projectCards = document.querySelectorAll('.project-card');
    projectCards.forEach((card, index) => {
        card.style.animationDelay = `${index * 0.2}s`;
    });
});

// Contact Form Handling
const contactForm = document.getElementById('contact-form');

contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = contactForm.querySelector('button[type="submit"]');
    const originalBtnHTML = submitBtn.innerHTML;

    // Show sending state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

    try {
        // Submit directly to Web3Forms (no email app, stays on the page)
        const response = await fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: { 'Accept': 'application/json' },
            body: new FormData(contactForm)
        });
        const result = await response.json();

        if (response.ok && result.success) {
            showNotification("Thanks! Your message has been sent — I'll reply within 24 hours.", 'success');
            contactForm.reset();
        } else {
            showNotification(result.message || 'Something went wrong. Please email me at hlugo576@gmail.com.', 'error');
        }
    } catch (err) {
        showNotification('Network error — please email me directly at hlugo576@gmail.com.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHTML;
    }
});

// Notification System
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    // Create notification element (textContent for the message — no HTML injection)
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.setAttribute('role', 'status');
    const content = document.createElement('div');
    content.className = 'notification-content';
    const text = document.createElement('span');
    text.textContent = message;
    const close = document.createElement('button');
    close.className = 'notification-close';
    close.setAttribute('aria-label', 'Dismiss');
    close.innerHTML = '&times;';
    content.appendChild(text);
    content.appendChild(close);
    notification.appendChild(content);
    
    // Color by type (error = red, otherwise theme accent)
    const accent = type === 'error' ? 'var(--error)' : 'var(--ink)';

    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--panel);
        border: 1px solid ${accent};
        color: ${accent};
        font-family: 'Share Tech Mono', monospace;
        padding: 14px 18px;
        border-radius: 6px;
        box-shadow: var(--shadow-lift);
        z-index: 1000;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        max-width: min(350px, calc(100vw - 40px));
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Close button functionality
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
    });
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

// Active Navigation Link Highlighting
function updateActiveNavLink() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('nav a[href^="#"]');
    
    let current = '';
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop - 100;
        const sectionHeight = section.offsetHeight;
        
        if (window.scrollY >= sectionTop && window.scrollY < sectionTop + sectionHeight) {
            current = section.getAttribute('id');
        }
    });
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
            link.classList.add('active');
        }
    });
}

// Active-nav styling lives in style.css (.active uses the cyan palette).
// (Scroll updates are handled by the single rAF-throttled listener above.)

// Initialize active nav state on load (particle background removed for a calmer, terminal-style look)
document.addEventListener('DOMContentLoaded', () => {
    updateActiveNavLink();
});

// Terminal panel typewriter reveal — progressive enhancement.
// Lines are fully visible without JS; when the panel scrolls into view they
// reveal one at a time for a live-terminal feel.
const terminalPanel = document.querySelector('.terminal');
if (terminalPanel) {
    const termLines = Array.from(terminalPanel.querySelectorAll('.terminal-body p'));
    let termPlayed = false;

    const revealTerminal = () => {
        if (termPlayed) return;
        termPlayed = true;
        termLines.forEach(line => { line.style.opacity = '0'; });
        termLines.forEach((line, i) => {
            setTimeout(() => {
                line.style.transition = 'opacity 0.25s ease';
                line.style.opacity = '1';
            }, i * 350);
        });
    };

    const terminalObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                revealTerminal();
                terminalObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });

    terminalObserver.observe(terminalPanel);
}

// Loading Animation
window.addEventListener('load', () => {
    document.body.classList.add('loaded');
});
// Failsafe: never leave scrolling locked if a slow resource delays the load event
setTimeout(() => document.body.classList.add('loaded'), 4000);

// Add loading styles
const loadingStyle = document.createElement('style');
loadingStyle.textContent = `
    body:not(.loaded) {
        overflow: hidden;
    }
    
    body:not(.loaded)::before {
        content: 'establishing codec link…';
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: var(--bg);
        color: var(--ink);
        font-family: 'Share Tech Mono', monospace;
        font-size: 15px;
        letter-spacing: 2px;
        text-transform: uppercase;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        animation: fadeOut 0.5s ease 2s forwards;
    }
    
    @keyframes fadeOut {
        to {
            opacity: 0;
            visibility: hidden;
        }
    }
`;
document.head.appendChild(loadingStyle);

// Copy-to-clipboard buttons (contact command block, etc.)
document.querySelectorAll('.copy-btn[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
        const text = btn.getAttribute('data-copy');
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }
        const icon = btn.querySelector('i');
        const prev = icon ? icon.className : '';
        if (icon) icon.className = 'fas fa-check';
        showNotification('Copied ' + text + ' to clipboard', 'success');
        setTimeout(() => { if (icon) icon.className = prev; }, 1500);
    });
});