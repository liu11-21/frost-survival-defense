# 寒霜火爐 · Frostbound Furnace

A lightweight 3D **tower-defence / survival** game built with **Vite + TypeScript + Babylon.js**,
running in a desktop browser at 16:9 on WebGL.

One furnace stands near the centre of a small frozen arena. It is the only thing that matters — if
it falls, the run ends. You gather the first resources by hand from **finite** trees and rocks,
build mines and lumberyards that out-produce you four to five times over, put up a recruit hall,
hire squads with the gold your kills drop, seal the base behind **four walls and their gates**, and
hold the line as enemies push in along **named** approach lanes you can see coming. Ally squads
search the whole map on their own and cross any gate to reach a fight — you never issue a pursue
order.

Everything on the field says which side it is on: allies wear a blue double-arc at their feet,
enemies a red broken ring of spikes, and every fighter, wall and building carries its own health
bar.

---

## Quick start

```bash
npm install
```

```bash
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

```bash
npm run build
```

```bash
npm run preview
```

Requires Node 18+ and a desktop browser with WebGL2 (Chrome, Edge, Firefox).

### Blender → GLB art pipeline

The game keeps its procedural meshes as a safe fallback, while authored assets
live in `assets-source/blender/` and export to `public/assets/models/`. The
Babylon `AssetRegistry` validates required nodes and animation names before any
GLB is instantiated.

```bash
npm run art:template   # create the metric Blender template
npm run art:export     # build hero, basic turret and wall/gate GLBs
npm run art:validate   # write reports/art-validation.json
```

Blender remains optional at runtime, but this machine now has Blender 5.2.0 LTS
installed from the official Blender Foundation Windows ZIP. `BLENDER_PATH` is
configured for the current user; missing/invalid files are still reported and
never make the game unplayable.

**New here? Pick 教學關卡 from the main menu.** It teaches movement, gathering, building,
recruiting, furnace upgrades and defending — one task at a time, and it can be skipped or replayed.
**圖鑑 (Codex)**, also on the main menu, documents every ally, enemy, building, resource and rule
with the numbers the game actually runs on.

---

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / arrows | Move (camera-relative) |
| `Shift` | Sprint |
| **`E`** | **Interact** — build, recruit, upgrade, collect, inspect |
| `Enter` | Confirm the highlighted panel entry |
| `Esc` | Unwinds one layer: dialog → codex → highlight → panel → pause |
| `B` | Build menu · `G` recruit menu · `U` furnace · `N` call next wave · `T` auto-rebuild toggle |
| `M` | Toggle the full tactical map (an always-on minimap sits in the HUD corner) |
| **`1` / `2` / `3`** + AUTO | **Hero skills** — 空中火力支援 / 無限火力 / 地面支援；震地波在戰鬥中自動施放 |
| Mouse wheel | Zoom (limited range) |
| Mouse | Click panels and menus |

Only **one** interaction prompt is ever shown — the nearest valid one — and it states the key, the
action, and the cost or status. The hero attacks entirely on its own: it picks the highest-level
enemy in range, shoots from distance, and switches to a wider melee swing inside 2.2 units. Gathering
is the same — stand next to a tree or rock and the axe swings automatically.

Recruiting uses `G`; skills 1–3 use the number row, while 震地波 stays automatic so it never steals an input during combat.

### Hero active skills

Each is purely cooldown-gated — like the hero's own auto-attack, none of them spend a resource:

| Key | Skill | Effect | Cooldown |
| --- | --- | --- | --- |
| `1` | 空中火力支援 | Three 1000-damage strikes around the furnace, then 500 damage per second for 10 seconds | 80 s (40 s initial) |
| `2` | 無限火力 | Doubles every attack building's fire rate for 5 seconds; duration and cooldown begin together | 20 s (10 s initial) |
| `3` | 地面支援 | Summons a three-person escort for 10 seconds: shared 5000 HP, 300 attack, engages and taunts only once enemies target the hero | 30 s after withdrawal (15 s initial) |
| AUTO | 震地波 | When the hero is attacking and an enemy is inside the forward cone, automatically hits for 300, knocks back, and applies +10% damage taken for 3 seconds | 10 s |

A small skill row sits under the hero's HP bar in the HUD, showing each key, name, and a cooldown fill
that reaches "ready" at exactly the moment `1`/`2`/`3` would actually work; the fourth card shows AUTO and only fires from a real combat lock — same source of truth,
so the HUD can never lie about readiness. A new run applies each skill's documented initial cooldown.

### Developer keys

| Key | Panel |
| --- | --- |
| `F3` | Performance monitor + stress test + quality |
| `F7` | AI diagnostics (states, targets, stuck counters, watchdog) |
| `F8` | Opens the stress-test controls |
| `F9` | Balance tool (multipliers, wave jump, spawn boss, reset) |

**Using any test tool marks the run as untracked — it can never write to the leaderboard.** The same
applies to the tutorial.

---

## The loop

1. **Hand-gather** from finite nodes — one wood per **0.55 s**, one stone per **0.70 s**. Each strike
   lands on the tool's hit frame; walking away stops production within 0.15 s.
2. **Mine (35 wood)** and **lumberyard (40 stone)** produce 1 per 0.25 s. The indestructible
   **gold mine (110 wood / 90 stone)** produces 1 gold per 0.75 s.
3. **Warehouse (100/90/20)** — until one stands, *every* resource is capped at 100. This is the real
   early gate: stone-heavy walls and the auto-collector are unaffordable without it.
4. **Recruit hall (95/65/15)** unlocks all ten recruitable squad types. Gold comes from kills,
   early-wave rewards, and gold mines.
5. **Walls and towers** close the perimeter and cover the lanes.
6. **Auto-collector** removes the walk-over step; **auto-rebuilder** repairs losses in destruction
   order.
7. **Upgrade the furnace** for hero power, every allied squad's health/attack/speed, every attackable
   facility's health/attack, furnace health, and (endless only) +2 squad slots.

### Finite natural resources

Nodes have real capacity and genuinely run out:

| Node | Small | Medium | Large |
| --- | --- | --- | --- |
| Tree | 6 wood | 10 wood | 16 wood |
| Rock | 8 stone | 14 stone | 22 stone |

A worked tree sheds its canopy tier by tier, then becomes a **stump**; a rock visibly chips down,
then becomes **rubble**. Spent nodes drop their harvest collision and cannot be worked again. The
map opens with **54 wood and 66 stone** in the ground — enough to start, not enough to coast on.
Stage mode never regrows them; endless regrows a tree after 90 s and a rock after 120 s, through a
visible sapling-to-tree animation rather than a pop-in.

---

## Modes

**闖關 Stage** — three levels, each a self-contained 10-wave defence. Nothing carries over. Difficulty
rises through **lane count, enemy mix and starting resources**, not inflated enemy stats
(2 → 3 → 4 lanes at 1.0 / 1.15 / 1.30).

**無限 Endless** — one continuous run, linear scaling only:

```text
enemy health = 1 + 0.08 × (wave − 1)
enemy attack = 1 + 0.05 × (wave − 1)
enemy count  = 1 + 0.06 × (wave − 1)
```

Every 10 waves: one more lane (max 6) and a **three-choice run upgrade**. The first Boss arrives at
wave 20 and then every 10 waves. Furnace levels add **+2 squad slots** here and nowhere else. Scores go to a **local `localStorage`
leaderboard** — per-browser only, explicitly not a verifiable global board.

Furnace upgrades now cap at **Lv.100**. The furnace and every attackable facility share the same
level-scaled recovery: after 15 seconds without taking damage they restore **1% of maximum HP per
second per furnace level**, capped at 10%/s from Lv.10 onward. Every level above 10 also adds one
burst after 8 quiet seconds: Lv.11 starts at **10% of that structure's Lv.11 maximum HP**, and every
later level adds a flat **5,000 HP** instead of another percentage increase. The burst can occur once
per damage cycle.

---

## Reading the battlefield

**Faction badges.** Every friendly — the hero included — stands on a **blue double-arc**; every
hostile stands on a **red broken ring with three spikes**. The two are different *shapes*, not just
different colours, so they separate for a colour-blind player without a mode that swaps anything
out. Whatever the cursor is over, or the hero is currently fighting, gets a brighter amber badge on
top of its own. The model itself is never tinted and never glows: the unit silhouettes already carry
the tier read, and washing them out would throw that away.

Settings offer **關閉 / 簡潔 / 明顯** (off / subtle / clear), defaulting to 明顯. Neutral things —
resource nodes, empty build slots — deliberately use neither colour.

**Health bars.** Everything that can be hurt has one, sized and coloured by what it is:

| | Colour | Shows | Appears |
| --- | --- | --- | --- |
| Enemies | red | `Lv.3 精銳射手` | 4 s after a hit, while targeted or hovered, or within 15 of the player |
| Allies | blue | name | 4 s after a hit, permanently below 50%, warning colour below 25% |
| Structures | amber | name + current/max | 5 s after a hit, permanently below 50%, or within 8 of the player |
| Boss | — | — | **excluded**; it owns the large bar at the top of the screen |

Beyond 52 units the caption is dropped and only the ratio is drawn; beyond 66 the bar is not drawn at
all. Captions are created on demand and only repainted when the text changes, which is what makes a
hundred and fifty simultaneous bars affordable.

**Where the attack is coming from.** Each approach is a named place — 北方森林, 南方冰原, 東側山口,
西側廢墟, 東北關隘, 西南斷崖 — never "lane 1". A packed-snow road with inward-pointing arrows marks
each one on the ground. Four seconds before a wave the road pulses red and a card names the lanes and
head counts:

```text
第 6 波即將來襲
北方森林：8 名敵人
東側山口：5 名敵人，包含 1 名高階單位
```

During the fight a red marker pins to the screen edge for anything off camera — one per lane, not one
per enemy — and the lane strip on the left lists each approach, how many are left on it, whether it
is walled, and whether anything has got through.

**Squad status.** The panel on the right lists only the types you actually have, with how many squads
of each, how many individuals survive, and a status word from their average health (**正常** ≥60%,
**受傷** 30–59%, **危險** <30%). Clicking a row highlights every unit of that type on the field;
clicking again or pressing Esc clears it. A wiped type shows **全滅** for a few seconds and then
leaves the list.

---

## Balance changes in this pass

**Gold economy.** Stage 1 now opens with **15 gold**, and the two gates that competed for it came
down: recruit hall 20 → **15 gold**, warehouse 30 → **20 gold**. The opening 15 gold exactly covers
the recruit hall, so the first real decision is *hall now, or tower now* rather than *neither yet*.

**Walls.** 7000 → 4500 HP per short segment, then superseded by the four-side perimeter rework below
(12000 HP per whole side, 160/500/50 stone). Higher tiers still hit fortifications harder than they
hit people: **Lv4 ×1.5, Lv5 ×1.2, Boss ×2.0** against walls, towers and buildings. A wall rebuilt
repeatedly **inside one wave** returns weaker — 90%, 80%, then a 70% floor — and the penalty clears
completely at the next wave. Sealing the perimeter is still strong, but it is now a maintained
position rather than a one-time purchase.

**Boss, three phases.** Same 10000 HP / 300 attack / 100 gold, but:

- **Phase 1 (100–70%)** — advances along its lane, prioritises blocking walls, ×2 against them.
- **Phase 2 (70–35%)** — gains **震地 (slam)**: 8 s cooldown, **1.2 s telegraph** with a growing red
  ground ring, radius 5. Damage is capped at **35% of each victim's own maximum health** and half
  that against structures, so a full-strength squad is always left standing and able to retreat.
- **Phase 3 (below 35%)** — +30% attack speed, +15% move speed, 40% tower damage reduction, plus
  **repeat-fire adaptation**: each consecutive hit from *the same tower* is worth 5% less, to a 30%
  floor, decaying after 3 s without that tower connecting. The hero and squads are never affected,
  so the answer becomes composition rather than more turrets.

---

## Furnace expansion, sky platforms and air units

Ground plots now unlock outward with the furnace: Lv.1–10 expose 4, 7, 10, 13,
16, 19, 22, 25, 28 and 31 universal ground plots. The four wall sides keep their
original positions. Sky platforms unlock at Lv.15, 20, 25, 30 and 35 (five total);
they are elevated, have no ground collision, accept attack facilities only, cost
`ceil(base cost × 1.25)` and stay out of existing enemy target and area-damage
queries. Their damage is multiplied by 1.5 before furnace and skill bonuses.

The sky profiles are deliberately readable: crossbows volley up to three targets,
towers gain range, nine-target coverage and a per-tower +5% streak (up to +50%),
frost towers freeze after three consecutive hits, snipers apply five-second ranged
armour break and a third-shot critical, and mortars burn for ten seconds at 300 DPS
with a crowd-based two-second minimum interval. Flagbearers follow the centre of
the living non-engineer, non-flagbearer, non-escort combat army instead of the hero;
when that army is empty they return to the furnace.

Four airborne enemy types now appear from waves 4, 8, 15 and 20. They fly over
walls and can be hit by ranged allies, the hero and attack facilities; melee,
shield, engineer and flagbearer units cannot target them. Their wave previews,
elite warnings, codex entries and airborne silhouettes use the same source data as
combat. The resource HUD also reports each completed producer's current output per
second, and the roster is a three-column melee/ranged/support grid with HP bars.

## The perimeter

**One rectangle, four walls, zero gaps.** The base used to be a ring of small, independently-built
wall slots — a player who left one segment unbuilt, or one lane unwalled, left a hole. That is gone.
The base is now a fixed rectangle (half-extents 20 × 17, corners at ±20/±17) with exactly **four
build points — 北/東/南/西**, one per side. Each is built in a single action and seals its entire
side at once; there is no partial state and no way to leave a corner open, because the four sides'
own half-lengths already meet exactly at each corner.

**Each wall is one structure, one HP pool.** 12000 HP per side (was 4500 on the old per-segment
model), cost **160 wood / 500 stone / 50 gold** (was 80/250/25 per short segment) — a side costs
more because it *is* more: a whole 40- or 34-unit face rather than a slice of one. Each side has its
own world-space and HUD health bar, is independently attackable and independently demolishable under
the same rules as any other non-core building (3 s post-hit lockout, 50%/50% refund, no gold back,
never enters the auto-rebuild queue). Visual damage moves through four stages — intact (100–70%),
damaged (69–40%), severely damaged (39–1%), collapsed (0%, fully open) — and the *passable* gap never
opens before the HP actually reaches zero, no matter how ruined the stonework looks.

**One ally-only gate per side, centred.** A gate is not a decorative opening the pathing layer has to
remember to treat specially — it is a real hole in the collision, exactly `MAP.gateWidth` (4.2 units)
wide, with one obstacle sitting in that hole that is solid to enemies and invisible to allies:

```ts
function canPassGate(entity: WorldEntity): boolean {
  return entity.faction === Faction.Friendly;
}
```

That single faction check, threaded through `CollisionWorld`'s `resolve()`/`avoidance()` as an
`exemptFaction` flag on the obstacle, is the *entire* mechanism — allies walk through the gap because
there is nothing there for them to collide with; enemies are stopped by it exactly like the masonry
either side of it. First-version priority, as specified: **the gate has no HP of its own** — it shares
its wall's HP outright, so as long a side stands, nothing gets through its gate either.

**Two different "solid" for two different questions.** Every wall side actually registers as *two*
collision shapes with different jobs:

- A **physical** shape — two half-length boxes flanking the real gate gap — used for steering and
  movement. This is what an ally's gate-shaped hole and an enemy's dead stop both come from.
- A **logical** shape — one box spanning the *entire* side, gate included — used only for
  reachability (`world.wallBlocks()`) and enemy targeting. As far as "can anything outside reach the
  furnace" is concerned, an intact wall is 100% solid, full stop; the gate only exists in the
  movement layer, never in the reachability graph enemies plan against.

### Why the old wall was still bypassable, and what actually stops it now

The old per-segment ring had already fixed its own generation's collision bugs, but it still had a
structural hole the brief called out directly: nothing enforced that the *whole* ring was closed, so
a lane with even one unbuilt segment — or a segment mid-rebuild — was a corridor straight to the
furnace, and nothing about the architecture made "all sides closed, always" the default state.

Now: the four sides are the *entire* map boundary by construction, not a player-assembled ring that
happens to be complete this run. `nearestSide(x, z)` — one O(1) formula, the boundary line with the
largest signed "how far past this side" value — answers both "which wall should this enemy attack"
and "which side is nearest this interior point," so targeting and gate-routing share one geometric
source of truth instead of drifting apart. `EnemyNavigator.route()` checks, every tick: is the whole
perimeter sealed and is this enemy nonetheless inside? If so, that is not a legal state under any
circumstance — see the anti-exploit net below — so it is corrected immediately, before anything else
runs.

### Taunt-through-a-wall still can't skip the wall

A shield trooper taunting from safely inside a sealed base still raises an enemy's attention, but
`UnitTargeting` resolves *reachability* before it resolves *priority*: an enemy always identifies the
nearest wall side toward its actual target first, and that side — not the ally behind it — becomes
the thing it walks at and swings on. Only once that side's HP hits zero and reachability is
recomputed can the enemy's intent (the taunt) turn into an actual path to the taunter. Verified with a
shield trooper taunting from inside a fully sealed perimeter: the attacking enemy's `targetKind` reads
`"wall"` for the whole engagement, and the wall visibly loses health from the hits.

### The anti-exploit safety net

Knockback, stray teleports, or an accumulated steering error could in principle push an enemy inside
an intact perimeter even though nothing in normal play should ever get it there. `EnemyNavigator`
checks this every tick regardless of cause: if the full perimeter (`gates.fullySealed`) is true and an
enemy's position is nonetheless inside it, the enemy is snapped to the nearest legal point just
outside the nearest wall, its current target and nav-point are cleared, and it is redirected to attack
that wall — the same "corrected" enemy then behaves exactly like one that arrived normally. This is
deliberately a net for abnormal penetration, never a way anything is meant to move under normal play.

### Destroy, breach, rebuild — without trapping anyone

At 0 HP a side's blocking drops, its enemy collision is removed, connectivity is recomputed, and the
HUD posts an explicit breach warning (e.g. "北側城牆已被突破") plus a screen-edge indicator — only
*that* side opens; the other three stay exactly as sealed as before. Auto-rebuild stays FIFO by
earliest-destroyed, one fixed slot per side. On rebuild completion the same generic
`BuildingManager`/`RebuildQueue` machinery that already handles every other building re-registers that
side's obstacles, re-sealing the gap — and because obstacle registration for a slot is now an array
(`Map<string, Obstacle[]>`, one to three entries), no wall-specific rebuild code was needed at all;
the existing generic destroy/rebuild path "just worked" once wall sides became ordinary demolishable
buildings with their own obstacle set.

Measured: destroying each of the four sides individually leaves the other three fully sealed, enemies
advance only through the breached side (`enemies advance through the one open side`), and rebuilding
reseals it (`rebuilding the side re-seals it`) — all four checks pass in `tools/v7checks.mjs`.

### A defence has to be able to shoot back

The same lesson from the old ring still applies at the new scale: a fully sealed perimeter must not be
a stalemate. Tower range and the besieger stopping-distance-against-a-wall logic carried over
unchanged from the old system (both already used the wall's real thickness, not a disc radius), and
still hold at the new, larger rectangle — verified by the Breacher siege test and the full stage
playthrough with all four sides sealed.

---

## Universal build slots

Every non-wall plot used to be locked to one of three categories — an economy building could only go
on an "inner" slot, a tower only on a "middle" slot — which meant the base's economic and military
layout was decided by the ring generator, not the player. That distinction is gone. `BuildSlotCategory`
is now just `"universal" | "wall" | "special"`: every one of the 22 hand-placed plots accepts *any*
player-buildable, non-wall building, and the build menu groups its cards by function (生產 / 經濟與支援
/ 防禦) instead of by which plot you happen to be standing on. Demolishing a universal slot forgets
what stood there — a former tower plot can become a mine, a former mine plot can become a mortar —
`BuildingManager.canBuild()`'s only remaining category check is a straight equality between the slot's
category and the building's own, so a mine and a sniper tower are equally legal everywhere a wall
isn't.

### Fixing the overlap that "universal" made visible

Letting anything go anywhere meant the old layout's assumption — inner plots only ever host small
economy buildings, middle plots only ever host towers — was no longer safe, since either could now
receive the largest building there is. Every plot's `maxBuildingRadius` is the same constant (the
biggest footprint any `"universal"` building has, computed from the data, never hand-copied), and
`validateBuildSlots()` (`SlotLayoutValidation.ts`) checks every plot pair against
`radiusA + radiusB + margin`, plus separate clearances against the walls, the four gate lanes, the
furnace, and every harvest node. Five plots that had been fine as "inner vs. middle" turned out to
be too close once every plot had to tolerate the worst case, and were re-placed by hand rather than
patched with a smaller margin. The F6 verification overlay's own text-check convention (a `dbg-check
ok/bad` row per invariant) now carries a "建造槽位重疊驗證" section reporting the exact offending pair,
their distance, and the required distance — not just a pass/fail count.

### Re-laid out along the four lanes, not a shared ring

The original 16 plots sat on one shared ring radius around the furnace — geometrically neutral, but
also uninformative: nothing about a plot's position said which lane it defended or why you'd pick it.
The 22 `"universal"` plots now read as a real layout instead: each lane gets 2 front-line plots, 1
mid-line, 1 back-line (`SlotRole = "front" | "mid" | "back"`), 4 corner **junctions** each covering the
two lanes that meet there, and 2 central hubs positioned close enough to every lane's near-furnace
approach to plausibly cover 3+ lanes at once with a long-range tower — all disclosed in-game rather
than left for the player to infer, since every `BuildSlotDefinition` now carries a natural name (北方
前線A, 東北交叉火力位, 中央多路防禦位A, …) that the build panel, the empty-slot `E` prompt, and a built
attack building's own info panel all show verbatim instead of a raw slot id or a generic category
label. `nearestRoadPoint()` (`AttackRangeGeometry.ts`) — the formula the coverage text and the range
preview both read — was fixed to measure from a lane's *whole* road, including the interior stretch
back to the furnace, not just the exterior beyond the wall; without that fix, no plot could ever be
close enough to two lanes' near-furnace ends at once for "covers 3 lanes" to be geometrically possible
at all. `tools/v7checks.mjs`'s layout section checks the per-lane row counts, the junction/hub counts
and their lane coverage, at least 4 distinct depth tiers (not one shared radius), and zero plots
sitting inside a gate's own lane.

## Four new attack buildings

Alongside the existing 砲塔 (中價範圍攻擊), four more defensive buildings fill out the price/role
spread the brief asked for, all buildable on any universal slot:

| Building | Cost | HP | Damage / interval / range | Method | Notes |
| --- | --- | --- | --- | --- | --- |
| 弩箭塔 Crossbow | 60/30/5 | 1200 | 18 / 0.65s / 9 | 單體速射 | nearest-to-furnace first, tie-break on HP ratio; needs line of sight |
| 冰霜塔 Frost | 80/100/12 | 1400 | 10 / 1.2s / 8 | 單體+小範圍減速 | 20% slow / 2s on normal targets, 8%/1s on Boss; refreshes, never stacks; LOS required |
| 狙擊塔 Sniper | 140/180/35 | 1600 | 120 / 2.4s / 16 | 超遠距離狙擊 | Boss > breacher/level-4+ > priority-support > highest HP > nearest furnace; 0.5s telegraph; +10% vs Boss; LOS required |
| 火焰迫擊砲 Mortar | 220/300/60 | 2400 | 80 / 3s / 14 (min 4) | 範圍燃燒 | best-coverage arc splash (same aim heuristic as the tower) plus a 4s/15-per-second ground fire, up to 3 zones, 50% less burn on Boss; arcs like the tower, no LOS check |

`Building.update()`'s combat branch is now keyed off `def.attackKind` rather than a hardcoded
`type === "tower"` check, dispatched in one new file, `BuildingCombat.ts`, alongside the existing
`TowerCombat.ts` (kept unchanged for the original tower's own `"areaShell"` case). Line-of-sight reuses
the same `world.wallBlocks()` an enemy's own reachability check already relies on — a crossbow, frost
or sniper tower simply cannot pick a target on the far side of an intact wall; the tower and mortar's
arc weapons never test it, matching the brief's own split between direct and lobbed fire.

**Sniper's overkill avoidance** is the one new piece of shared, genuinely stateful logic: firing commits
a target's damage into a small module-level map (`committed`), and a second sniper's own target search
filters out anything whose remaining health no longer exceeds what's already in flight, releasing the
commitment the moment the shot actually lands (whether it kills or not). Verified with two snipers
built on the same frame, both idle-to-firing at once, against one shared target — the shot-count
counter (`sniperShotsFired`) shows exactly one commit, not two.

## Immediate-next-wave gold reward (endless only)

"立即下一波" used to just forfeit whatever prep time was left, for nothing. In endless mode it now pays
`floor(remainingSeconds × baseGoldPerSecond(wave) × eliteMultiplier)` gold. The baseline starts at 1
gold/second and rises by 1 every ten waves; when the upcoming wave includes a level-4+ enemy, the
reward doubles as a clear risk premium — `EndlessEconomyConfig.ts`. Below 2 remaining seconds it pays nothing,
avoiding a trivial tap-to-farm at the very end of a countdown. The claim is guarded by remembering
which *upcoming wave number* was last paid for rather than a timer-based lock — wave numbers only ever
increase, so a double-click or a hotkey-plus-mouse race within the same prep phase resolves to "already
claimed" on the second attempt with no separate reset logic needed. Stage mode's own "立即下一波" button
keeps working exactly as before and never reads this reward. The HUD button shows a live `+N金幣` suffix
whenever a claim would pay out, refreshed on the same per-frame HUD pass everything else already uses.

## Endless boss pacing: no Boss before wave 20

`buildEndlessWave()`'s old rule was `wave % 10 === 0` — a full level-6 Boss, unconditionally, at wave 10,
before most runs have a real economy, army or perimeter. Endless now runs three distinct phases:

- **Waves 1-9, 11-14, 16-19** — regular waves, composed against a soft field-cap target that climbs by
  bracket (8-14 units for waves 1-5, 12-20 for 6-10, 14-26 for 11-15, 20-36 for 16-20, then +0.8/wave
  after). Wave 11 deliberately resets to roughly 16-18 units instead of spiking after the elite wave.
  The level-3+ "high-tier share" ceiling is 15% through wave 10, 25% through 14, 35% through 19,
  50% through 30 and 60% after — `EndlessDifficultyConfig.ts`.
- **Wave 10** — an elite wave: one existing level-4 unit (juggernaut) alongside grunt/slinger/bruiser
  fodder. No Boss.
- **Wave 15** — a strengthened elite: bombardier (level 5) at +30% HP/+15% damage, alongside icearmor
  and marksman. Still no full level-6 Boss.
- **Wave 20 and every 10 after** — the first, and every subsequent, real Boss wave.

Level-5 and level-6 enemies are additionally restricted to waves divisible by five in both stage and
endless play; a multiple-of-five wave may still choose not to include one.
  `isLevel6BossWave(wave)` is the single hard gate every other boss-related check reads from. The very
  first Boss encounter gets one escort instead of the usual two; each recurring Boss cycle (20, 30, 40…)
  compounds `+20%` health and `+10%` damage over the last, via `extraHealthMul`/`extraAttackMul` fields
  threaded through `SpawnGroup` into `SquadManager.spawnEnemy()` — a boss-only multiplier stacked on top
  of, not replacing, the existing linear per-wave scaling every other enemy still uses.

Verified three ways: a pure structural audit of `buildEndlessWave()`'s output for every wave 1 through
25 (no Boss below 20, wave 20 always has one, the composed result always agrees with
`isLevel6BossWave()`); a real simulated run jumping wave-by-wave through 20 checking
`BossController.active` never turns on early and does turn on at wave 20; and the wave 10/15 content
checks above. All in `tools/v8checks.mjs`.

---

## Demolition and conversion

Any completed non-core building can be taken down, so a fixed plot is no longer locked for the run.

- **Refund: 50% of the wood and stone, rounded down. No gold, ever.** A tower costing 50/50/10
  returns 25/25/0, whatever health it was on.
- **A second confirmation is always required**, listing exactly what comes back and what is at risk.
- **Blocked** while it is still building, while it is being taken down, if it was hit in the last
  **3 seconds**, and — for the auto-rebuilder — while it is mid-job. The refusal always says which.
- A **1.4 s take-apart animation** plays: production and combat stop at once, parts come off from the
  top down, then the plot is free.

**A demolition is not a destruction.** It never enters the rebuild queue, and any pending rebuild for
that plot is dropped, so the auto-rebuilder can never resurrect something the player chose to remove.
The plot also forgets what it held, which is what makes conversion work:

```text
tower on A → demolish → build a warehouse on A → enemies destroy it
  → the auto-rebuilder rebuilds the warehouse, never the tower
