Product Requirements Document (PRD)
Working Title: Cricket Clash — 3D Browser Fighting Game
Field
Value
Version
1.0 (Draft)

---

---

Date
14 Nov 2026
Platform
Web (desktop + mobile browsers)
Genre
3D fighting game (Tekken-style, 2.5D/3D arena)
Status
Draft for review

1. Overview
   1.1 Vision
   A fast, free-to-play browser fighting game where players pick from a roster of fictional, cricket-inspired fighters and battle in 1v1 matches against the CPU or a friend. The game should feel responsive and polished, loading quickly and running smoothly on mid-range laptops and phones, with no install required.
   1.2 Inspiration
   Tekken / Street Fighter for the combat structure: rounds, health bars, combos, blocking, special moves.
   FightKaro.com for browser delivery, humorous character-driven roster, and instant-play accessibility.
   1.3 Goals
   Deliver tight, satisfying combat with clear hit feedback.
   Instant-play experience: playable within ~10 seconds of opening the link.
   Support desktop keyboard/gamepad and mobile touch controls.
   Launch with 6–8 distinct fighters, each with a unique playstyle.
   Build an architecture that allows online multiplayer in a later phase.
   1.4 Non-Goals (v1)
   Online multiplayer (Phase 2).
   Real cricketer likenesses, names or licensed IP.
   Ranked ladders, tournaments, character customization marketplaces.
   Native mobile apps.

2. Feasibility Summary
   Building this is feasible with current web tech.
   Area
   Feasibility
   Notes
   3D rendering in browser
   High
   WebGL2 via Three.js or Babylon.js; WebGPU as progressive enhancement

---

---

---

Fighting game mechanics
High
Deterministic fixed-timestep loop, frame-based hit/hurtboxes
Local 2P + CPU AI
High
State-machine / behavior-tree AI with difficulty levels
Mobile performance
Medium
Needs low-poly models, texture atlases, 30/60 fps scaling
Online multiplayer
Medium–Low
Needs rollback netcode, server infra; deferred to Phase 2
Real player likeness
Legal risk
Avoided in v1 by using fictional characters

Main risks: 3D art/animation cost, game feel tuning, mobile input ergonomics, asset load size.

3. Target Audience
   Primary: Casual gamers aged 13–35, especially cricket fans, who want quick matches on phone or laptop.
   Secondary: Friends playing local 2P on one device; streamers and social sharers.
   Primary market: India, with global English-speaking audience.

4. Core Gameplay
   4.1 Game Modes (v1)
   Mode
   Description
   Single Player (vs CPU)
   Pick fighter, face a ladder of CPU opponents with rising difficulty

---

---

Local 2-Player
Two players on one device (split keyboard or two gamepads; touch split-screen buttons on tablets)
Practice / Training
Dummy opponent, move list overlay, hitbox display toggle
Quick Fight
Pick any fighter and opponent, single match

Phase 2: Online friend match via room code; Phase 3: ranked matchmaking.
4.2 Match Structure
Best of 3 rounds (configurable 1/3/5).
Round timer: 60 seconds (configurable 30/60/99/infinite).
Win by KO or higher health when time expires; draw triggers sudden-death round.
Between rounds: short intro/outro animations, skippable.
4.3 Combat Mechanics
Movement
Walk forward/back, jump, crouch, forward/back dash.
Sidestep (3D lateral movement) with a limited-depth arena (Tekken-style) or a 2.5D lane, finalized in prototype (see Open Questions).
Camera follows both fighters, auto-zoom based on distance.
Attacks
Punch (light/heavy): high/mid hits, fast.
Kick (light/heavy): longer range, slower, can be low/mid/high.
Throw/grab: beats block, can be broken or teched.
Launchers & juggles: limited air combos with damage scaling.
Combos: chains of 2–6 hits with input buffering and cancel windows.
Defense
Block: hold back to block high/mid; crouch-block for low.
Parry/Deflect (optional, v1.1): timed input for counter window.
Evade: sidestep avoids linear attacks.
Chip damage: small damage through block on specials.
Special Moves
Each fighter has 3–4 specials performed via directional + button inputs (e.g. ↓→ + Punch), simplified for mobile (see 7.3).
Super / Ultimate: requires a full meter, cinematic camera.
Meter system: fills by dealing/taking damage; spent on supers and enhanced specials.
Status feedback
Hit-stop (freeze frames), screen shake, impact sparks, sound effects, damage numbers (optional toggle).
Stun, knockdown, wall bounce, ring-out (optional per arena).
4.4 Cricket-Themed Flavor (fictional)
Moves draw from cricket without using real names or likenesses:
Bat swings, helicopter-shot style spins, yorker-slide kicks, bouncer throws, catch-and-counter parry, stumps as weapons.
Arena props: boundary ropes, pitch, stadium crowd, floodlights.
Super move examples: "Last Over Fury", "Hat-trick Combo".

