# Stacker Agent – Leadvise Treasure Hunter Challenge

A sophisticated agent that builds a staircase to reach a treasure tower with 100% success rate and average completion in **887 turns** (under 28ms per run).

## Overview

This agent solves the Treasure Hunter Challenge by implementing a four-phase strategy that efficiently explores the map, collects blocks, builds a spiral staircase, and climbs to the treasure. The solution achieves **100% success rate** across 1000+ random maps with an average of **887 turns**, well under the 1000-turn target.

## Performance Metrics

### Benchmark Results

| Metric | Value |
|--------|-------|
| Average Turns | 887 (1000 runs) |
| Average Runtime | 27ms per run |
| Success Rate | 100% |
| Best Run | 668 turns |
| Worst Run | 1,312 turns |

### Turn Distribution by Phase (10-run average)

| Phase | Mean | Min | Max | % of Total |
|-------|------|-----|-----|------------|
| Explore | 69.7 | 4 | 238 | 7.9% |
| BuildPrep | 244.2 | 0 | 623 | 27.8% |
| Build | 566.2 | 473 | 746 | 64.3% |
| TOTAL | 880.1 | 712 | 1,281 | 100% |

### Key Insights

- **Explore phase** shows high variance (σ = 78.1) due to random tower placement
- **BuildPrep phase** is occasionally zero (20% of runs) when blocks are immediately available
- **Build phase** is the most consistent (σ = 70.7), representing the bulk of game turns
- Worst-case scenarios (1,281 turns) occur on maps with blocks placed far from the tower

## Strategy Architecture

The agent operates in four distinct phases, each with specific objectives and exit conditions.

### Phase 1: EXPLORE

**Purpose:** Find the tower location as quickly as possible.

**Method:** BFS frontier exploration that:
- Ignores level constraints for maximum mobility
- Treats unknown cells as passable to rapidly discover the map
- Prioritizes unvisited cells to find the tower

**Exit Condition:** Tower is discovered (type 3 cell)

**Performance:** Typically completes within 70 turns; fastest runs find the tower in just 4 turns.

### Phase 2: BUILD_PREP

**Purpose:** Gather enough blocks to construct the staircase.

**Method:** Dynamic exploration with priority zones:
- **Priority 1:** Explore near the tower (most likely block locations)
- **Priority 2:** Expand outward in increasing radius
- **Priority 3:** Global exploration if needed

**Smart Collection Logic:**
- Tracks discovered blocks vs. required blocks
- Proceeds early if map is large and most blocks are found (≥80% of requirement)
- Avoids unnecessary exploration when blocks are scarce

**Exit Condition:** Enough blocks discovered OR large area explored with sufficient blocks

**Performance:** Average 244 turns; can be zero if blocks are already near the start position.

### Phase 3: BUILD

**Purpose:** Construct the staircase in a traversable spiral pattern.

**Geometric Foundation:**

The 8 cells surrounding the tower form a ring where every consecutive pair is exactly one cardinal move apart:

| Index | Name | Delta | Move to Next |
|-------|------|-------|--------------|
| 0 | L | (-1, 0) | up → TL |
| 1 | TL | (-1,+1) | right → T |
| 2 | T | ( 0,+1) | right → TR |
| 3 | TR | (+1,+1) | down → R |
| 4 | R | (+1, 0) | down → BR |
| 5 | BR | (+1,-1) | left → B |
| 6 | B | ( 0,-1) | left → BL |
| 7 | BL | (-1,-1) | up → L (wraps) |

**Spiral Build Order:**

For tower height H = 8 (7 steps), the construction proceeds in stages:

- Stage 1: Build all 7 cells to height 1 (from entry inward)
- Stage 2: Build 6 cells to height 2 (all but farthest)
- Stage 3: Build 5 cells to height 3 (all but two farthest)
- ... continuing until the top cell reaches height 7

This ensures the staircase is always traversable during construction, allowing the agent to reach any build location.

