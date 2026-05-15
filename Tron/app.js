const sceneCanvas = document.getElementById("scene-canvas");
const sceneCtx = sceneCanvas.getContext("2d");
sceneCtx.imageSmoothingEnabled = true;

const arenaCanvas = document.getElementById("arena-canvas");
const arenaCtx = arenaCanvas.getContext("2d");
arenaCtx.imageSmoothingEnabled = true;

const modeName = document.getElementById("mode-name");
const modeDescription = document.getElementById("mode-description");
const modeButtons = Array.from(document.querySelectorAll(".mode-button"));
const restartButton = document.getElementById("restart-button");
const controlButtons = Array.from(document.querySelectorAll(".control-button"));

const roundDisplay = document.getElementById("round-display");
const winDisplay = document.getElementById("win-display");
const threatDisplay = document.getElementById("threat-display");
const speedDisplay = document.getElementById("speed-display");
const statusLine = document.getElementById("status-line");
const runState = document.getElementById("run-state");

const keyDirections = {
    arrowup: "up",
    w: "up",
    arrowdown: "down",
    s: "down",
    arrowleft: "left",
    a: "left",
    arrowright: "right",
    d: "right"
};

const sceneModes = {
    legacy: {
        name: "Legacy Grid",
        description: "Cold cyan highways, amber portal light, and a disciplined city horizon.",
        accent: "#67f3ff",
        highlight: "#f4ffff",
        secondary: "#ffac42",
        trail: "#2be7ff",
        skyTop: "#04111d",
        skyBottom: "#091923",
        haze: "rgba(103, 243, 255, 0.15)",
        enemy: "#ff6489",
        road: "#0d2130",
        shadow: "rgba(1, 5, 10, 0.68)"
    },
    pursuit: {
        name: "Pursuit Run",
        description: "Magenta pressure, colder highlights, and a hotter pursuit line under a dark chase sky.",
        accent: "#ff6489",
        highlight: "#fff6fb",
        secondary: "#7ae8ff",
        trail: "#ff6d9b",
        skyTop: "#16040e",
        skyBottom: "#1f0912",
        haze: "rgba(255, 100, 137, 0.14)",
        enemy: "#ffcf56",
        road: "#29101d",
        shadow: "rgba(9, 2, 5, 0.72)"
    },
    citadel: {
        name: "Citadel Storm",
        description: "Teal circuitry, storm-gold energy, and a heavier skyline with sharper atmospheric contrast.",
        accent: "#79ffe1",
        highlight: "#f7fffb",
        secondary: "#ffc44b",
        trail: "#5df7d9",
        skyTop: "#071814",
        skyBottom: "#0c221b",
        haze: "rgba(121, 255, 225, 0.15)",
        enemy: "#ff7f59",
        road: "#103226",
        shadow: "rgba(2, 8, 7, 0.72)"
    }
};

let activeMode = "legacy";

const SCENE_WIDTH = sceneCanvas.width;
const SCENE_HEIGHT = sceneCanvas.height;
const SCENE_CENTER_X = SCENE_WIDTH / 2;
const SCENE_HORIZON_Y = 306;

const stars = Array.from({ length: 70 }, (_, index) => ({
    x: ((index * 137) % SCENE_WIDTH) + ((index % 5) * 6),
    y: 18 + ((index * 53) % 170),
    radius: index % 9 === 0 ? 2.6 : 1.4,
    phase: index * 0.37
}));

const skyline = Array.from({ length: 22 }, (_, index) => {
    const width = 28 + ((index * 11) % 30);
    const height = 86 + ((index * 31) % 150);
    const x = (index * 44) - 10;
    const crown = index % 4 === 0 ? 16 : index % 3 === 0 ? 10 : 0;
    return { x, width, height, crown };
});

let sceneParticles = [];

function withAlpha(hex, alpha) {
    const sanitized = hex.replace("#", "");
    const full = sanitized.length === 3
        ? sanitized.split("").map((char) => char + char).join("")
        : sanitized;
    const red = Number.parseInt(full.slice(0, 2), 16);
    const green = Number.parseInt(full.slice(2, 4), 16);
    const blue = Number.parseInt(full.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function lerp(start, end, amount) {
    return start + ((end - start) * amount);
}

function fillRoundedRect(ctx, x, y, width, height, radius) {
    const clamped = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + clamped, y);
    ctx.lineTo(x + width - clamped, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + clamped);
    ctx.lineTo(x + width, y + height - clamped);
    ctx.quadraticCurveTo(x + width, y + height, x + width - clamped, y + height);
    ctx.lineTo(x + clamped, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - clamped);
    ctx.lineTo(x, y + clamped);
    ctx.quadraticCurveTo(x, y, x + clamped, y);
    ctx.closePath();
    ctx.fill();
}

function strokeRoundedRect(ctx, x, y, width, height, radius) {
    const clamped = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + clamped, y);
    ctx.lineTo(x + width - clamped, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + clamped);
    ctx.lineTo(x + width, y + height - clamped);
    ctx.quadraticCurveTo(x + width, y + height, x + width - clamped, y + height);
    ctx.lineTo(x + clamped, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - clamped);
    ctx.lineTo(x, y + clamped);
    ctx.quadraticCurveTo(x, y, x + clamped, y);
    ctx.closePath();
    ctx.stroke();
}