5. Characters
   5.1 Roster (v1: 6–8 fictional fighters)
   Each fighter has an archetype, a silhouette that reads quickly, and signature gear.

#

Placeholder Name
Archetype
Playstyle
1
The Opener
Balanced / all-rounder
Easy to learn, solid tools

---

---

---

---

2
The Finisher
Heavy hitter
Slow, high damage, strong supers
3
The Spinner
Trickster
Unpredictable angles, evasive, low damage
4
The Quickie
Speedster
Fast pressure, short combos
5
The Keeper
Grappler/counter
Throws and counter-catches
6
The Captain
Zoner / strategist
Mid-range control, projectiles (ball throws)
7 (optional)
The Umpire
Unlockable boss / secret
Powerful, special rule-based moves
8 (optional)
The Rookie
Beginner-friendly
Simple inputs, forgiving

Names above are placeholders; final names/designs must be original and cleared for trademark.
5.2 Per-Character Requirements
Low-poly 3D model (target 8k–15k triangles), rigged to a shared humanoid skeleton.
Animation set: idle, walk (fwd/back), run/dash, jump, crouch, block, hit reactions (high/mid/low), knockdown/get-up, win/lose poses, taunt.
Moveset: ~12 normals, 3–4 specials, 1 super, 1–2 throws.
2–3 alternate color skins (post-launch cosmetics).
Character select portrait, voice lines (short), theme music sting.
5.3 Legal / IP Guidance
v1 uses fictional characters only.
Avoid real names, jersey numbers, team logos, trademarked catchphrases or recognizable facial likenesses.
If real or parody likenesses are added later, obtain written licensing/legal review first.

6. Game Features & Screens
   Loading screen — progress bar, tips; core assets streamed progressively.
   Main menu — Play, Local 2P, Training, Settings, Credits.
   Character select — 3D preview/turntable, stats (power, speed, defense), move list.
   Arena select — 2–3 stadium arenas (day, night, rain variants optional).
   Pre-fight intro — versus screen, taunt animations.
   In-fight HUD — health bars, round timer, super meter, round wins, combo counter, pause button.
   Result screen — winner, stats (hits, combos, damage), rematch / change fighter / menu.
   Settings — controls remapping, graphics quality (low/med/high), audio sliders, language, touch layout size.
   Pause menu — resume, move list, restart, quit.
   Tutorial — short interactive onboarding (move, attack, block, special).

7. Controls
   7.1 Keyboard (default, remappable)
   Action
   Player 1
   Player 2
   Move
   W A S D
   Arrow keys

---

---

---

Light Punch / Heavy Punch
J / K
Numpad 1 / 2
Light Kick / Heavy Kick
U / I
Numpad 4 / 5
Block
L
Numpad 3
Special / Super
O / Space
Numpad 6 / 0

7.2 Gamepad
Standard Gamepad API mapping (Xbox/PlayStation layouts), d-pad + stick for movement.
Face buttons for punches/kicks, trigger for block, shoulder for special.
7.3 Mobile Touch
Virtual joystick or d-pad on the left; 4 attack buttons + block on the right.
Simplified specials: dedicated "Special" button and swipe gestures instead of motion inputs.
Adjustable button size/opacity/position; haptic feedback where supported.
Landscape orientation enforced with a rotate prompt.
7.4 Input Handling Requirements
Input buffer window of ~6–10 frames.
Fixed 60 Hz logic tick independent of render frame rate.
Input latency target: under 50 ms from press to on-screen response on desktop.

