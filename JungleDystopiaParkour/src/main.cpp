#include "raylib.h"
#include "raymath.h"

#include <algorithm>
#include <cmath>
#include <vector>

struct Body {
    Vector2 pos{};
    Vector2 vel{};
    Vector2 half{16.0f, 30.0f};
    bool grounded = false;
    bool onWallLeft = false;
    bool onWallRight = false;
    float coyoteTimer = 0.0f;
    float jumpBufferTimer = 0.0f;
};

struct Platform {
    Rectangle rect{};
    bool oneWay = false;
};

struct RainDrop {
    Vector2 p{};
    float speed = 0.0f;
    float len = 0.0f;
};

static float ClampF(float v, float lo, float hi) {
    return std::max(lo, std::min(hi, v));
}

static bool AABBOverlap(const Rectangle& a, const Rectangle& b) {
    return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

static void ResolvePlayerVsPlatforms(Body& b, const std::vector<Platform>& plats, float prevBottom, bool movingDown) {
    b.grounded = false;
    b.onWallLeft = false;
    b.onWallRight = false;

    Rectangle playerRect{
        b.pos.x - b.half.x,
        b.pos.y - b.half.y,
        b.half.x * 2.0f,
        b.half.y * 2.0f
    };

    for (const Platform& p : plats) {
        if (!AABBOverlap(playerRect, p.rect)) continue;

        const float leftPen = (playerRect.x + playerRect.width) - p.rect.x;
        const float rightPen = (p.rect.x + p.rect.width) - playerRect.x;
        const float topPen = (playerRect.y + playerRect.height) - p.rect.y;
        const float bottomPen = (p.rect.y + p.rect.height) - playerRect.y;

        float minPen = leftPen;
        int axis = 0; // 0 left,1 right,2 top,3 bottom
        if (rightPen < minPen) { minPen = rightPen; axis = 1; }
        if (topPen < minPen) { minPen = topPen; axis = 2; }
        if (bottomPen < minPen) { minPen = bottomPen; axis = 3; }

        if (p.oneWay) {
            const float platformTop = p.rect.y;
            const float currBottom = playerRect.y + playerRect.height;
            const bool validLanding = movingDown && prevBottom <= platformTop + 2.0f && currBottom >= platformTop;
            if (!validLanding) continue;

            b.pos.y = platformTop - b.half.y;
            b.vel.y = 0.0f;
            b.grounded = true;
            playerRect.y = b.pos.y - b.half.y;
            continue;
        }

        if (axis == 0) {
            b.pos.x = p.rect.x - b.half.x;
            b.vel.x = std::min(0.0f, b.vel.x);
            b.onWallRight = true;
        } else if (axis == 1) {
            b.pos.x = p.rect.x + p.rect.width + b.half.x;
            b.vel.x = std::max(0.0f, b.vel.x);
            b.onWallLeft = true;
        } else if (axis == 2) {
            b.pos.y = p.rect.y - b.half.y;
            b.vel.y = std::min(0.0f, b.vel.y);
            b.grounded = true;
        } else {
            b.pos.y = p.rect.y + p.rect.height + b.half.y;
            b.vel.y = std::max(0.0f, b.vel.y);
        }

        playerRect.x = b.pos.x - b.half.x;
        playerRect.y = b.pos.y - b.half.y;
    }
}

int main() {
    const int screenW = 1600;
    const int screenH = 900;
    InitWindow(screenW, screenH, "Neon Vines: Jungle Dystopia Parkour");
    SetTargetFPS(144);

    Body player;
    player.pos = {140.0f, 220.0f};

    std::vector<Platform> level = {
        {{-200.0f, 760.0f, 3700.0f, 180.0f}, false},
        {{220.0f, 665.0f, 180.0f, 40.0f}, false},
        {{520.0f, 585.0f, 220.0f, 40.0f}, false},
        {{850.0f, 510.0f, 240.0f, 36.0f}, false},
        {{1200.0f, 440.0f, 240.0f, 36.0f}, false},
        {{1510.0f, 355.0f, 170.0f, 34.0f}, false},
        {{1800.0f, 515.0f, 300.0f, 34.0f}, false},
        {{2180.0f, 620.0f, 240.0f, 34.0f}, false},
        {{2520.0f, 540.0f, 200.0f, 34.0f}, false},
        {{2780.0f, 470.0f, 180.0f, 34.0f}, false},
        {{3090.0f, 420.0f, 210.0f, 34.0f}, false},
        {{360.0f, 470.0f, 130.0f, 18.0f}, true},
        {{960.0f, 360.0f, 120.0f, 18.0f}, true},
        {{2060.0f, 420.0f, 140.0f, 18.0f}, true},
        {{2890.0f, 320.0f, 120.0f, 18.0f}, true},
        {{1680.0f, 220.0f, 48.0f, 540.0f}, false},
        {{2420.0f, 260.0f, 44.0f, 500.0f}, false}
    };

    std::vector<RainDrop> rain(260);
    for (int i = 0; i < static_cast<int>(rain.size()); ++i) {
        rain[i].p = {GetRandomValue(0, 3800) * 1.0f, GetRandomValue(-900, 900) * 1.0f};
        rain[i].speed = 380.0f + GetRandomValue(0, 260);
        rain[i].len = 9.0f + GetRandomValue(0, 14);
    }

    float camX = 0.0f;
    float bestX = player.pos.x;

    const float gravity = 1800.0f;
    const float groundAccel = 5200.0f;
    const float airAccel = 2500.0f;
    const float maxSpeed = 500.0f;
    const float groundFriction = 11.0f;
    const float airDrag = 0.9f;
    const float jumpVel = -760.0f;
    const float wallJumpX = 470.0f;
    const float wallJumpY = -700.0f;
    const float coyoteTime = 0.11f;
    const float jumpBuffer = 0.12f;

    while (!WindowShouldClose()) {
        float dt = ClampF(GetFrameTime(), 0.0f, 0.033f);

        bool left = IsKeyDown(KEY_A) || IsKeyDown(KEY_LEFT);
        bool right = IsKeyDown(KEY_D) || IsKeyDown(KEY_RIGHT);
        bool jumpPressed = IsKeyPressed(KEY_SPACE) || IsKeyPressed(KEY_W) || IsKeyPressed(KEY_UP);
        bool jumpHeld = IsKeyDown(KEY_SPACE) || IsKeyDown(KEY_W) || IsKeyDown(KEY_UP);

        if (jumpPressed) player.jumpBufferTimer = jumpBuffer;
        else player.jumpBufferTimer = std::max(0.0f, player.jumpBufferTimer - dt);

        if (player.grounded) player.coyoteTimer = coyoteTime;
        else player.coyoteTimer = std::max(0.0f, player.coyoteTimer - dt);

        float moveInput = (right ? 1.0f : 0.0f) - (left ? 1.0f : 0.0f);
        float accel = player.grounded ? groundAccel : airAccel;
        player.vel.x += moveInput * accel * dt;

        if (moveInput == 0.0f) {
            if (player.grounded) player.vel.x = player.vel.x * std::exp(-groundFriction * dt);
            else player.vel.x = player.vel.x * std::exp(-airDrag * dt);
        }

        player.vel.x = ClampF(player.vel.x, -maxSpeed, maxSpeed);

        if (player.jumpBufferTimer > 0.0f) {
            if (player.coyoteTimer > 0.0f) {
                player.vel.y = jumpVel;
                player.grounded = false;
                player.coyoteTimer = 0.0f;
                player.jumpBufferTimer = 0.0f;
            } else if (!player.grounded && (player.onWallLeft || player.onWallRight)) {
                player.vel.y = wallJumpY;
                player.vel.x = player.onWallLeft ? wallJumpX : -wallJumpX;
                player.jumpBufferTimer = 0.0f;
            }
        }

        float gravityScale = 1.0f;
        if (player.vel.y < 0.0f && jumpHeld) gravityScale = 0.72f;
        if (player.vel.y > 0.0f) gravityScale = 1.18f;
        if (!player.grounded && (player.onWallLeft || player.onWallRight) && player.vel.y > 0.0f) gravityScale = 0.35f;

        player.vel.y += gravity * gravityScale * dt;
        player.vel.y = std::min(player.vel.y, 1500.0f);

        float prevBottom = player.pos.y + player.half.y;
        bool movingDown = player.vel.y > 0.0f;
        player.pos.x += player.vel.x * dt;
        player.pos.y += player.vel.y * dt;

        ResolvePlayerVsPlatforms(player, level, prevBottom, movingDown);

        if (player.pos.y > 1000.0f) {
            player.pos = {std::max(120.0f, bestX - 200.0f), 120.0f};
            player.vel = {0.0f, 0.0f};
        }

        bestX = std::max(bestX, player.pos.x);
        camX = ClampF(player.pos.x - 420.0f, 0.0f, 2600.0f);

        for (RainDrop& d : rain) {
            d.p.x += 80.0f * dt;
            d.p.y += d.speed * dt;
            if (d.p.y > screenH + 120.0f) {
                d.p.y = -80.0f;
                d.p.x = camX - 300.0f + GetRandomValue(0, 2200);
            }
        }

        BeginDrawing();
        ClearBackground(Color{10, 17, 24, 255});

        DrawRectangleGradientV(0, 0, screenW, screenH, Color{8, 18, 30, 255}, Color{14, 34, 44, 255});

        for (int i = 0; i < 12; ++i) {
            float x = -static_cast<float>(i) * 250.0f + std::fmod(camX * 0.15f, 3000.0f);
            DrawRectangle(static_cast<int>(x), 220 + (i % 3) * 30, 170, 500, Color{24, 30, 40, 220});
            DrawRectangle(static_cast<int>(x + 20), 250 + (i % 4) * 25, 18, 14, Color{36, 220, 180, 200});
            DrawRectangle(static_cast<int>(x + 70), 340 + (i % 5) * 20, 16, 12, Color{200, 50, 170, 180});
        }

        for (int i = 0; i < 14; ++i) {
            float x = -static_cast<float>(i) * 220.0f + std::fmod(camX * 0.35f, 3100.0f);
            DrawRectangle(static_cast<int>(x), 380 + (i % 2) * 36, 130, 380, Color{36, 44, 56, 255});
            DrawRectangle(static_cast<int>(x + 38), 430 + (i % 3) * 24, 10, 220, Color{18, 140, 90, 220});
            DrawCircle(static_cast<int>(x + 45), 425 + (i % 3) * 24, 18, Color{26, 90, 46, 220});
        }

        for (const Platform& p : level) {
            Rectangle r{p.rect.x - camX, p.rect.y, p.rect.width, p.rect.height};
            if (r.x + r.width < -100 || r.x > screenW + 100) continue;

            if (p.oneWay) {
                DrawRectangleRec(r, Color{48, 108, 78, 255});
                DrawRectangleLinesEx(r, 2.0f, Color{120, 230, 170, 200});
            } else {
                DrawRectangleRec(r, Color{46, 54, 66, 255});
                DrawRectangle(static_cast<int>(r.x), static_cast<int>(r.y), static_cast<int>(r.width), 8, Color{84, 96, 110, 255});
                DrawRectangleLinesEx(r, 2.0f, Color{28, 34, 44, 255});
            }
        }

        for (int i = 0; i < 40; ++i) {
            float vx = std::fmod((i * 91.0f) - camX * 0.55f, 3900.0f) - 250.0f;
            float vy = 130.0f + (i % 7) * 70.0f;
            DrawLineEx({vx, vy}, {vx + 24, vy + 120}, 3.0f, Color{28, 110, 60, 180});
            DrawCircle(static_cast<int>(vx + 26), static_cast<int>(vy + 122), 11, Color{24, 86, 46, 180});
        }

        for (const RainDrop& d : rain) {
            float rx = d.p.x - camX;
            DrawLineEx({rx, d.p.y}, {rx - 3.0f, d.p.y + d.len}, 1.4f, Color{120, 170, 210, 105});
        }

        Vector2 p = {player.pos.x - camX, player.pos.y};
        Color suit = player.grounded ? Color{240, 200, 64, 255} : Color{242, 220, 90, 255};
        DrawRectangleRounded({p.x - 13, p.y - 29, 26, 40}, 0.28f, 6, suit);
        DrawCircle(static_cast<int>(p.x), static_cast<int>(p.y - 36), 11, Color{208, 230, 250, 255});
        DrawCircle(static_cast<int>(p.x + 3), static_cast<int>(p.y - 38), 3, BLACK);
        if (!player.grounded) {
            DrawCircle(static_cast<int>(p.x), static_cast<int>(p.y + 18), 5, Color{36, 220, 180, 180});
        }

        DrawRectangle(14, 14, 390, 112, Color{8, 12, 18, 192});
        DrawText("Neon Vines", 26, 24, 30, Color{220, 236, 245, 255});
        DrawText(TextFormat("Distance: %.0f m", std::max(0.0f, player.pos.x - 120.0f)), 26, 62, 20, Color{150, 230, 185, 255});
        DrawText(TextFormat("Best: %.0f m", std::max(0.0f, bestX - 120.0f)), 26, 86, 20, Color{180, 205, 255, 255});

        DrawRectangle(screenW - 460, 14, 446, 122, Color{8, 12, 18, 192});
        DrawText("Controls", screenW - 444, 24, 25, Color{220, 236, 245, 255});
        DrawText("A/D move  Space jump  Wall slide/jump", screenW - 444, 58, 20, LIGHTGRAY);
        DrawText("Reach the far rooftops", screenW - 444, 84, 20, LIGHTGRAY);
        DrawText("R restart", screenW - 444, 108, 18, GRAY);

        if (IsKeyPressed(KEY_R)) {
            player.pos = {140.0f, 220.0f};
            player.vel = {0.0f, 0.0f};
            camX = 0.0f;
        }

        EndDrawing();
    }

    CloseWindow();
    return 0;
}