function drawGlow(ctx, x, y, radius, color, alpha) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, withAlpha(color, alpha));
    gradient.addColorStop(0.42, withAlpha(color, alpha * 0.45));
    gradient.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
}

function drawBeam(ctx, points, color, width, blur, alpha) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = withAlpha(color, alpha);
    ctx.shadowBlur = blur;
    ctx.shadowColor = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
        ctx.lineTo(points[index].x, points[index].y);
    }
    ctx.stroke();
    ctx.restore();
}

function setMode(modeKey) {
    activeMode = modeKey;
    const mode = sceneModes[modeKey];
    document.body.dataset.mode = modeKey;
    modeName.textContent = mode.name;
    modeDescription.textContent = mode.description;

    modeButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.mode === modeKey);
    });
}

modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
        setMode(button.dataset.mode);
    });
});

function drawSceneBackground(mode, time) {
    const sky = sceneCtx.createLinearGradient(0, 0, 0, SCENE_HEIGHT);
    sky.addColorStop(0, mode.skyTop);
    sky.addColorStop(0.58, mode.skyBottom);
    sky.addColorStop(1, "#020306");
    sceneCtx.fillStyle = sky;
    sceneCtx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);

    drawGlow(sceneCtx, 740, 126, 128, mode.secondary, 0.24);
    drawGlow(sceneCtx, 764, 154, 198, mode.accent, 0.11);

    sceneCtx.save();
    sceneCtx.strokeStyle = withAlpha(mode.secondary, 0.42);
    sceneCtx.lineWidth = 10;
    sceneCtx.shadowBlur = 24;
    sceneCtx.shadowColor = mode.secondary;
    sceneCtx.beginPath();
    sceneCtx.arc(742, 130, 58, 0, Math.PI * 2);
    sceneCtx.stroke();
    sceneCtx.restore();

    stars.forEach((star) => {
        const twinkle = 0.45 + (Math.sin((time * 0.0018) + star.phase) * 0.3);
        sceneCtx.fillStyle = withAlpha(mode.highlight, twinkle);
        sceneCtx.beginPath();
        sceneCtx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        sceneCtx.fill();
    });

    skyline.forEach((building, index) => {
        const top = SCENE_HORIZON_Y - building.height;
        const buildingGradient = sceneCtx.createLinearGradient(0, top, 0, SCENE_HORIZON_Y);
        buildingGradient.addColorStop(0, "#101d2a");
        buildingGradient.addColorStop(1, "#040a11");
        sceneCtx.fillStyle = buildingGradient;
        fillRoundedRect(sceneCtx, building.x, top, building.width, building.height, 4);

        if (building.crown > 0) {
            sceneCtx.fillStyle = "#0f1b28";
            fillRoundedRect(sceneCtx, building.x + 6, top - building.crown, building.width - 12, building.crown + 4, 4);
        }

        for (let y = top + 12; y < SCENE_HORIZON_Y - 10; y += 16) {
            for (let x = building.x + 7; x < building.x + building.width - 8; x += 9) {
                if ((x + y + index) % 2 === 0) {
                    sceneCtx.fillStyle = withAlpha(mode.secondary, 0.72);
                    sceneCtx.fillRect(x, y, 3, 7);
                }
            }
        }
    });

    const haze = sceneCtx.createLinearGradient(0, SCENE_HORIZON_Y - 14, 0, SCENE_HORIZON_Y + 62);
    haze.addColorStop(0, withAlpha(mode.accent, 0));
    haze.addColorStop(0.38, mode.haze);
    haze.addColorStop(1, withAlpha(mode.accent, 0));
    sceneCtx.fillStyle = haze;
    sceneCtx.fillRect(0, SCENE_HORIZON_Y - 14, SCENE_WIDTH, 90);

    const road = sceneCtx.createLinearGradient(0, SCENE_HORIZON_Y, 0, SCENE_HEIGHT);
    road.addColorStop(0, withAlpha(mode.road, 0.4));
    road.addColorStop(1, mode.shadow);
    sceneCtx.fillStyle = road;
    sceneCtx.beginPath();
    sceneCtx.moveTo(0, SCENE_HORIZON_Y);
    sceneCtx.lineTo(SCENE_WIDTH, SCENE_HORIZON_Y);
    sceneCtx.lineTo(SCENE_WIDTH, SCENE_HEIGHT);
    sceneCtx.lineTo(0, SCENE_HEIGHT);
    sceneCtx.closePath();
    sceneCtx.fill();

    sceneCtx.strokeStyle = withAlpha(mode.accent, 0.52);
    sceneCtx.lineWidth = 2;
    for (let row = 0; row < 11; row += 1) {
        const depth = row / 10;
        const y = lerp(SCENE_HORIZON_Y + 4, SCENE_HEIGHT - 12, Math.pow(depth, 1.85));
        sceneCtx.globalAlpha = 0.32 + (depth * 0.3);
        sceneCtx.beginPath();
        sceneCtx.moveTo(0, y);
        sceneCtx.lineTo(SCENE_WIDTH, y);
        sceneCtx.stroke();
    }
    sceneCtx.globalAlpha = 1;

    for (let column = -8; column <= 8; column += 1) {
        const topX = SCENE_CENTER_X + (column * 28);
        const bottomX = SCENE_CENTER_X + (column * 110);
        const gradient = sceneCtx.createLinearGradient(topX, SCENE_HORIZON_Y, bottomX, SCENE_HEIGHT);
        gradient.addColorStop(0, withAlpha(mode.accent, 0.45));
        gradient.addColorStop(1, withAlpha(mode.accent, 0.12));
        sceneCtx.strokeStyle = gradient;
        sceneCtx.lineWidth = column === 0 ? 3 : 2;
        sceneCtx.beginPath();
        sceneCtx.moveTo(topX, SCENE_HORIZON_Y);
        sceneCtx.lineTo(bottomX, SCENE_HEIGHT);
        sceneCtx.stroke();
    }

    sceneCtx.strokeStyle = withAlpha(mode.highlight, 0.24);
    sceneCtx.lineWidth = 1.2;
    sceneCtx.beginPath();
    sceneCtx.moveTo(0, SCENE_HORIZON_Y + 3);
    sceneCtx.lineTo(SCENE_WIDTH, SCENE_HORIZON_Y + 3);
    sceneCtx.stroke();
}

