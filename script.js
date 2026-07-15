const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ===== Codec mode (MGS2 green-phosphor theme) =====
const themeToggle = document.getElementById('theme-toggle');
// Every dithered portrait carries data-light / data-codec sources and swaps together.
const themedPortraits = document.querySelectorAll('img[data-codec]');

// ===== Custom reticle cursor (codec mode, fine-pointer devices only) =====
const finePointer = window.matchMedia('(pointer: fine)').matches;
let reticle = null;
let reticleEnabled = false;
let lastMouseX = -1, lastMouseY = -1; // so the reticle can appear instantly on toggle

function moveReticle(e) {
    lastMouseX = e.clientX; lastMouseY = e.clientY;
    if (!reticleEnabled || !reticle) return;
    reticle.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    if (!reticle.classList.contains('active')) reticle.classList.add('active');
}
function hoverReticle(e) {
    if (!reticleEnabled || !reticle) return;
    const interactive = e.target.closest('a, button, input, textarea, .copy-btn, .chips span, .work-card, .project-card, .beyond-card');
    reticle.classList.toggle('lock', !!interactive);
}
function ensureReticle() {
    if (reticle) return;
    reticle = document.createElement('div');
    reticle.className = 'reticle';
    reticle.setAttribute('aria-hidden', 'true');
    // Stroke ≥2.5px at full opacity — the reticle replaces the OS cursor, so it
    // must never be less visible than the default pointer it stands in for.
    reticle.innerHTML = '<svg viewBox="0 0 34 34" fill="none" stroke="currentColor" stroke-width="2.5">'
        + '<circle cx="17" cy="17" r="10"/>'
        + '<path d="M17 1 V7 M17 27 V33 M1 17 H7 M27 17 H33"/>'
        + '<circle cx="17" cy="17" r="1.6" fill="currentColor" stroke="none"/></svg>';
    document.body.appendChild(reticle);
    document.addEventListener('mousemove', moveReticle);
    document.addEventListener('mouseover', hoverReticle);
}
function setReticle(on) {
    // Users signalling accessibility needs (reduced motion) keep their real OS
    // cursor — possibly enlarged/high-contrast — instead of the thin reticle.
    reticleEnabled = !!(on && finePointer && !prefersReducedMotion);
    if (reticleEnabled) {
        ensureReticle();
        // Show immediately at the last known pointer position (or centre) so
        // there is never a moment with no visible pointer indicator at all.
        const x = lastMouseX >= 0 ? lastMouseX : window.innerWidth / 2;
        const y = lastMouseY >= 0 ? lastMouseY : window.innerHeight / 2;
        reticle.style.transform = `translate(${x}px, ${y}px)`;
        reticle.classList.add('active');
        document.documentElement.classList.add('reticle-on');
    } else {
        document.documentElement.classList.remove('reticle-on');
        if (reticle) reticle.classList.remove('active', 'lock');
    }
}

const THEMES = ['light', 'codec', 'starwars'];
const THEME_META = {
    light:    { label: 'ink',      icon: 'fa-pen-nib',         color: '#eaf0fb' },
    codec:    { label: 'codec',    icon: 'fa-tower-broadcast', color: '#081209' },
    starwars: { label: 'holonet',  icon: 'fa-satellite-dish',  color: '#0b0d10' },
};

function currentTheme() {
    const t = document.documentElement.dataset.theme;
    return THEMES.includes(t) ? t : 'light';
}

function applyTheme(name) {
    if (!THEMES.includes(name)) name = 'light';
    if (name === 'light') {
        delete document.documentElement.dataset.theme;
    } else {
        document.documentElement.dataset.theme = name;
    }
    const meta = THEME_META[name];
    const next = THEME_META[THEMES[(THEMES.indexOf(name) + 1) % THEMES.length]];
    if (themeToggle) {
        const text = themeToggle.querySelector('.codec-toggle-text');
        if (text) text.textContent = meta.label;
        const icon = themeToggle.querySelector('i');
        if (icon) icon.className = 'fas ' + meta.icon;
        themeToggle.setAttribute('aria-label', 'Theme: ' + meta.label + '. Activate to switch to ' + next.label + '.');
        themeToggle.title = 'Theme: ' + meta.label + ' — click for ' + next.label;
    }
    // Portraits: codec has its own green renders; ink and starwars share the blue
    // renders (starwars recolors them to hologram blue in CSS via filter).
    themedPortraits.forEach(img => { img.src = name === 'codec' ? img.dataset.codec : img.dataset.light; });
    // Radar HUD label — radar.js re-inks itself on themechange; the label swap
    // lives here so radar.js stays untouched. (Label may not exist ≤600px.)
    const radarLabel = document.querySelector('.soliton-label');
    if (radarLabel) radarLabel.textContent = name === 'starwars' ? 'SCANNER' : 'SOLITON';
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = meta.color;
    setReticle(name === 'codec');   // reticle stays codec-exclusive
    try { localStorage.setItem('theme', name); } catch (e) {}
    window.dispatchEvent(new CustomEvent('themechange'));
}

