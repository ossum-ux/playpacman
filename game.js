'use strict';

/* ============================================================
   MINI ARCADE  -  Pac-Man · Snake · Tetris · Pong
   Tutti i giochi usano il delta time (dt) per movimenti fluidi
   a qualsiasi frequenza di aggiornamento (60 / 120 / 144 Hz).
   ============================================================ */

const $ = (id) => document.getElementById(id);
const canvas = $('gameCanvas');
// alpha:false + desynchronized = meno latenza di disegno (dove supportato)
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

const el = {
    menu: $('menu-screen'),
    message: $('message-screen'),
    msgTitle: $('msg-title'),
    msgText: $('msg-text'),
    msgPrimary: $('msg-primary'),
    msgSecondary: $('msg-secondary'),
    hud: $('hud'),
    score: $('score-val'),
    best: $('best-val'),
    controls: $('controls'),
    action: $('action-btn')
};

/* ---------- Utility ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
}

const Store = {
    get(id) {
        try { return parseInt(localStorage.getItem('miniarcade-best-' + id), 10) || 0; }
        catch (e) { return 0; }
    },
    set(id, v) {
        try { localStorage.setItem('miniarcade-best-' + id, String(v)); }
        catch (e) { /* ignora */ }
    }
};

const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
};

/* ============================================================
   CORE: gestione schermate, loop, input
   ============================================================ */
const held = { up: false, down: false, left: false, right: false };
const GAME_IDS = ['pacman', 'snake', 'tetris', 'pong'];

const Arcade = {
    current: null,
    id: null,
    state: 'menu',      // menu | playing | paused | over
    score: 0,
    best: 0,
    token: 0,
    rafId: 0,
    last: 0,

    start(id) {
        clearHeld();
        this.id = id;
        this.current = new GAMES[id]();
        this.best = Store.get(id);
        this.score = 0;
        el.score.textContent = '0';
        el.best.textContent = String(this.best);

        el.menu.classList.add('hidden');
        el.message.classList.add('hidden');
        el.hud.classList.remove('hidden');
        canvas.classList.remove('hidden');
        el.controls.classList.remove('hidden');

        if (this.current.actionLabel) {
            el.action.textContent = this.current.actionLabel;
            el.action.classList.remove('hidden');
        } else {
            el.action.classList.add('hidden');
        }

        this.token++;
        this.state = 'playing';
        this.fit();

        if (!this.rafId) {
            this.last = performance.now();
            this.rafId = requestAnimationFrame(frame);
        }
    },

    setScore(n) {
        this.score = n;
        el.score.textContent = String(n);
        if (n > this.best) {
            this.best = n;
            el.best.textContent = String(n);
        }
    },

    saveBest() {
        if (this.id && this.score > Store.get(this.id)) Store.set(this.id, this.score);
    },

    gameOver(win, text) {
        if (this.state !== 'playing') return;
        this.state = 'over';
        this.saveBest();
        const tok = ++this.token;
        setTimeout(() => {
            if (this.token !== tok || this.state !== 'over') return;
            this.showMessage(
                win ? 'VITTORIA!' : 'GAME OVER',
                text || ('Punteggio: ' + this.score),
                'RIPROVA',
                win ? '#00ff66' : '#ff3b3b'
            );
        }, 450);
    },

    showMessage(title, text, primaryLabel, color) {
        el.msgTitle.textContent = title;
        el.msgTitle.style.color = color || '#ffe600';
        el.msgText.textContent = text || '';
        el.msgPrimary.textContent = primaryLabel;
        el.message.classList.remove('hidden');
    },

    pause() {
        if (this.state !== 'playing') return;
        this.state = 'paused';
        clearHeld();
        this.showMessage('PAUSA', 'Punteggio: ' + this.score, 'RIPRENDI', '#ffe600');
    },

    resume() {
        if (this.state !== 'paused') return;
        el.message.classList.add('hidden');
        this.state = 'playing';
    },

    togglePause() {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
    },

    toMenu() {
        this.saveBest();
        this.token++;
        this.state = 'menu';
        this.current = null;
        clearHeld();
        cancelAnimationFrame(this.rafId);
        this.rafId = 0;

        el.message.classList.add('hidden');
        el.hud.classList.add('hidden');
        canvas.classList.add('hidden');
        el.controls.classList.add('hidden');
        el.menu.classList.remove('hidden');
        this.refreshMenu();
    },

    refreshMenu() {
        GAME_IDS.forEach((id) => {
            const b = $('best-' + id);
            if (b) b.textContent = String(Store.get(id));
        });
    },

    /* Adatta il canvas allo schermo mantenendo le proporzioni (nitido su retina) */
    fit() {
        const g = this.current;
        if (!g) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const hudH = el.hud.offsetHeight;
        const ctrlH = el.controls.offsetParent ? el.controls.offsetHeight + 12 : 0;
        const maxW = Math.min(window.innerWidth - 16, 720);
        const maxH = window.innerHeight - hudH - ctrlH - 32;
        const s = Math.max(0.3, Math.min(maxW / g.width, maxH / g.height));
        const cssW = Math.floor(g.width * s);
        const cssH = Math.floor(g.height * s);

        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
        ctx.setTransform(canvas.width / g.width, 0, 0, canvas.height / g.height, 0, 0);

        el.hud.style.width = cssW + 'px';
        el.controls.style.width = cssW + 'px';
    }
};

function frame(ts) {
    Arcade.rafId = requestAnimationFrame(frame);
    const dt = Math.min((ts - Arcade.last) / 1000, 0.05);
    Arcade.last = ts;
    const g = Arcade.current;
    if (!g) return;
    if (Arcade.state === 'playing') g.update(dt);
    ctx.clearRect(0, 0, g.width, g.height);
    g.draw(ctx);
}

/* ---------- Input ---------- */
function clearHeld() {
    for (const k in held) held[k] = false;
}

function pressDir(dir) {
    held[dir] = true;
    if (Arcade.state === 'playing' && Arcade.current) Arcade.current.onDir(dir);
}

function releaseDir(dir) {
    held[dir] = false;
}

const KEYMAP = {
    w: 'up', arrowup: 'up',
    s: 'down', arrowdown: 'down',
    a: 'left', arrowleft: 'left',
    d: 'right', arrowright: 'right'
};

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key in KEYMAP) {
        e.preventDefault();
        if (!e.repeat) pressDir(KEYMAP[key]);
        return;
    }
    if (key === ' ' || key === 'spacebar') {
        e.preventDefault();
        if (!e.repeat && Arcade.state === 'playing' && Arcade.current && Arcade.current.onAction) {
            Arcade.current.onAction();
        }
        return;
    }
    if ((key === 'p' || key === 'escape') && !e.repeat) Arcade.togglePause();
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key in KEYMAP) releaseDir(KEYMAP[key]);
});

/* D-Pad touch (pointer events: funziona con dito e mouse) */
const DPAD = { 'up-btn': 'up', 'down-btn': 'down', 'left-btn': 'left', 'right-btn': 'right' };
Object.entries(DPAD).forEach(([id, dir]) => {
    const btn = $(id);
    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.classList.add('active');
        pressDir(dir);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => {
        btn.addEventListener(ev, () => {
            btn.classList.remove('active');
            releaseDir(dir);
        });
    });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
});