function spawnSceneParticles(trailX, trailY, mode) {
    if (sceneParticles.length > 80) {
        sceneParticles = sceneParticles.slice(-80);
    }

    for (let count = 0; count < 3; count += 1) {
        sceneParticles.push({
            x: trailX + ((Math.random() * 14) - 7),
            y: trailY + ((Math.random() * 20) - 10),
            vx: -2.4 - (Math.random() * 2.1),
            vy: (Math.random() * 1.4) - 0.7,
            life: 18 + Math.random() * 14,
            color: Math.random() > 0.72 ? mode.secondary : mode.accent
        });
    }
}

function drawWheel(mode, x, y, radius) {
    drawGlow(sceneCtx, x, y, radius * 1.85, mode.accent, 0.18);
    sceneCtx.save();
    sceneCtx.lineWidth = radius * 0.24;
    sceneCtx.strokeStyle = withAlpha(mode.accent, 0.95);
    sceneCtx.shadowBlur = 24;
    sceneCtx.shadowColor = mode.accent;
    sceneCtx.beginPath();
    sceneCtx.arc(x, y, radius, 0, Math.PI * 2);
    sceneCtx.stroke();

    sceneCtx.lineWidth = radius * 0.12;
    sceneCtx.strokeStyle = withAlpha(mode.highlight, 0.9);
    sceneCtx.beginPath();
    sceneCtx.arc(x, y, radius * 0.63, 0, Math.PI * 2);
    sceneCtx.stroke();
    sceneCtx.restore();

    sceneCtx.fillStyle = "#07111a";
    sceneCtx.beginPath();
    sceneCtx.arc(x, y, radius * 0.3, 0, Math.PI * 2);
    sceneCtx.fill();
}

