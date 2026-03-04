#include "raylib.h"
#include "raymath.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <fstream>
#include <string>
#include <vector>

enum ResourceId {
    RES_ORE = 0,
    RES_METAL = 1,
    RES_TECH = 2,
    RES_POWER = 3,
    RES_COUNT = 4
};

enum BuildingType {
    BLD_MINE = 0,
    BLD_SMELTER = 1,
    BLD_FAB = 2,
    BLD_POWER = 3,
    BLD_TRADE = 4,
    BLD_COUNT = 5
};

static constexpr int UPGRADE_COUNT = 10;

struct BuildingDef {
    const char* name;
    float cost;
    float upgradeCostBase;
    Color tint;
    const char* modelPath;
    const char* texturePath;
};

struct Building {
    BuildingType type = BLD_MINE;
    int gx = 0;
    int gz = 0;
    int level = 1;
};

struct UpgradeDef {
    const char* name;
    const char* description;
    float cost;
};

struct UpgradeState {
    bool owned = false;
};

struct ModelSlot {
    bool modelLoaded = false;
    bool textureLoaded = false;
    Model model{};
    Texture2D texture{};
};

struct DecoProp {
    Vector3 pos{};
    float scale = 1.0f;
    int type = 0;
    Color color{};
};

struct SimState {
    float money = 7500.0f;
    std::array<float, RES_COUNT> resources{120.0f, 70.0f, 20.0f, 110.0f};
    std::vector<Building> buildings;
    std::array<UpgradeState, UPGRADE_COUNT> upgrades{};
};

struct OrbitCam {
    float yaw = 2.5f;
    float pitch = 0.72f;
    float distance = 56.0f;
    Vector3 target{0.0f, 0.0f, 0.0f};
};

struct EconomyTuning {
    float mineMul = 1.0f;
    float powerMul = 1.0f;
    float smelterMul = 1.0f;
    float fabMul = 1.0f;
    float tradeMul = 1.0f;
    float upkeepMul = 1.0f;
    float passiveIncomePerSec = 0.0f;
    float moneyInterestRatePerSec = 0.0f;
};

static constexpr int GRID_W = 28;
static constexpr int GRID_H = 28;
static constexpr float CELL = 3.2f;
static constexpr const char* SAVE_FILE = "savegame_tycoon_v2.txt";

static const std::array<BuildingDef, BLD_COUNT> kBuildingDefs = {{
    {"Mine", 180.0f, 105.0f, Color{160, 120, 96, 255}, "assets/models/mine.glb", "assets/models/mine_albedo.png"},
    {"Smelter", 380.0f, 175.0f, Color{188, 98, 80, 255}, "assets/models/smelter.glb", "assets/models/smelter_albedo.png"},
    {"Fabricator", 700.0f, 320.0f, Color{88, 150, 208, 255}, "assets/models/fabricator.glb", "assets/models/fabricator_albedo.png"},
    {"Power Plant", 320.0f, 165.0f, Color{216, 192, 88, 255}, "assets/models/power.glb", "assets/models/power_albedo.png"},
    {"Trade Hub", 1200.0f, 520.0f, Color{92, 196, 124, 255}, "assets/models/trade_hub.glb", "assets/models/trade_hub_albedo.png"}
}};

static const std::array<UpgradeDef, UPGRADE_COUNT> kUpgradeDefs = {{
    {"Automated Drills", "Mines +35% ore output", 2200.0f},
    {"Smart Grid", "Power plants +35% power output", 2500.0f},
    {"Lean Assembly", "Smelter/Fabricator +20% throughput", 3200.0f},
    {"Global Logistics", "Trade hub revenue +40%", 4300.0f},
    {"Deep Core Extraction", "Mines +50% output", 6500.0f},
    {"Induction Furnaces", "Smelter +45% output", 7600.0f},
    {"Nano Fabrication", "Fabricator +45% output", 8600.0f},
    {"Predictive Maintenance", "Building upkeep -35%", 9800.0f},
    {"Market AI", "Trade +60%, passive +$6/s", 11500.0f},
    {"Venture Banking", "Earn 0.15% money/sec interest", 14500.0f}
}};

static float ClampF(float v, float lo, float hi) {
    return std::max(lo, std::min(hi, v));
}

static float HashNoise(int x, int z) {
    int n = x * 374761393 + z * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    n ^= (n >> 16);
    return static_cast<float>(n & 0x7fffffff) / 2147483647.0f;
}

static int FindBuildingIndex(const SimState& sim, int gx, int gz) {
    for (int i = 0; i < static_cast<int>(sim.buildings.size()); ++i) {
        if (sim.buildings[i].gx == gx && sim.buildings[i].gz == gz) {
            return i;
        }
    }
    return -1;
}

static bool IsCellInBounds(int gx, int gz) {
    return gx >= 0 && gx < GRID_W && gz >= 0 && gz < GRID_H;
}

