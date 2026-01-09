"use strict";
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

let score = 0, lives = 3, gameOver = false;
const player = { w: 80, h: 12, x: (W - 80) / 2, y: H - 30, speed: 6, dx: 0 };
const items = [];
let lastSpawn = 0, spawnInterval = 800, fallSpeed = 2;

function spawn() {
    const size = 18;
    const x = Math.random() * (W - size);
    items.push({ x, y: -size, size, vy: fallSpeed + Math.random() * 1.5 });
}

function reset() {
    score = 0; lives = 3; gameOver = false; items.length = 0; player.x = (W - player.w) / 2; lastSpawn = 0; spawnInterval = 800; fallSpeed = 2; lastTime = performance.now();
    document.getElementById('score').textContent = 'Score: 0';
    document.getElementById('lives').textContent = 'Lives: 3';
    loop(lastTime);
}

function update(dt) {
    if (gameOver) return;
    player.x += player.dx * player.speed * (dt / 16);
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > W) player.x = W - player.w;

    for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.y += it.vy * (dt / 16);
        if (it.y > H) {
            items.splice(i, 1);
            lives--;
            document.getElementById('lives').textContent = 'Lives: ' + lives;
            if (lives <= 0) { gameOver = true; }
            continue;
        }
        if (it.y + it.size >= player.y && it.y <= player.y + player.h) {
            if (it.x + it.size > player.x && it.x < player.x + player.w) {
                items.splice(i, 1);
                score++;
                document.getElementById('score').textContent = 'Score: ' + score;
                if (score % 10 === 0) fallSpeed += 0.4;
            }
        }
    }

    lastSpawn += dt;
    if (lastSpawn > spawnInterval) { spawn(); lastSpawn = 0; if (spawnInterval > 350) spawnInterval *= 0.995; }
}

function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.fillStyle = '#06d6a0';
    for (const it of items) {
        ctx.beginPath();
        ctx.arc(it.x + it.size / 2, it.y + it.size / 2, it.size / 2, 0, Math.PI * 2);
        ctx.fill();
    }
    if (gameOver) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff';
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Game Over', W / 2, H / 2 - 10);
        ctx.font = '16px sans-serif';
        ctx.fillText('Press Restart to play again', W / 2, H / 2 + 20);
    }
}

let lastTime = 0;
function loop(t) {
    const dt = t - (lastTime || t);
    lastTime = t;
    update(dt);
    draw();
    if (!gameOver) requestAnimationFrame(loop);
}

window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a') player.dx = -1;
    if (e.key === 'ArrowRight' || e.key === 'd') player.dx = 1;
});
window.addEventListener('keyup', e => {
    if ((e.key === 'ArrowLeft' && player.dx === -1) || (e.key === 'a' && player.dx === -1)) player.dx = 0;
    if ((e.key === 'ArrowRight' && player.dx === 1) || (e.key === 'd' && player.dx === 1)) player.dx = 0;
});

canvas.addEventListener('pointermove', e => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    player.x = x - player.w / 2;
});

document.getElementById('restart').addEventListener('click', () => { reset(); });

loop(performance.now());