**Method:**
- Pre-calculates optimal starting position (avoids walls)
- Generates build order in spiral pattern
- Prioritizes reachable targets using BFS pathfinding
- Manages block inventory efficiently

**Exit Condition:** All staircase cells reach target heights

**Performance:** Most consistent phase, averaging 566 turns (64% of total).

### Phase 4: CLIMB

**Purpose:** Ascend the completed staircase to the tower.

**Method:** BFS pathfinding with full level constraints

**Exit Condition:** Agent stands on tower cell (game victory)


## Design Decisions & Trade-offs

This section explains the rationale behind key architectural choices, including alternatives that were considered (and sometimes rejected due to time constraints).

### 1. BFS for Pathfinding & Exploration

**What I chose:** Breadth-First Search (BFS) for both exploration and pathfinding, treating unknown cells as passable during exploration.

**Alternatives considered:**
- **DFS (Depth-First Search):** Would explore deeper paths first, potentially finding the tower faster in some layouts
- **A* with heuristic:** Could reduce pathfinding steps by prioritizing promising directions
- **Random walk:** My initial prototype, which proved unreliable and prone to loops

**Why BFS:**
- Intuitively fit the exploration goal—BFS expands outward in rings, giving broad situational awareness around the agent
- Particularly valuable when searching near the tower, as BFS naturally prioritizes the area around discovered structures
- Guarantees optimal path length for movement, which matters more than theoretical efficiency on small maps (≤50×50)
- With time constraints, BFS was straightforward to implement correctly while achieving the 100% success target

**Trade-off:** A* might shave off additional turns, but the implementation complexity wasn't justified given the solution already meets performance targets.

### 2. Four-Phase Architecture

**What I chose:** Strictly sequential phases: EXPLORE → BUILD_PREP → BUILD → CLIMB

**Alternatives considered:**
- **Interleaved approach:** Switching between exploration, collection, and building dynamically
- **Unified state machine:** Continuous adaptation based on immediate needs

**Why phases:**
- Emerged naturally from how I mentally solved the problem: *find tower → plan staircase → gather materials → build → climb*
- Phases simplify reasoning about program state and prevent edge cases where the agent gets stuck between conflicting objectives
- With limited time, a phased approach was easier to debug—I could verify each phase worked independently before integration
- The 100% success requirement favored predictable behavior over theoretical efficiency

**Trade-off:** Phases can be rigid; in some maps, interleaving collection with building might reduce turns. However, the sequential approach proved reliable across all random maps.

### 3. Spiral Staircase Pattern

**What I chose:** A spiral staircase using the 8 cells surrounding the tower, built incrementally (all cells to height 1, then to height 2, etc.)

**Alternatives considered:**
- **Straight diagonal ramp:** Would block itself as it rises
- **Single-column tower:** Would exceed inventory capacity for taller towers
- **Scaffold-and-remove:** More complex to implement and debug
- **Build from tower outward:** Would require the agent to reach the tower before construction

**Why spiral:**
- Space-efficient—uses only the immediate 8-cell ring around the tower
- Always traversable during construction because each height level is completed before moving higher
- The incremental build order ensures the agent can reach any build location throughout construction
- With limited time to research alternatives, this pattern "just worked" after testing a few variations

**Trade-off:** The spiral pattern isn't necessarily turn-optimal, but it's deterministic, reliable, and sufficient for 100% success.

### 4. Block Collection Strategy

**What I chose:** Collect blocks *before* building, with an early exit when ≥80% of required blocks are discovered

**Alternatives considered:**
- **Collect all blocks first:** Could waste turns searching sparse maps
- **Build-as-you-collect:** Risked building an incomplete staircase that blocks future construction
- **Greedy approach:** Always move to the nearest undiscovered block

**Why threshold-based collection:**
- Separating collection from building aligns with the phased architecture
- The 80% threshold came from empirical observation: in large maps, searching for the last few blocks often costs more turns than starting the build and collecting remaining blocks during construction
- Early exit balances exploration overhead against build readiness