function drawLightCycle(mode, time) {
    const bob = Math.sin(time * 0.0029) * 4;
    const bikeX = 288;
    const bikeY = 296 + bob;
    const rearWheelX = bikeX + 120;
    const frontWheelX = bikeX + 358;
    const wheelY = bikeY + 120;
    const rearTrailX = bikeX + 24;
    const glowLine = [
        { x: rearTrailX - 240, y: wheelY + 1 },
        { x: rearTrailX - 70, y: wheelY + 1 },
        { x: rearTrailX + 18, y: wheelY + 1 }
    ];

    drawBeam(sceneCtx, glowLine, mode.trail, 14, 28, 0.3);
    drawBeam(sceneCtx, glowLine, mode.highlight, 4, 16, 0.82);

    sceneCtx.save();
    sceneCtx.fillStyle = withAlpha("#000000", 0.36);
    sceneCtx.beginPath();
    sceneCtx.ellipse(532, wheelY + 36, 236, 28, 0, 0, Math.PI * 2);
    sceneCtx.fill();
    sceneCtx.restore();

    drawWheel(mode, rearWheelX, wheelY, 58);
    drawWheel(mode, frontWheelX, wheelY, 58);

    drawGlow(sceneCtx, bikeX + 200, bikeY + 36, 86, mode.accent, 0.12);
    drawGlow(sceneCtx, rearTrailX + 20, bikeY + 44, 32, mode.trail, 0.15);

    sceneCtx.save();
    const shell = sceneCtx.createLinearGradient(bikeX + 82, bikeY + 8, bikeX + 318, bikeY + 118);
    shell.addColorStop(0, "#132231");
    shell.addColorStop(0.55, "#09141d");
    shell.addColorStop(1, "#152736");
    sceneCtx.fillStyle = shell;
    sceneCtx.beginPath();
    sceneCtx.moveTo(bikeX + 58, bikeY + 122);
    sceneCtx.quadraticCurveTo(bikeX + 74, bikeY + 88, bikeX + 98, bikeY + 74);
    sceneCtx.lineTo(bikeX + 224, bikeY + 54);
    sceneCtx.quadraticCurveTo(bikeX + 268, bikeY + 40, bikeX + 316, bikeY + 56);
    sceneCtx.lineTo(bikeX + 376, bikeY + 74);
    sceneCtx.quadraticCurveTo(bikeX + 406, bikeY + 82, bikeX + 416, bikeY + 96);
    sceneCtx.lineTo(bikeX + 420, bikeY + 112);
    sceneCtx.quadraticCurveTo(bikeX + 382, bikeY + 112, bikeX + 348, bikeY + 124);
    sceneCtx.lineTo(bikeX + 144, bikeY + 130);
    sceneCtx.quadraticCurveTo(bikeX + 84, bikeY + 132, bikeX + 58, bikeY + 122);
    sceneCtx.closePath();
    sceneCtx.fill();

    sceneCtx.lineWidth = 4;
    sceneCtx.strokeStyle = withAlpha(mode.accent, 0.86);
    sceneCtx.shadowBlur = 16;
    sceneCtx.shadowColor = mode.accent;
    sceneCtx.beginPath();
    sceneCtx.moveTo(bikeX + 100, bikeY + 82);
    sceneCtx.lineTo(bikeX + 218, bikeY + 64);
    sceneCtx.lineTo(bikeX + 332, bikeY + 74);
    sceneCtx.lineTo(bikeX + 402, bikeY + 98);
    sceneCtx.stroke();

    sceneCtx.strokeStyle = withAlpha(mode.highlight, 0.85);
    sceneCtx.lineWidth = 2;
    sceneCtx.beginPath();
    sceneCtx.moveTo(bikeX + 134, bikeY + 92);
    sceneCtx.lineTo(bikeX + 294, bikeY + 86);
    sceneCtx.stroke();
    sceneCtx.restore();

    sceneCtx.save();
    sceneCtx.strokeStyle = "#1a2c3d";
    sceneCtx.lineWidth = 10;
    sceneCtx.lineCap = "round";
    sceneCtx.beginPath();
    sceneCtx.moveTo(rearWheelX - 4, wheelY - 44);
    sceneCtx.lineTo(bikeX + 194, bikeY + 22);
    sceneCtx.lineTo(frontWheelX - 30, wheelY - 34);
    sceneCtx.stroke();

    sceneCtx.beginPath();
    sceneCtx.moveTo(bikeX + 194, bikeY + 22);
    sceneCtx.lineTo(bikeX + 232, bikeY - 20);
    sceneCtx.stroke();

    sceneCtx.beginPath();
    sceneCtx.moveTo(bikeX + 204, bikeY + 34);
    sceneCtx.lineTo(bikeX + 164, bikeY - 18);
    sceneCtx.stroke();

    sceneCtx.beginPath();
    sceneCtx.moveTo(bikeX + 234, bikeY + 36);
    sceneCtx.lineTo(bikeX + 258, bikeY + 92);
    sceneCtx.stroke();
    sceneCtx.restore();

    sceneCtx.save();
    sceneCtx.fillStyle = "#13212d";
    sceneCtx.beginPath();
    sceneCtx.arc(bikeX + 170, bikeY - 34, 28, 0, Math.PI * 2);
    sceneCtx.fill();
    sceneCtx.fillStyle = "#091118";
    sceneCtx.beginPath();
    sceneCtx.arc(bikeX + 170, bikeY - 34, 20, 0, Math.PI * 2);
    sceneCtx.fill();
    sceneCtx.fillStyle = withAlpha(mode.accent, 0.88);
    sceneCtx.beginPath();
    sceneCtx.arc(bikeX + 178, bikeY - 38, 7, 0, Math.PI * 2);
    sceneCtx.fill();

    sceneCtx.strokeStyle = "#1f3445";
    sceneCtx.lineWidth = 14;
    sceneCtx.lineCap = "round";
    sceneCtx.beginPath();
    sceneCtx.moveTo(bikeX + 170, bikeY - 10);
    sceneCtx.lineTo(bikeX + 170, bikeY + 38);
    sceneCtx.lineTo(bikeX + 222, bikeY + 48);
    sceneCtx.stroke();

    sceneCtx.beginPath();
    sceneCtx.moveTo(bikeX + 168, bikeY + 6);
    sceneCtx.lineTo(bikeX + 132, bikeY + 42);
    sceneCtx.stroke();

    sceneCtx.beginPath();
    sceneCtx.moveTo(bikeX + 220, bikeY + 48);
    sceneCtx.lineTo(bikeX + 284, bikeY + 28);
    sceneCtx.stroke();

    sceneCtx.beginPath();
    sceneCtx.moveTo(bikeX + 216, bikeY + 48);
    sceneCtx.lineTo(bikeX + 268, bikeY + 92);
    sceneCtx.stroke();

    sceneCtx.strokeStyle = withAlpha(mode.highlight, 0.82);
    sceneCtx.lineWidth = 4;
    sceneCtx.beginPath();
    sceneCtx.moveTo(bikeX + 168, bikeY + 18);
    sceneCtx.lineTo(bikeX + 168, bikeY + 42);
    sceneCtx.moveTo(bikeX + 154, bikeY + 18);
    sceneCtx.lineTo(bikeX + 182, bikeY + 18);
    sceneCtx.stroke();
    sceneCtx.restore();

    spawnSceneParticles(rearTrailX, bikeY + 44, mode);
}

