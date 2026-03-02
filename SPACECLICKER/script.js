const SAVE_KEY = "nebulaForgeSave";
const OFFLINE_CAP_SECONDS = 8 * 60 * 60;
const COMBO_DECAY_SECONDS = 2.2;
const PRESTIGE_BASE = 1_000_000;

const state = {
  stardust: 0,
  totalHarvested: 0,
  lifetimeHarvested: 0,
  clickPower: 1,
  manualClicks: 0,
  buildings: {},
  researchBought: {},
  unlockedMilestones: {},
  lastTick: Date.now(),
  lastSaveAt: Date.now(),
  combo: 0,
  comboUntil: 0,
  critChance: 0.05,
  buyMode: "1",
  prestigePoints: 0,
  totalRebirths: 0
};

const BUILDINGS = [
  { id: "probe", name: "Mining Probe", baseCost: 15, baseSps: 0.2, desc: "Tiny drones that scrape cosmic dust." },
  { id: "satellite", name: "Solar Satellite", baseCost: 80, baseSps: 1, desc: "Captures stellar wind into storage." },
  { id: "station", name: "Orbital Refinery", baseCost: 400, baseSps: 4.8, desc: "Refines stardust into dense fuel." },
  { id: "moonlab", name: "Moon Lab", baseCost: 1800, baseSps: 18, desc: "Automates high precision extraction." },
  { id: "carrier", name: "Nebula Carrier", baseCost: 8500, baseSps: 72, desc: "Harvest fleets in remote nebulae." },
  { id: "ringworld", name: "Ringworld Segment", baseCost: 42000, baseSps: 290, desc: "Industrialized megastructure output." },
  { id: "dyson", name: "Dyson Petal", baseCost: 210000, baseSps: 1200, desc: "Captures star-scale energy flows." },
  { id: "rift", name: "Dark Rift Harvester", baseCost: 1200000, baseSps: 5200, desc: "Converts exotic matter into dust." },
  { id: "citadel", name: "Celestial Citadel", baseCost: 7500000, baseSps: 23000, desc: "An empire-grade extraction command." }
];

const RESEARCH = [
  { id: "gloves", name: "Photon Gloves", cost: 120, desc: "Double click power.", onBuy: () => (state.clickPower *= 2) },
  { id: "targeting", name: "Stellar Targeting AI", cost: 900, desc: "+3 click power per building tier unlocked.", onBuy: () => (state.clickPower += 3 * unlockedBuildingTiers()) },
  { id: "reactor", name: "Fusion Reactor Lattice", cost: 6500, desc: "All production +25%.", multiplier: 1.25 },
  { id: "nanites", name: "Nebula Nanites", cost: 36000, desc: "Mining Probes and Satellites x4.", buildingMult: { probe: 4, satellite: 4 } },
  { id: "chrono", name: "Chrono Compressors", cost: 220000, desc: "All production +60%.", multiplier: 1.6 },
  { id: "overmind", name: "Overmind Doctrine", cost: 980000, desc: "Click power gains 1% of SPS.", onBuy: () => (state.clickPower += getSps() * 0.01) },
  { id: "singularity", name: "Pocket Singularity", cost: 5400000, desc: "All production +120%.", multiplier: 2.2 }
];

const MILESTONES = [
  { id: "m1", text: "Harvest 1,000 stardust.", rewardText: "+40 stardust and +0.25 click power.", check: () => state.totalHarvested >= 1000, onUnlock: () => { state.stardust += 40; state.clickPower += 0.25; } },
  { id: "m2", text: "Reach 100 stardust per second.", rewardText: "+5% crit chance.", check: () => getSps() >= 100, onUnlock: () => { state.critChance += 0.05; } },
  { id: "m3", text: "Build 50 total structures.", rewardText: "+10% all production.", check: () => totalBuildingsOwned() >= 50, onUnlock: () => { state.researchBought.milestoneBoost1 = true; } },
  { id: "m4", text: "Harvest 1,000,000 stardust.", rewardText: "+15 click power.", check: () => state.totalHarvested >= 1000000, onUnlock: () => { state.clickPower += 15; } },
  { id: "m5", text: "Reach 10,000 stardust per second.", rewardText: "+15% crit chance.", check: () => getSps() >= 10000, onUnlock: () => { state.critChance += 0.15; } },
  { id: "m6", text: "Establish a Celestial Citadel.", rewardText: "+20% all production.", check: () => (state.buildings.citadel || 0) >= 1, onUnlock: () => { state.researchBought.milestoneBoost2 = true; } }
];

