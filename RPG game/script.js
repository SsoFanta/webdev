"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const carListEl = document.getElementById("carList");
const carNameEl = document.getElementById("carName");
const speedReadoutEl = document.getElementById("speedReadout");
const gearReadoutEl = document.getElementById("gearReadout");
const lapReadoutEl = document.getElementById("lapReadout");
const throttleBarEl = document.getElementById("throttleBar");
const brakeBarEl = document.getElementById("brakeBar");
const slipBarEl = document.getElementById("slipBar");
const sessionStatsEl = document.getElementById("sessionStats");
const driftStatsEl = document.getElementById("driftStats");
const messageEl = document.getElementById("message");

const controls = {};
const pressed = {};

const WORLD_W = canvas.width;
const WORLD_H = canvas.height;
const ROAD_WIDTH = 110;

const centerline = [
  { x: 190, y: 130 },
  { x: 500, y: 100 },
  { x: 910, y: 135 },
  { x: 1050, y: 305 },
  { x: 980, y: 560 },
  { x: 650, y: 610 },
  { x: 350, y: 590 },
  { x: 150, y: 460 },
  { x: 130, y: 270 }
];

const cars = [
  {
    id: "r34",
    name: "Nissan Skyline GT-R R34",
    note: "AWD grip-biased setup",
    sprite: "coupe-box",
    colors: { body: "#5479b8", roof: "#2f3f59", hood: "#223044", glass: "#90b8d8", accent: "#dbe9ff" },
    wheelbase: 2.66,
    mass: 1560,
    engineForce: 12500,
    brakeForce: 12200,
    drag: 0.53,
    rolling: 13.5,
    frontGrip: 19500,
    rearGrip: 18000,
    steerMax: 0.57,
    yawResponse: 7.4,
    maxSpeed: 86
  },
  {
    id: "supra",
    name: "Toyota Supra JZA80",
    note: "High torque RWD",
    sprite: "coupe-long",
    colors: { body: "#d57f29", roof: "#4a3322", hood: "#2a1a11", glass: "#9cc1dd", accent: "#ffe4b5" },
    wheelbase: 2.55,
    mass: 1490,
    engineForce: 13300,
    brakeForce: 11800,
    drag: 0.56,
    rolling: 12.8,
    frontGrip: 17200,
    rearGrip: 15700,
    steerMax: 0.55,
    yawResponse: 6.8,
    maxSpeed: 89
  },
  {
    id: "fd3s",
    name: "Mazda RX-7 FD3S",
    note: "Lightweight rotation",
    sprite: "coupe-round",
    colors: { body: "#c23d41", roof: "#3d1a20", hood: "#2b1014", glass: "#8fb5cf", accent: "#ffd0d0" },
    wheelbase: 2.43,
    mass: 1280,
    engineForce: 12000,
    brakeForce: 11000,
    drag: 0.49,
    rolling: 11.5,
    frontGrip: 17800,
    rearGrip: 15000,
    steerMax: 0.62,
    yawResponse: 8.2,
    maxSpeed: 87
  },
  {
    id: "s15",
    name: "Nissan Silvia Spec-R S15",
    note: "Classic drift balance",
    sprite: "coupe-narrow",
    colors: { body: "#58a161", roof: "#243b28", hood: "#162617", glass: "#8ab3a0", accent: "#d7ffe2" },
    wheelbase: 2.52,
    mass: 1240,
    engineForce: 11700,
    brakeForce: 10400,
    drag: 0.47,
    rolling: 10.9,
    frontGrip: 16900,
    rearGrip: 14500,
    steerMax: 0.63,
    yawResponse: 8.5,
    maxSpeed: 84
  },
  {
    id: "ae86",
    name: "Toyota AE86 Trueno",
    note: "Low power, high precision",
    sprite: "hatch-compact",
    colors: { body: "#efefef", roof: "#2a2a2a", hood: "#131313", glass: "#9fb8c5", accent: "#ffd669" },
    wheelbase: 2.40,
    mass: 980,
    engineForce: 9100,
    brakeForce: 9300,
    drag: 0.43,
    rolling: 9.6,
    frontGrip: 16000,
    rearGrip: 13900,
    steerMax: 0.69,
    yawResponse: 9.0,
    maxSpeed: 75
  }
];

const state = {
  selectedCar: cars[0],
  player: {
    x: 188,
    y: 180,
    angle: -Math.PI * 0.18,
    vx: 0,
    vy: 0,
    yawRate: 0,
    w: 34,
    h: 62
  },
  time: 0,
  totalScore: 0,
  driftScore: 0,
  driftTimer: 0,
  driftCombo: 1,
  isDrifting: false,
  laps: 0,
  lapClock: 0,
  bestLap: null,
  checkpointArmed: false,
  prev: { x: 188, y: 180 },
  skidmarks: []
};