**Trade-off:** The 80% threshold is heuristic, not mathematically optimal. A more sophisticated approach could dynamically adjust based on map density, but this works reliably.

### 5. Treating Unknown Cells as Passable

**What I chose:** During exploration, treat undiscovered cells as passable terrain

**Alternatives considered:**
- **Conservative exploration:** Only move into confirmed passable cells
- **Wall-following:** Left-hand or right-hand wall following for maze navigation

**Why this approach:**
- Dramatically speeds up map discovery—the agent "optimistically" explores without waiting to verify terrain
- BFS with unknown-as-passable guarantees finding the tower in minimal steps regardless of map topology
- Wall-following fails on maps with disconnected obstacles or open areas
- Random walk (my first attempt) proved inefficient and could loop indefinitely

**Trade-off:** The agent might attempt to path through blocked cells, requiring fallback logic. However, the BFS layer recalculates when obstacles are discovered, making this a safe optimization.



## Future Optimizations & Improvements

While the current solution achieves 100% success with an average of 887 turns, there are several optimizations I'd explore given more time. These represent alternatives I *would* evaluate but didn't have bandwidth to implement—the current solution prioritizes reliability and development speed over theoretical minimum turns.

### 1. A* Search with Heuristics
- **Replace BFS with A*** using Manhattan distance heuristic
- Could reduce pathfinding overhead by 20-30% by prioritizing promising directions
- Particularly beneficial during Build phase where many pathfinding calls occur
- *Why not now:* BFS guarantees optimal path length and was simpler to implement correctly within time constraints

### 2. Hybrid Exploration Strategy
- **Combine BFS with DFS** to optimize for both open areas and maze-like maps
- DFS might find towers faster in certain layouts by exploring deeper paths first
- Could implement adaptive switching based on local map density
- *Why not now:* Current BFS approach already finds towers quickly (average 70 turns) and is simpler to reason about

### 3. Adaptive Phase Thresholds
- **Dynamically adjust the 80% BuildPrep exit rule** based on map size and block density
- In sparse maps, lower threshold could reduce unnecessary exploration
- In dense maps, higher threshold might prevent mid-build collection trips
- *Why not now:* 80% works reliably across all map types; adaptive logic adds complexity without guaranteed ROI

### 4. Parallel Path Planning
- **Pre-compute paths to multiple targets simultaneously**
- Reduce redundant BFS calculations during Build phase when multiple blocks need collection
- Could cache paths between frames to avoid recomputation
- *Why not now:* Current approach processes one target at a time; parallelism would require significant refactoring

### 5. Optimized Data Structures
- **Better hashing:** Use integer encoding `(x << 16) | (y & 0xFFFF)` for faster lookups
- Reduce memory overhead and improve cache locality in visited sets and pathfinding queues
- Could speed up BFS operations by 10-15%
- *Why not now:* Python overhead dominates; micro-optimizations offer diminishing returns at current performance level

### 6. Block Caching Between Phases
- **Remember block locations discovered during Explore and BuildPrep**
- Avoid rediscovering blocks during Build phase when inventory runs low
- Could reduce unnecessary map traversal in later stages
- *Why not now:* Current implementation collects most blocks before building; additional caching provides minimal benefit

### 7. Interleaved Build-Collection Strategy
- **Build while collecting** instead of strict phase separation
- Could reduce turns by overlapping activities
- *Why not now:* Adds significant complexity; current sequential approach is more predictable and easier to debug

### Summary of Trade-offs

These optimizations were deferred because:

| Priority | Decision |
|----------|----------|
| **Highest** | 100% success rate across all random maps |
| **High** | Predictable, debuggable code structure |
| **Medium** | Development speed within time constraints |
| **Lower** | Minimizing turn count (already under 1000 target) |

The current solution proves that a pragmatic, phased approach with BFS and spiral construction is sufficient for reliable success. Future iterations could incorporate the optimizations above to push turn counts lower while maintaining the 100% success rate.