function updateAndDrawSceneParticles() {
    sceneParticles = sceneParticles.filter((particle) => particle.life > 0);

    sceneParticles.forEach((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life -= 1;
        drawGlow(sceneCtx, particle.x, particle.y, 8, particle.color, Math.max(0.06, particle.life / 28));
    });
}

function drawSceneHud(mode) {
    sceneCtx.save();
    sceneCtx.fillStyle = withAlpha("#061018", 0.52);
    fillRoundedRect(sceneCtx, 28, 28, 220, 92, 16);
    fillRoundedRect(sceneCtx, 690, 410, 228, 94, 16);
    sceneCtx.strokeStyle = withAlpha(mode.accent, 0.34);
    sceneCtx.lineWidth = 2;
    strokeRoundedRect(sceneCtx, 28, 28, 220, 92, 16);
    strokeRoundedRect(sceneCtx, 690, 410, 228, 94, 16);

    sceneCtx.fillStyle = mode.highlight;
    sceneCtx.font = '700 20px "Orbitron"';
    sceneCtx.fillText("RIDER LOCK", 48, 58);
    sceneCtx.font = '600 16px "Orbitron"';
    sceneCtx.fillStyle = withAlpha(mode.accent, 0.95);
    sceneCtx.fillText("SPD 224 KPH", 48, 84);
    sceneCtx.fillText("TRACE 100%", 48, 106);

    sceneCtx.fillStyle = mode.highlight;
    sceneCtx.fillText("GRID CAM", 716, 442);
    sceneCtx.font = '600 15px "Orbitron"';
    sceneCtx.fillStyle = withAlpha(mode.accent, 0.88);
    sceneCtx.fillText("HUMAN + CYCLE", 716, 468);
    sceneCtx.fillText("LIVE RENDER", 716, 490);
    sceneCtx.restore();
}

function renderScene(time = 0) {
    const mode = sceneModes[activeMode];
    drawSceneBackground(mode, time);
    drawLightCycle(mode, time);
    updateAndDrawSceneParticles();
    drawSceneHud(mode);
    requestAnimationFrame(renderScene);
}

const directions = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
};

const leftTurn = {
    up: "left",
    left: "down",
    down: "right",
    right: "up"
};

const rightTurn = {
    up: "right",
    right: "down",
    down: "left",
    left: "up"
};

const arenaGrid = {
    cols: 40,
    rows: 40,
    cell: 12
};

arenaCanvas.width = arenaGrid.cols * arenaGrid.cell;
arenaCanvas.height = arenaGrid.rows * arenaGrid.cell;

let arenaState;
let arenaLastTick = 0;
let arenaAccumulator = 0;
let roundsWon = 0;