8. CPU AI
   Difficulty levels: Easy, Normal, Hard, Expert (adjusts reaction time, block rate, combo usage, punish accuracy).
   Architecture: finite state machine layered with behavior trees; spacing awareness, mix-ups, and punish logic.
   Must not read inputs frame-perfectly; uses simulated reaction delay and randomness.
   Per-character AI profiles to reflect archetype (e.g. Keeper tries throws).
   Rubber-banding is minimal and not exposed to the player.

9. Technical Requirements
   9.1 Recommended Stack
   Layer
   Recommendation
   Rendering
   Three.js or Babylon.js (WebGL2; WebGPU optional)

---

---

Language
TypeScript
Build
Vite
Game logic
Custom deterministic fixed-timestep ECS or state machine
Physics
Lightweight custom collision (AABB/capsule hit/hurtboxes); avoid heavy general physics for combat
Animation
glTF/GLB with skeletal animation, animation events for hit frames
Audio
Web Audio API / Howler.js
Input
Keyboard, Gamepad API, Pointer/Touch events
UI
HTML/CSS overlay or in-engine UI for HUD and menus
Hosting
Static hosting + CDN (Cloudflare / Vercel / Netlify)
Analytics
Privacy-friendly analytics (e.g. PostHog / Plausible)
Backend (Phase 2)
Node.js + WebSockets/WebRTC; rollback netcode library

9.2 Performance Targets
Metric
Target
Frame rate
60 fps on mid-range laptop; 30–60 fps on mid-range mobile

---

---

Initial load (to menu)
< 10 s on 4G, initial payload < 15 MB
Full asset size
< 60 MB total, streamed lazily
Draw calls
< 150 per frame
Triangle budget
~40k per scene including both fighters
Memory
< 500 MB on mobile

Techniques: texture atlases, KTX2/Basis texture compression, Draco/meshopt compression, LOD, baked lighting, instancing for crowd, dynamic quality scaling.
9.3 Architecture Principles
Deterministic simulation separated from rendering (required for future rollback netcode and replays).
Data-driven moves: frame data (startup, active, recovery, hit/blockstun, damage, hitbox/hurtbox) stored in JSON per character.
Event-driven animation sync to frame data.
Input abstraction layer so human, CPU and (later) network inputs share one interface.
9.4 Browser Support
Chrome, Edge, Safari (iOS 16+), Firefox — latest two versions.
Graceful fallback and warning when WebGL2 is unavailable.

10. Art & Audio Direction
    Style: stylized low-poly 3D with bold colors and exaggerated proportions; strong, readable silhouettes.
    Arenas: stylized cricket stadium at night/day, backyard gully cricket arena, rooftop pitch.
    VFX: impact flashes, speed lines, dust, trails on bat swings; kept lightweight (sprites/particles).
    Camera: dynamic, with cinematic cuts for supers and KO slow-motion.
    Audio: punchy hit SFX, crowd reactions that respond to combos, energetic music with dhol/rock fusion style; announcer lines ("Round 1", "Fight!", "KO!").
    Accessibility: subtitles, color-blind friendly health/meter colors, reduced-flash option.

11. Monetization (Proposed, to be confirmed)
    v1: Free to play, light non-intrusive ads on menu/results screens only (never mid-fight), or fully ad-free at launch.
    Later options: cosmetic skins, character unlock packs, optional rewarded ads for unlocks, sponsorship arenas.
    No pay-to-win elements.

12. Analytics & KPIs
    KPI
    Target (first 3 months)
    Time to first match
    < 60 seconds

---

---

Tutorial completion

> 60%
> Day-1 retention
> 30%
> Day-7 retention
> 10%
> Avg session length
> 8 minutes
> Crash/error-free sessions
> 99%
> Mobile frame rate ≥ 30 fps
> 90% of sessions

Events tracked: character picked, mode chosen, match result, round duration, quit points, device/performance tier.

