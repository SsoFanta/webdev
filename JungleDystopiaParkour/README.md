# Neon Vines: Jungle Dystopia Parkour

Simple 2D parkour prototype with grounded physics and a jungle-dystopian city visual style.

## Controls

- `A/D` or `Left/Right`: move
- `Space` or `W/Up`: jump
- `R`: restart from spawn

## Physics Features

- Acceleration + friction
- Coyote time + jump buffering
- Variable jump gravity
- Wall slide + wall jump
- One-way platforms + solid collision

## Build

```powershell
cmake -S . -B build
cmake --build build --config Release
```

Run:

```powershell
.\build\Release\JungleDystopiaParkour.exe
```
