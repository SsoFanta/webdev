#include "raylib.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <string>
#include <vector>

struct UpgradeDef {
    const char* name;
    const char* desc;
    float baseCost;
    float costScale;
    float baseValue;
    float valueScale;
};

enum UpgradeId {
    U_PWR = 0,
    U_AERO = 1,
    U_FUEL = 2,
    U_BOUNCE = 3,
    U_COIN = 4,
    U_AUTO = 5,
    U_COUNT = 6
};

struct Enemy {
    float x = 0.0f;
    float y = 0.0f;
    float baseY = 0.0f;
    float radius = 16.0f;
    float phase = 0.0f;
    int type = 0;
    bool alive = true;
};

struct GameState {
    float coins = 120.0f;
    float totalCoins = 120.0f;
    float science = 0.0f;

    std::array<int, U_COUNT> levels{};

    bool inFlight = false;
    bool charging = false;
    float charge = 0.0f;

    float x = 0.0f;
    float y = 0.0f;
    float vx = 0.0f;
    float vy = 0.0f;
    float fuel = 0.0f;
    float distance = 0.0f;
    float bestDistance = 0.0f;

    int hitsTaken = 0;
    int enemiesDefeated = 0;

    float launchCooldown = 0.0f;
    float autoTimer = 0.0f;

    float popTimer = 0.0f;
    float popAmount = 0.0f;

    std::vector<Enemy> enemies;

    std::string event = "Hold Space to charge and launch";
    float eventTimer = 3.0f;
};

static constexpr float GROUND_Y = 610.0f;
static constexpr float BASE_ROCKET_Y = GROUND_Y - 28.0f;

static const std::array<UpgradeDef, U_COUNT> kUpgrades = {{
    {"Launch Power", "More initial speed.", 90.0f, 1.22f, 1.0f, 1.11f},
    {"Aerodynamics", "Lower drag.", 120.0f, 1.24f, 1.0f, 1.07f},
    {"Fuel Tank", "Longer boost time.", 160.0f, 1.28f, 1.0f, 1.10f},
    {"Bounce Gear", "Better ground bounces.", 210.0f, 1.30f, 1.0f, 1.08f},
    {"Coin Magnet", "More coins per meter.", 180.0f, 1.27f, 1.0f, 1.10f},
    {"Auto Launcher", "Launches automatically.", 450.0f, 1.36f, 1.0f, 1.09f}
}};

static float ClampF(float v, float lo, float hi) {
    return std::max(lo, std::min(hi, v));
}

static float Noise1(int i) {
    float x = std::sin(static_cast<float>(i) * 12.9898f) * 43758.5453f;
    return x - std::floor(x);
}

static float UpgradeCost(UpgradeId id, int level) {
    const UpgradeDef& u = kUpgrades[id];
    return u.baseCost * std::pow(u.costScale, static_cast<float>(level));
}

static float UpgradeValue(UpgradeId id, int level) {
    const UpgradeDef& u = kUpgrades[id];
    return u.baseValue * std::pow(u.valueScale, static_cast<float>(level));
}

static void SetEvent(GameState& s, const std::string& text) {
    s.event = text;
    s.eventTimer = 2.3f;
}

static void SpawnEnemies(GameState& s) {
    s.enemies.clear();
    const int count = 11 + static_cast<int>(s.science * 0.6f) + s.levels[U_AUTO] / 2;
    s.enemies.reserve(count);

    for (int i = 0; i < count; ++i) {
        const float n0 = Noise1(i * 17 + 11);
        const float n1 = Noise1(i * 31 + 7);
        Enemy e;
        e.x = 980.0f + static_cast<float>(i) * (480.0f + 320.0f * n0);
        e.baseY = GROUND_Y - (130.0f + 270.0f * n1);
        e.y = e.baseY;
        e.radius = 14.0f + 8.0f * n0;
        e.phase = n1 * 6.28318f;
        e.type = i % 2;
        e.alive = true;
        s.enemies.push_back(e);
    }
}

static void StartLaunch(GameState& s, float charge01) {
    const float powerMul = UpgradeValue(U_PWR, s.levels[U_PWR]) * (1.0f + 0.14f * s.science);
    const float angle = 0.78f + 0.25f * charge01;
    const float speed = (360.0f + 560.0f * charge01) * powerMul;

    s.inFlight = true;
    s.x = 120.0f;
    s.y = BASE_ROCKET_Y;
    s.vx = std::cos(angle) * speed;
    s.vy = -std::sin(angle) * speed;

    s.fuel = (1.2f + 0.08f * static_cast<float>(s.levels[U_FUEL])) * UpgradeValue(U_FUEL, s.levels[U_FUEL]);
    s.distance = 0.0f;
    s.charge = 0.0f;
    s.charging = false;
    s.launchCooldown = 0.35f;
    s.hitsTaken = 0;
    s.enemiesDefeated = 0;

    SpawnEnemies(s);
}