el.action.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (Arcade.state === 'playing' && Arcade.current && Arcade.current.onAction) Arcade.current.onAction();
});

/* Swipe / tap / trascinamento sul canvas */
const touch = { sx: 0, sy: 0, moved: false };
const SWIPE_MIN = 14;   // pixel minimi per riconoscere uno swipe (più basso = più reattivo)

function toLogical(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const g = Arcade.current;
    return {
        x: (clientX - r.left) / r.width * g.width,
        y: (clientY - r.top) / r.height * g.height
    };
}

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const g = Arcade.current;
    if (!g) return;
    const t = e.touches[0];
    touch.sx = t.clientX;
    touch.sy = t.clientY;
    touch.moved = false;
    if (g.pointerControl && Arcade.state === 'playing') {
        const p = toLogical(t.clientX, t.clientY);
        g.onPointer(p.x, p.y);
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const g = Arcade.current;
    if (!g || Arcade.state !== 'playing') return;
    const t = e.touches[0];
    if (g.pointerControl) {
        const p = toLogical(t.clientX, t.clientY);
        g.onPointer(p.x, p.y);
        return;
    }
    const dx = t.clientX - touch.sx;
    const dy = t.clientY - touch.sy;
    if (Math.hypot(dx, dy) >= SWIPE_MIN) {
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        touch.sx = t.clientX;
        touch.sy = t.clientY;
        touch.moved = true;
        if (g.onSwipe) g.onSwipe(dir); else g.onDir(dir);
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const g = Arcade.current;
    if (!g) return;
    if (!touch.moved && !g.pointerControl && Arcade.state === 'playing' && g.onTap) g.onTap();
    if (g.onPointerEnd) g.onPointerEnd();
}, { passive: false });

canvas.addEventListener('mousemove', (e) => {
    const g = Arcade.current;
    if (g && g.pointerControl && Arcade.state === 'playing') {
        const p = toLogical(e.clientX, e.clientY);
        g.onPointer(p.x, p.y);
    }
});

/* Bottoni interfaccia */
document.querySelectorAll('.game-card').forEach((b) => {
    b.addEventListener('click', () => Arcade.start(b.dataset.game));
});
$('menu-btn').addEventListener('click', () => Arcade.toMenu());
$('pause-btn').addEventListener('click', () => Arcade.togglePause());
el.msgPrimary.addEventListener('click', () => {
    if (Arcade.state === 'paused') Arcade.resume();
    else Arcade.start(Arcade.id);
});
el.msgSecondary.addEventListener('click', () => Arcade.toMenu());

window.addEventListener('resize', () => Arcade.fit());
window.addEventListener('orientationchange', () => setTimeout(() => Arcade.fit(), 150));
document.addEventListener('visibilitychange', () => { if (document.hidden) Arcade.pause(); });


/* ============================================================
   1) PAC-MAN
   - Movimento a pixel con delta time
   - Svolte indulgenti: buffer d'input + "assistenza svolta" se premi
     pochi pixel dopo l'incrocio (nessuna svolta persa o in ritardo)
   - Pallini speciali: i fantasmi diventano blu, scappano e si
     possono mangiare (200 / 400 / 800 / 1600); gli occhi tornano
     alla casa e il fantasma rinasce.
   ============================================================ */