const stardustEl = document.getElementById("stardust");
const spsEl = document.getElementById("sps");
const totalEl = document.getElementById("total");
const clickPowerText = document.getElementById("clickPowerText");
const comboText = document.getElementById("comboText");
const critText = document.getElementById("critText");
const echoesOwnedEl = document.getElementById("echoesOwned");
const echoesGainEl = document.getElementById("echoesGain");
const echoBoostText = document.getElementById("echoBoostText");
const rebirthBtn = document.getElementById("rebirthBtn");
const flashEl = document.getElementById("eventFlash");
const floatLayer = document.getElementById("floatLayer");
const buildingsEl = document.getElementById("buildings");
const researchEl = document.getElementById("research");
const milestonesEl = document.getElementById("milestones");
const template = document.getElementById("shopItemTemplate");
const coreButton = document.getElementById("coreButton");
let hoveredShopItem = null;

function formatNumber(num) {
  if (num < 1000) return num.toFixed(num < 10 ? 2 : 1).replace(/\.0$/, "");
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(num);
}

function prestigeGainFromHarvested(harvested) {
  if (harvested < PRESTIGE_BASE) return 0;
  return Math.floor(Math.sqrt(harvested / PRESTIGE_BASE));
}

function currentPrestigeGain() {
  return prestigeGainFromHarvested(state.totalHarvested);
}

function prestigeSpsMultiplier() {
  return 1 + state.prestigePoints * 0.02;
}

function prestigeClickMultiplier() {
  return 1 + state.prestigePoints * 0.01;
}

function getBuildingCost(building, ownedOverride) {
  const owned = ownedOverride === undefined ? state.buildings[building.id] || 0 : ownedOverride;
  return Math.floor(building.baseCost * Math.pow(1.15, owned));
}

function getBulkCost(building, amount) {
  let owned = state.buildings[building.id] || 0;
  let cost = 0;
  for (let i = 0; i < amount; i += 1) {
    cost += getBuildingCost(building, owned + i);
  }
  return Math.floor(cost);
}

function getMaxAffordable(building) {
  let dust = state.stardust;
  let owned = state.buildings[building.id] || 0;
  let bought = 0;
  while (true) {
    const cost = getBuildingCost(building, owned + bought);
    if (dust < cost) break;
    dust -= cost;
    bought += 1;
    if (bought > 5000) break;
  }
  return bought;
}

function totalBuildingsOwned() {
  return Object.values(state.buildings).reduce((a, b) => a + b, 0);
}

function unlockedBuildingTiers() {
  return BUILDINGS.filter((b) => (state.buildings[b.id] || 0) > 0).length;
}

function comboMultiplier(now) {
  if (now > state.comboUntil) return 1;
  return Math.min(3, 1 + state.combo * 0.04);
}

function getSps() {
  let total = 0;
  for (const b of BUILDINGS) {
    const owned = state.buildings[b.id] || 0;
    if (!owned) continue;

    let value = b.baseSps;
    for (const r of RESEARCH) {
      if (state.researchBought[r.id] && r.buildingMult && r.buildingMult[b.id]) {
        value *= r.buildingMult[b.id];
      }
    }
    total += owned * value;
  }

  for (const r of RESEARCH) {
    if (state.researchBought[r.id] && r.multiplier) total *= r.multiplier;
  }

  if (state.researchBought.milestoneBoost1) total *= 1.1;
  if (state.researchBought.milestoneBoost2) total *= 1.2;
  total *= prestigeSpsMultiplier();
  return total;
}

function harvest(amount) {
  state.stardust += amount;
  state.totalHarvested += amount;
  state.lifetimeHarvested += amount;
}

function purchaseBuilding(building) {
  let amount = 1;
  if (state.buyMode === "10") amount = 10;
  if (state.buyMode === "max") amount = getMaxAffordable(building);
  if (amount < 1) return false;

  const cost = getBulkCost(building, amount);
  if (state.stardust < cost) return false;

  state.stardust -= cost;
  state.buildings[building.id] = (state.buildings[building.id] || 0) + amount;
  return true;
}

function setHoveredItem(node) {
  if (hoveredShopItem && hoveredShopItem !== node) hoveredShopItem.classList.remove("hover-armed");
  hoveredShopItem = node;
  if (hoveredShopItem) hoveredShopItem.classList.add("hover-armed");
}

function clearHoveredItem(node) {
  if (hoveredShopItem !== node) return;
  hoveredShopItem.classList.remove("hover-armed");
  hoveredShopItem = null;
}

function triggerFlash(kind) {
  flashEl.classList.remove("milestone", "purchase", "rebirth", "show");
  flashEl.classList.add(kind);
  void flashEl.offsetWidth;
  flashEl.classList.add("show");
}