```

Per-building consequences, all spelled out in the dialog before you agree:

| Building | What happens |
| --- | --- |
| 倉庫 Warehouse | **No** destruction penalty, but the 100 cap returns and the overflow drops on the ground for 20 s |
| 招募所 Recruit hall | Existing squads survive; no new recruiting until one stands again |
| 自動收取設施 Auto-collector | Production returns to each building's local buffer; enemy gold drops are also collected automatically, while non-gold ground loot remains available |
| 自動重建站 Auto-rebuilder | The queue is kept and resumes when rebuilt; cannot be removed mid-job |
| 城牆 Wall | That side opens fully — the other three stay sealed and their gates keep filtering by faction |

---

## Units

Every ordinary squad member is an independent fighter with its own health, position, attack and
death. The skill-only Ground Support escort is the explicit exception: its three members share one
5000 HP pool.

| Ally | Squad | HP each | Power | Interval | Range | Cost | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 戰士 Warrior | 3 | 400 | 10 | 1.00 s | 2.2 | 15 | melee splash |
| 盾兵 Shield | 1 | 1500 | 5 | 1.80 s | 2.2 | 15 | taunt radius 8 |
| 弓箭手 Archer | 3 | 200 | 20 | 0.35 s | 11 | 20 | keeps a 4–11 standoff band |
| 醫療兵 Medic | 3 | 500 | 20 heal | 1.00 s | 14 | 30 | **one** squad-wide event per tick |
| 掌旗者 Flagbearer | 1 | 500 | 0 | — | 8 aura | 50 | nearby allies: attack / attack speed +10%, +1% each per furnace level; non-stacking |
| 魔法師 Mage | 1 | 150 | 100 | 1.40 s | 8 | 70 | blast radius 2.5 |
| 突擊手 Assault | 3 | 120 | 20 | 0.70 s | 2.2 | 45 | blinks onto the top-tier enemy; 3 s invulnerable, then 3 s / 50% DR; ×5 vs Lv4+ |
| 工程兵 Engineer | 1 | 100 | 0 | — | 2.2 | 35 | independently repairs the nearest damaged non-furnace facility |
| 火槍手 Musketeer | 3 | 250 | 45 | 1.40 s | 12 | 80 | +40%/+20% vs Lv4-5/Boss, stacking on-hit slow |
| 冰霜術士 Frost Sorcerer | 1 | 180 | 35 | 1.60 s | 9 | 55 | AoE slow + a Freeze Zone every 10 s |

There is no per-class recruit-panel upgrade. Every furnace level immediately gives all deployed and
future allied squads — including Engineers and Flagbearers — **+10% maximum HP, +10% power and +10%
attack speed**. Every attackable facility also immediately gains **+10% maximum HP and +10% attack**.
This progression is linear from each base stat, never compounded; the battlefield labels show the
shared furnace level.

Engineers use a separate cap and never consume ordinary squad slots: 2 squads normally, 3 at furnace
Lv.20, 4 at Lv.50 and 5 at Lv.80. They spawn beside the furnace, do not follow the hero and cannot
attack. They reserve the nearest damaged facility so two Engineers never repair the same
target. Once in range, one complete 3-second countdown restores exactly 10% of that facility's maximum
HP; while the facility is under repeated attack the complete countdown is 6 seconds. Destroyed
facilities and the central furnace are never repair targets.

| Enemy | Lv | Squad | HP each | Power | Gold | Siege | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 近戰小兵 | 1 | 3 | 100 | 10 | 1 | ×1.0 | melee splash |
| 遠程小兵 | 1 | 3 | 50 | 15 | 1 | ×1.0 | ranged |
| 重裝近戰兵 | 2 | 3 | 500 | 8 | 5 | ×1.0 | taunt 5, **cannot** taunt buildings |
| 精銳射手 | 3 | 3 | 150 | 20 | 10 | ×1.0 | ranged |
| 重裝壁壘 | 4 | 1 | 6000 | 30 | 20 | **×1.5** | taunt 8, **can** taunt buildings |
| 轟擊者 | 5 | 1 | 1500 | 100 | 30 | **×1.2** | ranged blast |
| 破城者 Breacher | 4 | 1 | 2500 | 80 | 20 | **×3.0** | always attacks its lane's wall first, 1 s stun after breaching |
| 冰甲重兵 Ice Armor Heavy | 4 | 1 | 3500 | 25 | 25 | ×1.0 | hits under 25 raw damage are halved until the armour breaks at 50% HP |
| 號令者 Commander | 4 | 1 | 1200 | 10 | 30 | ×1.0 | non-stacking aura (+15% move/+10% atk speed), allies target it first |
| 冰爆怪 Ice Bomber | 2 | 1 | 500 | 0 | 12 | ×1.0 | 2 s armed countdown, radius-3 self-destruct, 30%-scale blast if killed early |
| 寒霜巨像 Boss | 6 | 1 | 10000 | 300 | 100 | **×2.0** | three phases, escorted by Lv4 + Lv5 |
| 飛行近戰小兵 | 1 | 6 | 60 | 8 | 1 | ×1.0 | airborne melee; ranged-only target |
| 飛行精銳射手 | 3 | 6 | 90 | 18 | 10 | ×1.0 | airborne ranged; ranged-only target |
| 飛行轟炸者 | 5 | 3 | 900 | 80 | 30 | ×1.2 | airborne area attack; appears on a 5-wave multiple |
| 飛行空中巨像 | 6 | 2 | 6000 | 220 | 100 | **×2.0** | airborne boss prototype; appears on a 5-wave multiple |

---

## Friendly AI

The old build had allies that occasionally stopped moving, attacking or healing. That is fixed at the
root, not patched over with a reset button.

**Root causes found:**

1. **A swing could wait forever for a hit-frame event that never arrived.** `animator.isBusy` gated
   the next attack, so one lost event froze the unit in its attack pose permanently.
2. **`home` could be `null`.** When the hero went down, `SquadManager` skipped formation assignment
   entirely, leaving units with no target *and* no fallback position — they simply stood still.
3. **Target validity was checked inconsistently** in several places, so a pooled-and-reused corpse
   could be held on to.
4. **Taunt sources were never re-validated**, so a unit could keep chasing a dead shield trooper.
5. **Separation force never faded near the goal**, so crowded melee units pushed each other off
   their target indefinitely.

**The fixes:**

- An explicit **`FriendlyBrain`** with exactly one active state and a **hard timeout plus a defined
  recovery on every state** — nothing can wait forever by construction. States: `spawn`,
  `followFormation`, `acquireTarget`, `moveToTarget`, `attackWindup`, `attackRecover`,
  `holdPosition`, `returnToFormation`, `stuckRecovery`, `acquireHealTarget`, `moveToHealRange`,
  `healWindup`, `healRecover`, `dead`.
- **Attack tokens.** Each swing gets an id; the hit frame only applies damage if the token still
  matches, so a late or duplicate event is dropped rather than landing on the wrong target.
- **One `validateTarget`** shared by the hero, allies, enemies and towers, checking liveness,
  faction, health, disposal, a **pooling generation stamp**, world bounds and leash.
- **`StuckDetector` + escalating recovery**: sidestep → different attack slot → return to formation →
  drop the target. A short safe reposition toward the rally point is the **last** resort only, and
  never lands on a target or crosses a wall.
- **`FormationSlotManager`** hands out claimed attack slots around each enemy, a rally ring for idle
  squads, ranged standoff bands, and separation that **fades to zero near the goal** so crowding
  spreads units out without preventing them from landing a hit.
- **Rally always exists** — it falls back to the furnace when the hero is down.
- **Wave-boundary cleanup** clears targets, taunts, animation locks and stuck state for everyone.
- **`AIWatchdog`** sweeps every 0.5 s as a safety net and, importantly, *reports* anything it finds so
  a real defect shows up in the test output instead of being silently papered over.

**Measured result: a 20-wave endless run with 0 stalls and 0 watchdog recoveries.**

### Death, and actually leaving the field

Friendly bodies used to stand in the snow for the rest of the run. The cause was a single guard:

```ts
for (const squad of this.allySquads) {
  if (!squad.alive) continue;   // <- once wiped, never updated again
  squad.update(dt);
}
```

When the last member of a squad fell, the squad stopped being updated, so its members' corpse timers
never advanced, `readyToRemove` never became true, and neither the roster nor the combat world ever
recycled them. Enemy squads had no such guard, which is exactly why only *friendly* bodies piled up.

The lifecycle is now explicit and one-shot. On death a unit drops its target, taunt, breach target,
waypoint and animation lock, leaves the spatial grid and its formation slot, and can no longer be
hit, healed, taunted or walked into. The death pose plays for 1.1 s, the body sinks into the snow and
shrinks over the next 1.8 s, and the rig goes back to its template's pool — with a **hard 4-second
ceiling** in case the animation event never fires. A wiped squad frees its capacity immediately and
leaves the HUD after a brief 全滅 notice.

Recycled rigs are fully reset — enabled state, transform, joint rotations, part visibility — so a
newly recruited fighter can never inherit the previous occupant's death pose.

Measured: 14 allies killed at once are all gone within **2.9 s**, squad count drops to zero, and all
14 rigs return to the pool.

### This pass: one member dying mid-squad, and buildings vanishing instantly

The fix above only closed the gap when an *entire* squad wiped at once. Two narrower gaps remained:

1. **A recycled rig could still be written to by its previous corpse.** `CombatUnit.dispose()` returns
   `this.rig` to a shared per-template pool the instant it's called, but a still-ticking corpse's
   `update()` kept writing position/scale to whatever rig field it held — if a brand-new unit had
   already claimed that same rig from the pool, the corpse would fight it for the transform. Fixed
   with a `corpse.recycled` guard checked before any further write, **and** at the squad level:
   `Squad.update()` now reverse-iterates its members and splices out anyone `readyToRemove` immediately,
   rather than waiting for the whole squad to wipe before anything gets cleaned up.
2. **Buildings disappeared the instant they hit 0 HP in combat**, with no version of the demolish
   animation that player-initiated teardown already had. `Building` gained `collapsing` /
   `collapseProgress` fields and a `readyForRemoval` getter; `BuildingManager.update()`'s dead branch
   now ticks the building's `playDemolish()` take-apart animation while `!alive`, and only frees the
   slot / pushes the rebuild queue / emits the destroyed event once the animation actually finishes —
   the same collapse the player sees when demolishing on purpose, reused rather than duplicated.

**New diagnostics, so a future regression here shows up instead of hiding:** `AIHeartbeat` replaces a
single `lastActionAt` timestamp with five (`lastUpdateAt` / `lastStateChangeAt` /
`lastMeaningfulActionAt` / `lastMovementAt` / `lastTargetAcquiredAt`), so a genuinely stuck unit can be
told apart from one that's just mid-windup. `AIWatchdog` gained a **registration-consistency check**
that compares `CombatWorld.allies` against the set reached by walking every `SquadManager` squad — two
independently-populated collections that must always agree — and exposes any mismatch as
`watchdog.unregistered`. A separate `DeathResidueGuard` sweeps both allies and enemies every 2 s for
anything `!alive` with a corpse older than 5 s (comfortably past the 2.9 s/4 s cleanup ceilings above)
and force-disposes it, logging the fact rather than silently sweeping it under the rug.

### Global pursuit — every squad searches the whole map, not a local radius

Squads used to only notice an enemy within `ALLY_ENGAGE_RANGE` of their own position or formation
slot, which meant a fight on the far side of the base could go completely unanswered until the enemy
wandered close. `UnitTargeting.acquireAllyTarget()` now scans every enemy on the field, unbounded by
distance, and scores each one instead of just taking the nearest:

```
score = (inside base ? +10000 : 0) + (priority target ? +5000 : 0) + level × 100
      − max(0, claimScore(enemy) − claimCap(enemy)) × 3000