static Vector3 GridToWorld(int gx, int gz, float y) {
    const float originX = -0.5f * GRID_W * CELL;
    const float originZ = -0.5f * GRID_H * CELL;
    return {
        originX + (static_cast<float>(gx) + 0.5f) * CELL,
        y,
        originZ + (static_cast<float>(gz) + 0.5f) * CELL
    };
}

static bool RayToGround(Ray ray, Vector3* hitPoint) {
    const float eps = 0.0001f;
    if (std::fabs(ray.direction.y) < eps) {
        return false;
    }
    const float t = -ray.position.y / ray.direction.y;
    if (t < 0.0f) {
        return false;
    }
    *hitPoint = Vector3Add(ray.position, Vector3Scale(ray.direction, t));
    return true;
}

static bool WorldToGrid(Vector3 world, int* gx, int* gz) {
    const float originX = -0.5f * GRID_W * CELL;
    const float originZ = -0.5f * GRID_H * CELL;
    *gx = static_cast<int>(std::floor((world.x - originX) / CELL));
    *gz = static_cast<int>(std::floor((world.z - originZ) / CELL));
    return IsCellInBounds(*gx, *gz);
}

static void AddEvent(std::string& eventText, float& eventTimer, const std::string& text) {
    eventText = text;
    eventTimer = 3.2f;
}

static bool SpendMoney(SimState& sim, float amount) {
    if (sim.money + 0.001f < amount) {
        return false;
    }
    sim.money -= amount;
    return true;
}

static void ClampResources(std::array<float, RES_COUNT>& resources) {
    for (float& r : resources) {
        if (r < 0.0f) {
            r = 0.0f;
        }
    }
}

static EconomyTuning BuildTuningFromUpgrades(const SimState& sim) {
    EconomyTuning t;
    if (sim.upgrades[0].owned) t.mineMul *= 1.35f;
    if (sim.upgrades[1].owned) t.powerMul *= 1.35f;
    if (sim.upgrades[2].owned) {
        t.smelterMul *= 1.20f;
        t.fabMul *= 1.20f;
    }
    if (sim.upgrades[3].owned) t.tradeMul *= 1.40f;
    if (sim.upgrades[4].owned) t.mineMul *= 1.50f;
    if (sim.upgrades[5].owned) t.smelterMul *= 1.45f;
    if (sim.upgrades[6].owned) t.fabMul *= 1.45f;
    if (sim.upgrades[7].owned) t.upkeepMul *= 0.65f;
    if (sim.upgrades[8].owned) {
        t.tradeMul *= 1.60f;
        t.passiveIncomePerSec += 6.0f;
    }
    if (sim.upgrades[9].owned) {
        t.moneyInterestRatePerSec += 0.0015f;
    }
    return t;
}

static void SimTick(SimState& sim, float dt, float marketPulse) {
    const EconomyTuning tune = BuildTuningFromUpgrades(sim);

    for (const Building& b : sim.buildings) {
        const float levelMul = 1.0f + (static_cast<float>(b.level) - 1.0f) * 0.22f;

        if (b.type == BLD_MINE) {
            sim.resources[RES_ORE] += 2.8f * levelMul * tune.mineMul * dt;
        }
        if (b.type == BLD_POWER) {
            sim.resources[RES_POWER] += 3.4f * levelMul * tune.powerMul * dt;
        }
        if (b.type == BLD_SMELTER) {
            const float units = 1.35f * levelMul * tune.smelterMul * dt;
            const float oreNeed = 2.0f * units;
            const float powerNeed = 0.92f * units;
            float scale = 1.0f;
            scale = std::min(scale, oreNeed > 0.0f ? sim.resources[RES_ORE] / oreNeed : 1.0f);
            scale = std::min(scale, powerNeed > 0.0f ? sim.resources[RES_POWER] / powerNeed : 1.0f);
            scale = ClampF(scale, 0.0f, 1.0f);
            sim.resources[RES_ORE] -= oreNeed * scale;
            sim.resources[RES_POWER] -= powerNeed * scale;
            sim.resources[RES_METAL] += 1.4f * units * scale;
        }
        if (b.type == BLD_FAB) {
            const float units = 0.95f * levelMul * tune.fabMul * dt;
            const float metalNeed = 1.52f * units;
            const float powerNeed = 1.12f * units;
            float scale = 1.0f;
            scale = std::min(scale, metalNeed > 0.0f ? sim.resources[RES_METAL] / metalNeed : 1.0f);
            scale = std::min(scale, powerNeed > 0.0f ? sim.resources[RES_POWER] / powerNeed : 1.0f);
            scale = ClampF(scale, 0.0f, 1.0f);
            sim.resources[RES_METAL] -= metalNeed * scale;
            sim.resources[RES_POWER] -= powerNeed * scale;
            sim.resources[RES_TECH] += 1.05f * units * scale;
        }
        if (b.type == BLD_TRADE) {
            const float units = 1.0f * levelMul * dt;
            const float techNeed = 1.2f * units;
            const float powerNeed = 0.58f * units;
            float scale = 1.0f;
            scale = std::min(scale, techNeed > 0.0f ? sim.resources[RES_TECH] / techNeed : 1.0f);
            scale = std::min(scale, powerNeed > 0.0f ? sim.resources[RES_POWER] / powerNeed : 1.0f);
            scale = ClampF(scale, 0.0f, 1.0f);
            sim.resources[RES_TECH] -= techNeed * scale;
            sim.resources[RES_POWER] -= powerNeed * scale;
            sim.money += 19.0f * units * scale * tune.tradeMul * marketPulse;
        }
    }

    sim.money += tune.passiveIncomePerSec * dt;
    if (tune.moneyInterestRatePerSec > 0.0f) {
        const float interest = std::min(sim.money * tune.moneyInterestRatePerSec * dt, 320.0f * dt);
        sim.money += interest;
    }

    const float upkeep = static_cast<float>(sim.buildings.size()) * 0.085f * tune.upkeepMul * dt;
    sim.money = std::max(0.0f, sim.money - upkeep);

    ClampResources(sim.resources);
}