function makeCycle(id, x, y, dir, paletteKey) {
    return {
        id,
        x,
        y,
        dir,
        nextDir: dir,
        alive: true,
        paletteKey,
        path: [{ x, y }]
    };
}

function createArenaState(round) {
    const botCount = round >= 4 ? 3 : 2;
    const bots = [
        makeCycle("clu", 34, 8, "left", "enemy"),
        makeCycle("sark", 34, 31, "left", "secondary"),
        makeCycle("asher", 20, 4, "down", "highlight")
    ].slice(0, botCount);

    return {
        round,
        state: "running",
        player: makeCycle("player", 5, 20, "right", "accent"),
        bots,
        trails: new Map(),
        interval: Math.max(70, 118 - ((round - 1) * 6)),
        message: "Cut the lane cleanly and let the enemy programs run out of room.",
        stateLabel: "Run state: live",
        timer: 0
    };
}

function resetArena(fullReset = false) {
    if (fullReset) {
        roundsWon = 0;
        arenaState = createArenaState(1);
    } else {
        arenaState = createArenaState(arenaState ? arenaState.round : 1);
    }

    arenaAccumulator = 0;
    arenaLastTick = 0;
    syncArenaHud();
}

function cycleColor(mode, cycle) {
    if (cycle.paletteKey === "accent") {
        return mode.accent;
    }
    if (cycle.paletteKey === "secondary") {
        return mode.secondary;
    }
    if (cycle.paletteKey === "highlight") {
        return mode.highlight;
    }
    return mode.enemy;
}

function cellKey(x, y) {
    return `${x},${y}`;
}

function isOpposite(current, next) {
    return (current === "up" && next === "down")
        || (current === "down" && next === "up")
        || (current === "left" && next === "right")
        || (current === "right" && next === "left");
}

function applyDirection(cycle, direction) {
    if (!direction || isOpposite(cycle.dir, direction)) {
        return;
    }
    cycle.nextDir = direction;
}

function handlePlayerDirection(direction) {
    if (arenaState?.state !== "running") {
        return;
    }
    applyDirection(arenaState.player, direction);
}

document.addEventListener("keydown", (event) => {
    const direction = keyDirections[event.key.toLowerCase()];
    if (direction) {
        event.preventDefault();
        handlePlayerDirection(direction);
        return;
    }

    if (event.key.toLowerCase() === "r") {
        resetArena(true);
    }
});

controlButtons.forEach((button) => {
    const sendDirection = () => handlePlayerDirection(button.dataset.dir);
    button.addEventListener("click", sendDirection);
    button.addEventListener("touchstart", (event) => {
        event.preventDefault();
        sendDirection();
    }, { passive: false });
});

restartButton.addEventListener("click", () => {
    resetArena(true);
});

function isBlockedByTrail(x, y) {
    return x < 0
        || x >= arenaGrid.cols
        || y < 0
        || y >= arenaGrid.rows
        || arenaState.trails.has(cellKey(x, y));
}

function lookAhead(cycle, direction) {
    let distance = 0;
    let probeX = cycle.x;
    let probeY = cycle.y;

    while (distance < 14) {
        probeX += directions[direction].x;
        probeY += directions[direction].y;
        if (isBlockedByTrail(probeX, probeY)) {
            break;
        }
        distance += 1;
    }

    return distance;
}

function chooseBotDirection(bot) {
    const options = [bot.dir, leftTurn[bot.dir], rightTurn[bot.dir]]
        .map((direction) => ({
            direction,
            score: lookAhead(bot, direction) + (direction === bot.dir ? 1.4 : 0)
        }))
        .sort((first, second) => second.score - first.score);

    const best = options[0];
    const fallback = options[1];
    const selection = Math.random() > 0.86 && fallback && fallback.score > 4 ? fallback : best;
    bot.nextDir = selection.direction;
}

function planMoves() {
    const liveCycles = [arenaState.player, ...arenaState.bots].filter((cycle) => cycle.alive);
    liveCycles.forEach((cycle) => {
        if (cycle !== arenaState.player) {
            chooseBotDirection(cycle);
        }
        if (!isOpposite(cycle.dir, cycle.nextDir)) {
            cycle.dir = cycle.nextDir;
        }
    });

    return liveCycles.map((cycle) => {
        const delta = directions[cycle.dir];
        return {
            cycle,
            fromX: cycle.x,
            fromY: cycle.y,
            toX: cycle.x + delta.x,
            toY: cycle.y + delta.y,
            crashed: false
        };
    });
}