static void EndRun(GameState& s) {
    const float coinMul = UpgradeValue(U_COIN, s.levels[U_COIN]) * (1.0f + 0.12f * s.science);
    const float enemyBonus = static_cast<float>(s.enemiesDefeated) * 12.0f;
    const float gained = std::floor((s.distance / 14.0f) * coinMul + 8.0f + enemyBonus);

    s.coins += gained;
    s.totalCoins += gained;
    s.popAmount = gained;
    s.popTimer = 1.3f;

    s.bestDistance = std::max(s.bestDistance, s.distance);
    s.inFlight = false;

    if (gained > 0.0f) {
        SetEvent(s, "+$" + std::to_string(static_cast<int>(gained)) + " from run");
    }
}

static void Rebirth(GameState& s) {
    const float points = std::floor(s.bestDistance / 1800.0f + s.totalCoins / 30000.0f);
    if (points < 1.0f) {
        SetEvent(s, "Need more progress before rebirth");
        return;
    }

    s.science += points;
    const float keepScience = s.science;

    s = GameState{};
    s.science = keepScience;
    s.coins = 120.0f + keepScience * 40.0f;
    s.totalCoins = s.coins;

    SetEvent(s, "Rebirth complete: +" + std::to_string(static_cast<int>(points)) + " science");
}