const PAC_MAP = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
    [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,0,1],
    [1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1],
    [1,1,1,1,0,1,1,1,2,1,2,1,1,1,0,1,1,1,1],
    [1,2,2,1,0,1,2,2,2,2,2,2,2,1,0,1,2,2,1],
    [1,1,1,1,0,1,2,1,1,2,1,1,2,1,0,1,1,1,1],
    [1,0,0,0,0,2,2,1,2,2,2,1,2,2,0,0,0,0,1],
    [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
    [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1],
    [1,1,0,1,0,1,0,1,1,1,1,1,0,1,0,1,0,1,1],
    [1,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];
// Pallini speciali: [riga, colonna]
const POWER_SPOTS = [[3, 1], [3, 17], [13, 1], [13, 17]];
const HOUSE_ROW = 7, HOUSE_COL = 9;     // centro della casa dei fantasmi

const PT = 20;                // dimensione tile
const EPS = 1e-4;
const CORNER_TOL = 7;         // pixel di tolleranza per svoltare "in ritardo"
const FRIGHT_TIME = 7;        // secondi di fantasmi blu
const BUFFER_TIME = 0.55;     // quanto resta valida una svolta prenotata

const gridCoord = (v) => (v - PT / 2) / PT;

function isCentered(e) {
    const fx = gridCoord(e.x), fy = gridCoord(e.y);
    return Math.abs(fx - Math.round(fx)) < EPS && Math.abs(fy - Math.round(fy)) < EPS;
}

function snapToCenter(e) {
    e.x = Math.round(gridCoord(e.x)) * PT + PT / 2;
    e.y = Math.round(gridCoord(e.y)) * PT + PT / 2;
}

/* Muove l'entità di "dist" pixel, fermandosi ad ogni centro tile per decidere la direzione */
function advance(e, dist, decide) {
    let guard = 0;
    while (dist > EPS && guard++ < 8) {
        if (isCentered(e)) {
            snapToCenter(e);
            decide(e);
            if (e.dx === 0 && e.dy === 0) return;
        }
        const f = e.dx !== 0 ? gridCoord(e.x) : gridCoord(e.y);
        const dir = e.dx !== 0 ? e.dx : e.dy;
        const target = dir > 0 ? Math.floor(f + EPS) + 1 : Math.ceil(f - EPS) - 1;
        const d = Math.abs(target - f) * PT;
        const step = Math.min(dist, d);
        e.x += e.dx * step;
        e.y += e.dy * step;
        dist -= step;
        if (step >= d - EPS) snapToCenter(e);
    }
}

class PacmanGame {
    constructor() {
        this.width = PAC_MAP[0].length * PT;
        this.height = PAC_MAP.length * PT;
        this.actionLabel = null;
        this.map = PAC_MAP.map((r) => r.slice());
        POWER_SPOTS.forEach(([r, c]) => { this.map[r][c] = 3; });
        this.dots = 0;
        this.map.forEach((r) => r.forEach((t) => { if (t === 0 || t === 3) this.dots++; }));
        this.score = 0;
        this.time = 0;
        this.ready = 1.0;
        this.mouthPhase = 0;
        this.fright = 0;
        this.chain = 0;
        this.popups = [];

        this.pac = {
            x: PT * 1.5, y: PT * 1.5, dx: 0, dy: 0, nx: 0, ny: 0,
            angle: 0, speed: 112, wantDir: null, wantAge: 0
        };
        this.ghosts = [
            { x: PT * 9.5,  y: PT * 7.5, color: '#ff3030', chase: 0.7, delay: 0.6 },
            { x: PT * 8.5,  y: PT * 7.5, color: '#ffb8ff', chase: 0.4, delay: 3.0 },
            { x: PT * 10.5, y: PT * 7.5, color: '#00e5ff', chase: 0.2, delay: 6.0 }
        ].map((g) => ({ ...g, dx: 0, dy: 0, timer: 0, state: 'normal' }));

        this.buildHomeField();
    }

    free(c, r) {
        return r >= 0 && r < this.map.length && c >= 0 && c < this.map[0].length && this.map[r][c] !== 1;
    }

    /* Mappa delle distanze dalla casa: serve agli "occhi" per tornare a casa */
    buildHomeField() {
        const rows = this.map.length, cols = this.map[0].length;
        const f = Array.from({ length: rows }, () => Array(cols).fill(-1));
        const q = [[HOUSE_ROW, HOUSE_COL]];
        f[HOUSE_ROW][HOUSE_COL] = 0;
        while (q.length) {
            const [r, c] = q.shift();
            for (const d of Object.values(DIRS)) {
                const nr = r + d.y, nc = c + d.x;
                if (this.free(nc, nr) && f[nr][nc] < 0) {
                    f[nr][nc] = f[r][c] + 1;
                    q.push([nr, nc]);
                }
            }
        }
        this.homeField = f;
    }

    onDir(dir) {
        const v = DIRS[dir];
        const p = this.pac;
        p.nx = v.x;
        p.ny = v.y;
        p.wantDir = dir;
        p.wantAge = 0;
        // Inversione immediata a metà corridoio
        if ((p.dx || p.dy) && v.x === -p.dx && v.y === -p.dy) {
            p.dx = v.x;
            p.dy = v.y;
        }
    }

    /* Se premi la svolta qualche pixel DOPO il centro dell'incrocio, la svolta
       viene comunque eseguita (si torna indietro al centro): niente più ritardo. */
    cornerAssist() {
        const p = this.pac;
        if (!(p.nx || p.ny) || !(p.dx || p.dy)) return;
        if (p.nx * p.dx + p.ny * p.dy !== 0) return;     // solo svolte perpendicolari
        if (isCentered(p)) return;
        const f = p.dx !== 0 ? gridCoord(p.x) : gridCoord(p.y);
        const dir = p.dx !== 0 ? p.dx : p.dy;
        const passed = (f - Math.round(f)) * PT * dir;   // pixel oltre il centro
        if (passed > 0 && passed <= CORNER_TOL) {
            const c = Math.round(gridCoord(p.x)), r = Math.round(gridCoord(p.y));
            if (this.free(c + p.nx, r + p.ny)) {
                snapToCenter(p);
                p.dx = p.nx;
                p.dy = p.ny;
            }
        }
    }

    powerUp() {
        this.fright = FRIGHT_TIME;
        this.chain = 0;
        for (const g of this.ghosts) {
            if (g.state === 'eyes') continue;
            g.state = 'fright';
            if (g.dx || g.dy) { g.dx = -g.dx; g.dy = -g.dy; }   // i fantasmi invertono la marcia
        }
    }

    decidePac(e) {
        const c = Math.round(gridCoord(e.x));
        const r = Math.round(gridCoord(e.y));

        const t = this.map[r][c];
        if (t === 0 || t === 3) {
            this.map[r][c] = 2;
            this.dots--;
            this.score += t === 3 ? 50 : 10;
            Arcade.setScore(this.score);
            if (t === 3) this.powerUp();
            if (this.dots === 0) {
                Arcade.gameOver(true, 'Hai mangiato tutti i pallini! Punteggio: ' + this.score);
            }
        }
        if ((e.nx || e.ny) && this.free(c + e.nx, r + e.ny)) {
            e.dx = e.nx;
            e.dy = e.ny;
        }
        if (!this.free(c + e.dx, r + e.dy)) {
            e.dx = 0;
            e.dy = 0;
        }
    }

    decideGhost(g) {
        const c = Math.round(gridCoord(g.x));
        const r = Math.round(gridCoord(g.y));
        const all = Object.values(DIRS);

        // Occhi: tornano alla casa seguendo il percorso più breve
        if (g.state === 'eyes') {
            if (this.homeField[r][c] === 0) {
                g.state = 'normal';           // rinasce e riparte
                g.dx = 0;
                g.dy = 0;
            } else {
                let best = null;
                for (const d of all) {
                    const nr = r + d.y, nc = c + d.x;
                    if (!this.free(nc, nr)) continue;
                    const v = this.homeField[nr][nc];
                    if (v >= 0 && (!best || v < best.v)) best = { d, v };
                }
                if (best) { g.dx = best.d.x; g.dy = best.d.y; }
                return;
            }
        }

        const moving = g.dx !== 0 || g.dy !== 0;
        let opts = all.filter((d) => this.free(c + d.x, r + d.y) && !(moving && d.x === -g.dx && d.y === -g.dy));
        if (!opts.length) opts = all.filter((d) => this.free(c + d.x, r + d.y));
        if (!opts.length) return;

        const pc = Math.round(gridCoord(this.pac.x));
        const pr = Math.round(gridCoord(this.pac.y));
        const distTo = (d) => Math.hypot(c + d.x - pc, r + d.y - pr);

        let pick;
        if (g.state === 'fright') {
            // Fuga: si allontana da Pac-Man (con un po' di casualità)
            if (Math.random() < 0.25) {
                pick = opts[Math.floor(Math.random() * opts.length)];
            } else {
                pick = opts.reduce((b, d) => (!b || distTo(d) > distTo(b)) ? d : b, null);
            }
        } else if (Math.random() < g.chase) {
            pick = opts.reduce((b, d) => (!b || distTo(d) < distTo(b)) ? d : b, null);
        } else {
            pick = opts[Math.floor(Math.random() * opts.length)];
        }
        g.dx = pick.x;
        g.dy = pick.y;
    }

    update(dt) {
        this.time += dt;

        for (let i = this.popups.length - 1; i >= 0; i--) {
            const pp = this.popups[i];
            pp.t += dt;
            pp.y -= 16 * dt;
            if (pp.t > 0.9) this.popups.splice(i, 1);
        }

        if (this.ready > 0) {
            this.ready -= dt;
            return;
        }

        const p = this.pac;

        // La svolta prenotata scade (a meno che tu tenga premuto il tasto)
        if (p.nx || p.ny) {
            if (p.wantDir && held[p.wantDir]) p.wantAge = 0;
            else p.wantAge += dt;
            if (p.wantAge > BUFFER_TIME) { p.nx = 0; p.ny = 0; }
        }

        this.cornerAssist();
        advance(p, p.speed * dt, (e) => this.decidePac(e));

        const moving = p.dx !== 0 || p.dy !== 0;
        if (moving) {
            this.mouthPhase += dt * 16;
            const ta = Math.atan2(p.dy, p.dx);
            const diff = ((ta - p.angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
            p.angle += diff * Math.min(1, dt * 30);
        }

        // Fine effetto dei pallini speciali
        if (this.fright > 0) {
            this.fright -= dt;
            if (this.fright <= 0) {
                this.fright = 0;
                for (const g of this.ghosts) if (g.state === 'fright') g.state = 'normal';
            }
        }

        for (const g of this.ghosts) {
            g.timer += dt;
            if (g.timer >= g.delay) {
                const sp = g.state === 'eyes' ? 200 : g.state === 'fright' ? 62 : 100;
                advance(g, sp * dt, (e) => this.decideGhost(e));
            }
            if (g.state === 'eyes') continue;

            if (Math.hypot(p.x - g.x, p.y - g.y) < PT * 0.7) {
                if (g.state === 'fright') {
                    // Fantasma mangiato!
                    this.chain++;
                    const pts = 200 * Math.pow(2, this.chain - 1);
                    this.score += pts;
                    Arcade.setScore(this.score);
                    this.popups.push({ x: g.x, y: g.y, text: String(pts), t: 0 });
                    g.state = 'eyes';
                    g.timer = Math.max(g.timer, g.delay);
                } else {
                    Arcade.gameOver(false, 'Un fantasma ti ha preso! Punteggio: ' + this.score);
                    return;
                }
            }
        }
    }

    drawGhost(c, g) {
        const r = PT / 2 - 2;
        const bob = g.timer < g.delay ? Math.sin(this.time * 8 + g.x) * 1.5 : 0;
        const gx = g.x, gy = g.y - 1 + bob;

        if (g.state !== 'eyes') {
            const blink = g.state === 'fright' && this.fright < 2 && Math.floor(this.time * 6) % 2 === 0;
            c.fillStyle = g.state === 'fright' ? (blink ? '#ffffff' : '#2a2aff') : g.color;
            c.beginPath();
            c.arc(gx, gy, r, Math.PI, 0);
            c.lineTo(gx + r, gy + r);
            c.lineTo(gx + r * 0.66, gy + r - 3);
            c.lineTo(gx + r * 0.33, gy + r);
            c.lineTo(gx, gy + r - 3);
            c.lineTo(gx - r * 0.33, gy + r);
            c.lineTo(gx - r * 0.66, gy + r - 3);
            c.lineTo(gx - r, gy + r);
            c.closePath();
            c.fill();

            if (g.state === 'fright') {
                const face = blink ? '#ff2a2a' : '#ffd1c4';
                c.fillStyle = face;
                c.beginPath();
                c.arc(gx - 3, gy - 2, 1.6, 0, Math.PI * 2);
                c.arc(gx + 3, gy - 2, 1.6, 0, Math.PI * 2);
                c.fill();
                c.strokeStyle = face;
                c.lineWidth = 1.2;
                c.beginPath();
                c.moveTo(gx - 5, gy + 3);
                c.lineTo(gx - 2.5, gy + 1);
                c.lineTo(gx, gy + 3);
                c.lineTo(gx + 2.5, gy + 1);
                c.lineTo(gx + 5, gy + 3);
                c.stroke();
                return;
            }
        }

        // Occhi (fantasma normale o solo occhi)
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(gx - 3, gy - 2, 2.8, 0, Math.PI * 2);
        c.arc(gx + 3, gy - 2, 2.8, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#1a2bff';
        c.beginPath();
        c.arc(gx - 3 + g.dx * 1.3, gy - 2 + g.dy * 1.3, 1.3, 0, Math.PI * 2);
        c.arc(gx + 3 + g.dx * 1.3, gy - 2 + g.dy * 1.3, 1.3, 0, Math.PI * 2);
        c.fill();
    }

    draw(c) {
        c.fillStyle = '#000';
        c.fillRect(0, 0, this.width, this.height);

        // Mappa
        for (let r = 0; r < this.map.length; r++) {
            for (let col = 0; col < this.map[r].length; col++) {
                const x = col * PT, y = r * PT, t = this.map[r][col];
                if (t === 1) {
                    roundRect(c, x + 2, y + 2, PT - 4, PT - 4, 4);
                    c.fillStyle = '#0a0a48';
                    c.fill();
                    c.strokeStyle = '#2f2fff';
                    c.lineWidth = 2;
                    c.stroke();
                } else if (t === 0) {
                    c.fillStyle = '#ffb8ae';
                    c.beginPath();
                    c.arc(x + PT / 2, y + PT / 2, 2, 0, Math.PI * 2);
                    c.fill();
                } else if (t === 3) {
                    const rr = 4.6 + Math.sin(this.time * 9) * 1.0;
                    c.fillStyle = '#ffe3da';
                    c.beginPath();
                    c.arc(x + PT / 2, y + PT / 2, rr, 0, Math.PI * 2);
                    c.fill();
                }
            }
        }

        // Pac-Man
        const p = this.pac;
        const open = 0.05 + 0.2 * Math.abs(Math.sin(this.mouthPhase));
        c.fillStyle = '#ffe600';
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.arc(p.x, p.y, PT / 2 - 2, p.angle + open * Math.PI, p.angle + (2 - open) * Math.PI);
        c.closePath();
        c.fill();

        // Fantasmi
        for (const g of this.ghosts) this.drawGhost(c, g);

        // Punti guadagnati (200, 400, ...)
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = 'bold 11px "Courier New", monospace';
        for (const pp of this.popups) {
            c.globalAlpha = clamp(1 - (pp.t - 0.5) / 0.4, 0, 1);
            c.fillStyle = '#00e5ff';
            c.fillText(pp.text, pp.x, pp.y);
        }
        c.globalAlpha = 1;

        if (this.ready > 0) {
            c.fillStyle = '#ffe600';
            c.font = 'bold 16px "Courier New", monospace';
            c.fillText('READY!', this.width / 2, PT * 11.5);
        }
    }
}


/* ============================================================
   2) SNAKE
   La logica gira a "tick", ma il disegno interpola la posizione
   di ogni segmento. Le svolte non aspettano più il tick completo:
   se premi dopo il 30% del passo, il serpente gira subito
   (la grafica riparte dalla posizione attuale, senza salti).
   ============================================================ */
const SNAKE_EARLY = 0.3;

class SnakeGame {
    constructor() {
        this.cols = 20;
        this.rows = 20;
        this.cell = 20;
        this.width = this.cols * this.cell;
        this.height = this.rows * this.cell;
        this.actionLabel = null;

        this.snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
        this.prev = this.snake.map((s) => ({ ...s }));
        this.dir = { x: 1, y: 0 };
        this.queue = [];
        this.timer = 0;
        this.interval = 0.14;
        this.time = 0;
        this.score = 0;
        this.eatPulse = 0;
        this.eatenFood = null;
        this.deadPts = null;
        this.spawnFood();
    }

    spawnFood() {
        const free = [];
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (!this.snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
            }
        }
        this.food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
    }

    onDir(dir) {
        const v = DIRS[dir];
        const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
        if (v.x === -last.x && v.y === -last.y) return;   // niente inversione a U
        if (v.x === last.x && v.y === last.y) return;     // già in quella direzione
        if (this.queue.length < 3) this.queue.push(v);
    }

    visualPoints(t) {
        return this.snake.map((s, i) => {
            const p = this.prev[i] || s;
            return { x: lerp(p.x, s.x, t), y: lerp(p.y, s.y, t) };
        });
    }

    die(t) {
        this.deadPts = this.visualPoints(t);   // il serpente resta fermo dov'è
        Arcade.gameOver(false, 'Lunghezza: ' + this.snake.length + ' · Punteggio: ' + this.score);
    }

    /* t = avanzamento visivo (0..1) del passo precedente */
    step(t) {
        if (this.queue.length) this.dir = this.queue.shift();
        const head = { x: this.snake[0].x + this.dir.x, y: this.snake[0].y + this.dir.y };

        if (head.x < 0 || head.x >= this.cols || head.y < 0 || head.y >= this.rows) {
            this.die(t);
            return false;
        }
        const ate = this.food && head.x === this.food.x && head.y === this.food.y;
        const body = ate ? this.snake : this.snake.slice(0, -1);
        if (body.some((s) => s.x === head.x && s.y === head.y)) {
            this.die(t);
            return false;
        }

        const from = this.visualPoints(t);      // da dove riparte la grafica
        this.eatenFood = ate ? { x: this.food.x, y: this.food.y } : null;
        this.snake.unshift(head);
        if (ate) {
            from.push({ ...from[from.length - 1] });   // la coda resta ferma mentre cresce
            this.score += 10;
            Arcade.setScore(this.score);
            this.eatPulse = 1;
            this.interval = Math.max(0.065, this.interval * 0.97);
            this.spawnFood();
            if (!this.food) {
                this.prev = from;
                Arcade.gameOver(true, 'Hai riempito tutta l\'area! Punteggio: ' + this.score);
                return false;
            }
        } else {
            this.snake.pop();
        }
        this.prev = from;
        return true;
    }

    update(dt) {
        this.time += dt;
        this.eatPulse = Math.max(0, this.eatPulse - dt * 4);
        this.timer += dt;

        let guard = 0;
        while (guard++ < 8) {
            if (this.timer >= this.interval) {
                this.timer -= this.interval;
                if (!this.step(1)) return;
            } else if (this.queue.length && this.timer >= this.interval * SNAKE_EARLY) {
                // Svolta anticipata: non aspettare la fine del passo
                const t = this.timer / this.interval;
                if (!this.step(t)) return;
                this.timer = 0;
            } else {
                break;
            }
        }
    }

    drawApple(c, fx, fy, r) {
        if (r <= 0.3) return;
        c.fillStyle = '#ff2d3d';
        c.beginPath();
        c.arc(fx, fy + 1, r, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.beginPath();
        c.arc(fx - r * 0.35, fy - r * 0.25, r * 0.29, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#7a4a1a';
        c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(fx, fy - r + 2);
        c.lineTo(fx + 1.5, fy - r - 2);
        c.stroke();
        c.fillStyle = '#3ddc57';
        c.beginPath();
        c.ellipse(fx + 4, fy - r, 3, 1.6, -0.5, 0, Math.PI * 2);
        c.fill();
    }

    draw(c) {
        const C = this.cell;
        const t = clamp(this.timer / this.interval, 0, 1);

        // Sfondo a scacchiera
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                c.fillStyle = (x + y) % 2 ? '#0a170a' : '#0d1f0d';
                c.fillRect(x * C, y * C, C, C);
            }
        }

        // Cibo (mela pulsante)
        if (this.food) {
            const fx = (this.food.x + 0.5) * C, fy = (this.food.y + 0.5) * C;
            this.drawApple(c, fx, fy, 6.2 + Math.sin(this.time * 6) * 1.1);
        }
        // Mela appena mangiata: si rimpicciolisce mentre la testa arriva
        if (this.eatenFood && !this.deadPts) {
            this.drawApple(c, (this.eatenFood.x + 0.5) * C, (this.eatenFood.y + 0.5) * C, 6.2 * (1 - t));
        }

        // Posizioni interpolate di ogni segmento
        const pts = (this.deadPts || this.visualPoints(t)).map((p) => ({ x: (p.x + 0.5) * C, y: (p.y + 0.5) * C }));

        c.lineCap = 'round';
        c.lineJoin = 'round';
        const pass = (width, color) => {
            c.strokeStyle = color;
            c.lineWidth = width;
            c.beginPath();
            c.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
            if (pts.length === 1) c.lineTo(pts[0].x + 0.01, pts[0].y);
            c.stroke();
        };
        pass(C * 0.86, '#0f7a2b');
        pass(C * 0.7, '#2fd45a');
        pass(C * 0.22, 'rgba(255,255,255,0.12)');

        // Testa
        const h = pts[0];
        const grow = 1 + this.eatPulse * 0.18;
        c.fillStyle = '#44f070';
        c.beginPath();
        c.arc(h.x, h.y, C * 0.47 * grow, 0, Math.PI * 2);
        c.fill();

        // Occhi orientati nella direzione di marcia
        const d = this.dir;
        const px = -d.y, py = d.x;
        for (const side of [-1, 1]) {
            const ex = h.x + d.x * 3.5 + px * side * 4;
            const ey = h.y + d.y * 3.5 + py * side * 4;
            c.fillStyle = '#fff';
            c.beginPath();
            c.arc(ex, ey, 2.6, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#111';
            c.beginPath();
            c.arc(ex + d.x * 0.9, ey + d.y * 0.9, 1.3, 0, Math.PI * 2);
            c.fill();
        }
    }
}


/* ============================================================
   3) TETRIS
   Caduta con interpolazione verticale, scorrimento orizzontale
   morbido, DAS/ARR rapidi, input bufferizzato tra un pezzo e
   l'altro e animazione di cancellazione righe più breve.
   ============================================================ */
const TCOLS = 10, TROWS = 20, TCELL = 24;
const T_DAS = 0.12;          // attesa prima dell'auto-ripetizione laterale
const T_ARR = 0.035;         // intervallo di ripetizione laterale
const T_FLASH = 0.2;         // durata effetto "laser" sulle righe
const T_FALL = 0.12;         // durata caduta delle righe sopra
const TET_SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]]
};
const TET_COLORS = {
    I: '#00e5ff', O: '#ffe000', T: '#b44cff', S: '#33e05a', Z: '#ff3b3b', J: '#3b6bff', L: '#ff9a1f'
};
const rotateCW = (m) => m[0].map((_, c) => m.map((row) => row[c]).reverse());

function drawBlock(c, x, y, s, color, alpha) {
    c.globalAlpha = alpha === undefined ? 1 : alpha;
    c.fillStyle = color;
    c.fillRect(x + 1, y + 1, s - 2, s - 2);
    c.fillStyle = 'rgba(255,255,255,0.3)';
    c.fillRect(x + 1, y + 1, s - 2, 3);
    c.fillRect(x + 1, y + 1, 3, s - 2);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(x + 1, y + s - 4, s - 2, 3);
    c.fillRect(x + s - 4, y + 1, 3, s - 2);
    c.globalAlpha = 1;
}

class TetrisGame {
    constructor() {
        this.width = 370;
        this.height = TROWS * TCELL;
        this.actionLabel = '⤓';
        this.panelX = TCOLS * TCELL + 14;

        this.board = Array.from({ length: TROWS }, () => Array(TCOLS).fill(null));
        this.bag = [];
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.interval = 0.8;
        this.time = 0;
        this.hdir = 0;
        this.hTimer = 0;
        this.hRep = false;
        this.pendingRotate = false;
        this.clearing = null;
        this.piece = null;
        this.next = this.pullFromBag();
        this.spawn();
    }

    pullFromBag() {
        if (!this.bag.length) {
            this.bag = Object.keys(TET_SHAPES);
            for (let i = this.bag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
            }
        }
        return this.bag.pop();
    }

    spawn() {
        const type = this.next;
        this.next = this.pullFromBag();
        const m = TET_SHAPES[type].map((r) => r.slice());
        const x = Math.floor((TCOLS - m[0].length) / 2);
        const y = type === 'I' ? -1 : 0;
        this.piece = { type, m, x, y, vx: x, vy: y };
        this.dropTimer = 0;
        this.lockResets = 0;
        if (this.collide(m, x, y)) {
            Arcade.gameOver(false, 'Righe: ' + this.lines + ' · Livello: ' + this.level + ' · Punteggio: ' + this.score);
            return;
        }
        // Input premuti durante l'animazione: applicali subito al nuovo pezzo
        if (this.pendingRotate) {
            this.pendingRotate = false;
            this.rotate();
        }
        if (held.left !== held.right) {
            this.hdir = held.left ? -1 : 1;
            this.hTimer = 0;
            this.hRep = false;
            this.move(this.hdir);
            this.piece.vx = this.piece.x;
        }
    }

    collide(m, x, y) {
        for (let r = 0; r < m.length; r++) {
            for (let c = 0; c < m[r].length; c++) {
                if (!m[r][c]) continue;
                const gx = x + c, gy = y + r;
                if (gx < 0 || gx >= TCOLS || gy >= TROWS) return true;
                if (gy >= 0 && this.board[gy][gx]) return true;
            }
        }
        return false;
    }

    resting() {
        const p = this.piece;
        return this.collide(p.m, p.x, p.y + 1);
    }

    afterMove() {
        if (this.resting() && this.lockResets < 12) {
            this.dropTimer = 0;
            this.lockResets++;
        }
    }

    move(dx) {
        const p = this.piece;
        if (!p || this.collide(p.m, p.x + dx, p.y)) return false;
        p.x += dx;
        this.afterMove();
        return true;
    }

    rotate() {
        const p = this.piece;
        if (!p || p.type === 'O') return;
        const rot = rotateCW(p.m);
        const kicks = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]];
        for (const [kx, ky] of kicks) {
            if (!this.collide(rot, p.x + kx, p.y + ky)) {
                p.m = rot;
                p.x += kx;
                p.y += ky;
                this.afterMove();
                return;
            }
        }
    }

    hardDrop() {
        const p = this.piece;
        if (!p) return;
        let d = 0;
        while (!this.collide(p.m, p.x, p.y + 1)) { p.y++; d++; }
        p.vy = p.y;
        this.score += d * 2;
        Arcade.setScore(this.score);
        this.lockPiece();
    }

    lockPiece() {
        const p = this.piece;
        let overTop = false;
        for (let r = 0; r < p.m.length; r++) {
            for (let c = 0; c < p.m[r].length; c++) {
                if (!p.m[r][c]) continue;
                const gy = p.y + r, gx = p.x + c;
                if (gy < 0) overTop = true;
                else this.board[gy][gx] = p.type;
            }
        }
        if (overTop) {
            this.piece = null;
            Arcade.gameOver(false, 'Righe: ' + this.lines + ' · Livello: ' + this.level + ' · Punteggio: ' + this.score);
            return;
        }
        const rows = [];
        for (let r = 0; r < TROWS; r++) if (this.board[r].every((v) => v)) rows.push(r);
        this.piece = null;
        if (rows.length) this.clearing = { rows, t: 0, phase: 'flash', offs: null };
        else this.spawn();
    }

    onDir(dir) {
        if (dir === 'left' || dir === 'right') {
            this.hdir = dir === 'left' ? -1 : 1;
            this.hTimer = 0;
            this.hRep = false;
            this.move(this.hdir);
        } else if (dir === 'up') {
            if (this.piece) this.rotate();
            else this.pendingRotate = true;
        }
    }

    onSwipe(dir) {
        if (dir === 'left') this.move(-1);
        else if (dir === 'right') this.move(1);
        else if (dir === 'up') this.rotate();
        else if (dir === 'down') this.hardDrop();
    }

    onTap() { this.rotate(); }
    onAction() { this.hardDrop(); }

    updateClearing(dt) {
        const cl = this.clearing;
        cl.t += dt;
        if (cl.phase === 'flash' && cl.t >= T_FLASH) {
            const n = cl.rows.length;
            const keep = [];
            for (let r = 0; r < TROWS; r++) if (!cl.rows.includes(r)) keep.push(r);
            const newBoard = Array.from({ length: n }, () => Array(TCOLS).fill(null));
            const offs = Array(TROWS).fill(0);
            keep.forEach((oldR, i) => {
                newBoard.push(this.board[oldR]);
                offs[n + i] = n + i - oldR;
            });
            this.board = newBoard;
            cl.offs = offs;
            cl.phase = 'fall';
            cl.t = 0;

            this.score += [0, 100, 300, 500, 800][n] * this.level;
            this.lines += n;
            this.level = Math.floor(this.lines / 10) + 1;
            this.interval = Math.max(0.05, 0.8 * Math.pow(0.85, this.level - 1));
            Arcade.setScore(this.score);
        } else if (cl.phase === 'fall' && cl.t >= T_FALL) {
            this.clearing = null;
            this.spawn();
        }
    }

    update(dt) {
        this.time += dt;
        if (this.clearing) { this.updateClearing(dt); return; }
        const p = this.piece;
        if (!p) return;

        // Movimento orizzontale con tasto tenuto premuto (DAS / ARR)
        const hHeld = this.hdir < 0 ? held.left : this.hdir > 0 ? held.right : false;
        if (this.hdir !== 0 && hHeld) {
            this.hTimer += dt;
            let thr = this.hRep ? T_ARR : T_DAS;
            while (this.hTimer >= thr) {
                this.hTimer -= thr;
                this.hRep = true;
                thr = T_ARR;
                if (!this.move(this.hdir)) { this.hTimer = 0; break; }
            }
        } else {
            this.hdir = 0;
        }

        // Gravità
        const interval = held.down ? Math.min(this.interval, 0.04) : this.interval;
        this.dropTimer += dt;
        let guard = 0;
        while (this.dropTimer >= interval && guard++ < 30) {
            if (!this.collide(p.m, p.x, p.y + 1)) {
                p.y++;
                this.dropTimer -= interval;
                this.lockResets = 0;
                if (held.down) {
                    this.score += 1;
                    Arcade.setScore(this.score);
                }
            } else {
                this.lockPiece();
                return;
            }
        }

        // Posizione grafica fluida (inseguimento veloce: nessun ritardo percepibile)
        p.vx += (p.x - p.vx) * (1 - Math.exp(-dt * 60));
        if (Math.abs(p.x - p.vx) < 0.005) p.vx = p.x;
        const canDown = !this.collide(p.m, p.x, p.y + 1);
        p.vy = p.y + (canDown ? clamp(this.dropTimer / interval, 0, 0.999) : 0);
    }

    drawBoard(c) {
        const cl = this.clearing;
        for (let r = 0; r < TROWS; r++) {
            if (cl && cl.phase === 'flash' && cl.rows.includes(r)) continue;
            let py = r * TCELL;
            if (cl && cl.phase === 'fall' && cl.offs) {
                const pr = clamp(cl.t / T_FALL, 0, 1);
                py -= cl.offs[r] * TCELL * (1 - pr * pr);
            }
            for (let col = 0; col < TCOLS; col++) {
                const v = this.board[r][col];
                if (v) drawBlock(c, col * TCELL, py, TCELL, TET_COLORS[v]);
            }
        }
        // Effetto "laser" sulle righe completate
        if (cl && cl.phase === 'flash') {
            const pr = clamp(cl.t / T_FLASH, 0, 1);
            const w = TCOLS * TCELL * (1 - pr);
            c.fillStyle = '#fff';
            for (const r of cl.rows) {
                c.fillRect((TCOLS * TCELL - w) / 2, r * TCELL + 2, w, TCELL - 4);
            }
        }
    }

    drawPreview(c, type, cx, cy, size) {
        const m = TET_SHAPES[type];
        let minR = 9, maxR = -1, minC = 9, maxC = -1;
        m.forEach((row, r) => row.forEach((v, col) => {
            if (v) { minR = Math.min(minR, r); maxR = Math.max(maxR, r); minC = Math.min(minC, col); maxC = Math.max(maxC, col); }
        }));
        const w = (maxC - minC + 1) * size, h = (maxR - minR + 1) * size;
        m.forEach((row, r) => row.forEach((v, col) => {
            if (v) drawBlock(c, cx - w / 2 + (col - minC) * size, cy - h / 2 + (r - minR) * size, size, TET_COLORS[type]);
        }));
    }

    draw(c) {
        c.fillStyle = '#05050f';
        c.fillRect(0, 0, this.width, this.height);

        // Campo
        c.fillStyle = '#0a0a1c';
        c.fillRect(0, 0, TCOLS * TCELL, TROWS * TCELL);
        c.strokeStyle = 'rgba(255,255,255,0.05)';
        c.lineWidth = 1;
        c.beginPath();
        for (let x = 1; x < TCOLS; x++) { c.moveTo(x * TCELL, 0); c.lineTo(x * TCELL, TROWS * TCELL); }
        for (let y = 1; y < TROWS; y++) { c.moveTo(0, y * TCELL); c.lineTo(TCOLS * TCELL, y * TCELL); }
        c.stroke();

        this.drawBoard(c);

        // Pezzo corrente + ombra
        const p = this.piece;
        if (p) {
            let gy = p.y;
            while (!this.collide(p.m, p.x, gy + 1)) gy++;
            p.m.forEach((row, r) => row.forEach((v, col) => {
                if (!v) return;
                c.strokeStyle = TET_COLORS[p.type];
                c.globalAlpha = 0.35;
                c.lineWidth = 2;
                c.strokeRect((p.vx + col) * TCELL + 2, (gy + r) * TCELL + 2, TCELL - 4, TCELL - 4);
                c.globalAlpha = 1;
            }));
            p.m.forEach((row, r) => row.forEach((v, col) => {
                if (v) drawBlock(c, (p.vx + col) * TCELL, (p.vy + r) * TCELL, TCELL, TET_COLORS[p.type]);
            }));
        }

        // Pannello laterale
        const px = this.panelX, pw = this.width - px - 6;
        c.textAlign = 'left';
        c.textBaseline = 'top';
        c.fillStyle = '#8888cc';
        c.font = 'bold 13px "Courier New", monospace';
        c.fillText('PROSSIMO', px, 14);
        roundRect(c, px, 34, pw, 84, 10);
        c.fillStyle = '#0a0a1c';
        c.fill();
        c.strokeStyle = '#2a2a66';
        c.lineWidth = 2;
        c.stroke();
        this.drawPreview(c, this.next, px + pw / 2, 76, 18);

        c.fillStyle = '#8888cc';
        c.fillText('LIVELLO', px, 150);
        c.fillStyle = '#fff';
        c.font = 'bold 26px "Courier New", monospace';
        c.fillText(String(this.level), px, 170);

        c.fillStyle = '#8888cc';
        c.font = 'bold 13px "Courier New", monospace';
        c.fillText('RIGHE', px, 220);
        c.fillStyle = '#fff';
        c.font = 'bold 26px "Courier New", monospace';
        c.fillText(String(this.lines), px, 240);

        c.fillStyle = '#667';
        c.font = '11px "Courier New", monospace';
        c.fillText('↑ ruota', px, 330);
        c.fillText('↓ scendi', px, 346);
        c.fillText('SPAZIO caduta', px, 362);
    }
}