function pulsePanel(node) {
  node.classList.remove("impact");
  void node.offsetWidth;
  node.classList.add("impact");
}

function spawnFloatingText(value, crit, label = "") {
  const el = document.createElement("span");
  el.className = crit ? "float-text crit" : "float-text";
  const amountText = value > 0 ? `+${formatNumber(value)}` : "";
  el.textContent = label ? `${label} ${amountText}`.trim() : amountText;
  const x = 35 + Math.random() * 30;
  const y = 45 + Math.random() * 16;
  el.style.left = `${x}%`;
  el.style.top = `${y}%`;
  floatLayer.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

function applyMilestones() {
  let unlockedAny = false;
  for (const m of MILESTONES) {
    if (state.unlockedMilestones[m.id]) continue;
    if (!m.check()) continue;
    state.unlockedMilestones[m.id] = true;
    if (m.onUnlock) m.onUnlock();
    unlockedAny = true;
  }
  if (unlockedAny) {
    triggerFlash("milestone");
    pulsePanel(milestonesEl.closest(".panel"));
  }
}

function nextMilestone() {
  return MILESTONES.find((m) => !state.unlockedMilestones[m.id]) || null;
}

function renderBuildings() {
  buildingsEl.innerHTML = "";

  for (const b of BUILDINGS) {
    const node = template.content.firstElementChild.cloneNode(true);
    const owned = state.buildings[b.id] || 0;

    const singleCost = getBuildingCost(b);
    let countText = "x1";
    let activeCost = singleCost;
    if (state.buyMode === "10") {
      countText = "x10";
      activeCost = getBulkCost(b, 10);
    } else if (state.buyMode === "max") {
      const maxAffordable = getMaxAffordable(b);
      countText = `x${maxAffordable}`;
      activeCost = maxAffordable > 0 ? getBulkCost(b, maxAffordable) : singleCost;
    }

    node.querySelector("h3").textContent = b.name;
    node.querySelector(".desc").textContent = `${b.desc} (+${formatNumber(b.baseSps)} / sec each)`;
    node.querySelector(".owned").textContent = `Owned: ${owned} | Buy ${countText}`;
    node.querySelector(".cost").textContent = formatNumber(activeCost);
    node.disabled = state.stardust < activeCost || (state.buyMode === "max" && getMaxAffordable(b) === 0);

    if (state.stardust >= activeCost) node.classList.add("affordable");
    node.addEventListener("mouseenter", () => setHoveredItem(node));
    node.addEventListener("mouseleave", () => clearHoveredItem(node));
    node.addEventListener("click", () => {
      if (!purchaseBuilding(b)) return;
      triggerFlash("purchase");
      pulsePanel(node);
      render();
    });
    buildingsEl.appendChild(node);
  }
}

function renderResearch() {
  researchEl.innerHTML = "";
  for (const r of RESEARCH) {
    const node = template.content.firstElementChild.cloneNode(true);
    const bought = !!state.researchBought[r.id];
    node.querySelector("h3").textContent = r.name;
    node.querySelector(".desc").textContent = r.desc;
    node.querySelector(".owned").textContent = bought ? "Researched" : "Available";
    node.querySelector(".cost").textContent = formatNumber(r.cost);
    node.disabled = bought || state.stardust < r.cost;
    if (!bought && state.stardust >= r.cost) node.classList.add("affordable");

    node.addEventListener("mouseenter", () => setHoveredItem(node));
    node.addEventListener("mouseleave", () => clearHoveredItem(node));
    node.addEventListener("click", () => {
      if (bought || state.stardust < r.cost) return;
      state.stardust -= r.cost;
      state.researchBought[r.id] = true;
      if (r.onBuy) r.onBuy();
      triggerFlash("purchase");
      pulsePanel(node);
      render();
    });
    researchEl.appendChild(node);
  }
}

function renderMilestones() {
  milestonesEl.innerHTML = "";
  const next = nextMilestone();
  if (next) {
    const nextItem = document.createElement("li");
    nextItem.classList.add("next-goal");
    nextItem.textContent = `Next goal: ${next.text} Reward: ${next.rewardText}`;
    milestonesEl.appendChild(nextItem);
  }

  for (const m of MILESTONES) {
    const item = document.createElement("li");
    const unlocked = !!state.unlockedMilestones[m.id];
    item.textContent = unlocked ? `Complete: ${m.text} Reward claimed.` : `${m.text} Reward: ${m.rewardText}`;
    if (unlocked) item.classList.add("unlocked");
    milestonesEl.appendChild(item);
  }
}

function renderStats() {
  stardustEl.textContent = formatNumber(state.stardust);
  totalEl.textContent = formatNumber(state.totalHarvested);
  spsEl.textContent = formatNumber(getSps());
  clickPowerText.textContent = `Click power: ${formatNumber(state.clickPower * prestigeClickMultiplier())}`;
  comboText.textContent = `Combo: x${comboMultiplier(Date.now()).toFixed(2)}`;
  critText.textContent = `Crit chance: ${Math.round(state.critChance * 100)}%`;
}

function renderPrestige() {
  const gain = currentPrestigeGain();
  echoesOwnedEl.textContent = formatNumber(state.prestigePoints);
  echoesGainEl.textContent = formatNumber(gain);
  echoBoostText.textContent = `Current boost: +${Math.round((prestigeSpsMultiplier() - 1) * 100)}% production, +${Math.round((prestigeClickMultiplier() - 1) * 100)}% click power`;
  rebirthBtn.disabled = gain < 1;
}

function renderBuyControls() {
  const buttons = document.querySelectorAll(".buy-mode");
  buttons.forEach((btn) => {
    if (btn.dataset.buyMode === state.buyMode) btn.classList.add("active");
    else btn.classList.remove("active");
  });
}

function render() {
  applyMilestones();
  renderStats();
  renderPrestige();
  renderBuyControls();
  renderBuildings();
  renderResearch();
  renderMilestones();
}

function save() {
  state.lastSaveAt = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function load() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    Object.assign(state, parsed);
  } catch (err) {
    console.warn("Save data invalid.", err);
  }
}

