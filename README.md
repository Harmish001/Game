# 🏏 Cricket Clash — 3D Browser Fighting Game

> **Cricket Clash** is a fast, responsive, 3D browser fighting game where players command fictional cricket-inspired fighters in 1v1 matches against CPU AI or local friends. Powered by Three.js, TypeScript, and a deterministic 60Hz physics engine.

---

## 🎮 Play & Development

### 1. Start Development Server
```bash
npm run dev
```
Open [http://localhost:5173/](http://localhost:5173/) in Chrome, Edge, Safari, or Firefox.

### 2. Build for Production
```bash
npm run build
```
Creates an optimized static bundle in `dist/` (< 200 kB gzipped).

### 3. Run Automated Mechanics Verification
```bash
npx tsx scripts/verify-game.ts
```
Executes 309 frame data, collision, AI, and combat balance tests.

---

## 🕹️ Controls

### Keyboard (Player 1)
| Action | Key |
|---|---|
| **Move / Jump / Crouch** | `W` `A` `S` `D` |
| **Dash Forward / Backward** | Double-tap `D` or `A` |
| **Light Punch (Jab)** | `J` |
| **Heavy Punch (Cover Drive)** | `K` |
| **Light Kick (Shin Tap)** | `U` |
| **Heavy Kick (Roundhouse)** | `I` |
| **Block** | `L` (or hold back `A` / `D`) |
| **Special Move** | `O` (or motion inputs below) |
| **Super / Ultimate** | `Space` (requires 100% Super Gauge) |
| **Grab / Throw** | `J` + `U` (Light Punch + Light Kick) |
| **Debug Hitbox View** | `H` |
| **Pause Game** | `Escape` |

### Keyboard (Player 2 — Local 2-Player Mode)
| Action | Key |
|---|---|
| **Move / Jump / Crouch** | `Arrow Keys` |
| **Light Punch / Heavy Punch** | `Numpad 1` / `Numpad 2` |
| **Light Kick / Heavy Kick** | `Numpad 4` / `Numpad 5` |
| **Block** | `Numpad 3` |
| **Special / Super** | `Numpad 6` / `Numpad 0` |

### Motion Inputs (Street Fighter / Tekken Style)
- **Quarter Circle Forward (↓ ↘ → + Punch):** Signature Slash / Projectile
- **Quarter Circle Back (↓ ↙ ← + Kick):** Spin / Launcher
- **Dragon Punch (→ ↓ ↘ + Kick/Punch):** Anti-Air / Slide
- **Super Move:** Requires full 100% Super Meter

### Mobile / Touch Controls
- **Virtual 8-Way Joystick:** Bottom-left zone
- **Action Buttons:** `LP`, `HP`, `LK`, `HK`, `BLK`, `SP` in the bottom-right zone
- **Automatic Landscape Lock:** Prompt appears when held in portrait

---

## 🌟 6 Distinct Fighters

| Fighter | Archetype | Style & Signature Specials |
|---|---|---|
| **The Opener** | Balanced | Master of textbook cover drives, helicopter bat spins, and yorker slides. Super: *Last Over Fury*. |
| **The Finisher** | Heavy Slugger | Colossal willow swings with armored startup and massive hit damage. Super: *Hat-trick Combo*. |
| **The Spinner** | Trickster | Elusive drift footwork, tricky feints, and centrifugal launches. Super: *Web of Spin*. |
| **The Quickie** | Speedster | Lightning 150 km/h sprint rushes, rapid jabs, and slipstream dash cancels. Super: *150 KPH Express*. |
| **The Keeper** | Grappler | Iron mitt counter grabs, close-range unblockable takedowns. Super: *Lightning Stumping*. |
| **The Captain** | Zoner | Strategic space control with lofted ball tosses and barrier traps. Super: *Masterclass Declaration*. |

---

## 🏟️ 3 Stadium Arenas
1. **Stadium Day:** Full cricket ground with clay pitch, white crease markings, wooden wickets with bails, foam boundary wedges, tiered stands, 180 instanced spectators, and floodlights.
2. **Gully Cricket:** Rough brick street alleyway, asphalt pitch, plastic chair wickets.
3. **Rooftop Pitch:** High-rise sunset skyline with rooftop turf.

---

## ⚙️ Core Technical Features
- **Deterministic 60 Hz Game Loop:** Accumulator pattern guarantees identical frame execution regardless of 60/120/144Hz refresh rates.
- **2.5D Camera Engine:** Auto-tracking perspective camera with dynamic distance zoom and impact screen shake.
- **Full Fighting Game Mechanics:**
  - High / Mid / Low hit levels & blocking
  - Counter-hit 1.25x damage & hitstun bonuses
  - Gatling cancel windows (LP → HP → Special → Super)
  - Hit-stop freeze frames for heavy impacts
  - Combo damage scaling (100% → 85% → 75% → 60% floor)
  - Unblockable throw grabs & tech breaks
  - Hard knockdowns & get-up roll invulnerability
- **Web Audio API Synth Engine:** 100% offline procedural SFX (willow bat crack, punch thuds, block clank, super risers, KO gong, crowd cheers, announcer chords, techno-dhol battle music).
- **Procedural 3D Fighter Meshes:** Stylized 3D geometry with cricket helmets, wire face guards, batting pads, and willow bats synchronized to 60fps frame data.
- **CPU AI System:** 4 difficulty tiers (Easy, Normal, Hard, Expert) with spacing awareness, whiff punishes, and anti-air reactions.
- **Lightweight:** Entire production build is **162 kB gzipped**, loading in under 1 second.