```

ties break on distance. This is a **search-space** change, not a **frequency** one: the scan still
only runs on each unit's existing low-frequency retarget timer (general combat 0.2–0.35 s, medic
0.3 s, 0.5 s when the field is empty of enemies), never per frame — "global" describes how far the
search looks, not how often it looks.

**Crossing gates without being told to.** A squad chasing a target on the far side of a wall — or a
medic travelling to whichever ally squad currently has the lowest health ratio, now found by a true
global search rather than "nearest within range" — routes through `gateWaypoint(fromX, fromZ, toX,
toZ)`: a small geometric check that returns an intermediate gate coordinate whenever exactly one
endpoint is outside the rectangle, and `null` (go straight there) otherwise. The same helper backs
both combat pursuit (`CombatMovement.approach()`) and medic patient-seeking (`tickMoveToHeal`), so
there is exactly one place that knows how to get from inside the base to outside it and back.

**Target saturation, so squads don't all zerg one grunt.** `ThreatTracker` rebuilds a claim-count map
every 0.5 s from what every living ally is currently attacking; the acquisition score above subtracts
a penalty once an enemy's claim count passes its cap (3 for an ordinary enemy, 8 for anything
high-tier, priority, or already sieging). An enemy with enough attackers committed stops attracting
more without needing a hard cap on anyone's target.

**Retuned watchdog.** The same `AIWatchdog` from the stall-elimination pass now fires at the spec's
tighter thresholds — flags a combat-capable unit after **1.5 s** without motion or a legal action,
escalates to full stuck-recovery at **2.5 s** — since a global searcher with nothing wrong should
never need to sit idle that long. Measured across a 20-wave endurance run and the dedicated 50-ally
gate-congestion stress test: **0 stalls, 0 watchdog recoveries** in both.

---

## Building visuals

### Why parts of finished buildings disappeared

```ts
dispose(): void {
  this.root.dispose(false, true);   // <- disposeMaterialAndTextures
}
```

Every building asks `MaterialFactory` for its materials by key, so all of them share the same nine
cached instances and the same procedural textures. That second argument disposes the materials of
every descendant — the shared ones. One destroyed wall therefore tore the albedo textures out from
under every stone, plank, beam and roof mesh in the base, and Babylon silently stops drawing a mesh
whose material is not ready. The glowing accent parts, which have no texture, kept rendering, which
is why buildings came apart rather than vanishing.

It surfaced in endless mode first because that is the only mode that destroys and rebuilds enough
times to hit it.

**The fix is ownership.** `BuildingVisualController` owns one building's meshes for its whole life
and disposes *only* those, never the shared materials or textures behind them. Those belong to the
scene and outlive every individual building.

**The safety net** — deliberately behind the fix, not instead of it — re-checks integrity when a
building completes, when one is rebuilt, after a quality change and every 30 s. If a part has
genuinely been lost it rebuilds that building's geometry, without spending a resource or
re-registering anything. It reports how often it fired; **the expected number is zero.**

Measured after three full destroy-and-rebuild rounds of every attackable type, two quality switches
and a visibility change: **18 buildings, 100% intact, 0 disposed meshes, 0 lost materials,
0 repairs.** Stage 1–3 and the tutorial pass the same check.

### The tower and wall rebuild

The v5 unit pass initially rebuilt only three of the five planned baseline models (hero, warrior,
grunt) and left the tower and wall untouched — the biggest gap flagged in that pass's own report.
This follow-up closes it, in `BuildingMeshFactory.ts`, same shared-material rules as everything
else (no per-instance materials, no new stages the construction animator doesn't already handle
generically):

- **Tower**: four corner buttresses at the footing (it no longer reads as a plain cylinder the
  shaft merely balances on), a full four-way crenellation ring instead of the two merlons that used
  to flank the barrel only, and a small ammo rack plus a banner pole beside the gun so the silhouette
  is readable from angles other than straight down the barrel.
- **Wall**: a centre brace so a long segment doesn't look like it is only held up at its two ends,
  a pair of torch sconces, and a small deterministic height jitter across the merlon row (never
  random — the same segment must look identical on every rebuild) so the crest reads as weathered
  stonework instead of one uniform extrusion.

Verified via the existing visual-integrity harness (all parts present, no disposed meshes, no lost
materials, across the same destroy/rebuild/quality-switch rounds above) plus a live screenshot
check of a sealed base — no regression to the 254/254 automated suite.

### Separating silhouettes that were too close

Two more pairs flagged in the same report as still confusable at a glance:

- **Mage vs. Frost Sorcerer** — both ally casters, both held a plain `staff`, and their palettes
  were both in the same violet-blue family. The Frost Sorcerer now carries a new `iceStaff` weapon
  kind (a hexagonal, faceted-crystal shaft, not the Mage's smooth taper), a much colder cyan/white
  palette, a large floating crystal above the shoulder as its own marker, and ice-shard pauldrons in
  place of the cape the Mage already owns.
- **Archer vs. Marksman** — both use `bow`, and were separated only by faction colour. The Archer
  now carries a back quiver with visible arrow fletchings; the Marksman gets a longer duster-coat
  torso proportion and a spare-bolt case on the hip. Faction colour and markers still do the
  first-glance separation; the new attachments hold up under a closer look too.

---

## Performance monitoring

`F3` opens a live panel showing FPS, 5 s / 30 s averages, an approximate 1% low, **separate
simulation and render milliseconds**, total frame time, draw calls, active meshes, vertices, unit /
projectile / pickup / particle counts, the GPU strings, quality level and both canvas and CSS
resolutions. **Export 效能報告** writes a full report to the panel and copies JSON to the clipboard.
Nothing is ever uploaded.

**GPU detection** tries `WEBGL_debug_renderer_info` (`UNMASKED_RENDERER_WEBGL` /
`UNMASKED_VENDOR_WEBGL`), then the masked `RENDERER` / `VENDOR`, and degrades safely at each step —
a blocked extension yields "detail unavailable", never a crash. SwiftShader, llvmpipe, Microsoft
Basic Render and similar are flagged as software rendering with a non-blocking notice.

> A web page **cannot** force a particular GPU. If you want the discrete card, set it in the browser's
> and Windows' own graphics settings. The game only reports what it observes.

**Stress test** (`F8` or `?stressTest=1`) spawns 50 / 100 / 150 / 250 / 400 units that genuinely
move, target, attack, take damage, die, fire projectiles, heal and taunt through the same spatial
grid as a real wave. It auto-records for 30 s and any run that used it is untracked.

**Quality**: Low / Medium / High / **Auto**. Auto samples about 8 s of real FPS and picks ≥55 → High,
35–54 → Medium, <35 → Low. A manual choice is sticky and stored in `localStorage`; Auto never
overrides it.

### Measured performance

| Preset | Units on field | Simulation cost |
| --- | --- | --- |
| 50 | 50 | 0.11 ms/frame |
| 100 | 102 | 0.19 ms/frame |
| 150 | 152 | 0.29 ms/frame |
| 250 | 252 | 0.35 ms/frame |
| 152 units with **151 live health bars** | 152 | 0.89 ms/frame |

Measured again after the four-wall/global-pursuit rework (global ally targeting no longer capped by
`ALLY_ENGAGE_RANGE`, `ThreatTracker` rebuilding every 0.5 s, gate-routing on every cross-boundary
move) — the 150-unit figure above (**0.29 ms/frame**) already includes that cost. It stays flat rather
than growing with the newly-uncapped search space because the scan itself is unchanged (still one
flat pass over `world.enemies`, still gated to each unit's own low-frequency retarget timer); only the
*range check* that used to shrink the candidate set was removed.

These are **simulation** figures measured under headless Chrome on the **SwiftShader software
rasteriser**. That is the part the game controls, and it scales cleanly. **Render cost and real FPS
on GPU hardware are still unmeasured here** — the monitor now exists so you can measure them on your
own machine, but this README will not quote a number nobody ran.

---

## Camera

The camera is a tight tactical follow, not a wide shot of the whole base: it frames a **9-unit radius**
(`CAMERA.localViewRadius`) around the hero, re-fit from the live viewport (aspect ratio, FOV, rig tilt)
on every resize so 16:9, 16:10 and 21:9 all keep the hero and the immediate fight readable. This
replaced an earlier wide framing that tried to keep the entire perimeter on screen at once — at the
base's actual size that meant everything was rendered too small to read at a glance, which is what the
minimap and full map below now exist to compensate for instead. Mouse-wheel zoom (`0.75×`–`1.25×`) and
screen shake both apply on top of the same rig, and a `returnToPlayer` transition smooths the camera
back after any cinematic focus (construction, thaw, furnace) ends.

### Minimap and tactical map

An always-on minimap sits in the HUD corner, framing a little past the wall ring at all times: hero,
ally squads and enemies as clustered dots (so a wave doesn't become a dot soup), the boss, all four
wall sides colour-coded open/damaged/sealed, and the camera's own current view as a small rectangle.
Press **`M`** for the full-screen tactical map — the same data at `640px`, click-to-place temporary
markers (6 s lifetime), and the game keeps running underneath at **¼ speed** rather than pausing, so
nothing takes full-speed, unseen damage while it's open. Both draw from one shared snapshot
(`gatherMinimapSnapshot`), so the corner map and the full map can never show two different realities.

---

## Project layout

```text
src/
├─ main.ts                     entry point only
├─ ai/                         friendly AI — the stall fixes live here
│  ├─ FriendlyStateMachine.ts  the brain: one active state, every wait bounded
│  ├─ BrainTypes.ts            states, events, and the narrow internals surface
│  ├─ BrainIdleStates.ts       heal, formation and hold states
│  ├─ BrainAttackStates.ts     windup and recover, incl. the lost-event guard
│  ├─ BrainCombatStates.ts     approach, sidestep and re-slot movement
│  ├─ BrainRecovery.ts         escalating stuck recovery
│  ├─ TargetValidator.ts       the single shared validity rule
│  ├─ FormationSlotManager.ts  rally rings, attack slots, standoff, separation
│  ├─ StuckDetector.ts         progress sampling
│  ├─ AIWatchdog.ts            safety net + stall reporting, retuned 1.5s/2.5s thresholds
│  ├─ ThreatTracker.ts         per-enemy claim counts — soft target-saturation, rebuilt every 0.5s
│  ├─ GateRouting.ts           `gateWaypoint()` — the one place that knows how to cross a wall
│  └─ AIConfig.ts              every AI timing constant
├─ performance/
│  ├─ PerformanceMonitor.ts    per-frame sim/render timing, 1% low, counters
│  ├─ PerformanceSnapshot.ts   snapshot + report shapes and text formatting
│  ├─ GpuDetector.ts           safe GPU identification
│  ├─ AdaptiveQualityManager.ts Low/Medium/High/Auto with sticky manual choice
│  └─ StressTestController.ts  50–400 genuinely fighting units
├─ resources/
│  ├─ NaturalResourceNode.ts   finite capacity and state machine
│  ├─ ResourceNodeView.ts      canopy tiers, stumps, rubble, regrowth
│  └─ ResourceNodeManager.ts   lookup, respawn, per-run reset
├─ data/                       every gameplay number, no Babylon imports
│  ├─ BuildSlotDefinitions.ts  rectangle geometry, WALL_SIDES, hand-placed universal slots
│  ├─ BuildingDefinitions.ts   economy buildings + shared types; DEFENSE_BUILDINGS concatenated in
│  ├─ DefenseBuildingDefinitions.ts  the 5 attack buildings + the wall, split out for line budget
│  ├─ BuildingPresentation.ts  build-menu grouping, attack-method / effective-against labels
│  ├─ EndlessEconomyConfig.ts  the early-wave gold reward formula
│  └─ EndlessDifficultyConfig.ts  boss-eligibility gate, field-cap and high-tier-share curves
├─ combat/                     units, squads, targeting, projectiles, motor, death
├─ buildings/                  slots, staged assembly, rebuild FIFO, demolition, visual lifetime
│  ├─ WallObstacles.ts         registers one wall side's physical collision (2 half-segments + gate gap)
│  ├─ BuildingCombat.ts        fireBuilding() dispatch for the 4 new attack buildings + sniper overkill guard
│  ├─ BurnZones.ts             the mortar's ground-fire zones
│  ├─ SlotLayoutValidation.ts  the universal-slot overlap/clearance validator
│  └─ WallMeshHelpers.ts       crenelRow()/torch() — split out of BuildingMeshFactory for line budget
├─ enemies/                    navigation, waves, LaneGates, WavePreview, BossController
│  ├─ LaneGates.ts             per-side gate state, derived from the wall building itself
│  └─ EnemyNavigator.ts        4-side routing + the anti-exploit position-correction net
├─ economy/ hero/ heat/ scene/ camera/ effects/
├─ modes/
│  └─ EarlyWaveReward.ts       the immediate-next-wave gold claim, single-claim-guarded
├─ ui/
│  ├─ UIRoot.ts ContextPrompt.ts ActionPanels.ts FurnacePanel.ts
│  ├─ Notifications.ts         the only place a message is rendered
│  ├─ HealthBarManager.ts HealthBarPolicy.ts HealthBarLabel.ts
│  ├─ SquadStatusHud.ts LaneHud.ts EdgeIndicators.ts HoverPicker.ts
│  ├─ CodexScreen.ts ConfirmDialog.ts BuildingInfoPanel.ts
│  ├─ TutorialController.ts GameMenus.ts DebugPanels.ts
│  ├─ BalancePanelView.ts      the F9 panel's own render logic, split out for line budget
│  └─ ResourceIcons.ts BuildingIcons.ts UnitThumbs.ts
└─ game/                       Game, GameSystems, GameLoop, GameFlow, GameInput
   ├─ DebugApiV7.ts             perimeter/exploit-simulation test hooks, dev-build only
   └─ DebugApiV8.ts             universal-slot, layout, gold-reward and boss-pacing test hooks