/* ============================================================
   4) PONG
   Fisica a sotto-passi (la palla non attraversa mai le racchette),
   racchetta che risponde subito (tastiera, mouse e dito senza
   inerzia), scia della palla, IA imperfetta.
   Controlli: W/S o frecce, mouse, oppure trascina il dito.
   ============================================================ */
class PongGame {
    constructor() {
        this.width = 600;
        this.height = 400;
        this.actionLabel = null;
        this.pointerControl = true;

        this.pw = 10;
        this.ph = 74;
        this.br = 7;
        this.PS = 430;               // velocità racchetta giocatore da tastiera
        this.winScore = 7;

        this.player = { x: 24, y: (this.height - this.ph) / 2, vy: 0, flash: 0 };
        this.ai = { x: this.width - 24 - this.pw, y: (this.height - this.ph) / 2, vy: 0, flash: 0 };
        this.pScore = 0;
        this.aScore = 0;
        this.score = 0;
        this.target = null;
        this.time = 0;
        this.aiErr = 0;
        this.over = false;
        this.serve(Math.random() < 0.5 ? -1 : 1);
    }

    serve(dir) {
        this.ball = { x: this.width / 2, y: this.height / 2, vx: 0, vy: 0, speed: 300 };
        this.serveDir = dir;
        this.serveTimer = 1.0;
        this.trail = [];
    }