function detectCrashes(plans) {
    const targets = new Map();
    const occupiedHeads = new Map(plans.map((plan) => [cellKey(plan.fromX, plan.fromY), plan.cycle.id]));

    plans.forEach((plan) => {
        if (isBlockedByTrail(plan.toX, plan.toY)) {
            plan.crashed = true;
            return;
        }

        const targetKey = cellKey(plan.toX, plan.toY);
        const occupiedByHead = occupiedHeads.get(targetKey);
        if (occupiedByHead && occupiedByHead !== plan.cycle.id) {
            plan.crashed = true;
            return;
        }

        targets.set(targetKey, (targets.get(targetKey) || 0) + 1);
    });

    plans.forEach((plan, index) => {
        if (!plan.crashed && targets.get(cellKey(plan.toX, plan.toY)) > 1) {
            plan.crashed = true;
        }

        for (let compare = index + 1; compare < plans.length; compare += 1) {
            const other = plans[compare];
            const swapped = plan.toX === other.fromX
                && plan.toY === other.fromY
                && other.toX === plan.fromX
                && other.toY === plan.fromY;

            if (swapped) {
                plan.crashed = true;
                other.crashed = true;
            }
        }
    });
}

function applyMoves(plans) {
    plans.forEach((plan) => {
        arenaState.trails.set(cellKey(plan.fromX, plan.fromY), plan.cycle.paletteKey);
    });

    plans.forEach((plan) => {
        if (plan.crashed) {
            plan.cycle.alive = false;
            return;
        }

        plan.cycle.x = plan.toX;
        plan.cycle.y = plan.toY;
        plan.cycle.path.push({ x: plan.toX, y: plan.toY });
    });
}

function stepArena() {
    if (arenaState.state === "running") {
        const plans = planMoves();
        detectCrashes(plans);
        applyMoves(plans);

        if (!arenaState.player.alive) {
            arenaState.state = "crashed";
            arenaState.message = "You hit a solid lane. Head cells and fresh trail segments now collide correctly.";
            arenaState.stateLabel = "Run state: derezzed";
            syncArenaHud();
            return;
        }

        const liveBots = arenaState.bots.filter((bot) => bot.alive);
        if (liveBots.length === 0) {
            arenaState.state = "won";
            arenaState.timer = 960;
            roundsWon += 1;
            arenaState.message = "Arena cleared. The next round is loading with a little more speed.";
            arenaState.stateLabel = "Run state: arena secured";
            syncArenaHud();
            return;
        }
    }

    if (arenaState.state === "won") {
        arenaState.timer -= arenaState.interval;
        if (arenaState.timer <= 0) {
            arenaState = createArenaState(arenaState.round + 1);
            syncArenaHud();
        }
    }
}

function syncArenaHud() {
    const liveBots = arenaState.bots.filter((bot) => bot.alive).length;
    roundDisplay.textContent = String(arenaState.round);
    winDisplay.textContent = String(roundsWon);
    threatDisplay.textContent = String(liveBots);
    speedDisplay.textContent = `${188 + ((arenaState.round - 1) * 12)} kph`;
    statusLine.textContent = arenaState.message;
    runState.textContent = arenaState.stateLabel;
}

function cellCenter(value) {
    return (value * arenaGrid.cell) + (arenaGrid.cell / 2);
}

function drawArenaBackground(mode) {
    const gradient = arenaCtx.createLinearGradient(0, 0, 0, arenaCanvas.height);
    gradient.addColorStop(0, "#09111b");
    gradient.addColorStop(1, "#03060a");
    arenaCtx.fillStyle = gradient;
    arenaCtx.fillRect(0, 0, arenaCanvas.width, arenaCanvas.height);

    drawGlow(arenaCtx, arenaCanvas.width / 2, arenaCanvas.height / 2, 240, mode.accent, 0.08);
    drawGlow(arenaCtx, arenaCanvas.width / 2, arenaCanvas.height / 2, 148, mode.secondary, 0.06);

    arenaCtx.strokeStyle = withAlpha(mode.accent, 0.14);
    arenaCtx.lineWidth = 1;
    for (let x = 0; x <= arenaCanvas.width; x += arenaGrid.cell) {
        arenaCtx.beginPath();
        arenaCtx.moveTo(x, 0);
        arenaCtx.lineTo(x, arenaCanvas.height);
        arenaCtx.stroke();
    }
    for (let y = 0; y <= arenaCanvas.height; y += arenaGrid.cell) {
        arenaCtx.beginPath();
        arenaCtx.moveTo(0, y);
        arenaCtx.lineTo(arenaCanvas.width, y);
        arenaCtx.stroke();
    }

    arenaCtx.strokeStyle = withAlpha(mode.highlight, 0.2);
    arenaCtx.lineWidth = 2;
    arenaCtx.strokeRect(1, 1, arenaCanvas.width - 2, arenaCanvas.height - 2);
}

