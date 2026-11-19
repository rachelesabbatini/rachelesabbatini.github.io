// Effetti del sito: scramble del menu, griglia elastica, grafico dello user study, alto contrasto.
(function () {
    var root = document.documentElement;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function isHighContrast() {
        return root.classList.contains('high-contrast') || document.body.classList.contains('high-contrast');
    }

    // --- 1. Scramble del testo del menu (hover / focus da tastiera) ---
    var CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+/';

    document.querySelectorAll('[data-scramble]').forEach(function (link) {
        var text = link.getAttribute('data-scramble');
        var label = link.querySelector('span') || link;
        var timer = null;

        function scramble() {
            if (reduceMotion || window.innerWidth <= 768) return;
            clearInterval(timer);
            var frame = 0;
            var steps = 10;
            timer = setInterval(function () {
                frame++;
                var revealed = Math.floor((text.length * frame) / steps);
                label.textContent = frame >= steps ? text : text.split('').map(function (c, i) {
                    return (i < revealed || c === ' ') ? c : CHARS[Math.floor(Math.random() * CHARS.length)];
                }).join('');
                if (frame >= steps) clearInterval(timer);
            }, 30);
        }

        link.addEventListener('mouseenter', scramble);
        link.addEventListener('focus', scramble);
    });

    // --- 2. Griglia elastica che si "gonfia" sotto il cursore ---
    // Solo con mouse/trackpad e se l'utente non ha chiesto movimento ridotto.
    var hasHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;

    if (!reduceMotion && hasHover) {
        var canvas = document.createElement('canvas');
        canvas.className = 'interactive-grid-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        canvas.style.cssText = 'position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 0;';
        document.body.appendChild(canvas);

        // Compatibilità con le pagine non ancora convertite a style.css:
        // porta il contenuto sopra la griglia e rende opachi i box semitrasparenti.
        var container = document.querySelector('header') && document.querySelector('header').parentNode;
        if (container && getComputedStyle(container).zIndex === 'auto') {
            container.style.position = 'relative';
            container.style.zIndex = '2';
        }
        document.querySelectorAll('[style*="rgba(17,19,22"], [style*="rgba(17, 19, 22"]').forEach(function (el) {
            el.style.background = '#111316';
        });

        var ctx = canvas.getContext('2d');
        var CELL = 24;      // lato dei quadretti (px)
        var STEP = 12;      // passo dei punti lungo ogni linea
        var RADIUS = 190;   // raggio della bolla
        var STRENGTH = 28;  // quanto si gonfia
        var EASE = 0.18;    // quanto velocemente la bolla insegue il cursore

        var width = 0, height = 0;
        var mouseX = -1000, mouseY = -1000;
        var smoothX = -1000, smoothY = -1000;
        var running = false;

        function resize() {
            var dpr = window.devicePixelRatio || 1;
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            start();
        }

        function displace(x, y) {
            var dx = x - smoothX;
            var dy = y - smoothY;
            var distSq = dx * dx + dy * dy;

            if (distSq < RADIUS * RADIUS && distSq > 0.001) {
                var dist = Math.sqrt(distSq);
                var t = 1 - dist / RADIUS;
                var push = t * t * (3 - 2 * t) * STRENGTH; // smoothstep
                return { x: x + (dx / dist) * push, y: y + (dy / dist) * push };
            }
            return { x: x, y: y };
        }

        function drawGrid() {
            ctx.clearRect(0, 0, width, height);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 1;
            ctx.beginPath();

            var x, y, p;
            for (x = 0; x <= width; x += CELL) {          // linee verticali
                for (y = 0; y <= height; y += STEP) {
                    p = displace(x, y);
                    if (y === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
                }
            }
            for (y = 0; y <= height; y += CELL) {         // linee orizzontali
                for (x = 0; x <= width; x += STEP) {
                    p = displace(x, y);
                    if (x === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
                }
            }
            ctx.stroke();
        }

        function frame() {
            if (isHighContrast()) {
                ctx.clearRect(0, 0, width, height);
                running = false;
                return;
            }

            smoothX += (mouseX - smoothX) * EASE;
            smoothY += (mouseY - smoothY) * EASE;
            drawGrid();

            // Quando la bolla ha raggiunto il cursore il ciclo si ferma:
            // niente ridisegni inutili a mouse fermo.
            if (Math.abs(mouseX - smoothX) < 0.1 && Math.abs(mouseY - smoothY) < 0.1) {
                running = false;
                return;
            }
            requestAnimationFrame(frame);
        }

        function start() {
            if (running) return;
            running = true;
            requestAnimationFrame(frame);
        }

        window.addEventListener('resize', resize);
        window.addEventListener('mousemove', function (e) {
            mouseX = e.clientX;
            mouseY = e.clientY;
            start();
        }, { passive: true });
        document.addEventListener('mouseleave', function () {
            mouseX = -1000;
            mouseY = -1000;
            start();
        });
        document.addEventListener('highcontrastchange', start);

        resize();
    }

    // --- 3. User study: i numeri compaiono e le barre crescono quando la sezione è visibile ---
    var study = document.getElementById('study');
    if (study) {
        var segments = Array.prototype.slice.call(study.querySelectorAll('.seg'));
        var figures = study.querySelectorAll('.fig');

        segments.forEach(function (seg) {
            seg.setAttribute('data-width', seg.style.width);
            if (!reduceMotion) seg.style.width = '0%';
        });

        var show = function () {
            segments.forEach(function (seg) { seg.style.width = seg.getAttribute('data-width'); });
            figures.forEach(function (fig) { fig.classList.add('in'); });
        };

        if (reduceMotion || !('IntersectionObserver' in window)) {
            show();
        } else {
            var observer = new IntersectionObserver(function (entries) {
                if (entries.some(function (e) { return e.isIntersecting; })) {
                    show();
                    observer.disconnect();
                }
            }, { threshold: 0.15 });
            observer.observe(study);
        }
    }

    // --- 4. Pulsante alto contrasto ---
    var a11yBtn = document.getElementById('a11y-toggle');

    function applyHighContrast(on) {
        root.classList.toggle('high-contrast', on);
        document.body.classList.toggle('high-contrast', on); // per le pagine non ancora convertite
        if (a11yBtn) a11yBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        document.dispatchEvent(new Event('highcontrastchange'));
    }

    var saved = false;
    try { saved = localStorage.getItem('highContrast') === 'true'; } catch (e) { }
    applyHighContrast(saved);

    if (a11yBtn) {
        a11yBtn.addEventListener('click', function () {
            var on = !isHighContrast();
            applyHighContrast(on);
            try { localStorage.setItem('highContrast', on); } catch (e) { }
        });
    }
})();