const finishLine = { ax: 220, ay: 70, bx: 220, by: 200 };
const checkpointLine = { ax: 920, ay: 500, bx: 920, by: 680 };

function setMessage(text) {
  messageEl.textContent = text;
}

function vecSub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function distToSegment(p, a, b) {
  const ab = vecSub(b, a);
  const ap = vecSub(p, a);
  const abLen2 = Math.max(0.0001, dot(ab, ab));
  const t = Math.max(0, Math.min(1, dot(ap, ab) / abLen2));
  const proj = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}

function roadDistance(x, y) {
  const p = { x, y };
  let best = Infinity;
  for (let i = 0; i < centerline.length; i += 1) {
    const a = centerline[i];
    const b = centerline[(i + 1) % centerline.length];
    best = Math.min(best, distToSegment(p, a, b));
  }
  return best;
}

function onRoad(x, y) {
  return roadDistance(x, y) <= ROAD_WIDTH * 0.5;
}

function resetCar() {
  const p = state.player;
  p.x = 188;
  p.y = 180;
  p.vx = 0;
  p.vy = 0;
  p.angle = -Math.PI * 0.18;
  p.yawRate = 0;
  state.driftScore = 0;
  state.driftTimer = 0;
  state.driftCombo = 1;
  state.isDrifting = false;
  setMessage("Car reset on grid.");
}

function selectCar(index) {
  state.selectedCar = cars[index];
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.yawRate = 0;
  state.driftScore = 0;
  state.driftTimer = 0;
  state.driftCombo = 1;
  setMessage(`${cars[index].name} selected.`);
  renderGarage();
}

function renderGarage() {
  carListEl.innerHTML = "";
  cars.forEach((car, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `car-btn ${state.selectedCar.id === car.id ? "active" : ""}`;
    btn.innerHTML = `<strong>${car.name}</strong><br><small>${car.note}</small>`;
    btn.addEventListener("click", () => selectCar(i));
    carListEl.appendChild(btn);
  });
}

