const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreVal = document.getElementById('score-val');
const finalScore = document.getElementById('final-score');
const menuScreen = document.getElementById('menu-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const statusTitle = document.getElementById('status-title');

const TILE_SIZE = 20;
const SPEED = 2; // Deve essere sottomultiplo di TILE_SIZE

const MAP = [
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

let currentMap = [];
let score = 0;
let gameRunning = false;
let animationId;

class Entity {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.dirX = 0;
        this.dirY = 0;
        this.nextDirX = 0;
        this.nextDirY = 0;
        this.radius = TILE_SIZE / 2 - 2;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    getMapPos() {
        return {
            col: Math.floor(this.x / TILE_SIZE),
            row: Math.floor(this.y / TILE_SIZE)
        };
    }

    isAtCenter() {
        return (this.x % TILE_SIZE === TILE_SIZE / 2) && (this.y % TILE_SIZE === TILE_SIZE / 2);
    }

    canMove(dx, dy) {
        const pos = this.getMapPos();
        const nextCol = pos.col + dx;
        const nextRow = pos.row + dy;
        if (nextRow < 0 || nextRow >= currentMap.length || nextCol < 0 || nextCol >= currentMap[0].length) return false;
        return currentMap[nextRow][nextCol] !== 1;
    }
}

class Pacman extends Entity {
    constructor(x, y) {
        super(x, y, 'yellow');
        this.mouthOpen = 0;
        this.mouthDir = 0.1;
    }

    update() {
        if (this.isAtCenter()) {
            const pos = this.getMapPos();
            
            // Mangia pallini
            if (currentMap[pos.row][pos.col] === 0) {
                currentMap[pos.row][pos.col] = 2;
                score += 10;
                scoreVal.innerText = score;
                checkVictory();
            }

            // Cambia direzione
            if (this.nextDirX !== 0 || this.nextDirY !== 0) {
                if (this.canMove(this.nextDirX, this.nextDirY)) {
                    this.dirX = this.nextDirX;
                    this.dirY = this.nextDirY;
                }
            }

            // Collisione muri
            if (!this.canMove(this.dirX, this.dirY)) {
                this.dirX = 0;
                this.dirY = 0;
            }
        }
        this.x += this.dirX * SPEED;
        this.y += this.dirY * SPEED;
        
        this.mouthOpen += this.mouthDir;
        if (this.mouthOpen > 0.2 || this.mouthOpen < 0) this.mouthDir *= -1;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        let rotation = 0;
        if (this.dirX === 1) rotation = 0;
        else if (this.dirX === -1) rotation = Math.PI;
        else if (this.dirY === 1) rotation = 0.5 * Math.PI;
        else if (this.dirY === -1) rotation = 1.5 * Math.PI;

        const startAngle = (this.mouthOpen) * Math.PI + rotation;
        const endAngle = (2 - this.mouthOpen) * Math.PI + rotation;

        ctx.moveTo(this.x, this.y);
        ctx.arc(this.x, this.y, this.radius, startAngle, endAngle);
        ctx.fill();
    }
}

class Ghost extends Entity {
    constructor(x, y, color) {
        super(x, y, color);
        this.dirX = 1;
    }

    update() {
        if (this.isAtCenter()) {
            const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
            const validDirs = dirs.filter(d => this.canMove(d.x, d.y) && (d.x !== -this.dirX || d.y !== -this.dirY));
            const finalDirs = validDirs.length > 0 ? validDirs : dirs.filter(d => this.canMove(d.x, d.y));
            const move = finalDirs[Math.floor(Math.random() * finalDirs.length)];
            if (move) {
                this.dirX = move.x;
                this.dirY = move.y;
            }
        }
        this.x += this.dirX * SPEED;
        this.y += this.dirY * SPEED;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y - 2, this.radius, Math.PI, 0);
        ctx.lineTo(this.x + this.radius, this.y + this.radius);
        ctx.lineTo(this.x - this.radius, this.y + this.radius);
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(this.x - 4, this.y - 4, 2, 0, Math.PI * 2);
        ctx.arc(this.x + 4, this.y - 4, 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

let player;
let ghosts = [];

function init() {
    score = 0;
    scoreVal.innerText = score;
    currentMap = JSON.parse(JSON.stringify(MAP));
    canvas.width = currentMap[0].length * TILE_SIZE;
    canvas.height = currentMap.length * TILE_SIZE;
    player = new Pacman(TILE_SIZE * 1.5, TILE_SIZE * 1.5);
    ghosts = [
        new Ghost(TILE_SIZE * 9.5, TILE_SIZE * 7.5, 'red'),
        new Ghost(TILE_SIZE * 8.5, TILE_SIZE * 7.5, 'pink'),
        new Ghost(TILE_SIZE * 10.5, TILE_SIZE * 7.5, 'cyan')
    ];
}

function checkVictory() {
    let dots = 0;
    currentMap.forEach(row => row.forEach(tile => { if(tile === 0) dots++; }));
    if (dots === 0) gameOver(true);
}

function gameOver(win) {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    statusTitle.innerText = win ? "VITTORIA!" : "GAME OVER";
    statusTitle.style.color = win ? "#00ff00" : "#ff0000";
    finalScore.innerText = score;
    gameOverScreen.classList.remove('hidden');
}

function drawMap() {
    for (let r = 0; r < currentMap.length; r++) {
        for (let c = 0; c < currentMap[r].length; c++) {
            const x = c * TILE_SIZE;
            const y = r * TILE_SIZE;
            if (currentMap[r][c] === 1) {
                ctx.strokeStyle = '#2222ff';
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            } else if (currentMap[r][c] === 0) {
                ctx.fillStyle = '#ffb8ae';
                ctx.beginPath();
                ctx.arc(x + TILE_SIZE/2, y + TILE_SIZE/2, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

function loop() {
    if (!gameRunning) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    drawMap();
    player.update();
    player.draw();

    ghosts.forEach(g => {
        g.update();
        g.draw();
        const dist = Math.hypot(player.x - g.x, player.y - g.y);
        if (dist < TILE_SIZE * 0.7) gameOver(false);
    });

    animationId = requestAnimationFrame(loop);
}

// Input Handlers
function handleInput(dir) {
    if (!player) return;
    if (dir === 'up') { player.nextDirX = 0; player.nextDirY = -1; }
    if (dir === 'down') { player.nextDirX = 0; player.nextDirY = 1; }
    if (dir === 'left') { player.nextDirX = -1; player.nextDirY = 0; }
    if (dir === 'right') { player.nextDirX = 1; player.nextDirY = 0; }
}

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'arrowup') handleInput('up');
    if (key === 's' || key === 'arrowdown') handleInput('down');
    if (key === 'a' || key === 'arrowleft') handleInput('left');
    if (key === 'd' || key === 'arrowright') handleInput('right');
});

// D-Pad Event Listeners
const dpadMapping = { 'up-btn': 'up', 'down-btn': 'down', 'left-btn': 'left', 'right-btn': 'right' };
Object.entries(dpadMapping).forEach(([id, dir]) => {
    const btn = document.getElementById(id);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); handleInput(dir); });
    btn.addEventListener('mousedown', () => handleInput(dir));
});

// Swipe Detection
let startX, startY;
canvas.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
}, {passive: false});

canvas.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > 30) handleInput(dx > 0 ? 'right' : 'left');
    } else {
        if (Math.abs(dy) > 30) handleInput(dy > 0 ? 'down' : 'up');
    }
}, {passive: false});

// Bottoni UI
document.getElementById('start-button').addEventListener('click', () => {
    menuScreen.classList.add('hidden');
    gameRunning = true;
    init();
    loop();
});

document.getElementById('restart-button').addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    gameRunning = true;
    init();
    loop();
});