int main() {
    InitWindow(1540, 900, "Sky Lab Idle - Launch Tycoon");
    SetTargetFPS(144);

    GameState s;

    while (!WindowShouldClose()) {
        float dt = std::min(GetFrameTime(), 0.05f);
        if (s.eventTimer > 0.0f) s.eventTimer -= dt;
        if (s.popTimer > 0.0f) s.popTimer -= dt;
        if (s.launchCooldown > 0.0f) s.launchCooldown -= dt;

        const float autoPower = static_cast<float>(s.levels[U_AUTO]);
        if (!s.inFlight && autoPower > 0.0f) {
            const float interval = ClampF(4.2f / (1.0f + 0.22f * autoPower), 0.9f, 4.2f);
            s.autoTimer += dt;
            if (s.autoTimer >= interval && s.launchCooldown <= 0.0f) {
                s.autoTimer = 0.0f;
                StartLaunch(s, 0.65f + 0.03f * ClampF(autoPower, 0.0f, 8.0f));
            }
        }

        if (!s.inFlight) {
            if (IsKeyDown(KEY_SPACE)) {
                s.charging = true;
                s.charge = ClampF(s.charge + dt * 0.7f, 0.0f, 1.0f);
            }
            if (s.charging && IsKeyReleased(KEY_SPACE) && s.launchCooldown <= 0.0f) {
                StartLaunch(s, s.charge);
            }

            if (IsKeyPressed(KEY_R)) {
                Rebirth(s);
            }

            for (int i = 0; i < U_COUNT; ++i) {
                if (IsKeyPressed(KEY_ONE + i)) {
                    UpgradeId id = static_cast<UpgradeId>(i);
                    const float cost = UpgradeCost(id, s.levels[id]);
                    if (s.coins >= cost) {
                        s.coins -= cost;
                        s.levels[id] += 1;
                        SetEvent(s, std::string("Upgraded ") + kUpgrades[id].name + " to Lv." + std::to_string(s.levels[id]));
                    } else {
                        SetEvent(s, "Not enough coins");
                    }
                }
            }
        } else {
            const float aero = UpgradeValue(U_AERO, s.levels[U_AERO]) * (1.0f + 0.05f * s.science);
            const float drag = 0.0015f / aero;

            bool boosting = IsKeyDown(KEY_UP) && s.fuel > 0.0f;
            if (boosting) {
                const float boost = 460.0f * (1.0f + 0.08f * static_cast<float>(s.levels[U_FUEL]));
                s.vx += boost * dt;
                s.vy -= 180.0f * dt;
                s.fuel -= dt;
            }

            s.vy += 540.0f * dt;
            s.vx -= s.vx * drag * dt * 60.0f;
            s.vy -= s.vy * drag * 0.5f * dt * 60.0f;

            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.distance = std::max(0.0f, s.x - 120.0f);

            const float t = static_cast<float>(GetTime());
            for (Enemy& e : s.enemies) {
                if (!e.alive) continue;

                if (e.type == 0) {
                    e.y = e.baseY + 24.0f * std::sin(t * 1.9f + e.phase);
                } else {
                    e.y = e.baseY + 14.0f * std::cos(t * 2.4f + e.phase);
                    e.x -= (46.0f + 24.0f * std::sin(t + e.phase)) * dt;
                }

                const float dx = s.x - e.x;
                const float dy = s.y - e.y;
                const float rr = e.radius + 16.0f;
                if ((dx * dx + dy * dy) <= rr * rr) {
                    e.alive = false;
                    if (boosting) {
                        s.enemiesDefeated += 1;
                        s.coins += 10.0f;
                        s.totalCoins += 10.0f;
                    } else {
                        s.hitsTaken += 1;
                        const float fine = std::min(s.coins, 10.0f + 4.0f * static_cast<float>(s.hitsTaken));
                        s.coins -= fine;
                        s.vx *= 0.68f;
                        s.vy = -std::fabs(s.vy) * 0.35f - 90.0f;
                        s.fuel = std::max(0.0f, s.fuel - 0.45f);
                        SetEvent(s, "Enemy hit! -$" + std::to_string(static_cast<int>(fine)));
                    }
                }
            }

            if (s.y >= BASE_ROCKET_Y) {
                s.y = BASE_ROCKET_Y;
                const float bounce = 0.24f + 0.05f * static_cast<float>(s.levels[U_BOUNCE]);
                if (std::fabs(s.vy) > 80.0f && s.vx > 120.0f) {
                    s.vy = -std::fabs(s.vy) * ClampF(bounce, 0.24f, 0.86f);
                    s.vx *= 0.82f;
                } else {
                    s.vy = 0.0f;
                    s.vx *= 0.90f;
                }
            }

            if ((s.vx < 28.0f && std::fabs(s.vy) < 12.0f && s.y >= BASE_ROCKET_Y) || s.x > 200000.0f) {
                EndRun(s);
            }
        }

        const float renderZoom = 0.68f;
        float camX = s.inFlight ? ClampF(s.x - 350.0f / renderZoom, 0.0f, 200000.0f) : 0.0f;
        auto WorldToScreenPos = [&](float wx, float wy) {
            return Vector2{120.0f + (wx - camX) * renderZoom, BASE_ROCKET_Y + (wy - BASE_ROCKET_Y) * renderZoom};
        };

        Vector2 rocketPos = WorldToScreenPos(s.x, s.y);

        BeginDrawing();
        ClearBackground(Color{136, 185, 235, 255});

        DrawRectangleGradientV(0, 0, GetScreenWidth(), static_cast<int>(GROUND_Y), Color{145, 198, 245, 255}, Color{224, 241, 255, 255});
        DrawRectangle(0, static_cast<int>(GROUND_Y), GetScreenWidth(), GetScreenHeight() - static_cast<int>(GROUND_Y), Color{245, 245, 250, 255});

        for (int i = 0; i < GetScreenWidth(); i += 140) {
            int x = i - (static_cast<int>(s.distance * 0.06f) % 140);
            DrawLine(x, static_cast<int>(GROUND_Y), x + 48, static_cast<int>(GROUND_Y + 62), Color{220, 220, 228, 255});
        }

        DrawRectangle(44, static_cast<int>(GROUND_Y - 74), 40, 74, Color{92, 92, 100, 255});
        DrawRectangle(32, static_cast<int>(GROUND_Y - 86), 62, 14, Color{138, 54, 54, 255});

        for (const Enemy& e : s.enemies) {
            if (!e.alive) continue;
            Vector2 ep = WorldToScreenPos(e.x, e.y);
            if (ep.x < -40.0f || ep.x > static_cast<float>(GetScreenWidth()) + 40.0f) continue;

            if (e.type == 0) {
                DrawCircleV(ep, e.radius * renderZoom, Color{210, 74, 76, 255});
                DrawCircleV(ep, 5.0f * renderZoom + 3.0f, Color{255, 220, 220, 255});
            } else {
                DrawTriangle({ep.x - 18.0f * renderZoom, ep.y - 8.0f * renderZoom}, {ep.x - 18.0f * renderZoom, ep.y + 8.0f * renderZoom}, {ep.x + 14.0f * renderZoom, ep.y}, Color{250, 130, 78, 255});
            }
        }

        const float rocketScale = 0.88f;
        DrawCircleV(rocketPos, 16.0f * rocketScale, Color{235, 72, 92, 255});
        DrawRectangle(static_cast<int>(rocketPos.x - 9 * rocketScale), static_cast<int>(rocketPos.y - 31 * rocketScale), static_cast<int>(18 * rocketScale), static_cast<int>(31 * rocketScale), Color{242, 242, 246, 255});
        DrawTriangle({rocketPos.x, rocketPos.y - 46.0f * rocketScale}, {rocketPos.x - 10.0f * rocketScale, rocketPos.y - 31.0f * rocketScale}, {rocketPos.x + 10.0f * rocketScale, rocketPos.y - 31.0f * rocketScale}, Color{255, 110, 120, 255});

        if (s.inFlight && IsKeyDown(KEY_UP) && s.fuel > 0.0f) {
            const float flameWobble = 8.0f * static_cast<float>(std::sin(GetTime() * 30.0));
            DrawTriangle({rocketPos.x - 7.0f * rocketScale, rocketPos.y + 16.0f * rocketScale}, {rocketPos.x + 7.0f * rocketScale, rocketPos.y + 16.0f * rocketScale}, {rocketPos.x, rocketPos.y + (36.0f + flameWobble) * rocketScale}, ORANGE);
        }

        DrawRectangle(14, 14, 380, 128, Color{12, 16, 22, 188});
        DrawText("Sky Lab Idle", 24, 22, 26, Color{240, 245, 250, 255});
        DrawText(TextFormat("$%.0f", s.coins), 24, 54, 24, Color{132, 240, 152, 255});
        DrawText(TextFormat("Best %.0f m", s.bestDistance), 24, 84, 18, Color{202, 230, 255, 255});
        DrawText(TextFormat("Science %.0f", s.science), 24, 106, 18, Color{255, 215, 120, 255});

        DrawRectangle(14, 152, 460, 224, Color{12, 16, 22, 188});
        DrawText("Upgrades (1-6)", 24, 162, 22, Color{240, 245, 250, 255});

        int uy = 190;
        for (int i = 0; i < U_COUNT; ++i) {
            UpgradeId id = static_cast<UpgradeId>(i);
            float cost = UpgradeCost(id, s.levels[id]);
            const Color c = s.coins >= cost ? Color{190, 240, 190, 255} : Color{230, 180, 180, 255};
            DrawText(TextFormat("%d) %-12s Lv.%d $%.0f", i + 1, kUpgrades[i].name, s.levels[id], cost), 24, uy, 18, c);
            uy += 28;
        }

        DrawText("Space launch  Up boost  R rebirth", 24, 348, 16, Color{220, 230, 240, 255});

        DrawRectangle(GetScreenWidth() - 420, 14, 406, 220, Color{12, 16, 22, 188});
        DrawText("Run", GetScreenWidth() - 404, 22, 24, Color{240, 245, 250, 255});
        DrawText(TextFormat("Dist %.0f m", s.distance), GetScreenWidth() - 404, 54, 18, Color{206, 232, 250, 255});
        DrawText(TextFormat("Speed %.1f", s.vx), GetScreenWidth() - 404, 76, 18, Color{206, 232, 250, 255});
        DrawText(TextFormat("Alt %.1f m", (GROUND_Y - s.y) * 0.1f), GetScreenWidth() - 404, 98, 18, Color{206, 232, 250, 255});
        DrawText(TextFormat("Fuel %.1f", std::max(0.0f, s.fuel)), GetScreenWidth() - 404, 120, 18, Color{255, 215, 145, 255});
        DrawText(TextFormat("Enemy Defeated %d", s.enemiesDefeated), GetScreenWidth() - 404, 146, 18, Color{170, 230, 255, 255});
        DrawText(TextFormat("Hits Taken %d", s.hitsTaken), GetScreenWidth() - 404, 168, 18, Color{255, 175, 175, 255});

        DrawRectangle(GetScreenWidth() - 404, 194, 368, 18, Color{34, 38, 48, 255});
        DrawRectangle(GetScreenWidth() - 404, 194, static_cast<int>(368.0f * s.charge), 18, Color{122, 212, 255, 255});

        float nextRebirth = std::floor(s.bestDistance / 1800.0f + s.totalCoins / 30000.0f);
        DrawText(TextFormat("Rebirth gain now: +%.0f", nextRebirth), GetScreenWidth() - 404, 236, 16, Color{255, 220, 132, 255});

        if (s.popTimer > 0.0f) {
            DrawText(TextFormat("+$%.0f", s.popAmount), static_cast<int>(rocketPos.x - 10), static_cast<int>(rocketPos.y - 56 - (1.4f - s.popTimer) * 24.0f), 22, Color{255, 228, 122, 255});
        }

        if (s.eventTimer > 0.0f) {
            int w = MeasureText(s.event.c_str(), 20) + 28;
            DrawRectangle((GetScreenWidth() - w) / 2, GetScreenHeight() - 46, w, 30, Color{12, 16, 22, 220});
            DrawText(s.event.c_str(), (GetScreenWidth() - w) / 2 + 14, GetScreenHeight() - 40, 20, Color{255, 225, 135, 255});
        }

        EndDrawing();
    }

    CloseWindow();
    return 0;
}