function lineSide(p, a, b) {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

function crossedLine(prev, curr, line) {
  const a = { x: line.ax, y: line.ay };
  const b = { x: line.bx, y: line.by };
  const s1 = lineSide(prev, a, b);
  const s2 = lineSide(curr, a, b);
  if (s1 === 0 || s2 === 0) return false;
  return (s1 < 0 && s2 > 0) || (s1 > 0 && s2 < 0);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function physicsStep(dt) {
  const car = state.selectedCar;
  const p = state.player;

  const throttle = controls.w || controls.ArrowUp ? 1 : 0;
  const braking = controls.s || controls.ArrowDown ? 1 : 0;
  const handbrake = controls[" "] ? 1 : 0;
  const steerInput = (controls.a || controls.ArrowLeft ? -1 : 0) + (controls.d || controls.ArrowRight ? 1 : 0);

  const cosA = Math.cos(p.angle);
  const sinA = Math.sin(p.angle);
  const forward = { x: cosA, y: sinA };
  const right = { x: -sinA, y: cosA };

  const vLong = p.vx * forward.x + p.vy * forward.y;
  const vLat = p.vx * right.x + p.vy * right.y;
  const speed = Math.hypot(p.vx, p.vy);

  const roadGripFactor = onRoad(p.x, p.y) ? 1 : 0.42;
  const steer = steerInput * car.steerMax * clamp(1.1 - speed / 95, 0.25, 1.1);

  const tractionCut = clamp(1 - Math.abs(vLong) / car.maxSpeed, 0.18, 1);
  const engine = throttle * car.engineForce * tractionCut;
  const brake = braking * car.brakeForce * Math.sign(vLong || 1);

  const drag = car.drag * vLong * Math.abs(vLong);
  const rolling = car.rolling * vLong;

  const frontGrip = car.frontGrip * roadGripFactor;
  const rearGripBase = car.rearGrip * roadGripFactor;
  const rearGrip = rearGripBase * (handbrake ? 0.36 : 1);
  const lateralGrip = (frontGrip + rearGrip) * 0.5;

  const slipAssist = steer * Math.abs(vLong) * (handbrake ? 0.95 : 0.6);
  const latForce = -(vLat - slipAssist) * lateralGrip;

  const accLong = (engine - brake - drag - rolling) / car.mass;
  const accLat = latForce / car.mass;

  const ax = forward.x * accLong + right.x * accLat;
  const ay = forward.y * accLong + right.y * accLat;

  p.vx += ax * dt;
  p.vy += ay * dt;

  if (!onRoad(p.x, p.y)) {
    p.vx *= Math.pow(0.983, dt * 60);
    p.vy *= Math.pow(0.983, dt * 60);
  }

  const desiredYawRate = (vLong / Math.max(1.2, car.wheelbase)) * Math.tan(steer);
  const yawGrip = handbrake ? 0.55 : 1;
  p.yawRate += (desiredYawRate - p.yawRate) * car.yawResponse * yawGrip * dt;
  p.yawRate *= Math.pow(0.92, dt * 60);
  p.angle += p.yawRate * dt;

  state.prev.x = p.x;
  state.prev.y = p.y;
  p.x += p.vx * dt * 60;
  p.y += p.vy * dt * 60;

  p.x = clamp(p.x, 20, WORLD_W - 20);
  p.y = clamp(p.y, 20, WORLD_H - 20);

  if (pressed.r) resetCar();

  const slipDeg = Math.abs(Math.atan2(vLat, Math.max(2.5, Math.abs(vLong))) * 57.2958);
  const driftActive = onRoad(p.x, p.y) && speed > 10 && slipDeg > 12 && throttle > 0;

  if (driftActive) {
    state.isDrifting = true;
    state.driftTimer += dt;
    state.driftCombo = 1 + Math.min(3.5, state.driftTimer * 0.5);
    state.driftScore += slipDeg * dt * 9.5 * state.driftCombo;

    if (slipDeg > 16 && state.skidmarks.length < 900) {
      state.skidmarks.push({ x: p.x - right.x * 10, y: p.y - right.y * 17, life: 1 });
      state.skidmarks.push({ x: p.x + right.x * 10, y: p.y + right.y * 17, life: 1 });
    }
  } else {
    if (state.isDrifting && state.driftScore > 10) {
      const banked = Math.round(state.driftScore);
      state.totalScore += banked;
      setMessage(`Drift banked: ${banked} pts`);
    }
    state.isDrifting = false;
    state.driftScore = 0;
    state.driftTimer = 0;
    state.driftCombo = 1;
  }

  for (let i = state.skidmarks.length - 1; i >= 0; i -= 1) {
    state.skidmarks[i].life -= dt * 0.2;
    if (state.skidmarks[i].life <= 0) state.skidmarks.splice(i, 1);
  }

  const crossedCheckpoint = crossedLine(state.prev, { x: p.x, y: p.y }, checkpointLine);
  if (crossedCheckpoint) state.checkpointArmed = true;

  const crossedFinish = crossedLine(state.prev, { x: p.x, y: p.y }, finishLine);
  if (crossedFinish && state.checkpointArmed) {
    state.laps += 1;
    lapReadoutEl.textContent = `${state.laps}`;
    if (state.lapClock > 3) {
      state.bestLap = state.bestLap === null ? state.lapClock : Math.min(state.bestLap, state.lapClock);
      setMessage(`Lap ${state.laps} complete: ${state.lapClock.toFixed(2)}s`);
    }
    state.lapClock = 0;
    state.checkpointArmed = false;
  }

  state.time += dt;
  state.lapClock += dt;

  updateHud({ speed, throttle, braking, slipDeg, vLong });
}

function drawTrack() {
  ctx.fillStyle = "#0e1621";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  ctx.strokeStyle = "#203045";
  ctx.lineWidth = 1;
  for (let x = 0; x < WORLD_W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD_H);
    ctx.stroke();
  }
  for (let y = 0; y < WORLD_H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_W, y);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(centerline[0].x, centerline[0].y);
  for (let i = 1; i < centerline.length; i += 1) {
    ctx.lineTo(centerline[i].x, centerline[i].y);
  }
  ctx.closePath();

  ctx.strokeStyle = "#4d565f";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = ROAD_WIDTH + 12;
  ctx.stroke();

  ctx.strokeStyle = "#808a95";
  ctx.lineWidth = ROAD_WIDTH;
  ctx.stroke();

  ctx.setLineDash([13, 12]);
  ctx.strokeStyle = "rgba(236,242,248,0.65)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "#f5f5f5";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(finishLine.ax, finishLine.ay);
  ctx.lineTo(finishLine.bx, finishLine.by);
  ctx.stroke();

  ctx.strokeStyle = "#ffd166";
  ctx.beginPath();
  ctx.moveTo(checkpointLine.ax, checkpointLine.ay);
  ctx.lineTo(checkpointLine.bx, checkpointLine.by);
  ctx.stroke();
}

function drawSkidmarks() {
  for (const mark of state.skidmarks) {
    ctx.fillStyle = `rgba(20,20,20,${0.38 * mark.life})`;
    ctx.fillRect(mark.x - 2, mark.y - 2, 4, 4);
  }
}

function drawCarSprite() {
  const car = state.selectedCar;
  const p = state.player;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);

  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(-14, -26, 28, 52);

  if (car.sprite === "coupe-box") {
    ctx.fillStyle = car.colors.body;
    ctx.fillRect(-14, -29, 28, 58);
    ctx.fillStyle = car.colors.roof;
    ctx.fillRect(-11, -10, 22, 20);
    ctx.fillStyle = car.colors.hood;
    ctx.fillRect(-10, -29, 20, 12);
  } else if (car.sprite === "coupe-long") {
    ctx.fillStyle = car.colors.body;
    ctx.fillRect(-13, -31, 26, 62);
    ctx.fillStyle = car.colors.roof;
    ctx.fillRect(-10, -9, 20, 18);
    ctx.fillStyle = car.colors.hood;
    ctx.fillRect(-8, -31, 16, 13);
  } else if (car.sprite === "coupe-round") {
    ctx.fillStyle = car.colors.body;
    ctx.beginPath();
    ctx.roundRect(-14, -30, 28, 60, 8);
    ctx.fill();
    ctx.fillStyle = car.colors.roof;
    ctx.fillRect(-10, -10, 20, 21);
  } else if (car.sprite === "coupe-narrow") {
    ctx.fillStyle = car.colors.body;
    ctx.fillRect(-12, -30, 24, 60);
    ctx.fillStyle = car.colors.roof;
    ctx.fillRect(-9, -11, 18, 22);
    ctx.fillStyle = car.colors.hood;
    ctx.fillRect(-8, -30, 16, 12);
  } else {
    ctx.fillStyle = car.colors.body;
    ctx.fillRect(-12, -27, 24, 54);
    ctx.fillStyle = car.colors.roof;
    ctx.fillRect(-8, -9, 16, 18);
    ctx.fillStyle = car.colors.hood;
    ctx.fillRect(-8, -27, 16, 10);
  }

  ctx.fillStyle = car.colors.glass;
  ctx.fillRect(-8, -18, 16, 9);
  ctx.fillRect(-8, 8, 16, 9);

  ctx.fillStyle = "#101317";
  ctx.fillRect(-16, -24, 4, 12);
  ctx.fillRect(12, -24, 4, 12);
  ctx.fillRect(-16, 12, 4, 12);
  ctx.fillRect(12, 12, 4, 12);

  ctx.fillStyle = car.colors.accent;
  ctx.fillRect(-10, -31, 20, 2);
  ctx.fillRect(-10, 29, 20, 2);

  ctx.restore();
}