    launch() {
        const a = rand(-0.45, 0.45);
        const b = this.ball;
        b.speed = 300;
        b.vx = Math.cos(a) * b.speed * this.serveDir;
        b.vy = Math.sin(a) * b.speed;
    }

    onDir() { /* i tasti vengono letti direttamente da "held" */ }
    onPointer(x, y) { this.target = y; }
    onPointerEnd() { this.target = null; }

    hit(pad, dirX) {
        const b = this.ball;
        const rel = clamp((b.y - (pad.y + this.ph / 2)) / (this.ph / 2 + this.br), -1, 1);
        const ang = rel * 1.0;
        b.speed = Math.min(720, b.speed + 22);
        b.vx = Math.cos(ang) * b.speed * dirX;
        b.vy = Math.sin(ang) * b.speed + clamp(pad.vy, -600, 600) * 0.12;
        b.x = dirX === 1 ? pad.x + this.pw + this.br : pad.x - this.br;
        pad.flash = 1;
        if (pad === this.player) {
            this.score += 10;
            Arcade.setScore(this.score);
            this.aiErr = rand(-30, 30);
        }
    }

    point(who) {
        if (who === 'player') {
            this.pScore++;
            this.score += 100;
        } else {
            this.aScore++;
        }
        Arcade.setScore(this.score);

        if (this.pScore >= this.winScore) {
            this.score += 500;
            Arcade.setScore(this.score);
            this.over = true;
            Arcade.gameOver(true, 'Hai vinto ' + this.pScore + ' a ' + this.aScore + '! Punteggio: ' + this.score);
        } else if (this.aScore >= this.winScore) {
            this.over = true;
            Arcade.gameOver(false, 'Hai perso ' + this.pScore + ' a ' + this.aScore + '. Punteggio: ' + this.score);
        } else {
            this.serve(who === 'player' ? 1 : -1);
        }
    }