static bool SaveGame(const SimState& sim) {
    std::ofstream out(SAVE_FILE, std::ios::trunc);
    if (!out.is_open()) {
        return false;
    }

    out << "v2\n";
    out << sim.money << "\n";
    out << sim.resources[RES_ORE] << " " << sim.resources[RES_METAL] << " "
        << sim.resources[RES_TECH] << " " << sim.resources[RES_POWER] << "\n";
    for (size_t i = 0; i < sim.upgrades.size(); ++i) {
        out << (sim.upgrades[i].owned ? 1 : 0) << (i + 1 < sim.upgrades.size() ? ' ' : '\n');
    }
    out << sim.buildings.size() << "\n";
    for (const Building& b : sim.buildings) {
        out << static_cast<int>(b.type) << " " << b.gx << " " << b.gz << " " << b.level << "\n";
    }

    return true;
}

static bool LoadGame(SimState& sim) {
    std::ifstream in(SAVE_FILE);
    if (!in.is_open()) {
        return false;
    }

    SimState loaded;
    std::string header;
    if (!(in >> header)) {
        return false;
    }

    if (header == "v2") {
        if (!(in >> loaded.money)) return false;
    } else {
        loaded.money = std::stof(header);
    }

    if (!(in >> loaded.resources[RES_ORE] >> loaded.resources[RES_METAL] >> loaded.resources[RES_TECH] >> loaded.resources[RES_POWER])) {
        return false;
    }

    for (size_t i = 0; i < loaded.upgrades.size(); ++i) {
        int owned = 0;
        if (!(in >> owned)) {
            owned = 0;
            in.clear();
        }
        loaded.upgrades[i].owned = (owned != 0);
    }

    size_t count = 0;
    if (!(in >> count)) {
        count = 0;
    }

    loaded.buildings.reserve(count);
    for (size_t i = 0; i < count; ++i) {
        int type = 0;
        Building b;
        if (!(in >> type >> b.gx >> b.gz >> b.level)) {
            break;
        }
        if (type < 0 || type >= BLD_COUNT || b.level < 1 || !IsCellInBounds(b.gx, b.gz)) {
            continue;
        }
        if (FindBuildingIndex(loaded, b.gx, b.gz) != -1) {
            continue;
        }
        b.type = static_cast<BuildingType>(type);
        loaded.buildings.push_back(b);
    }

    ClampResources(loaded.resources);
    loaded.money = std::max(0.0f, loaded.money);
    sim = loaded;
    return true;
}

static void ResetNewGame(SimState& sim) {
    sim = SimState{};
    sim.buildings.push_back({BLD_MINE, 12, 12, 1});
    sim.buildings.push_back({BLD_POWER, 13, 12, 1});
    sim.buildings.push_back({BLD_SMELTER, 11, 12, 1});
    sim.buildings.push_back({BLD_TRADE, 12, 11, 1});
}

