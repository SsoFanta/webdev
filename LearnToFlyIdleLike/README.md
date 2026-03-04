# Sky Lab Idle (Launch Tycoon)

Inspired by launch-idle progression games: repeated launches, upgrades, automation, and rebirth meta-progression.

## Controls

- `Space` hold/release: charge and launch
- `Up Arrow`: boost while in flight
- `1..6`: buy upgrades
- `R`: rebirth (prestige reset for science points)

## Gameplay Loop

- Launch and fly farther to earn coins.
- Buy upgrades to increase launch power, reduce drag, boost fuel, improve bounces, improve coin gain, and unlock auto-launching.
- Rebirth for permanent science bonuses that improve future runs.

## Build

```powershell
cmake -S . -B build
cmake --build build --config Release
```

Run:

```powershell
.\build\Release\LearnToFlyIdleLike.exe
```