13. Development Roadmap
    Phase 0 — Prototype (4–6 weeks)
    Fixed-timestep loop, 2 placeholder fighters, movement, punch/kick, block, hit detection, basic HUD.
    Decide arena structure (2.5D vs sidestep 3D) and camera.
    Validate game feel and mobile performance.
    Phase 1 — Vertical Slice (6–8 weeks)
    2 fully animated characters with full movesets, 1 arena, CPU AI (3 levels), local 2P, audio, menus.
    Phase 2 — MVP / Launch (8–10 weeks)
    6–8 characters, 2–3 arenas, touch controls, tutorial, settings, analytics, optimization, QA.
    Phase 3 — Post-launch
    Online friend matches (room codes, rollback netcode).
    New characters, skins, seasonal arenas, ranked mode, replays.
    Estimated total to MVP: ~5–6 months with a small team (see Team).

14. Suggested Team
    Role
    Count
    Game/gameplay engineer (TypeScript, Three.js)
    2

---

---

3D character artist + rigger
1–2
Animator (combat animation)
1
Environment / VFX artist
1 (part-time)
UI/UX designer
1 (part-time)
Sound designer / composer
1 (contract)
Game designer (combat balance)
1
QA
1
Producer / PM
1

Smaller teams can reduce scope to 4–6 fighters and reuse a shared animation set with per-character variations.

15. Risks & Mitigations
    Risk
    Impact
    Mitigation
    Poor game feel / input lag
    High
    Early prototype, frame-data tuning, fixed timestep, playtests

---

---

---

Heavy assets hurt mobile load/perf
High
Compression, LODs, quality presets, lazy loading
3D animation volume is large
High
Shared skeleton, retargeted base animations, reuse across characters
Touch controls too clumsy
Medium
Simplified specials, customizable layout, usability testing
Legal issues with likeness/IP
High
Fictional characters only; legal review before any parody content
Online netcode complexity
Medium
Deterministic design from day 1; postpone to Phase 2
Browser fragmentation (iOS Safari)
Medium
Test matrix, feature detection, fallbacks
Balance issues
Medium
Data-driven frame data, telemetry, patchable JSON

16. Acceptance Criteria (MVP)
    [ ] 6+ distinct fighters selectable, each with unique normals, specials and a super.
    [ ] Vs CPU with 3+ difficulty levels and a working local 2-player mode.
    [ ] Punch, kick, block, throw, jump, crouch, dash, combos and special moves function reliably.
    [ ] Stable 60 fps on reference desktop and ≥30 fps on reference mid-range phone.
    [ ] Initial load under 10 s on 4G; total payload within budget.
    [ ] Keyboard, gamepad and touch controls fully functional and remappable (where applicable).
    [ ] Tutorial, settings, pause and results flows complete.
    [ ] Analytics events firing; no critical bugs open.
    [ ] No real-person likenesses or third-party IP in shipped assets.

17. Open Questions
    Arena movement: full 3D sidestep (Tekken) or 2.5D side-view lane (Street Fighter) for MVP? A 2.5D lane is cheaper and better for mobile.
    Monetization: ad-supported, cosmetic-only, or ad-free at launch?
    Regional launch: English only or Hindi/Gujarati localization at launch?
    Hosting/budget: target monthly infra budget (matters for Phase 2 online play)?
    Team: in-house build, freelancers, or agency? This affects timeline.
    Brand: final game title and character names.

18. Appendix
    A. Sample Frame Data Schema (per move)
    {
    "id": "light_punch",
    "input": "LP",
    "startup": 10,
    "active": 3,
    "recovery": 12,
    "damage": 8,
    "hitLevel": "high",
    "onHit": 4,
    "onBlock": -2,
    "hitbox": { "x": 0.6, "y": 1.4, "w": 0.5, "h": 0.4 },
    "cancelInto": ["heavy_punch", "special_1"]
    }
    B. Glossary
    Frame data: timing values (startup/active/recovery) defining a move's behavior at 60 fps.
    Hitbox / hurtbox: regions that deal / receive damage.
    Rollback netcode: online technique that predicts inputs and rewinds to correct, giving low-latency fights.
    Hit-stop: brief freeze on impact that adds weight to hits.