function resetRunForRebirth() {
  state.stardust = 0;
  state.totalHarvested = 0;
  state.clickPower = 1;
  state.manualClicks = 0;
  state.buildings = {};
  state.researchBought = {};
  state.unlockedMilestones = {};
  state.combo = 0;
  state.comboUntil = 0;
  state.critChance = 0.05;
  state.buyMode = "1";
  hoveredShopItem = null;
}

function triggerRebirth() {
  const gain = currentPrestigeGain();
  if (gain < 1) return;
  const shouldProceed = confirm(`Rebirth for ${gain} Echoes? This resets this run's stardust, buildings, research, and milestones.`);
  if (!shouldProceed) return;

  state.prestigePoints += gain;
  state.totalRebirths += 1;
  resetRunForRebirth();
  triggerFlash("rebirth");
  spawnFloatingText(0, false, `+${gain} Echoes`);
  save();
  render();
}

function applyOfflineProgress() {
  if (!state.lastSaveAt) return;
  const elapsed = Math.max(0, Math.floor((Date.now() - state.lastSaveAt) / 1000));
  if (elapsed < 5) return;

  const seconds = Math.min(OFFLINE_CAP_SECONDS, elapsed);
  const gain = getSps() * seconds;
  if (gain > 0) {
    harvest(gain);
    spawnFloatingText(gain, false, "Offline");
  }
}

coreButton.addEventListener("click", () => {
  const now = Date.now();
  state.manualClicks += 1;
  if (now > state.comboUntil) state.combo = 0;
  state.combo += 1;
  state.comboUntil = now + COMBO_DECAY_SECONDS * 1000;

  let gain = state.clickPower * prestigeClickMultiplier() * comboMultiplier(now);
  const didCrit = Math.random() < state.critChance;
  if (didCrit) gain *= 2.5;
  harvest(gain);
  spawnFloatingText(gain, didCrit);

  coreButton.classList.remove("pulse");
  void coreButton.offsetWidth;
  coreButton.classList.add("pulse");

  renderStats();
  renderPrestige();
  renderBuildings();
  renderResearch();
});

document.querySelectorAll(".buy-mode").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.buyMode = btn.dataset.buyMode || "1";
    render();
  });
});

rebirthBtn.addEventListener("click", triggerRebirth);
document.getElementById("saveBtn").addEventListener("click", save);
document.getElementById("resetBtn").addEventListener("click", () => {
  if (confirm("Reset all progress, including Echoes?")) {
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.code !== "Space") return;
  event.preventDefault();
  if (!hoveredShopItem || hoveredShopItem.disabled) return;
  hoveredShopItem.click();
});

function gameLoop() {
  const now = Date.now();
  const delta = (now - state.lastTick) / 1000;
  state.lastTick = now;

  if (now > state.comboUntil) state.combo = 0;

  const generated = getSps() * delta;
  if (generated > 0) harvest(generated);

  applyMilestones();
  renderStats();
  renderPrestige();
  renderMilestones();
  renderBuildings();
  renderResearch();
  requestAnimationFrame(gameLoop);
}

load();
applyOfflineProgress();
state.lastTick = Date.now();
render();
gameLoop();
setInterval(save, 30000);
