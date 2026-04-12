# Azerfall — Internal Systems Reference

Technical documentation of every runtime system: equations, constants, algorithms, and data flow.  
All values are sourced directly from the codebase. If something below disagrees with the code, the code wins.

---

## Table of Contents

1. [Server Tick Loop](#1-server-tick-loop)
2. [Networking & World State](#2-networking--world-state)
3. [Client-Side Interpolation](#3-client-side-interpolation)
4. [Client-Side Prediction & Reconciliation](#4-client-side-prediction--reconciliation)
5. [Movement & Collision](#5-movement--collision)
6. [Combat — Melee](#6-combat--melee)
7. [Combat — Ranged (Server-Authoritative Projectiles)](#7-combat--ranged-server-authoritative-projectiles)
8. [Combat — Skills](#8-combat--skills)
9. [Buffs, Debuffs & DoTs](#9-buffs-debuffs--dots)
10. [Enemy AI](#10-enemy-ai)
11. [Player Stats & Levelling](#11-player-stats--levelling)
12. [Loot & Drops](#12-loot--drops)
13. [Player Regen & Death](#13-player-regen--death)
14. [Casting & Concentration](#14-casting--concentration)
15. [Client Projectile System](#15-client-projectile-system)
16. [Particle System](#16-particle-system)
17. [Audio System](#17-audio-system)
18. [Camera](#18-camera)
19. [Render Order](#19-render-order)
20. [Client Update Order](#20-client-update-order)

---

## 1. Server Tick Loop

**File:** `game/ServerWorld.js` — `tick()`

The server runs a fixed-rate game loop:

| Constant  | Value |
|-----------|-------|
| Tick rate | **60 Hz** (`setInterval(tick, 1000/60)`) |
| dt cap    | `Math.min(0.1, (now - lastTick) / 1000)` — prevents spiral-of-death |

### Execution order per tick

```
1. updateProjectiles(mapEntry, dt)      — per map
2. updateEnemyAi(mapEntry, dt, now)     — per map
3. updateEnemyRespawns(mapEntry, now)   — per map
4. updateDropPickups(mapEntry, mapId, now) — per map
5. updatePlayerDeaths(now)              — all players
6. updatePlayerRegen(dt)                — all players
7. updatePlayerCasts(now)               — all players
8. updateBuffsAndDebuffs(now)           — all players + enemies
9. broadcastWorldState()                — sends state to each client
```

**Important:** Projectiles update *before* enemy AI. This means a projectile can kill an enemy before the enemy gets its AI tick for that frame.

Auto-save runs every 60 seconds via `_autoSaveAll()`.

---

## 2. Networking & World State

**File:** `game/ServerWorld.js` — `broadcastWorldState()`

Each tick, the server sends every connected player a `state` message:

```json
{
  "type": "state",
  "tick": <integer>,
  "enemies": [{ "id", "type", "x", "y", "hp", "maxHp", "dead", "activeDebuffs" }],
  "players": [{ "id", "name", "x", "y", "level", "charClass", "dead", "activeBuffs" }],
  "drops":   [{ "id", "x", "y" }],
  "you": {
    "x", "y", "hp", "maxHp", "mana", "maxMana", "gold", "level", "xp",
    "xpToLevel", "damage", "dead", "ackSeq", "buffs"
  }
}
```

- Enemy snapshots are built once per map and reused for all players on that map.
- `you.ackSeq` is `player.lastAckSeq` — the last move sequence number the server processed.
- Only enemies on the player's current map are included.
- Other players on the same map are included (excluding self).

### Enemy snapshot fields

```js
{
  id, type, x, y,
  hp, maxHp,
  dead: Boolean,
  activeDebuffs: [{ id, stat, modifier, duration, expiresAt, ... }]
}
```

---

## 3. Client-Side Interpolation

**File:** `public/js/systems/NetworkSystem.js` — `_interpolateEntities()`

### Constants

| Name | Value | Purpose |
|------|-------|---------|
| `_interpTicks` | **3** | How many ticks behind "now" we render enemies |
| `_bufLen` | **16** | Ring buffer depth per entity |
| `_tickMs` | **16.667** | Nominal tick length in ms (1000/60) |
| `_tickTimeMapLen` | **120** | Time↔tick mapping entries for regression |
| Blend factor | **0.45** | Output smoothing per frame |
| Hard snap threshold | **150 px** | Skip blending, teleport |

### Tick-to-time mapping

The client converts `performance.now()` to a fractional server tick using **linear regression** over all stored `{tick, time}` pairs (up to 120). This replaces naive single-sample estimation.

```
tick(clientTime) = slope × clientTime + intercept
```

where `slope` and `intercept` come from least-squares regression over `_tickTimeMap[]`.

### Render ticks

- **Enemies:** `renderTick = currentTick - 3`
- **Remote players:** `renderTick = currentTick - 4` (one extra tick of safety margin)

### Interpolation priority

For each entity, the system finds snapshots bracketing `renderTick`:

1. **Catmull-Rom spline** — when 4 neighbouring points exist (`p0`, `p1`, `p2`, `p3`):

$$
\text{pos}(t) = 0.5 \times \left[
  2p_1 + (-p_0 + p_2)t + (2p_0 - 5p_1 + 4p_2 - p_3)t^2 + (-p_0 + 3p_1 - 3p_2 + p_3)t^3
\right]
$$

   where $t \in [0, 1]$ is `(renderTick - p1.tick) / (p2.tick - p1.tick)`.

   Result is **clamped** to the bounding box of `p1`↔`p2` to prevent spline overshoot.

2. **Linear fallback** — when at buffer edges (fewer than 4 points):

$$
\text{pos}(t) = p_1 + (p_2 - p_1) \times t
$$

3. **Dead reckoning** — when `renderTick` is past all snapshots:

   Extrapolates from the last two snapshots' velocity with exponential decay:

$$
\text{velocity} = \frac{s_1.\text{pos} - s_0.\text{pos}}{s_1.\text{tick} - s_0.\text{tick}}
$$

   The overshoot ticks are capped at 3. Velocity halves every tick:

$$
\text{effectiveTicks} = \frac{1 - 0.5^{\text{capped}}}{0.6931}
$$

$$
\text{pos} = s_1.\text{pos} + \text{velocity} \times \text{effectiveTicks}
$$

   If speed < 0.1 px/tick, the entity is considered stopped (holds position).

### Output smoothing pass

After interpolation, every entity is blended with its previous rendered position:

```
ent.x = prev.x + (ent.x - prev.x) × 0.45
ent.y = prev.y + (ent.y - prev.y) × 0.45
```

If distance > **150 px**, skip blend (hard snap — teleport or map change).

The smooth map is pruned when it grows more than 4 entries beyond the result set.

---

## 4. Client-Side Prediction & Reconciliation

**File:** `public/js/systems/NetworkSystem.js`

### Movement sending

Each time the client moves, it sends:

```json
{ "type": "move", "seq": <integer>, "x": ..., "y": ..., "level": ..., "floor": ... }
```

The prediction buffer stores `{ seq, x, y }` for each sent move. Buffer max: **64** entries.

### Reconciliation on `state` message

When the server returns `you.ackSeq`:

1. All predictions with `seq ≤ ackSeq` are purged from the buffer.
2. The position at the acked sequence is compared to the server's.

| Error magnitude | Action |
|-----------------|--------|
| > **80 px** | Hard snap to server position, clear prediction buffer |
| > **0.5 px** | Accumulate `(server - predicted)` into smooth correction |
| ≤ 0.5 px | No correction needed |

### Smooth correction application

`_applyCorrection()` runs once per frame before interpolation:

```
player.x += correctionX × 0.2
player.y += correctionY × 0.2
correctionX -= applied
correctionY -= applied
```

Dead zone: when abs(correction) < **0.1 px** on both axes, correction is zeroed out.

| Constant | Value |
|----------|-------|
| `_correctionRate` | **0.2** per frame |
| Hard snap threshold | **80 px** |
| Dead zone | **0.5 px** (accumulation) / **0.1 px** (drain) |

---

## 5. Movement & Collision

### Client movement

**File:** `public/js/systems/EntitySystem.js`

The player moves based on WASD input at `moveSpeed` px/s (default **205**). Diagonal movement is normalised so speed is consistent in all directions.

### Server move validation

**File:** `game/ServerWorld.js` — `handleMove()`

| Check | Threshold |
|-------|-----------|
| Max distance per message | **80 px** (normal), **300 px** (floor change / stair teleport) |
| Tile collision | Server calls `collision.isBlocked(x, y, 16, floor)` |
| Sequence tracking | `player.lastAckSeq = msg.seq` for reconciliation |

### Collision — `CollisionMap`

**File:** `game/ServerWorld.js` — class `CollisionMap`

Uses a **9-point circle approximation**. Checks these offsets around `(cx, cy)`:

| Point | Offset |
|-------|--------|
| Center | `(0, 0)` |
| Right | `(+r, 0)` |
| Left | `(-r, 0)` |
| Down | `(0, +r)` |
| Up | `(0, -r)` |
| Bottom-right | `(+0.7r, +0.7r)` |
| Bottom-left | `(-0.7r, +0.7r)` |
| Top-right | `(+0.7r, -0.7r)` |
| Top-left | `(-0.7r, -0.7r)` |

If **any** of these 9 points lands on a blocked tile, the position is considered blocked.

The collision grid is stored as a flat `Uint8Array` where each byte encodes floor-based block flags. A tile is blocked on a given floor if:
- `(byte & (1 << floor)) !== 0` for floors 1+
- `(byte & 1) !== 0` for floor 0

Players and enemies have a default radius of **15–16 px** for collision checks.

### Enemy movement

**File:** `game/ServerWorld.js` — `_moveEnemy()`

Enemies use the same `CollisionMap` but with **separate X/Y axis movement**:

1. Try moving full `(newX, newY)` — accept if not blocked.
2. Try X only `(newX, oldY)` — accept (axis slide).
3. Try Y only `(oldX, newY)` — accept (axis slide).
4. If all blocked, don't move.

This allows enemies to slide along walls rather than getting stuck on diagonals.

---

## 6. Combat — Melee

**File:** `game/ServerWorld.js` — `handleAttack()`

### Preconditions
- Player not dead
- Cooldown elapsed: `now - lastAttackAt ≥ attackCooldown × 1000`
- Enemy exists, not dead
- Distance check: `dist(player, enemy) ≤ player.attackRange + 30` (30 px latency buffer)

### Damage formula

$$
\text{damage} = \max(2, \; \text{player.damage} + \text{randInt}(-2, 4))
$$

`player.damage` is computed from `baseDamage + weapon.attackBonus`.

Damage is applied **immediately**. No projectile. The server sends:

- `attack_result` to the attacker (damage, enemy HP)
- `combat_visual` to all other players on the map (with `isRanged: false`)

### Default base stats

| Stat | Value |
|------|-------|
| `attackRange` | **52 px** (overridden by weapon `range`) |
| `attackCooldown` | **0.82 s** |
| `baseDamage` | **16** + `(level - 1) × 4` |

---

## 7. Combat — Ranged (Server-Authoritative Projectiles)

**File:** `game/ServerWorld.js` — `handleAttack()`, `updateProjectiles()`, `_resolveProjectileHit()`

Ranged weapons (any weapon with a `range` property in items.json) use server-tracked projectiles. **Damage is NOT computed at launch time.** It is computed at launch but only *applied* when the projectile hits.

### Launch

When a ranged attack passes validation, the server:

1. Computes damage: `max(2, player.damage + randInt(-2, 4))`
2. Creates a server projectile:
   ```js
   { id, playerId, targetEnemyId, x, y, speed: 360, damage, type: "attack", hitParticle, hitSfx }
   ```
3. Broadcasts `projectile_spawn` to **all** clients (attacker + observers)
4. Does NOT send `attack_result` yet

### Movement (per tick)

```js
dx = enemy.x - proj.x
dy = enemy.y - proj.y
d  = sqrt(dx² + dy²)
step = proj.speed × dt   // 360 × ~0.0167 ≈ 6 px/tick
```

The projectile **homes** toward the current enemy position (not launch position).

### Hit detection

A hit occurs when:
- `d ≤ 16` (distance threshold), **or**
- `step ≥ d` (projectile would overshoot in one tick)

### On hit — `_resolveProjectileHit()`

1. `enemy.hp -= proj.damage`
2. If skill-type projectile with debuff, apply debuff to enemy
3. Send `attack_result` (weapon) or `projectile_hit` (skill) to attacker
4. Broadcast `combat_visual` with `projectileHit: true` to observers
5. If `enemy.hp ≤ 0`, call `killEnemy()`

### Why this matters

Damage is only applied when the server's own projectile reaches the target. There is no pre-computation, no HP holds, no damage masking. If the enemy dies from another source before the projectile arrives, the projectile fizzles (the `if (!enemy || enemy.dead) continue` check).

---

## 8. Combat — Skills

**File:** `game/ServerWorld.js` — `handleUseSkill()`

### Validation chain

1. Skill exists in `SKILLS` data
2. Class restriction check
3. Level requirement check
4. Cooldown: `now - lastUsed < cooldown × 1000`
5. Mana: `player.mana ≥ manaCost`
6. For targeted skills: target exists, not dead, within `skillRange + 30`

### Damage formula (attack / debuff skills)

$$
\text{baseDmg} = \text{skill.damage} + \text{skill.damagePerLevel} \times (\text{level} - 1)
$$

$$
\text{damage} = \max(1, \; \text{baseDmg} + \text{randInt}(-2, 4))
$$

Note: skill damage floor is **1** (not 2 like auto-attacks).

### Ranged skills (projectileSpeed > 0)

Same server-authoritative projectile system as weapon attacks. Server creates:
```js
{ id, playerId, targetEnemyId, x, y, speed: skill.projectileSpeed, damage,
  type: "skill", skillId, hitParticle, hitSfx, damageType, debuff }
```

The `skill_result` message sent to the attacker confirms mana/cooldown only (no damage). Damage arrives later via `projectile_hit`.

### Instant skills (projectileSpeed = 0 or undefined)

Damage applied immediately. `skill_result` includes damage and enemy HP.

### Heal skills

$$
\text{healAmount} = \text{skill.healAmount} + \text{skill.healPerLevel} \times (\text{level} - 1)
$$

```
player.hp = min(maxHp, hp + healAmount)
```

### Legacy heal (hotkey)

```
Cooldown: 5300 ms
Mana cost: 22
Heal: 34 + level × 6
```

### Buff / Support skills

Apply `buff` entry to `player.activeBuffs[]`. Duration-based expiry. Replaces existing buff of same `id`.

---

## 9. Buffs, Debuffs & DoTs

**File:** `game/ServerWorld.js` — `updateBuffsAndDebuffs()`

Runs once per tick.

### Player buffs

```
player.activeBuffs = player.activeBuffs.filter(b => now < b.expiresAt)
```

Simple timer-based expiry. No tick effects on buffs currently.

### Enemy debuffs

For each debuff on each alive enemy:

- If `stat === "dot"` and `tickDamage` is set:

$$
\text{interval} = (\text{debuff.tickInterval} \; || \; 2) \times 1000 \text{ ms}
$$

  If `now - lastTickAt ≥ interval`:

$$
\text{dmg} = \text{tickDamage} + \text{tickDamagePerLevel}
$$

  `enemy.hp -= dmg`. If hp ≤ 0, `killEnemy()` is called with the caster as killer.

- Expired debuffs: `enemy.activeDebuffs.filter(d => now < d.expiresAt)`

---

## 10. Enemy AI

**File:** `game/ServerWorld.js` — `updateEnemyAi()`

Each alive enemy runs a simple state machine every tick.

### Aggro acquisition

```
Scan all players on same map where:
  - player.dead === false
  - player.mapId === currentMap
  - dist(enemy, player) ≤ enemy.aggroRange
  - player is NOT in a safe zone (checked via collision.isSafeZone)
```

Nearest qualifying player becomes the target.

### Aggro loss

Target is dropped when:
- Target player is dead
- Target player left the map
- `dist(enemy, target) > aggroRange × 1.6`
- Target is in a safe zone

### Leash

If `dist(enemy, spawnPoint) > 300`:
- Drop target
- Return home at **50% speed**
- When within **24 px** of spawn: snap to spawn, enter idle

### Chase

When target is valid and distance > `attackRange`:
- Move toward target at full `enemy.speed`
- Uses `_moveEnemy()` with axis-separated collision

### Attack

When `dist(enemy, target) ≤ attackRange`:
- Cooldown: `now - lastAttackAt ≥ attackCooldown × 1000`
- Damage: `enemy.damage` (flat, no randomisation)
- Sends `player_hit` to victim
- Broadcasts `combat_visual` with enemy attack effects to other players

### Wander (no target)

Two-phase idle/wander cycle:

| Phase | Duration | Speed |
|-------|----------|-------|
| **Idle** | 2.0 – 4.5 s | 0 (stationary) |
| **Wander** | 0.8 – 1.6 s | 35% of `enemy.speed` |

Wander direction is random angle, normalised to unit vector.

### Default enemy stats

| Enemy | HP | Damage | Speed | Aggro Range | Attack Range | Cooldown | Respawn |
|-------|----|--------|-------|-------------|--------------|----------|---------|
| **Wolf** | 60 | 9 | 105 | 210 | 34 | 1.35s | 15s |
| **Boar** | 74 | 11 | 95 | 210 | 34 | 1.35s | 18s |
| **Bandit** | 90 | 14 | 100 | 240 | 34 | 1.2s | 22s |

---

## 11. Player Stats & Levelling

**File:** `game/ServerWorld.js` — `_recalcStats()`, `_grantXp()`, `_xpToLevelForLevel()`

### XP curve

$$
\text{xpToLevel}(1) = 160
$$
$$
\text{xpToLevel}(n) = \text{round}(\text{xpToLevel}(n-1) \times 1.28)
$$

Iterative computation — each level requires 28% more XP than the last. Level cap: **100**.

### Stat formulas

$$
\text{maxHp} = 120 + (\text{level} - 1) \times 24 + \text{armor.hpBonus}
$$

$$
\text{maxMana} = 80 + (\text{level} - 1) \times 16 + \text{trinket.manaBonus}
$$

$$
\text{baseDamage} = 16 + (\text{level} - 1) \times 4
$$

$$
\text{damage} = \text{baseDamage} + \text{weapon.attackBonus}
$$

$$
\text{attackRange} = \text{weapon.range} \; || \; 52
$$

### On stat recalculation

HP and mana **preserve their current ratio** when max values change:

```
hpRatio  = hp / oldMaxHp
manaRatio = mana / oldMaxMana
hp   = clamp(round(newMaxHp × hpRatio), 1, newMaxHp)
mana = clamp(round(newMaxMana × manaRatio), 0, newMaxMana)
```

### On level-up

1. `xp -= xpToLevel`
2. `level += 1`
3. `baseDamage` recalculated
4. `_recalcStats()` called (adjusts maxHp, maxMana, damage)
5. **Full heal**: `hp = maxHp, mana = maxMana`
6. Loop continues — multi-level-ups from one XP grant are handled

---

## 12. Loot & Drops

**File:** `game/ServerWorld.js` — `killEnemy()`

### On enemy death

1. Enemy marked `dead = true`, `deadUntil = Date.now() + respawnSeconds × 1000`
2. Gold: `randInt(enemy.goldMin, enemy.goldMax)`
3. Item: iterate `enemy.loot[]`, first entry that passes `chance(lootEntry.chance)` wins. Only one item per kill.
4. Drop placed at `enemy.x ± 8, enemy.y ± 8`

### Drop ownership

| Property | Value |
|----------|-------|
| `ownerId` | Killer's player ID |
| `ownerUntil` | **10 seconds** after death |
| `expiresAt` | **25 seconds** after death |

Only the owner can loot within the first 10 seconds. After that, anyone can pick it up.

### Pickup

**File:** `game/ServerWorld.js` — `updateDropPickups()`

- Player must be within **42 px** of drop
- Gold added to `player.gold`
- Items attempt to stack into inventory via `_addItemToSlots()`
- If item doesn't fit, gold-only pickup; item stays

### Enemy respawn

**File:** `game/ServerWorld.js` — `updateEnemyRespawns()`

Each tick, dead enemies are checked: if `Date.now() ≥ enemy.deadUntil`, re-create the enemy via `makeEnemy()` at the original spawn position.

---

## 13. Player Regen & Death

### Regen

**File:** `game/ServerWorld.js` — `updatePlayerRegen()`

Runs every tick for all alive players:

$$
\text{mana} = \min(\text{maxMana}, \; \text{mana} + 7 \times dt)
$$

$$
\text{hp} = \min(\text{maxHp}, \; \text{hp} + 1.8 \times dt)
$$

At 60 Hz ($dt \approx 0.0167$): ~**0.03 hp/tick**, ~**0.117 mana/tick**, or approximately **1.8 hp/s** and **7 mana/s**.

### Death and Respawn

**File:** `game/ServerWorld.js` — `updatePlayerDeaths()`

When `player.dead === true` and `Date.now() ≥ player.deathUntil`:

1. `dead = false`
2. Full heal: `hp = maxHp, mana = maxMana`
3. Teleport to map spawn point
4. Floor reset to 0
5. Send `you_respawned` with new position and stats

---

## 14. Casting & Concentration

**File:** `game/ServerWorld.js` — `updatePlayerCasts()`

### Cast system

Players can have an active cast (`player.casting`). Each tick:

1. If player is dead → cancel cast
2. **Concentration check** — if `casting.concentration === true`:
   - If `player.x !== casting.castX` or `player.y !== casting.castY`:
   - Interrupt cast with reason `"moved"`
3. If cast duration elapsed (`now - startedAt ≥ duration`):
   - Complete cast via `_completeCast()`

### Data-driven concentration

The `concentration: true` flag is set on item definitions (e.g., Hearthstone in `items.json`). The server stores the player's position at cast start (`castX`, `castY`) and checks for **exact position match** every tick. Any server-acknowledged movement interrupts the cast.

---

## 15. Client Projectile System

**File:** `public/js/systems/ProjectileSystem.js`

Client-side visual projectiles are purely cosmetic. All damage is server-authoritative.

### Spawn parameters

```js
{
  sx, sy,             // start position
  tx, ty,             // initial target position (updates if homing)
  targetId,           // enemy ID for homing
  speed,              // px/s
  sprite,             // optional sprite path (e.g., arrow.png)
  spriteW, spriteH,   // sprite dimensions
  color, trail,       // fallback colours if no sprite
  size,               // projectile radius
  onHit               // callback for particles/sfx on arrival
}
```

### Update loop

Each frame per projectile:

1. If `targetId` set and enemy still alive: **re-target** to enemy's current position (homing)
2. Compute direction vector toward target
3. `step = speed × dt`
4. **Hit check**: `dist ≤ size + 8` or `step ≥ dist`
5. On hit: call `onHit()` callback (spawns particles, plays SFX), remove projectile
6. Otherwise: advance position, store trail history (last 6 positions)

### Trail rendering

Stores last 6 positions. Draws lines with decreasing alpha (`(count - i) / count`) and narrowing width.

### Projectile colours by damage type

| Type | Colour | Trail | Size |
|------|--------|-------|------|
| `physical` | `#d4a856` | `#8b7340` | 3 |
| `fire` | `#ff6622` | `#ff4400` | 4 |
| `frost` | `#66ccff` | `#3399ff` | 4 |
| `shadow` | `#aa44ff` | `#7722cc` | 4 |
| `nature` | `#44dd44` | `#22aa22` | 4 |

---

## 16. Particle System

**File:** `public/js/systems/ParticleSystem.js`

### Architecture

Two emission modes:
1. **Burst** — `emit(preset, x, y)`: spawns a batch of particles instantly
2. **Continuous** — `emitContinuous(id, preset, x, y, opts)`: spawns at a fixed rate until stopped

### Hard cap

Maximum **2000** live particles at any time. New particles are silently dropped above this limit.

### Particle spawn

Each particle gets randomised properties from the preset:

```
angle  ∈ [preset.angle[0], preset.angle[1]]    (degrees → radians)
speed  ∈ [preset.speed[0], preset.speed[1]]
life   ∈ [preset.lifetime[0], preset.lifetime[1]]
size   ∈ [preset.size[0], preset.size[1]]
colour = random pick from preset.color[]
```

Initial velocity:
```
vx = cos(angle) × speed
vy = sin(angle) × speed
```

### Per-frame physics

```
life -= dt
vy   += gravity × dt
vx   *= friction
vy   *= friction
x    += vx × dt
y    += vy × dt
```

Default `gravity = 0`, default `friction = 1.0` (no drag). Can be set per preset.

### Size interpolation

$$
t = 1 - \frac{\text{life}}{\text{maxLife}}
$$

$$
\text{size}(t) = \text{startSize} + (\text{sizeEnd} - \text{startSize}) \times t
$$

Default `sizeEnd = 0` — particles shrink to nothing.

### Fade

If `fadeOut` (default true): `alpha = life / maxLife`

### Continuous emitters

Each continuous emitter has:
- `rate` — seconds between bursts (from `preset.emitInterval` or default **0.15 s**)
- `duration` — total lifetime (default `Infinity`)
- `age` — time accumulator

Each frame: `elapsed += dt`. When `elapsed ≥ rate`, trigger a burst `emit()`. The first burst fires immediately (elapsed initialised to 999).

### Rendering

Particles are drawn as filled rectangles (`fillRect`) at world position minus camera offset. They are grouped by `blendMode` to minimise canvas state changes. Most use `"lighter"` (additive blending).

---

## 17. Audio System

**File:** `public/js/systems/AudioManager.js`

### Architecture

Uses **Web Audio API** with three gain nodes:

```
Source → sfxGain → masterGain → destination
              ↗
       bgmGain
```

| Node | Default Volume |
|------|---------------|
| Master | 1.0 (0 if muted) |
| SFX | 0.5 |
| BGM | 0.3 |

### SFX playback

Pre-loads all SFX as `AudioBuffer` from `/assets/sfx/{name}.wav`. Plays via `createBufferSource()` — one-shot, very low latency.

Available SFX: `sword_swing`, `sword_hit`, `heal`, `pickup`, `quest_complete`, `player_death`, `level_up`, `ui_click`, `enemy_death`, `chat_msg`, `error`, `footstep`, `casting`, `player_hit`, `arrow_hit`, `bow_shoot`, `magic_hit`, `staff_swing`, `bite_hit`, `punch_hit`, `punch_swing`, `potion_drink`

### BGM playback

Uses `HTMLAudioElement` routed through `createMediaElementSource()`. Loads from `/assets/bgm/{name}.mp3` with `.wav` fallback. Loops forever.

### Volume persistence

All volume settings are saved to and loaded from `localStorage` (`sfxVolume`, `bgmVolume`, `muted`).

---

## 18. Camera

**File:** `public/js/core/Game.js` — `updateCamera()`

### Following lerp

Each frame:

$$
\text{camera.x} += (\text{targetX} - \text{camera.x}) \times 0.11
$$

$$
\text{camera.y} += (\text{targetY} - \text{camera.y}) \times 0.11
$$

where `targetX = player.x - canvas.width × 0.5`, same for Y.

This is an **exponential smoothing** — the camera covers 11% of the remaining distance each frame. At 60 fps this gives a responsive but smooth follow.

### Viewport clamping

```
camera.x ∈ [0, worldWidth - canvasWidth]
camera.y ∈ [0, worldHeight - canvasHeight]
```

### Pixel-snapping for render

During the render pass, camera coordinates are rounded to integers to prevent **sub-pixel shimmer** on tile edges:

```js
const cam = { x: Math.round(this.camera.x), y: Math.round(this.camera.y) };
```

The raw float values are kept for smooth lerp accumulation.

### Instant center

`centerCameraOnPlayer()` sets `camera.x/y` directly (no lerp) for map changes and initial load.

---

## 19. Render Order

**File:** `public/js/core/Game.js` — `render()`

```
1. clearRect (full canvas)
2. world.drawTerrain()       — ground tiles
3. world.drawObjects()       — static objects (trees, rocks, buildings)
4. entities.draw()           — player, remote players, enemies, NPCs, statues
5. projectiles.draw()        — arrows, skill projectiles (with trails)
6. particles.draw()          — all live particles (additive blending)
7. drawInteractionPrompt()   — "Press E" tooltip near NPCs/statues
8. minimap.drawMinimap()     — corner minimap
9. minimap.drawFullMap()     — full-screen map overlay (when toggled)
```

All positions are drawn relative to the integer-snapped camera.

---

## 20. Client Update Order

**File:** `public/js/core/Game.js` — `update(dt)`

```
1. handleHotkeys()           — process key presses (I, C, L, P, K, M, 1-0, E, Enter, Esc)
2. mouse world position      — camera.x + mouse.x, camera.y + mouse.y
3. left/right click handling — combat targeting
4. network.interpolate(dt)   — smooths remote entities, applies prediction correction
5. entities.update(dt)       — local player movement, enemy/NPC state
6. combat.update(dt)         — auto-attack timers, target validation
7. projectiles.update(dt)    — advance visual projectiles, hit callbacks
8. particles.update(dt)      — advance particles, continuous emitter ticks
9. checkPortals()            — map transition detection
10. checkStairs(dt)          — floor change detection
11. updateCamera()           — lerp camera toward player
12. ui.update()              — HUD refresh
13. input.endFrame()         — clear per-frame input state
```

`dt` is capped at **0.05 s** (20 fps floor) to prevent physics explosions from lag spikes.