// Sync button/portraits with the pre-paint theme set in <head>
applyTheme(currentTheme());

themeToggle.addEventListener('click', () => {
    const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
    applyTheme(next);
    const announce = document.getElementById('theme-announce');
    if (announce) announce.textContent = 'Theme changed to ' + THEME_META[next].label;
});

// Codec Infiltration launchers: the Konami code (keyboard) and the footer
// "CODEC 140.85" link (touch/mouse) share the same "!" alert + ring sequence.
// game.js is lazy-loaded on first launch — it costs nothing at page load and
// the 650ms dramatic pause covers the fetch.
let gameScriptRequested = false;
function openGame() {
    if (window.MGSGame) { window.MGSGame.open(); return; }
    if (gameScriptRequested) return;
    gameScriptRequested = true;
    const s = document.createElement('script');
    s.src = 'game.js?v=7';
    s.onload = () => { if (window.MGSGame) window.MGSGame.open(); };
    s.onerror = () => {
        gameScriptRequested = false; // allow a retry
        showNotification('Codec link failed — check your connection and try again.', 'error');
    };
    document.body.appendChild(s);
}
function launchGame() {
    const alertMark = document.createElement('div');
    alertMark.className = 'mgs-alert';
    alertMark.textContent = '!';
    alertMark.setAttribute('aria-hidden', 'true');
    document.body.appendChild(alertMark);
    setTimeout(() => alertMark.remove(), 1600);
    // Mirror the visual "!" alert for screen-reader users (the mark itself is aria-hidden)
    const liveStatus = document.getElementById('live-status');
    if (liveStatus) liveStatus.textContent = 'Incoming codec call — opening mini-game';
    playCodecRing();
    // Dramatic beat after the "!" alert, then drop into Codec Infiltration.
    setTimeout(openGame, 650);
}

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiPos = 0;
document.addEventListener('keydown', (e) => {
    // While the game is open it swallows keydowns (capture phase), so this won't re-fire.
    konamiPos = (e.key === KONAMI[konamiPos]) ? konamiPos + 1 : (e.key === KONAMI[0] ? 1 : 0);
    if (konamiPos === KONAMI.length) {
        konamiPos = 0;
        launchGame();
    }
});

// Touch-accessible trigger (mobile visitors can't type the Konami code)
const codecLaunchBtn = document.getElementById('codec-launch');
if (codecLaunchBtn) codecLaunchBtn.addEventListener('click', launchGame);

// Short two-tone codec ring (WebAudio, no assets). One AudioContext is created
// on first use and reused — browsers cap concurrent contexts, so a fresh
// context per launch would eventually go silent (game.js uses the same pattern).
let codecRingCtx = null;
function playCodecRing() {
    try {
        if (!codecRingCtx) codecRingCtx = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = codecRingCtx;
        if (ctx.state === 'suspended') ctx.resume();
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
let typeCycles = 0; // WCAG 2.2.2: the loop must not run forever

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
            // After two full passes through the list, settle on a static role
            // instead of animating forever (WCAG 2.2.2 — no pause control exists).
            if (roleIndex === roles.length - 1 && ++typeCycles >= 2) return;
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

// Escape dismisses the open mobile menu and returns focus to the toggle
// (expected disclosure-pattern behavior for keyboard users)
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !nav.classList.contains('active')) return;
    nav.classList.remove('active');
    mobileMenuToggle.setAttribute('aria-expanded', 'false');
    const icon = mobileMenuToggle.querySelector('i');
    icon.classList.remove('fa-times');
    icon.classList.add('fa-bars');
    mobileMenuToggle.focus();
});

// Smooth Scrolling for Navigation Links (incl. the skip link).
// Besides scrolling, this must do what native anchor navigation would have
// done: move keyboard focus into the target section and update the URL hash —
// otherwise the skip link skips nothing and links aren't shareable.
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href');
        const targetSection = document.querySelector(targetId);
        if (!targetSection) return;
        e.preventDefault();

        const headerHeight = document.querySelector('header').offsetHeight;
        const targetPosition = targetSection.offsetTop - headerHeight;

        window.scrollTo({
            top: targetPosition,
            behavior: prefersReducedMotion ? 'auto' : 'smooth'
        });

        targetSection.tabIndex = -1;
        targetSection.focus({ preventScroll: true });
        history.pushState(null, '', targetId);
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

    // Hide/show header on scroll (never while the mobile menu is open —
    // hiding would silently carry the open menu off-screen)
    if (scrollTop > lastScrollTop && scrollTop > 200 && !nav.classList.contains('active')) {
        header.style.transform = 'translateY(-100%)';
    } else {
        header.style.transform = 'translateY(0)';
    }

    lastScrollTop = scrollTop;
}