static void UpdateOrbitCamera(OrbitCam& orbit, Camera3D& cam, float dt) {
    orbit.distance = ClampF(orbit.distance - GetMouseWheelMove() * 3.2f, 18.0f, 130.0f);

    if (IsMouseButtonDown(MOUSE_RIGHT_BUTTON)) {
        Vector2 d = GetMouseDelta();
        orbit.yaw -= d.x * 0.004f;
        orbit.pitch += d.y * 0.004f;
        orbit.pitch = ClampF(orbit.pitch, 0.2f, 1.32f);
    }

    Vector3 forward = {std::sin(orbit.yaw), 0.0f, std::cos(orbit.yaw)};
    Vector3 right = {forward.z, 0.0f, -forward.x};

    const float panSpeed = 34.0f * dt * (orbit.distance / 55.0f);
    if (IsKeyDown(KEY_W)) orbit.target = Vector3Add(orbit.target, Vector3Scale(forward, panSpeed));
    if (IsKeyDown(KEY_S)) orbit.target = Vector3Add(orbit.target, Vector3Scale(forward, -panSpeed));
    if (IsKeyDown(KEY_D)) orbit.target = Vector3Add(orbit.target, Vector3Scale(right, panSpeed));
    if (IsKeyDown(KEY_A)) orbit.target = Vector3Add(orbit.target, Vector3Scale(right, -panSpeed));

    const float mapHalfX = GRID_W * CELL * 0.56f;
    const float mapHalfZ = GRID_H * CELL * 0.56f;
    orbit.target.x = ClampF(orbit.target.x, -mapHalfX, mapHalfX);
    orbit.target.z = ClampF(orbit.target.z, -mapHalfZ, mapHalfZ);

    const float planar = std::cos(orbit.pitch) * orbit.distance;
    cam.position = {
        orbit.target.x + std::sin(orbit.yaw) * planar,
        orbit.target.y + std::sin(orbit.pitch) * orbit.distance,
        orbit.target.z + std::cos(orbit.yaw) * planar
    };
    cam.target = orbit.target;
    cam.up = {0.0f, 1.0f, 0.0f};
}

static void DrawFallbackBuilding(const Building& b, Vector3 pos, Color tint, float t) {
    const float baseH = 0.45f + 0.12f * static_cast<float>(b.level - 1);

    DrawCube({pos.x, 0.20f, pos.z}, CELL * 0.92f, 0.4f, CELL * 0.92f, Color{40, 43, 50, 255});
    DrawCubeWires({pos.x, 0.20f, pos.z}, CELL * 0.92f, 0.4f, CELL * 0.92f, Fade(BLACK, 0.45f));

    if (b.type == BLD_MINE) {
        DrawCube({pos.x, baseH, pos.z}, 2.4f, 1.35f, 2.1f, tint);
        DrawCylinder({pos.x + 0.8f, 1.7f, pos.z + 0.35f}, 0.32f, 0.28f, 2.0f, 12, DARKBROWN);
        DrawCube({pos.x - 0.55f, 1.2f, pos.z - 0.5f}, 0.6f, 0.35f, 0.9f, ORANGE);
    } else if (b.type == BLD_SMELTER) {
        DrawCube({pos.x, baseH + 0.3f, pos.z}, 2.6f, 2.0f, 2.4f, tint);
        DrawCylinder({pos.x + 0.9f, 2.0f, pos.z - 0.15f}, 0.26f, 0.20f, 2.8f, 12, GRAY);
        float pulse = 0.55f + 0.45f * std::sin(t * 3.0f + static_cast<float>(b.gx));
        DrawCube({pos.x - 0.8f, 0.95f, pos.z + 0.75f}, 0.45f, 0.45f, 0.45f, Color{255, static_cast<unsigned char>(120 + 80 * pulse), 50, 255});
    } else if (b.type == BLD_FAB) {
        DrawCube({pos.x, baseH + 0.35f, pos.z}, 2.9f, 2.25f, 2.8f, tint);
        DrawCube({pos.x - 0.55f, 1.8f, pos.z + 0.8f}, 1.1f, 0.75f, 0.9f, SKYBLUE);
        DrawCube({pos.x + 0.55f, 1.8f, pos.z + 0.8f}, 1.1f, 0.75f, 0.9f, SKYBLUE);
    } else if (b.type == BLD_POWER) {
        DrawCube({pos.x, baseH + 0.45f, pos.z}, 2.4f, 2.3f, 2.4f, tint);
        DrawCylinder({pos.x, 2.05f, pos.z}, 0.22f, 0.22f, 2.6f, 16, YELLOW);
        float ringY = 1.8f + 0.25f * std::sin(t * 2.8f + static_cast<float>(b.gz));
        DrawCylinderWires({pos.x, ringY, pos.z}, 0.7f, 0.7f, 0.02f, 24, GOLD);
    } else if (b.type == BLD_TRADE) {
        DrawCube({pos.x, baseH + 0.5f, pos.z}, 3.2f, 2.4f, 3.0f, tint);
        DrawCube({pos.x, 2.25f, pos.z}, 2.1f, 0.35f, 2.1f, GREEN);
        float spin = t * 60.0f;
        DrawCubeV({pos.x, 2.65f, pos.z}, {0.2f, 0.2f, 1.4f}, LIME);
        DrawCubeV({pos.x, 2.65f, pos.z}, {1.4f, 0.2f, 0.2f}, LIME);
        DrawCylinderEx({pos.x, 2.65f, pos.z}, {pos.x + 0.8f * std::cos(spin * DEG2RAD), 2.65f, pos.z + 0.8f * std::sin(spin * DEG2RAD)}, 0.04f, 0.04f, 8, LIME);
    }
}

