# Forge Frontier (Tycoon/Idle 3D Vertical Slice)

C++/raylib 3D tycoon-idle prototype with a stronger progression/economy layer and improved visual presentation.

## Features

- 3D grid-based city builder controls and denser environment dressing
- Economy chain:
  - `Ore -> Metal -> Tech -> Money`
- 5 building types:
  - Mine, Smelter, Fabricator, Power Plant, Trade Hub
- 10 global upgrades with distinct effects
- Passive income, interest system, and market pulse economy
- Instant resource-to-cash sales (`O`, `M`, `T`)
- Save/load support (`savegame_tycoon_v2.txt`)
- Time scaling (`x1..x8`) + pause
- Optional realistic model + albedo texture loading from `assets/models`

## Controls

- Camera:
  - `W/A/S/D` pan
  - Hold `Right Mouse` + drag orbit
  - `Mouse Wheel` zoom
- Build:
  - `1..5` select building
  - `Left Click` place
  - Hover + `U` upgrade
  - Hover + `X` sell
- Upgrades:
  - `Q/E` select upgrade
  - `Enter` buy selected upgrade
- Market:
  - `O` sell ore
  - `M` sell metal
  - `T` sell tech
- Simulation:
  - `Space` pause
  - `-` / `=` time scale down/up
- Save/Load:
  - `F5` save
  - `F9` load
  - `N` new game

## Realistic Models

Drop models into `assets/models` with these names (and optional textures):

- `mine.glb` + optional `mine_albedo.png`
- `smelter.glb` + optional `smelter_albedo.png`
- `fabricator.glb` + optional `fabricator_albedo.png`
- `power.glb` + optional `power_albedo.png`
- `trade_hub.glb` + optional `trade_hub_albedo.png`

If a model is missing, the game uses procedural fallback buildings.

## Build

```powershell
cmake -S . -B build
cmake --build build --config Release
```

Run:

```powershell
.\build\Release\TycoonIdle3D.exe
```

If `cmake` is not on PATH:

```powershell
& "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" -S . -B build -G "Visual Studio 16 2019" -A x64
& "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" --build build --config Release
```
