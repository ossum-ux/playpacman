const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score-val');
const finalScoreElement = document.getElementById('final-score');
const menuScreen = document.getElementById('menu-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const gameUI = document.getElementById('game-ui');
const statusTitle = document.getElementById('status-title');

const TILE_SIZE = 20;
const SPEED = 2; // Deve essere un divisore di TILE_SIZE per un movimento perfetto sulla griglia

// Mappa: 1 = Muro, 0 = Pallino, 2 = Spazio Vuoto
let map = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
    [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,0,1],
    [1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1],
    [1,1,1,1,0,1,1,1,2,1,2,1,1,1,0,1,1,1,1],
    [2,2,2,1,0,1,2,2,2,2,2,2,2,1,0,1,2,2,2],
    [1,1,1,1,0,1,2,1,1,2,1,1,2,1,0,1,1,1,1],
    [1,0,0,0,0,2,2,1,2,2,2,1,2,2,0,0,0,0,1],
    [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
    [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1],
    [1,1,0,1,0,1,0,1,1,1,1,1,0,1,0,1,0,1,1],
    [1,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

const originalMap = JSON.parse(JSON.stringify(map));

canvas.width = map[0].length * TILE_SIZE;
canvas.height = map.length * TILE_SIZE;

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
        const { col, row } = this.getMapPos();
        const nextCol = col + dx;
        const nextRow = row + dy;
        
        if (nextRow < 0 || nextRow >= map.length || nextCol < 0 || nextCol >= map[0].length) return false;
        return map[nextRow][nextCol] !== 1;
    }
}

class Pacman extends Entity {
    constructor(x, y) {
        super(x, y, 'yellow');
        this.mouthOpen = 0;
        this.mouthSpeed = 0.1;
    }

    update() {
        if (this.isAtCenter()) {
            // Mangia pallino
            const { col, row } = this.getMapPos();
            if (map[row][col] === 0) {
                map[row][col] = 2;
                score += 10;
                scoreElement.innerText = score;
                checkWin();
            }

            // Cambia direzione se possibile
            if (this.nextDirX !== 0 || this.nextDirY !== 0) {
                if (this.canMove(this.nextDirX, this.nextDirY)) {
                    this.dirX = this.nextDirX;
                    this.dirY = this.nextDirY;
                }
            }

            // Fermati se muro davanti
            if (!this.canMove(this.dirX, this.dirY)) {
                this.dirX = 0;
                this.dirY = 0;
            }
        }

        this.x += this.dirX * SPEED;
        this.y += this.dirY * SPEED;

        // Animazione bocca
        this.mouthOpen += this.mouthSpeed;
        if (this.mouthOpen > 0.2 || this.mouthOpen < 0) this.mouthSpeed *= -1;
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
            const directions = [
                { x: 1, y: 0 }, { x: -1, y: 0 },
                { x: 0, y: 1 }, { x: 0, y: -1 }
            ];

            // Filtra direzioni possibili (non muri e non tornare indietro se possibile)
            let possible = directions.filter(d => 
                this.canMove(d.x, d.y) && (d.x !== -this.dirX || d.y !== -this.dirY)
            );

            if (possible.length === 0) {
                possible = directions.filter(d => this.canMove(d.x, d.y));
            }

            const choice = possible[Math.floor(Math.random() * possible.length)];
            if (choice) {
                this.dirX = choice.x;
                this.dirY = choice.y;
            }
        }

        this.x += this.dirX * SPEED;
        this.y += this.dirY * SPEED;
    }

    draw() {
        ctx.fillStyle = this.color;
        // Corpo Ghost
        ctx.beginPath();
        ctx.arc(this.x, this.y - 2, this.radius, Math.PI, 0);
        ctx.lineTo(this.x + this.radius, this.y + this.radius);
        ctx.lineTo(this.x - this.radius, this.y + this.radius);
        ctx.fill();
        
        // Occhi
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(this.x - 4, this.y - 4, 3, 0, Math.PI * 2);
        ctx.arc(this.x + 4, this.y - 4, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

let player;
let ghosts = [];

function initGame() {
    score = 0;
    scoreElement.innerText = score;
    map = JSON.parse(JSON.stringify(originalMap));
    player = new Pacman(TILE_SIZE * 1.5, TILE_SIZE * 1.5);
    ghosts = [
        new Ghost(TILE_SIZE * 9.5, TILE_SIZE * 7.5, 'red'),
        new Ghost(TILE_SIZE * 8.5, TILE_SIZE * 7.5, 'pink'),
        new Ghost(TILE_SIZE * 10.5, TILE_SIZE * 7.5, 'cyan')
    ];
}

function drawMap() {
    for (let row = 0; row < map.length; row++) {
        for (let col = 0; col < map[row].length; col++) {
            const x = col * TILE_SIZE;
            const y = row * TILE_SIZE;
            if (map[row][col] === 1) {
                ctx.strokeStyle = '#2222ff';
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            } else if (map[row][col] === 0) {
                ctx.fillStyle = '#ffb8ae';
                ctx.beginPath();
                ctx.arc(x + TILE_SIZE/2, y + TILE_SIZE/2, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

function checkWin() {
    let dots = 0;
    for (let row of map) {
        for (let tile of row) {
            if (tile === 0) dots++;
        }
    }
    if (dots === 0) {
        endGame(true);
    }
}

function endGame(win) {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    statusTitle.innerText = win ? "HAI VINTO!" : "GAME OVER";
    statusTitle.style.color = win ? "#00ff00" : "#ff0000";
    finalScoreElement.innerText = score;
    gameOverScreen.classList.remove('hidden');
}

function update() {
    if (!gameRunning) return;

    player.update();
    
    for (let ghost of ghosts) {
        ghost.update();
        // Collisione Pacman-Ghost
        const dist = Math.hypot(player.x - ghost.x, player.y - ghost.y);
        if (dist < TILE_SIZE * 0.8) {
            endGame(false);
        }
    }
}

function draw() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    drawMap();
    player.draw();
    ghosts.forEach(g => g.draw());
}

function gameLoop() {
    update();
    draw();
    if (gameRunning) {
        animationId = requestAnimationFrame(gameLoop);
    }
}

// Input
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'arrowup' || key === 'w')    { player.nextDirX = 0; player.nextDirY = -1; }
    if (key === 'arrowdown' || key === 's')  { player.nextDirX = 0; player.nextDirY = 1; }
    if (key === 'arrowleft' || key === 'a')  { player.nextDirX = -1; player.nextDirY = 0; }
    if (key === 'arrowright' || key === 'd') { player.nextDirX = 1; player.nextDirY = 0; }
});

// UI Buttons
document.getElementById('start-button').addEventListener('click', () => {
    menuScreen.classList.add('hidden');
    gameUI.classList.remove('hidden');
    gameRunning = true;
    initGame();
    gameLoop();
});

document.getElementById('restart-button').addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    gameRunning = true;
    initGame();
    gameLoop();
});