static void DrawBuilding(const Building& b, const ModelSlot& modelSlot, float t) {
    const BuildingDef& def = kBuildingDefs[b.type];
    Vector3 pos = GridToWorld(b.gx, b.gz, 0.0f);

    if (modelSlot.modelLoaded) {
        const float levelScale = 1.0f + 0.08f * static_cast<float>(b.level - 1);
        DrawModelEx(modelSlot.model, {pos.x, 0.0f, pos.z}, {0.0f, 1.0f, 0.0f}, 0.0f, {levelScale, levelScale, levelScale}, WHITE);
        DrawCubeWires({pos.x, 0.05f, pos.z}, CELL * 0.94f, 0.1f, CELL * 0.94f, Fade(def.tint, 0.5f));
    } else {
        DrawFallbackBuilding(b, pos, def.tint, t);
    }

    if (b.type == BLD_TRADE) {
        float glow = 0.35f + 0.35f * std::sin(t * 3.0f + static_cast<float>(b.gx + b.gz));
        DrawSphere({pos.x, 2.8f, pos.z}, 0.16f, Color{120, static_cast<unsigned char>(200 + 50 * glow), 255, 220});
    }
}

static std::vector<DecoProp> GenerateEnvironmentProps() {
    std::vector<DecoProp> props;
    props.reserve(220);

    const float radiusX = GRID_W * CELL * 0.63f;
    const float radiusZ = GRID_H * CELL * 0.63f;

    for (int i = 0; i < 220; ++i) {
        const float fx = HashNoise(i * 17, i * 23) * 2.0f - 1.0f;
        const float fz = HashNoise(i * 43, i * 11) * 2.0f - 1.0f;
        Vector3 p{fx * radiusX * 1.18f, 0.0f, fz * radiusZ * 1.18f};

        if (std::fabs(p.x) < radiusX && std::fabs(p.z) < radiusZ) {
            continue;
        }

        DecoProp d;
        d.pos = p;
        d.scale = 0.8f + 2.4f * HashNoise(i * 31, i * 5);
        d.type = static_cast<int>(HashNoise(i * 7, i * 19) * 3.0f) % 3;
        d.color = d.type == 0 ? Color{58, 96, 62, 255} : (d.type == 1 ? Color{82, 82, 88, 255} : Color{104, 96, 76, 255});
        props.push_back(d);
    }

    return props;
}