function drawTrailPath(mode, cycle) {
    const color = cycleColor(mode, cycle);
    const points = cycle.path.map((point) => ({
        x: cellCenter(point.x),
        y: cellCenter(point.y)
    }));

    if (points.length < 2) {
        return;
    }

    drawBeam(arenaCtx, points, color, arenaGrid.cell * 0.9, 18, 0.18);
    drawBeam(arenaCtx, points, color, arenaGrid.cell * 0.56, 10, 0.9);
    drawBeam(arenaCtx, points, "#ffffff", arenaGrid.cell * 0.16, 6, 0.65);
}

function drawCycleHead(mode, cycle) {
    if (!cycle.alive) {
        return;
    }

    const color = cycleColor(mode, cycle);
    const centerX = cellCenter(cycle.x);
    const centerY = cellCenter(cycle.y);
    const length = arenaGrid.cell * 0.92;
    const width = arenaGrid.cell * 0.6;

    arenaCtx.save();
    arenaCtx.translate(centerX, centerY);

    const angle = cycle.dir === "up"
        ? -Math.PI / 2
        : cycle.dir === "down"
            ? Math.PI / 2
            : cycle.dir === "left"
                ? Math.PI
                : 0;
    arenaCtx.rotate(angle);

    drawGlow(arenaCtx, 0, 0, arenaGrid.cell * 1.3, color, 0.2);

    arenaCtx.fillStyle = "#0d1520";
    arenaCtx.beginPath();
    arenaCtx.moveTo(-length * 0.55, -width * 0.6);
    arenaCtx.lineTo(length * 0.2, -width * 0.6);
    arenaCtx.quadraticCurveTo(length * 0.62, 0, length * 0.2, width * 0.6);
    arenaCtx.lineTo(-length * 0.55, width * 0.6);
    arenaCtx.closePath();
    arenaCtx.fill();

    arenaCtx.strokeStyle = color;
    arenaCtx.lineWidth = 2;
    arenaCtx.shadowBlur = 10;
    arenaCtx.shadowColor = color;
    arenaCtx.beginPath();
    arenaCtx.moveTo(-length * 0.48, -width * 0.42);
    arenaCtx.lineTo(length * 0.1, -width * 0.42);
    arenaCtx.quadraticCurveTo(length * 0.42, 0, length * 0.1, width * 0.42);
    arenaCtx.lineTo(-length * 0.48, width * 0.42);
    arenaCtx.stroke();

    arenaCtx.strokeStyle = withAlpha("#ffffff", 0.82);
    arenaCtx.lineWidth = 1.5;
    arenaCtx.beginPath();
    arenaCtx.moveTo(-length * 0.16, 0);
    arenaCtx.lineTo(length * 0.18, 0);
    arenaCtx.stroke();
    arenaCtx.restore();
}

function renderArenaOverlay(mode) {
    if (arenaState.state === "running") {
        return;
    }

    arenaCtx.fillStyle = withAlpha("#020408", 0.68);
    fillRoundedRect(arenaCtx, 56, 186, arenaCanvas.width - 112, 108, 22);
    arenaCtx.strokeStyle = withAlpha(mode.accent, 0.42);
    arenaCtx.lineWidth = 2;
    strokeRoundedRect(arenaCtx, 56, 186, arenaCanvas.width - 112, 108, 22);

    arenaCtx.fillStyle = mode.highlight;
    arenaCtx.font = '700 26px "Orbitron"';
    arenaCtx.fillText(arenaState.state === "won" ? "ARENA CLEAR" : "RIDER DOWN", 126, 228);
    arenaCtx.font = '600 14px "Orbitron"';
    arenaCtx.fillStyle = withAlpha(mode.accent, 0.9);
    arenaCtx.fillText(arenaState.state === "won" ? "NEXT ROUND LOADING" : "PRESS R OR RESTART", 120, 258);
}

function renderArena() {
    const mode = sceneModes[activeMode];
    drawArenaBackground(mode);

    [arenaState.player, ...arenaState.bots].forEach((cycle) => {
        drawTrailPath(mode, cycle);
    });

    drawCycleHead(mode, arenaState.player);
    arenaState.bots.forEach((bot) => {
        drawCycleHead(mode, bot);
    });

    renderArenaOverlay(mode);
}

function arenaLoop(timestamp) {
    if (!arenaLastTick) {
        arenaLastTick = timestamp;
    }

    const delta = timestamp - arenaLastTick;
    arenaLastTick = timestamp;
    arenaAccumulator += delta;

    while (arenaAccumulator >= arenaState.interval) {
        stepArena();
        arenaAccumulator -= arenaState.interval;
    }

    syncArenaHud();
    renderArena();
    requestAnimationFrame(arenaLoop);
}

setMode(activeMode);
resetArena(true);
requestAnimationFrame(renderScene);
requestAnimationFrame(arenaLoop);