function updateHud(info) {
  const speedMph = Math.max(0, info.speed * 1.95);
  carNameEl.textContent = state.selectedCar.name;
  speedReadoutEl.textContent = `${speedMph.toFixed(0)} mph`;

  let gear = "N";
  if (info.vLong > 1.5) {
    if (speedMph < 20) gear = "1";
    else if (speedMph < 36) gear = "2";
    else if (speedMph < 52) gear = "3";
    else if (speedMph < 68) gear = "4";
    else gear = "5";
  } else if (info.vLong < -1.5) {
    gear = "R";
  }
  gearReadoutEl.textContent = gear;

  throttleBarEl.style.width = `${info.throttle * 100}%`;
  brakeBarEl.style.width = `${info.braking * 100}%`;
  slipBarEl.style.width = `${clamp(info.slipDeg / 45, 0, 1) * 100}%`;

  const bestLapText = state.bestLap === null ? "--.--" : state.bestLap.toFixed(2);
  sessionStatsEl.textContent = `Score ${state.totalScore} | Best Lap ${bestLapText}s`;

  if (state.isDrifting) {
    driftStatsEl.textContent = `Drifting: ${Math.round(state.driftScore)} pts x${state.driftCombo.toFixed(1)}`;
  } else {
    driftStatsEl.textContent = "No drift chain";
  }
}

function tick(dt) {
  physicsStep(dt);
  drawTrack();
  drawSkidmarks();
  drawCarSprite();
  Object.keys(pressed).forEach((k) => (pressed[k] = false));
}

let last = performance.now();
function frame(ts) {
  const dt = Math.min(0.033, (ts - last) / 1000);
  last = ts;
  tick(dt);
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "r", "w", "a", "s", "d"].includes(key)) {
    e.preventDefault();
  }
  if (!controls[key]) pressed[key] = true;
  controls[key] = true;
});

window.addEventListener("keyup", (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  controls[key] = false;
});

function start() {
  renderGarage();
  lapReadoutEl.textContent = "0";
  setMessage("Drive a clean lap, then drift for points.");
  requestAnimationFrame(frame);
}

start();