```

Conventions: `main.ts` only boots; **no file over 350 lines**; **no `any`**; no `TODO`; every gameplay
number lives in `src/data/`; systems talk through `GameEvents` or explicit public methods.

**UI layering** is one explicit stack in `src/ui-hud.css`, lowest first: HUD → squad and lane
panels → edge markers → interaction prompt → boss bar → tutorial → banner → toast → side panels →
confirmation dialog → full screens → debug panels. The build banner moved to the very top of the
screen so it never covers the base, the prompt or the boss bar.

---

## Testing

Two headless harnesses drive real Chrome through `puppeteer-core` (a dev tool, deliberately not a
dependency):

```bash
npm install --no-save puppeteer-core@23
```

```bash
node tools/playtest.mjs
```

**195 assertions**, all passing, covering: economy and capacity, construction, recruiting, squad
limits, wall sealing and no-tunnelling, rebuild FIFO and per-slot type memory, taunt priority, the
medic single-event rule, hero death and revive, warehouse loss and scattering, furnace healing and
self-repair, a full winnable 10-wave stage, endless reset and scaling, plus this pass's additions:

- finite node capacity by size, real depletion, no yield from a spent node
- gather rate ≈ 1 wood / 0.55 s, and **no gathering at a distance**
- camera framing covers the perimeter
- opening gold exactly covers the recruit hall
- wall base 12000 and same-wave rebuild at 90%
- boss phase 1 → 2 → 3 thresholds, slam telegraph, and the 35% damage cap
- allies re-plan promptly after a target dies; ≤5% stall under crowding; idle medics never freeze
- **a 20-wave endless run with 0 stalls**
- GPU detection and software-rendering identification
- stress presets 50 / 100 / 150 / 250 with simulation cost recorded

and this pass's additions:

- faction badges default to 明顯, can be turned off, and are **actually drawn** — not merely enabled
- nearby enemies, damaged structures and wounded allies all get a bar without being hit
- the boss is excluded from world bars; bars unbind when their owner is recycled
- **151 live health bars at 152 units, measured**
- the perimeter is one wall building per side, each with its own HP and sealing its whole side
- a sealed ring is never breached, even with a taunting shield trooper inside it
- destroying a side reopens that side only and enemies advance through it
- a wave is announced before it lands, naming places and head counts
- **every notification is checked for markup** — `<svg`, `<path`, `viewBox`, `[object Object]` — by
  driving the real build panel through the DOM, not by calling the manager directly
- the squad HUD lists types, counts squads, shows a status word and reacts to damage
- allies die, their bodies leave within seconds, capacity is freed and rigs are reused clean
- every finished building is visually complete after repeated destroy/rebuild rounds, quality
  switches and a visibility change, in **all four modes**
- demolition rules, refunds, the combat lockout, conversion, and every per-building consequence
- the codex: five categories, correct entry counts, search, next/previous, and Esc back
- always-on faction marking and health bars for every living combatant and attackable structure
- universal demolition (attackable or not), the general HUD's FPS readout, and the F6 verification
  overlay's counts

**254 assertions total**, all passing, plus this pass's additions (`tools/v6checks.mjs`) covering
the seven new units:

- the Engineer scans every 3 seconds for the nearest unclaimed damaged facility, never the furnace
- the Musketeer's bonus damage vs Lv4-5/Boss and its stacking on-hit slow, capped at 3 stacks
- the Frost Sorcerer's normal-attack slow and its periodic Freeze Zone stun-then-slow
- the Breacher always targets its lane's blocking wall over a taunting ally behind it
- Ice Armor Heavy's damage-value-gated mitigation and its permanent armour break at 50% HP
- the Commander's non-stacking aura buff and allies' priority targeting of it
- the Ice Bomber's armed countdown, full detonation, and the reduced early-kill explosion
- mixed combat with all seven new units at once, with an AI-watchdog stall check
- stress presets 50 / 100 / 150 / 250 with the new roster mixed into both factions

**269 assertions total**, all passing, plus this pass's additions (`tools/v7checks.mjs`) covering the
four-side perimeter rework:

- exactly four wall slots exist, named north/east/south/west, with no fifth or partial state
- an enemy approaching a corner never ends up inside — no gap where two sides meet
- an ally teleported straight past a gate is never pulled back in by collision
- an enemy dropped exactly into a sealed side's gate gap is corrected back outside
- the anti-exploit net: an enemy forced to dead-centre of a fully sealed perimeter is pushed back
  out and has its target cleared, rather than being left to fight from inside
- destroying one side opens only that side; the other three stay sealed; enemies advance through the
  breach; rebuilding it reseals the side
- a squad with nothing nearby still acquires and closes on a distant enemy across the perimeter,
  purely from the global search — no local-radius miss
- **fifty allies funnelling through one gate produce zero watchdog stalls**
- the base layout is measurably irregular (more than 60% of inner/middle plots sit at distinct radii
  from the centre) and the furnace core stays clear of the nearest plot by more than 7 units

**313 assertions total**, all passing, plus this pass's additions (`tools/v8checks.mjs`) covering
universal build slots, the layout validator, the four new attack buildings, and endless boss pacing:

- every building type — mine through mortar — can be built and demolished on the *same* universal
  slot in sequence, with no type ever rejected because of what stood there before
- a manually-demolished slot forgets its former type outright, and never enters the auto-rebuild FIFO;
  a combat-killed one does enter the FIFO, and can still be converted to a different type before the
  auto-rebuilder gets to it, which drops the pending rebuild entirely
- the hand-placed universal-slot layout reports zero overlaps and zero placement issues against the
  worst-case footprint, at load time
- the early-wave gold reward formula matches exactly at 30/20/10/2 remaining seconds across three
  wave-multiplier tiers, pays nothing under the 2-second floor, and a second claim in the same prep
  phase pays nothing — single-claim enforced
- each of the four new towers builds, deals its documented kind of damage (or slow, for the frost
  tower) to a real enemy in range, demolishes normally, and is correctly auto-rebuilt after a combat
  kill
- two snipers built on the same frame, both coming off cooldown together against one shared target,
  commit only one shot between them — the overkill guard resolves the exact race it exists for
- a structural audit of every composed endless wave from 1 through 25: no level-6 Boss below wave 20,
  wave 20 is always the first one, wave 10 is an elite (no Boss) and wave 15 a strengthened elite
  (still no Boss), and Boss health/damage multipliers grow by exactly one cycle-step between
  consecutive Boss waves
- a real simulated run stepping through waves 1-20 never activates the Boss controller early, and
  does activate it at wave 20

**The current full regression (`node tools/playtest.mjs`) is 426/426 checks passing** with no
console errors. The focused expansion/air regression (`node tools/playtest.mjs --suite v10`) adds 12 live checks for
ground-ring unlock counts, sky unlock levels and costs, attack-only sky placement, elevated flying
units, melee-versus-air targeting, sky exclusion from enemy targets, roster categories, and live
production-rate HUD values. The focused v9 HUD/codex suite passes 75 assertions.

```bash
node tools/prodcheck.mjs --url http://localhost:4173
```

Verifies the built bundle boots, renders, accepts input, and that the dev-only debug hook is absent.

### Bugs earlier passes caught

- **The camera framing maths was inverted** — it treated a tilted camera as compressing the depth
  axis when it stretches it, zooming roughly 2× too far out. Caught by looking at a screenshot.
- **Wall rebuild decay leaked across runs** because the per-wave counter was never cleared on reset,
  so a fresh wall came back at 90%.
- **The watchdog counted walking as idle**, reporting ~1959 false stalls in a 20-wave run. Movement
  now counts as progress; the real figure is 0.
- **Resources trimmed by the returning 100 cap vanished silently** — they now scatter as pickups.
- **`Squad.playAction` could permanently corrupt a unit's hit-frame callback** if the swing was
  interrupted before the event fired. Replaced by the token system.

### Bugs this pass caught

- **Health bars were culled at 34 units while the camera sits 44–50 away** — they only ever appeared
  if the player zoomed all the way in. Nobody had looked at a screenshot closely enough to notice.
- **Faction badges rendered nothing three times over**: buried under the snow shader's drift
  displacement at y = 0.05, then invisible as thin instances, then invisible again as hardware
  instances whose hidden source mesh never reached the active-mesh list. Pooled clones, at y = 0.14.
- **A sealed base was a permanent stalemate** once walls actually worked — besiegers stood outside
  every tower's reach and the wave could never end. Caught by the stage playthrough hanging at wave 4.
- **A demolished warehouse deleted its overflow instead of dropping it**, because the cap was
  re-applied the moment the take-apart animation started rather than when the building was gone.
- **Structures never revealed their own health bar when hit** — only units did, because only units
  had a combat context to report through.

### Bugs this pass caught (v5 unit rebuild)

- **The Engineer's repair search used its own melee `attackRange` (2.2) as the detection radius**,
  so it could only ever notice a structure it was already standing next to. Fixed to search the same
  wide engagement range every other ally uses to spot a fight, while still walking in to melee range
  before actually repairing.
- **A stuck-recovery finishing for an Engineer fell back to `acquireTarget` instead of
  `acquireRepairTarget`**, dropping it out of its repair role the first time it ever got stuck. Found
  while wiring the new `replanState` helper and fixed by routing every re-plan through it.
- **`areaDamage` had no way to run extra per-target logic**, so the Frost Sorcerer's on-hit slow could
  not distinguish which units its own splash actually reached. Added an optional `onHit` callback
  rather than duplicating the splash-query logic in a second place.
- **A destroyed test wall silently produced `slotHealth() === null` and mid-siege assertions crashed**
  — not a game bug, but it caught a real gap in `tools/v6checks.mjs` itself: an isolated single-enemy
  test can be starved of resources (the 100 cap without a warehouse) or contaminated by a standing
  tower left over from an earlier test in the same session. Every new isolated-mechanic test now
  either builds its own warehouse first or resets to a fresh stage.

### Bugs this pass caught (perimeter rework)

- **A test-infrastructure bug this pass's own geometry change directly caused**: `HeroController`
  clamps the hero's position to `MAP.playableRadius` every frame via `collision.resolve(...,
  MAP.playableRadius, "ally")`. Shrinking `playableRadius` from the old ring's much larger value down
  to **30** for the new rectangle meant an existing test's `teleport(0, 300)` — meant to move the hero
  "far away" — was silently snapped back to `(0, 30)` on the very next frame, landing the hero on top
  of enemies spawned at `z = 30` in that test, where the hero's own auto-attack killed them before the
  assertion ran. The test read as "enemies vanished." Fixed by moving every such teleport to a safe
  in-bounds point (`(0, -29)`) rather than widening the clamp radius, since the clamp itself is
  correct behaviour — only the test coordinate was stale.
- **Stale Vite HMR state produced one false test failure** (`a single finished wall seals its lane`
  reported every side as partially sealed) after several source-file edits in a row with the same dev
  server still attached. Not a regression — a full server restart before re-running fixed it. Treated
  as a process lesson for this pass: restart the dev server after a batch of edits before trusting a
  surprising failure.
- **The wall-obstacle registration originally lived inline in `BuildingManager.place()`**, which
  pushed that file to 371 lines. Extracted into `WallObstacles.ts` (`registerWallObstacles()`) —
  `BuildingManager.ts` is back to 346 lines, and `place()` now treats a wall slot's obstacle set as
  just another array entry in `Map<string, Obstacle[]>`, which is also what let wall destroy/rebuild
  reuse the existing generic demolition path with no wall-specific code.

### Bugs this pass caught (universal slots + towers + boss pacing)

- **The store's own 100-unit cap without a warehouse bit every new test in this pass at least once.**
  Granting a large resource amount before any warehouse exists silently clamps straight back to 100 —
  several `v8checks.mjs` sections and the three-development-strategy runs had to build (and wait out)
  a warehouse on its own small grant *before* the real budget grant, exactly like a real early-game
  run has to.
- **A single-target attack-building test checked the wrong squad member.** Grunts recruit as a
  3-person squad; `unitInfo("grunt")` returns whichever one happens to be first in the internal list,
  which is not necessarily the one a single-target tower actually hit. The crossbow tower's own "does
  it damage an enemy" check intermittently failed for this reason alone — fixed by checking
  `allUnitsOf("grunt")` for *any* member with reduced HP, not one specific member.
- **A long-running test section can outlive the stage's own wave clock.** The four-new-towers section
  builds, demolishes, and rebuilds each tower in turn — cumulatively longer than stage 1's own prep
  timer — so a real stage wave started spawning its own grunts partway through, and `unitInfo("grunt")`
  could return one of *those* instead of the test's own intentionally-placed one. Fixed by pinning the
  prep countdown to a very large number for the section's whole duration, rather than racing it.
- **A discovered, unresolved stall under an unusual configuration**, found by the three-strategy
  playtest and not yet root-caused: with only two of the four wall sides built (matching endless
  mode's first two live lanes) and a large ally roster (8+ squads), a wave can reach a state where
  every living squad reports state `moveToTarget` against a small number of enemies whose own reported
  position stops changing — neither side makes further progress, and neither `runOver` nor the next
  wave transition ever fires, for well beyond what any real combat should take. The AI watchdog does
  not flag it, because every unit genuinely has a target and is nominally "moving" rather than idle.
  This did not reproduce in any of the four-side-sealed configurations used elsewhere in this pass's
  or earlier passes' testing, so it appears specific to a *partially* walled perimeter combined with a
  large simultaneous squad count — a combination normal play may rarely reach (a real base tends to
  wall all four sides, or fewer squads at once), but it is a real, reproducible finding and is flagged
  here rather than quietly ignored. Recommended follow-up: extend `AIWatchdog` to also flag a unit
  whose *position*, not just its state, has not changed in N seconds despite reporting `moveToTarget`.

---

## Known limitations

- **Real-GPU FPS is still unmeasured.** Every automated run uses SwiftShader. The simulation numbers
  above are real and meaningful; the render half is not, and this README will not invent one. `F3`
  and its report exist so you can measure it on your own hardware.
- **A web page cannot select a GPU.** Use the browser and OS graphics settings.
- **The ground does not receive projected shadows** — it uses a custom melt `ShaderMaterial`.
- **The bundle is ~5 MB raw / ~1.2 MB gzipped** because the game imports from the `@babylonjs/core`
  root for reliable side-effect registration.
- **Enemy pathing is rectangle-side routing plus steering**, not a navmesh. Robust against sealing,
  corner bypass and stalling — an enemy always knows which of the four sides it must break — but it
  will not find clever paths through complex geometry beyond the perimeter itself.
- **No skeletal animation** — everything is procedural joint rotation.
- The 20-wave AI endurance test **holds the furnace up deliberately** and force-advances waves. It
  measures AI stability across 20 wave transitions, not whether a run is survivable that long.
- **Endless wave 10 is deliberately no longer a Boss wave** (this pass's own change — see "Endless
  boss pacing" above); the harder-hitting stage-mode wave 10 (still a full Boss, per its own
  hand-authored 10-wave table, untouched by this pass) still benefits from the auto-rebuilder for the
  same reason as before: each perimeter side is a single 12000 HP structure rather than a small
  segment, so losing one opens every lane that fed into it at once.
- **The three-development-strategy playtest is a scripted proxy, not real adaptive play.** Each
  strategy follows a fixed build/recruit order and receives a fixed per-wave resource trickle standing
  in for hand-gathering, collected production and kill-gold — genuine autonomous economic
  decision-making is out of scope for a test harness. All three reliably clear the critical wave-10
  gate; only one of the three scripts reliably completes through wave 20 within this pass's testing,
  with the other two running into the stall documented above rather than dying outright. This is a
  property of the specific scripts and the discovered stall, not a claim about what a real player can
  or cannot achieve.
- Stage levels 2 and 3 reuse stage 1's wave table with more lanes and a difficulty multiplier.
- Audio is fully synthesised Web Audio; functional and event-driven but plain.
- **The codex uses flat portraits, not live 3D previews.** They are drawn from the same palette and
  weapon shapes as the rigs, so an entry and the fighter on the field are recognisably the same unit,
  but they are not the model. This is deliberate: the codex opens from the main menu, and building a
  dozen rigs there would stall it. Nothing has to be released on the way out either.
- **Faction badges are pooled clones, not hardware instances.** Instances of a hidden source mesh
  never reached Babylon's active-mesh list here, so at 250 units the badges cost 250 draw calls
  rather than two. The geometry is 84 vertices and the material is shared, and the measured cost at
  152 units is 0.89 ms/frame of simulation — but the render half of that is still SwiftShader, so
  treat the draw-call count as the honest caveat it is.
- **Hover detection projects candidates to the screen rather than ray-picking**, because every unit
  mesh is `isPickable = false`. It is forgiving rather than pixel-exact, which suits a tooltip.
- The codex's unlock flag exists but is always true: there is no collection metagame, by design.
- **All geometry is procedural** (boxes/cylinders/spheres/tori assembled per unit), so the triangle
  budgets a hand-modelled art pipeline would use do not apply here; the v5 art pass targets
  comparable visual richness (distinct proportions, silhouette-defining attachments, shared
  per-unit-type materials) rather than a specific poly count.
- **No true skeletal animation still applies to the seven new units** — they share the same
  procedural walk/attack/idle joint-rotation states as every other unit, not a bespoke animation set
  per unit. Distinctiveness comes from silhouette (attachments, proportions), colour and mechanics,
  not from unique motion.
- **Camera zoom is fixed per the existing top-down framing** — the new units are not given a special
  close-up view; they read the same way the rest of the roster does at normal play distance.
- **Five source files exceed the project's 350-line convention**: `src/combat/CombatUnit.ts` (403),
  `src/ai/FriendlyStateMachine.ts` (375), `src/combat/LiteHumanoid.ts` (366),
  `src/effects/AudioManager.ts` (360) — all unchanged from before this pass — and
  `src/combat/SquadManager.ts` (372, +7 lines from this pass's boss-cycle-scaling parameters on
  `spawnEnemy()`). Every file newly touched or created *this* pass stays under the limit, including
  five that briefly grew past it during the work and were split back down:
  `src/buildings/BuildingManager.ts` (wall-collision work, 371→346, `WallObstacles.ts`),
  `src/data/BuildingDefinitions.ts` (all 13 building defs in one file, 414→238,
  `DefenseBuildingDefinitions.ts` + `BuildingPresentation.ts`), `src/ui/DebugPanels.ts` (the F9 panel's
  own render logic, 420→296, `BalancePanelView.ts`), `src/buildings/BuildingMeshFactory.ts` (4 new
  tower meshes, 367→342, `WallMeshHelpers.ts`), and `src/modes/RunController.ts` (the early-wave
  reward's own state, 359→344, `EarlyWaveReward.ts`). The five that remain over budget could not be
  split further without either fragmenting the stall-prevention state machine
  (`CombatUnit`/`FriendlyStateMachine`) across more files than is readable, reshaping the master-mesh
  rig builder (`LiteHumanoid`) that every existing unit also depends on, exposing private synth
  helpers out of `AudioManager` for a ten-line saving, or splitting `SquadManager`'s already-small
  7-line addition into its own file for no real readability gain. Flagged rather than hidden.
- **The base layout is hand-authored, not procedural.** `BUILD_SLOTS` in `BuildSlotDefinitions.ts` is
  a fixed list of coordinates grouped by `district` (production/military/automation/core), chosen
  deliberately over a per-run randomizer to avoid the pathing and visual problems random placement
  would risk near the walls, gates and roads. It will look the same on every run of the same version;
  variety would need either more hand-authored layouts to pick between, or a constrained randomizer
  built later.
- **The four gates carry no HP of their own** — a first-version choice made explicit in the brief: a
  gate is simply the hole in its wall side and shares that side's HP outright. There is no path yet to
  a gate that could be reinforced, sealed, or destroyed independently of its wall.
- **Commander's "stays behind the front line" behaviour is not a bespoke back-line AI** — it relies
  on the existing generic ranged-enemy movement (which already stops at `attackRange` instead of
  closing to melee), not a dedicated formation role. It reads as holding back in practice but is not
  a purpose-built system.
- **Ice Bomber's "cracks that brighten" cue is approximated as a growing glow-core burst and an
  accelerating warning tone**, not a per-instance emissive-intensity ramp — `InstancedMesh` shares
  its material across every instance of the same unit type, so a literal per-unit brightening glow
  would require a per-instance shader trick this pass did not add.

---

## Three balance items worth tuning next

1. **Gold is still the only real bottleneck, and it is now tight in both directions.** With the hall
   at 15 gold the opening is unblocked, but the mid-game still has nothing to spend gold on except
   squads and walls. Giving towers a small gold *refund* on kills, or letting the warehouse convert
   surplus stone to gold slowly, would make the middle of a run a real economic decision.
2. **The auto-rebuilder is close to mandatory for wave 10.** It costs 500/600/150, which is a huge
   spike right when you also want squads. Splitting it into a cheaper "repair one slot" version and
   the full automatic station would let a player buy into the mechanic gradually.
3. **Phase-3 tower adaptation is the right idea but currently invisible mid-fight.** The boss bar
   says "對砲塔傷害減免" but not *how much* your specific firing line has decayed to. Showing the
   current stack on the bar — or tinting adapted towers — would turn it from a hidden penalty into a
   readable prompt to switch to squads.
4. **Four whole sides make "seal everything" a much bigger single purchase, and an all-or-nothing
   defence.** Closing the full perimeter is now 4 × 500 = 2000 stone (plus 640 wood, 200 gold) instead
   of a per-lane decision, and every side funnels multiple lanes at once (see `LANES` in
   `BuildSlotDefinitions.ts` — north and south each carry one lane, east and west each carry two).
   Losing the busiest side is now a much bigger single event than losing one of the old eight
   segments ever was. Worth watching whether players end up racing to wall every side immediately
   rather than making a real per-lane tradeoff, since the decision space that used to exist between
   "wall this lane" and "wall that lane" has been replaced by "wall this side or not."
5. **The mortar and sniper tower are expensive enough that they compete directly with the
   auto-rebuilder and a second squad, not just with each other.** A mortar (220/300/60) plus a sniper
   (140/180/35) together cost more stone than the auto-rebuilder itself. Worth checking whether the
   two high-tier towers ever actually get built before wave 15-20 in practice, or whether the
   crossbow/frost pair quietly become the only towers anyone uses before then.
6. **The gold economy is the tightest resource by a wide margin once army size starts scaling.** This
   pass's own three-strategy playtest needed a per-wave gold trickle roughly four times the wood/stone
   equivalent (90 gold vs. 260 wood/stone per wave) just to keep recruiting pace with a growing squad
   limit — wood and stone rarely bind at all once a warehouse and a mine/lumberyard pair exist, but
   gold has no comparable passive source beyond kills. A small passive gold trickle (e.g. from the
   furnace itself, scaling with level) would make the mid-to-late army-growth curve less exclusively
   dependent on how efficiently a run's squads are already killing things.