int main() {
    InitWindow(1720, 980, "Forge Frontier - Steam-Style Tycoon Vertical Slice");
    SetTargetFPS(144);

    SimState sim;
    ResetNewGame(sim);

    OrbitCam orbit;
    Camera3D cam{};
    cam.fovy = 54.0f;
    cam.projection = CAMERA_PERSPECTIVE;

    const std::vector<DecoProp> envProps = GenerateEnvironmentProps();

    std::array<ModelSlot, BLD_COUNT> models{};
    for (int i = 0; i < BLD_COUNT; ++i) {
        const BuildingDef& def = kBuildingDefs[i];
        if (FileExists(def.modelPath)) {
            models[i].model = LoadModel(def.modelPath);
            models[i].modelLoaded = true;

            if (FileExists(def.texturePath) && models[i].model.materialCount > 0) {
                models[i].texture = LoadTexture(def.texturePath);
                models[i].textureLoaded = true;
                models[i].model.materials[0].maps[MATERIAL_MAP_ALBEDO].texture = models[i].texture;
            }
        }
    }

    int selectedBuildType = BLD_MINE;
    int selectedUpgrade = 0;
    bool paused = false;
    int timeScale = 1;
    float simAccumulator = 0.0f;
    const float tick = 1.0f / 20.0f;

    std::string eventText = "Welcome to Forge Frontier";
    float eventTimer = 3.0f;

    while (!WindowShouldClose()) {
        const float t = static_cast<float>(GetTime());
        float dt = std::min(GetFrameTime(), 0.05f);
        if (eventTimer > 0.0f) eventTimer -= dt;

        UpdateOrbitCamera(orbit, cam, dt);

        if (IsKeyPressed(KEY_ONE)) selectedBuildType = BLD_MINE;
        if (IsKeyPressed(KEY_TWO)) selectedBuildType = BLD_SMELTER;
        if (IsKeyPressed(KEY_THREE)) selectedBuildType = BLD_FAB;
        if (IsKeyPressed(KEY_FOUR)) selectedBuildType = BLD_POWER;
        if (IsKeyPressed(KEY_FIVE)) selectedBuildType = BLD_TRADE;

        if (IsKeyPressed(KEY_Q)) {
            selectedUpgrade = (selectedUpgrade + UPGRADE_COUNT - 1) % UPGRADE_COUNT;
        }
        if (IsKeyPressed(KEY_E)) {
            selectedUpgrade = (selectedUpgrade + 1) % UPGRADE_COUNT;
        }

        if (IsKeyPressed(KEY_ENTER) && !sim.upgrades[selectedUpgrade].owned) {
            if (SpendMoney(sim, kUpgradeDefs[selectedUpgrade].cost)) {
                sim.upgrades[selectedUpgrade].owned = true;
                AddEvent(eventText, eventTimer, std::string("Unlocked: ") + kUpgradeDefs[selectedUpgrade].name);
            } else {
                AddEvent(eventText, eventTimer, "Not enough money for selected upgrade");
            }
        }

        if (IsKeyPressed(KEY_SPACE)) paused = !paused;
        if (IsKeyPressed(KEY_MINUS)) {
            timeScale = std::max(1, timeScale - 1);
            AddEvent(eventText, eventTimer, "Time scale: x" + std::to_string(timeScale));
        }
        if (IsKeyPressed(KEY_EQUAL)) {
            timeScale = std::min(8, timeScale + 1);
            AddEvent(eventText, eventTimer, "Time scale: x" + std::to_string(timeScale));
        }

        if (IsKeyPressed(KEY_F5)) AddEvent(eventText, eventTimer, SaveGame(sim) ? "Game saved" : "Save failed");
        if (IsKeyPressed(KEY_F9)) AddEvent(eventText, eventTimer, LoadGame(sim) ? "Game loaded" : "No valid save found");
        if (IsKeyPressed(KEY_N)) {
            ResetNewGame(sim);
            AddEvent(eventText, eventTimer, "New game created");
        }

        if (IsKeyPressed(KEY_O) && sim.resources[RES_ORE] >= 25.0f) {
            sim.resources[RES_ORE] -= 25.0f;
            sim.money += 60.0f;
            AddEvent(eventText, eventTimer, "Sold 25 Ore for $60");
        }
        if (IsKeyPressed(KEY_M) && sim.resources[RES_METAL] >= 20.0f) {
            sim.resources[RES_METAL] -= 20.0f;
            sim.money += 180.0f;
            AddEvent(eventText, eventTimer, "Sold 20 Metal for $180");
        }
        if (IsKeyPressed(KEY_T) && sim.resources[RES_TECH] >= 12.0f) {
            sim.resources[RES_TECH] -= 12.0f;
            sim.money += 340.0f;
            AddEvent(eventText, eventTimer, "Sold 12 Tech for $340");
        }

        Ray ray = GetMouseRay(GetMousePosition(), cam);
        Vector3 hit{};
        bool hasHit = RayToGround(ray, &hit);
        int hoverGX = -1;
        int hoverGZ = -1;
        bool hoverValid = hasHit && WorldToGrid(hit, &hoverGX, &hoverGZ);

        if (hoverValid && !IsMouseButtonDown(MOUSE_RIGHT_BUTTON)) {
            if (IsMouseButtonPressed(MOUSE_LEFT_BUTTON)) {
                if (FindBuildingIndex(sim, hoverGX, hoverGZ) == -1) {
                    const BuildingDef& def = kBuildingDefs[selectedBuildType];
                    if (SpendMoney(sim, def.cost)) {
                        sim.buildings.push_back({static_cast<BuildingType>(selectedBuildType), hoverGX, hoverGZ, 1});
                        AddEvent(eventText, eventTimer, std::string("Placed: ") + def.name);
                    } else {
                        AddEvent(eventText, eventTimer, "Not enough money");
                    }
                } else {
                    AddEvent(eventText, eventTimer, "Cell occupied");
                }
            }

            if (IsKeyPressed(KEY_U)) {
                int idx = FindBuildingIndex(sim, hoverGX, hoverGZ);
                if (idx != -1) {
                    Building& b = sim.buildings[idx];
                    float cost = kBuildingDefs[b.type].upgradeCostBase * static_cast<float>(b.level);
                    if (SpendMoney(sim, cost)) {
                        b.level += 1;
                        AddEvent(eventText, eventTimer, std::string("Upgraded: ") + kBuildingDefs[b.type].name);
                    } else {
                        AddEvent(eventText, eventTimer, "Not enough money for upgrade");
                    }
                }
            }

            if (IsKeyPressed(KEY_X)) {
                int idx = FindBuildingIndex(sim, hoverGX, hoverGZ);
                if (idx != -1) {
                    const Building& b = sim.buildings[idx];
                    float refund = kBuildingDefs[b.type].cost * (0.45f + 0.08f * static_cast<float>(b.level - 1));
                    sim.money += refund;
                    sim.buildings.erase(sim.buildings.begin() + idx);
                    AddEvent(eventText, eventTimer, "Building sold");
                }
            }
        }

        if (!paused) {
            const float marketPulse = 0.88f + 0.24f * (0.5f + 0.5f * std::sin(t * 0.58f));
            simAccumulator += dt * static_cast<float>(timeScale);
            while (simAccumulator >= tick) {
                SimTick(sim, tick, marketPulse);
                simAccumulator -= tick;
            }
        }

        Color skyTop{28, 39, 66, 255};
        Color skyBottom{156, 182, 204, 255};
        DrawRectangleGradientV(0, 0, GetScreenWidth(), GetScreenHeight(), skyTop, skyBottom);

        BeginDrawing();
        BeginMode3D(cam);

        const float startX = -0.5f * GRID_W * CELL;
        const float startZ = -0.5f * GRID_H * CELL;

        for (int gx = 0; gx < GRID_W; ++gx) {
            for (int gz = 0; gz < GRID_H; ++gz) {
                float n = HashNoise(gx, gz);
                Color c{
                    static_cast<unsigned char>(38 + n * 16.0f),
                    static_cast<unsigned char>(48 + n * 16.0f),
                    static_cast<unsigned char>(58 + n * 14.0f),
                    255
                };
                Vector3 p = GridToWorld(gx, gz, -0.02f);
                DrawCubeV({p.x, -0.06f, p.z}, {CELL, 0.12f, CELL}, c);
            }
        }

        for (int x = 0; x <= GRID_W; ++x) {
            float xx = startX + static_cast<float>(x) * CELL;
            DrawLine3D({xx, 0.01f, startZ}, {xx, 0.01f, startZ + GRID_H * CELL}, Color{62, 70, 82, 255});
        }
        for (int z = 0; z <= GRID_H; ++z) {
            float zz = startZ + static_cast<float>(z) * CELL;
            DrawLine3D({startX, 0.01f, zz}, {startX + GRID_W * CELL, 0.01f, zz}, Color{62, 70, 82, 255});
        }

        DrawCube({0.0f, 0.08f, startZ - 1.6f}, GRID_W * CELL + 3.8f, 0.16f, 3.2f, DARKGRAY);
        DrawCube({0.0f, 0.08f, startZ + GRID_H * CELL + 1.6f}, GRID_W * CELL + 3.8f, 0.16f, 3.2f, DARKGRAY);
        DrawCube({startX - 1.6f, 0.08f, 0.0f}, 3.2f, 0.16f, GRID_H * CELL + 3.8f, DARKGRAY);
        DrawCube({startX + GRID_W * CELL + 1.6f, 0.08f, 0.0f}, 3.2f, 0.16f, GRID_H * CELL + 3.8f, DARKGRAY);

        for (const DecoProp& d : envProps) {
            if (d.type == 0) {
                DrawCylinder({d.pos.x, 0.9f * d.scale, d.pos.z}, 0.22f * d.scale, 0.18f * d.scale, 1.6f * d.scale, 8, BROWN);
                DrawSphere({d.pos.x, 1.9f * d.scale, d.pos.z}, 0.85f * d.scale, d.color);
            } else if (d.type == 1) {
                DrawSphere({d.pos.x, 0.4f * d.scale, d.pos.z}, 0.45f * d.scale, d.color);
            } else {
                DrawCube({d.pos.x, 0.6f * d.scale, d.pos.z}, 0.9f * d.scale, 1.2f * d.scale, 0.9f * d.scale, d.color);
            }
        }

        for (const Building& b : sim.buildings) {
            DrawBuilding(b, models[b.type], t);
        }

        if (hoverValid) {
            Vector3 p = GridToWorld(hoverGX, hoverGZ, 0.08f);
            int idx = FindBuildingIndex(sim, hoverGX, hoverGZ);
            Color c = idx == -1 ? Color{80, 200, 255, 200} : Color{255, 120, 80, 200};
            DrawCubeWires({p.x, p.y, p.z}, CELL * 0.98f, 0.12f, CELL * 0.98f, c);
        }

        DrawSphere({startX + GRID_W * CELL * 0.18f, 32.0f, startZ - 22.0f}, 4.2f, Color{255, 220, 150, 255});

        EndMode3D();

        DrawRectangle(12, 12, 500, 220, Color{7, 10, 14, 210});
        DrawText("Forge Frontier", 26, 24, 34, Color{228, 234, 244, 255});
        DrawText(TextFormat("Money: $%.0f", sim.money), 26, 68, 25, Color{132, 235, 152, 255});
        DrawText(TextFormat("Ore %.1f   Metal %.1f", sim.resources[RES_ORE], sim.resources[RES_METAL]), 26, 99, 21, LIGHTGRAY);
        DrawText(TextFormat("Tech %.1f  Power %.1f", sim.resources[RES_TECH], sim.resources[RES_POWER]), 26, 126, 21, LIGHTGRAY);
        DrawText(TextFormat("Buildings: %d", static_cast<int>(sim.buildings.size())), 26, 153, 21, Color{176, 205, 230, 255});
        DrawText(TextFormat("Time x%d %s", timeScale, paused ? "(Paused)" : ""), 26, 180, 21, Color{176, 205, 230, 255});

        DrawRectangle(12, 242, 700, 265, Color{7, 10, 14, 210});
        DrawText("Build Menu | 1-5 select | Left place | U upgrade | X sell", 24, 254, 22, Color{222, 228, 236, 255});
        int y = 287;
        for (int i = 0; i < BLD_COUNT; ++i) {
            const BuildingDef& def = kBuildingDefs[i];
            bool selected = (selectedBuildType == i);
            DrawText(TextFormat("%d: %-11s  Cost: $%.0f", i + 1, def.name, def.cost), 24, y, 20, selected ? YELLOW : LIGHTGRAY);
            y += 29;
        }

        DrawText("Instant Market Sells: O (Ore)  M (Metal)  T (Tech)", 24, 437, 20, Color{160, 228, 255, 255});

        DrawRectangle(GetScreenWidth() - 610, 12, 598, 380, Color{7, 10, 14, 210});
        DrawText("Upgrades | Q/E select | Enter buy", GetScreenWidth() - 590, 24, 24, Color{228, 234, 244, 255});
        y = 60;
        for (int i = 0; i < UPGRADE_COUNT; ++i) {
            Color rowColor = LIGHTGRAY;
            if (sim.upgrades[i].owned) rowColor = Color{120, 220, 138, 255};
            if (i == selectedUpgrade) rowColor = YELLOW;
            const char* status = sim.upgrades[i].owned ? "[Owned]" : TextFormat("$%.0f", kUpgradeDefs[i].cost);
            DrawText(TextFormat("%2d. %-20s %s", i + 1, kUpgradeDefs[i].name, status), GetScreenWidth() - 590, y, 20, rowColor);
            y += 30;
        }
        DrawText(kUpgradeDefs[selectedUpgrade].description, GetScreenWidth() - 590, 370, 19, Color{160, 228, 255, 255});

        DrawRectangle(GetScreenWidth() - 610, 404, 598, 170, Color{7, 10, 14, 210});
        DrawText("Controls", GetScreenWidth() - 590, 416, 24, Color{228, 234, 244, 255});
        DrawText("WASD pan | Hold Right Mouse + drag orbit | Wheel zoom", GetScreenWidth() - 590, 448, 18, LIGHTGRAY);
        DrawText("Space pause | +/- time | F5 save | F9 load | N new game", GetScreenWidth() - 590, 472, 18, LIGHTGRAY);
        DrawText("Model files: assets/models/*.glb (+ optional *_albedo.png)", GetScreenWidth() - 590, 496, 18, LIGHTGRAY);

        if (hoverValid) {
            DrawRectangle(GetScreenWidth() - 610, 586, 598, 130, Color{7, 10, 14, 210});
            int idx = FindBuildingIndex(sim, hoverGX, hoverGZ);
            if (idx == -1) {
                DrawText(TextFormat("Tile [%d, %d] empty", hoverGX, hoverGZ), GetScreenWidth() - 590, 604, 22, LIGHTGRAY);
                DrawText(TextFormat("Place %s for $%.0f", kBuildingDefs[selectedBuildType].name, kBuildingDefs[selectedBuildType].cost), GetScreenWidth() - 590, 635, 20, YELLOW);
            } else {
                const Building& b = sim.buildings[idx];
                float upgradeCost = kBuildingDefs[b.type].upgradeCostBase * static_cast<float>(b.level);
                DrawText(TextFormat("Tile [%d, %d]: %s Lv.%d", hoverGX, hoverGZ, kBuildingDefs[b.type].name, b.level), GetScreenWidth() - 590, 604, 22, LIGHTGRAY);
                DrawText(TextFormat("Upgrade: $%.0f (U) | Sell: X", upgradeCost), GetScreenWidth() - 590, 635, 20, SKYBLUE);
            }
        }

        if (eventTimer > 0.0f) {
            int w = MeasureText(eventText.c_str(), 24) + 36;
            DrawRectangle((GetScreenWidth() - w) / 2, GetScreenHeight() - 62, w, 42, Color{7, 10, 14, 220});
            DrawText(eventText.c_str(), (GetScreenWidth() - w) / 2 + 18, GetScreenHeight() - 53, 24, Color{255, 225, 130, 255});
        }

        EndDrawing();
    }

    for (ModelSlot& slot : models) {
        if (slot.textureLoaded) {
            UnloadTexture(slot.texture);
            slot.textureLoaded = false;
        }
        if (slot.modelLoaded) {
            UnloadModel(slot.model);
            slot.modelLoaded = false;
        }
    }

    CloseWindow();
    return 0;
}