// Keyboard users can Tab into the hidden header; being position:fixed it never
// scrolls into view on focus, so bring it back whenever a child gains focus.
header.addEventListener('focusin', () => {
    header.style.transform = 'translateY(0)';
});

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
});

// Contact Form Handling
const contactForm = document.getElementById('contact-form');

contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = contactForm.querySelector('button[type="submit"]');
    const originalBtnHTML = submitBtn.innerHTML;

    // Show sending state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Sending...';

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
    // Announce via the permanent live regions in index.html — a live element
    // inserted pre-populated is often not announced at all, so the visual
    // toast below carries no live role and the announcement happens here.
    const live = document.getElementById(type === 'error' ? 'live-alert' : 'live-status');
    if (live) {
        live.textContent = '';
        setTimeout(() => { live.textContent = message; }, 50);
    }

    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());

    // Create notification element (textContent for the message — no HTML injection)
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
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
        link.removeAttribute('aria-current'); // mirror the visual state for AT
        if (link.getAttribute('href') === `#${current}`) {
            link.classList.add('active');
            link.setAttribute('aria-current', 'true');
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
        // Hiding readable content to animate it back is exactly what the
        // reduced-motion preference asks to avoid — leave the lines as-is.
        if (prefersReducedMotion) return;
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

// Codec dial-in loader — the frequency jitters and homes in on 140.85 while a
// signal-bar meter fills, then "connected" before the overlay fades. Styling
// lives in style.css (.codec-loader); markup is in index.html so it paints
// instantly with no flash.
(function codecLoader() {
    const loader = document.getElementById('codec-loader');
    if (!loader) { document.body.classList.add('loaded'); return; }
    const freqEl = document.getElementById('cl-freq');
    const barsEl = document.getElementById('cl-bars');
    const statusEl = document.getElementById('cl-status');

    // Full dial-in plays once per session; repeat navigations get a ~400ms
    // blip instead of staring at the splash on every page view.
    let dialedThisSession = false;
    try { dialedThisSession = sessionStorage.getItem('codec-dialed') === '1'; } catch (e) {}

    const BARS = 7;
    for (let i = 0; i < BARS; i++) barsEl.appendChild(document.createElement('i'));
    const bars = barsEl.children;

    let done = false;
    function finish() {
        if (done) return;
        done = true;
        loader.classList.add('done');
        document.body.classList.add('loaded');
        try { sessionStorage.setItem('codec-dialed', '1'); } catch (e) {}
        setTimeout(() => loader.remove(), 600);
    }

    if (prefersReducedMotion) {
        freqEl.textContent = '140.85';
        statusEl.textContent = 'connected';
        for (const b of bars) b.classList.add('on');
        window.addEventListener('load', () => setTimeout(finish, 300));
        setTimeout(finish, dialedThisSession ? 300 : 1500);
        return;
    }

    const start = performance.now();
    const DURATION = dialedThisSession ? 400 : 1500;

    let barI = 0;
    const barTimer = setInterval(() => { if (barI < BARS) bars[barI++].classList.add('on'); }, DURATION / (BARS + 1));

    function dial(now) {
        const t = Math.min(1, (now - start) / DURATION);
        if (t < 0.82) {
            const wobble = (1 - t) * 1.4;
            freqEl.textContent = (140.85 + Math.sin(now / 38) * wobble).toFixed(2);
            statusEl.textContent = t < 0.4 ? 'dialing' : 'connecting';
            requestAnimationFrame(dial);
        } else {
            freqEl.textContent = '140.85';
            statusEl.textContent = 'connected';
            for (const b of bars) b.classList.add('on');
        }
    }
    requestAnimationFrame(dial);

    // Fade only once the DOM is ready AND the dial-in has had time to play.
    // Gating on DOMContentLoaded (not window 'load') keeps slow connections
    // from staring at the splash while webfonts/images finish downloading —
    // the page's own assets are tiny, so DOM-ready means it's usable.
    let pageLoaded = document.readyState !== 'loading';
    if (!pageLoaded) document.addEventListener('DOMContentLoaded', () => { pageLoaded = true; });
    const settle = setInterval(() => {
        if ((pageLoaded || dialedThisSession) && performance.now() - start >= DURATION + 200) {
            clearInterval(settle); clearInterval(barTimer); finish();
        }
    }, 80);
    setTimeout(() => { clearInterval(settle); clearInterval(barTimer); finish(); }, 4000); // failsafe
})();

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