    stepBall(h) {
        const b = this.ball, p = this.player, a = this.ai;
        b.x += b.vx * h;
        b.y += b.vy * h;

        if (b.y < this.br) { b.y = this.br; b.vy = Math.abs(b.vy); }
        if (b.y > this.height - this.br) { b.y = this.height - this.br; b.vy = -Math.abs(b.vy); }

        if (b.vx < 0 && b.x > p.x && b.x - this.br <= p.x + this.pw && b.x + this.br >= p.x &&
            b.y + this.br >= p.y && b.y - this.br <= p.y + this.ph) {
            this.hit(p, 1);
        } else if (b.vx > 0 && b.x < a.x + this.pw && b.x + this.br >= a.x && b.x - this.br <= a.x + this.pw &&
            b.y + this.br >= a.y && b.y - this.br <= a.y + this.ph) {
            this.hit(a, -1);
        }

        if (b.x < -this.br * 2) this.point('ai');
        else if (b.x > this.width + this.br * 2) this.point('player');
    }

    update(dt) {
        this.time += dt;
        const p = this.player, a = this.ai, b = this.ball;
        p.flash = Math.max(0, p.flash - dt * 5);
        a.flash = Math.max(0, a.flash - dt * 5);

        // Racchetta giocatore: risposta immediata
        const keyDir = (held.down ? 1 : 0) - (held.up ? 1 : 0);
        if (keyDir !== 0) {
            this.target = null;
            p.vy = lerp(p.vy, keyDir * this.PS, Math.min(1, dt * 80));   // rampa di ~12 ms
        } else if (this.target !== null) {
            // Segue il dito/mouse praticamente senza ritardo
            const err = this.target - (p.y + this.ph / 2);
            p.vy = clamp(err / Math.max(dt, 0.001), -1800, 1800);
        } else {
            p.vy = lerp(p.vy, 0, Math.min(1, dt * 60));
        }
        p.y += p.vy * dt;
        if (p.y < 0) { p.y = 0; p.vy = 0; }
        if (p.y > this.height - this.ph) { p.y = this.height - this.ph; p.vy = 0; }

        // IA: segue la palla con velocità limitata ed errore casuale
        let tgt = this.height / 2;
        if (b.vx > 0) tgt = b.y + this.aiErr;
        else tgt = this.height / 2 + (b.y - this.height / 2) * 0.25;
        const err = tgt - (a.y + this.ph / 2);
        const maxSp = 255 + Math.min(this.pScore, 6) * 18;
        const aDesired = Math.abs(err) < 6 ? 0 : clamp(err * 8, -maxSp, maxSp);
        a.vy = lerp(a.vy, aDesired, Math.min(1, dt * 12));
        a.y = clamp(a.y + a.vy * dt, 0, this.height - this.ph);

        // Palla
        if (this.serveTimer > 0) {
            this.serveTimer -= dt;
            if (this.serveTimer <= 0) this.launch();
            return;
        }
        this.trail.push({ x: b.x, y: b.y });
        if (this.trail.length > 14) this.trail.shift();

        const steps = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * dt / 5));
        const h = dt / steps;
        for (let i = 0; i < steps && !this.over; i++) this.stepBall(h);
    }

    draw(c) {
        const W = this.width, H = this.height;
        c.fillStyle = '#04040c';
        c.fillRect(0, 0, W, H);

        // Linea centrale
        c.fillStyle = 'rgba(255,255,255,0.18)';
        for (let y = 8; y < H; y += 28) c.fillRect(W / 2 - 2, y, 4, 14);

        // Punteggio partita
        c.fillStyle = 'rgba(255,255,255,0.14)';
        c.font = 'bold 72px "Courier New", monospace';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(String(this.pScore), W * 0.25, 70);
        c.fillText(String(this.aScore), W * 0.75, 70);

        // Scia
        const b = this.ball;
        for (let i = 0; i < this.trail.length; i++) {
            const t = this.trail[i];
            const k = (i + 1) / this.trail.length;
            c.fillStyle = 'rgba(0,229,255,' + (k * 0.28).toFixed(3) + ')';
            c.beginPath();
            c.arc(t.x, t.y, this.br * (0.4 + k * 0.6), 0, Math.PI * 2);
            c.fill();
        }

        // Racchette
        const paddle = (pad, color) => {
            c.shadowColor = color;
            c.shadowBlur = 10 + pad.flash * 22;
            c.fillStyle = pad.flash > 0 ? '#fff' : color;
            roundRect(c, pad.x, pad.y, this.pw, this.ph, 5);
            c.fill();
            c.shadowBlur = 0;
        };
        paddle(this.player, '#00e5ff');
        paddle(this.ai, '#ff4fa3');

        // Palla (lampeggia durante il servizio)
        const blink = this.serveTimer > 0 ? (Math.floor(this.time * 8) % 2 === 0) : true;
        if (blink) {
            c.shadowColor = '#fff';
            c.shadowBlur = 14;
            c.fillStyle = '#fff';
            c.beginPath();
            c.arc(b.x, b.y, this.br, 0, Math.PI * 2);
            c.fill();
            c.shadowBlur = 0;
        }

        if (this.time < 3.5) {
            c.fillStyle = 'rgba(255,255,255,0.55)';
            c.font = '14px "Courier New", monospace';
            c.fillText('W/S, frecce, mouse o trascina il dito · primo a ' + this.winScore, W / 2, H - 18);
        }
    }
}


/* ============================================================
   Registro dei giochi + avvio
   ============================================================ */
const GAMES = {
    pacman: PacmanGame,
    snake: SnakeGame,
    tetris: TetrisGame,
    pong: PongGame
};

Arcade.refreshMenu();
