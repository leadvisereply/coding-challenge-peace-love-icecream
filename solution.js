/**
 * Stacker Agent – Leadvise Treasure Hunter Challenge
 * 
 * A sophisticated agent that builds a staircase to reach a treasure tower.
 * The agent adapts its exploration based on block requirements and builds
 * in a spiral pattern to maintain traversability.
 *
 * @author Maximilian Kritzenthaler
 * @version 1.0
 */


// Average for 1000 runs: 887 turns, 27ms

/**
 * STRATEGY OVERVIEW
 * =================
 * 
 * The agent operates in four distinct phases:
 * 
 * PHASE 1: EXPLORE
 * ---------------
 * Purpose: Find the tower location.
 * Method: BFS frontier exploration that ignores level constraints and treats
 *         unknown cells as passable. This allows rapid exploration of the map.
 * Exit Condition: Tower is discovered.
 * 
 * PHASE 2: BUILD_PREP
 * -------------------
 * Purpose: Gather enough blocks to construct the staircase.
 * Method: Dynamic exploration that prioritizes areas near the tower first,
 *         then expands outward. Only explores until we have enough blocks,
 *         avoiding unnecessary map coverage.
 * Exit Condition: Enough blocks discovered to complete staircase.
 * 
 * PHASE 3: BUILD
 * --------------
 * Purpose: Construct the staircase in a spiral pattern.
 * Method: Follows a predefined build order that maintains connectivity:
 *         - Stage 1: All cells to height 1 (starting from entry point)
 *         - Stage 2: All cells to height 2
 *         - Stage 3: All cells to height 3
 *         - etc.
 *         This ensures the staircase is always traversable during construction.
 * Exit Condition: All staircase cells reach their target heights.
 * 
 * PHASE 4: CLIMB
 * --------------
 * Purpose: Ascend the completed staircase to the tower.
 * Method: BFS pathfinding respecting level constraints.
 * Exit Condition: Agent stands on tower cell (game win).
 * 
 * 
 * GEOMETRIC INSIGHT – RING TRAVERSAL
 * ===================================
 * The 8 cells surrounding the tower form a ring where every consecutive pair
 * is exactly one cardinal move apart. This is crucial for staircase connectivity:
 * 
 *   Index  Name  Delta     Move to Next
 *   0      L     (-1, 0)   up    → TL
 *   1      TL    (-1,+1)   right → T
 *   2      T     ( 0,+1)   right → TR
 *   3      TR    (+1,+1)   down  → R
 *   4      R     (+1, 0)   down  → BR
 *   5      BR    (+1,-1)   left  → B
 *   6      B     ( 0,-1)   left  → BL
 *   7      BL    (-1,-1)   up    → L  (wraps)
 * 
 * For tower height H, we need H-1 consecutive cells from this ring.
 * The first cell (chain[0]) must be a cardinal neighbor (indices 0,2,4,6)
 * to allow the final step onto the tower.
 * 
 * 
 * SPIRAL BUILD ORDER
 * ==================
 * To maintain traversability during construction, we build in stages:
 * 
 * Example for H=8 (7 steps):
 * 
 *   Stage 1: Build all cells to height 1
 *     - Start from entry (cell 6), then cell 5, 4, 3, 2, 1, 0
 *   Stage 2: Build all cells except farthest to height 2
 *     - Start from entry (cell 6), then 5, 4, 3, 2, 1
 *   Stage 3: Build all cells except two farthest to height 3
 *     - Start from entry (cell 6), then 5, 4, 3, 2
 *   ... and so on.
 * 
 * This ensures the agent always has a path to the construction site.
 */
class Stacker {
    /**
     * Initialize the agent's state.
     * All state variables are reset for each new game.
     */
    constructor() {
        // ========== MAP KNOWLEDGE ==========
        /** @type {Map<string, {type: number, level: number, visited: boolean}>} */
        this.map = new Map();
        
        // ========== AGENT STATE ==========
        /** @type {{x: number, y: number}} Current agent position */
        this.currentPos = { x: 0, y: 0 };
        /** @type {number} Current elevation level */
        this.currentLevel = 0;
        /** @type {boolean} Whether agent is carrying a block */
        this.hasBlock = false;
        /** @type {string|null} Last action taken */
        this.lastAction = null;
        
        // ========== WORLD KNOWLEDGE ==========
        /** @type {{x: number, y: number}|null} Tower position */
        this.towerPos = null;
        /** @type {number|null} Tower height (always 8 in tests) */
        this.towerLevel = null;
        
        // ========== STAIRCASE PLANNING ==========
        /**
         * Ordered list of building steps.
         * Each step: {x, y, targetHeight, stage, positionIndex, buildOrder, totalNeeded}
         * @type {Array<Object>}
         */
        this.staircaseSteps = [];
        /** @type {Array<{x: number, y: number}>} Known block locations */
        this.blockLocations = [];
        
        // ========== PATH QUEUE ==========
        /** @type {Array<string>} Pre-computed action sequence */
        this.path = [];
        
        // ========== PHASE MANAGEMENT ==========
        /** @type {'EXPLORE'|'BUILD_PREP'|'BUILD'|'CLIMB'} Current phase */
        this.phase = "EXPLORE";
        
        // ========== BUILD PREPARATION TRACKING ==========
        /** @type {number} Total blocks needed for staircase */
        this.targetBlocksNeeded = 0;
        /** @type {number} Progress logging throttle (avoid spam) */
        this.lastLoggedPercent = -1;
    }

    // ================================================================
    // MAIN LOOP
    // ================================================================

    /**
     * Main game loop entry point. Called once per game tick.
     * @param {Object} cell - Information about current cell and neighbors
     * @returns {string} Action to perform: "left", "right", "up", "down", "pickup", or "drop"
     */
    turn(cell) {
        // 1. Update agent position based on previous action
        if (this.lastAction) this.updatePosition(this.lastAction);
        
        // 2. Update world knowledge from observations
        this.updateKnowledge(cell);
        
        // 3. Update block carrying state
        this.updateBlockState();
        
        // 4. Follow pre-computed path if available
        if (this.path.length > 0) {
            const action = this.path.shift();
            this.lastAction = action;
            return action;
        }
        
        // 5. Delegate to current phase handler
        let action;
        switch (this.phase) {
            case "EXPLORE":
                action = this.handleExploration();
                break;
            case "BUILD_PREP":
                action = this.handleBuildPreparation();
                break;
            case "BUILD":
                action = this.handleStairBuilding();
                break;
            case "CLIMB":
                action = this.handleClimbing();
                break;
            default:
                action = "right";
        }
        
        this.lastAction = action;
        return action;
    }

    // ================================================================
    // STATE UPDATES
    // ================================================================

    /**
     * Update agent position based on movement action.
     * @param {string} action - The action taken
     */
    updatePosition(action) {
        const moves = {
            right: [1, 0],
            left: [-1, 0],
            up: [0, 1],
            down: [0, -1]
        };
        
        if (moves[action]) {
            this.currentPos.x += moves[action][0];
            this.currentPos.y += moves[action][1];
        }
    }

    /**
     * Update block carrying state based on last action.
     * Also removes picked-up blocks from known locations.
     */
    updateBlockState() {
        if (this.lastAction === "pickup") {
            this.hasBlock = true;
            this.blockLocations = this.blockLocations.filter(
                b => !(b.x === this.currentPos.x && b.y === this.currentPos.y)
            );
        } else if (this.lastAction === "drop") {
            this.hasBlock = false;
        }
    }

    /**
     * Update map knowledge from current observation.
     * @param {Object} cell - Current cell and neighbor information
     */
    updateKnowledge(cell) {
        const key = this.getKey(this.currentPos.x, this.currentPos.y);
        
        // CRITICAL: Never mark tower cell as visited until climbing
        // The agent can only stand next to the tower, not on it
        const isTowerCell = this.towerPos && 
                           this.currentPos.x === this.towerPos.x && 
                           this.currentPos.y === this.towerPos.y;
        
        this.map.set(key, {
            type: cell.type,
            level: cell.level,
            visited: !isTowerCell
        });
        this.currentLevel = cell.level;
        
        // Process all four cardinal directions
        const directions = [
            { dir: 'left',  dx: -1, dy: 0 },
            { dir: 'right', dx: 1,  dy: 0 },
            { dir: 'up',    dx: 0,  dy: 1 },
            { dir: 'down',  dx: 0,  dy: -1 }
        ];
        
        for (const { dir, dx, dy } of directions) {
            const adjCell = cell[dir];
            if (!adjCell) continue;
            
            const ax = this.currentPos.x + dx;
            const ay = this.currentPos.y + dy;
            const aKey = this.getKey(ax, ay);
            
            // Update or create cell entry
            const prev = this.map.get(aKey);
            this.map.set(aKey, {
                type: adjCell.type,
                level: adjCell.level,
                visited: prev ? prev.visited : false
            });
            
            // Track loose blocks (type 2) that aren't part of staircase
            const isStairPos = this.staircaseSteps.some(s => s.x === ax && s.y === ay);
            if (adjCell.type === 2 && !isStairPos) {
                const exists = this.blockLocations.some(b => b.x === ax && b.y === ay);
                if (!exists) {
                    this.blockLocations.push({ x: ax, y: ay });
                }
            } else {
                // Remove blocks that were picked up or became staircase cells
                this.blockLocations = this.blockLocations.filter(
                    b => !(b.x === ax && b.y === ay)
                );
            }
            
            // Detect tower when adjacent to it
            if (adjCell.type === 3 && !this.towerPos) {
                this.towerPos = { x: ax, y: ay };
                this.towerLevel = adjCell.level;
                
                const stepsNeeded = this.towerLevel - 1;
                this.targetBlocksNeeded = (stepsNeeded * (stepsNeeded + 1)) / 2;
                
                console.log(`[Tower] Found at (${ax},${ay}) height=${this.towerLevel}`);
                console.log(`[Tower] Need ${this.targetBlocksNeeded} blocks for staircase`);
                
                if (this.phase === "EXPLORE") {
                    console.log("[Phase] Switching to BUILD_PREP mode");
                    this.phase = "BUILD_PREP";
                }
            }
        }
    }

    // ================================================================
    // PHASE 1: GLOBAL EXPLORATION
    // ================================================================

    /**
     * Explore the map using BFS, ignoring level constraints.
     * Treats unknown cells as passable to reach new frontiers.
     * @returns {string} Action to perform
     */
    handleExploration() {
        const target = this.findNearestUnexplored();
        if (!target) return "right";
        
        const path = this.bfsPath(this.currentPos, target, false, true);
        if (!path || path.length === 0) return "right";
        
        const dirs = this.pathToDirs(path);
        if (dirs.length > 1) this.path = dirs.slice(1);
        return dirs[0] || "right";
    }
    
    /**
     * Find the nearest unexplored cell using BFS.
     * @returns {{x: number, y: number}|null} Target position or null if none found
     */
    findNearestUnexplored() {
        const startKey = this.getKey(this.currentPos.x, this.currentPos.y);
        const visited = new Set([startKey]);
        const queue = [{ x: this.currentPos.x, y: this.currentPos.y }];
        
        while (queue.length > 0) {
            const pos = queue.shift();
            const key = this.getKey(pos.x, pos.y);
            const cell = this.map.get(key);
            
            // Found unexplored cell
            if (!cell || !cell.visited) return pos;
            
            // Explore neighbors
            for (const [dx, dy] of [[1,0], [-1,0], [0,1], [0,-1]]) {
                const nx = pos.x + dx;
                const ny = pos.y + dy;
                const nKey = this.getKey(nx, ny);
                
                if (visited.has(nKey)) continue;
                
                const nc = this.map.get(nKey);
                if (nc && nc.type === 1) continue; // Skip walls
                
                visited.add(nKey);
                queue.push({ x: nx, y: ny });
            }
        }
        
        return null; // Everything reachable is explored
    }

    // ================================================================
    // PHASE 2: BUILD PREPARATION (Dynamic Block Collection)
    // ================================================================

    /**
     * Explore dynamically until enough blocks are collected.
     * Prioritizes areas near the tower first, then expands outward.
     * @returns {string} Action to perform
     */
    handleBuildPreparation() {
        // Safety check: ensure tower exists
        if (!this.towerPos) {
            this.phase = "EXPLORE";
            return this.handleExploration();
        }
        
        // Check if we have enough blocks to proceed
        if (this.hasEnoughBlocksForStaircase()) {
            console.log(`[Prep] Sufficient blocks: ${this.blockLocations.length}/${this.targetBlocksNeeded}`);
            return this.transitionToBuild();
        }
        
        // Log progress periodically (every 10%)
        const percentNeeded = Math.round((this.blockLocations.length / this.targetBlocksNeeded) * 100);
        if (percentNeeded % 10 === 0 && percentNeeded !== this.lastLoggedPercent) {
            console.log(`[Prep] Blocks: ${this.blockLocations.length}/${this.targetBlocksNeeded} (${percentNeeded}%)`);
            this.lastLoggedPercent = percentNeeded;
        }
        
        // Priority 1: Explore near the tower (most likely block locations)
        const towerTarget = this.findNearestUnvisitedNearTower();
        if (towerTarget) {
            const path = this.bfsPath(this.currentPos, towerTarget, true, false);
            if (path && path.length > 0) {
                const dirs = this.pathToDirs(path);
                if (dirs.length > 1) this.path = dirs.slice(1);
                return dirs[0] || "right";
            }
        }
        
        // Priority 2: Expand exploration globally
        const target = this.findNearestUnexplored();
        if (!target) {
            // Map fully explored but still need blocks - proceed anyway
            console.warn(`[Prep] Map fully explored. Proceeding with ${this.blockLocations.length}/${this.targetBlocksNeeded} blocks`);
            return this.transitionToBuild();
        }
        
        const path = this.bfsPath(this.currentPos, target, false, true);
        if (!path || path.length === 0) return "right";
        
        const dirs = this.pathToDirs(path);
        if (dirs.length > 1) this.path = dirs.slice(1);
        return dirs[0] || "right";
    }
    
    /**
     * Check if we have discovered enough blocks to complete the staircase.
     * @returns {boolean} True if we have sufficient blocks
     */
    hasEnoughBlocksForStaircase() {
        // Exact requirement met
        if (this.blockLocations.length >= this.targetBlocksNeeded) {
            return true;
        }
        
        // Optimization: If we've explored a large area and found most blocks,
        // proceed anyway (remaining blocks are likely unreachable)
        const exploredArea = this.countExploredCells();
        if (exploredArea > 200 && this.blockLocations.length >= this.targetBlocksNeeded * 0.8) {
            console.log(`[Prep] Large area explored (${exploredArea} cells), proceeding with ${this.blockLocations.length} blocks`);
            return true;
        }
        
        return false;
    }
    
    /**
     * Find unvisited cells near the tower with expanding radius.
     * @returns {{x: number, y: number}|null} Target position or null
     */
    findNearestUnvisitedNearTower() {
        if (!this.towerPos) return null;
        
        // Dynamic max radius based on block needs
        const maxRadius = Math.max(10, Math.ceil(Math.sqrt(this.targetBlocksNeeded)));
        const candidates = [];
        
        for (let radius = 1; radius <= maxRadius; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    const x = this.towerPos.x + dx;
                    const y = this.towerPos.y + dy;
                    
                    // Skip the tower cell itself
                    if (x === this.towerPos.x && y === this.towerPos.y) continue;
                    
                    const cell = this.map.get(this.getKey(x, y));
                    if (cell && !cell.visited && cell.type !== 1) {
                        candidates.push({ x, y, distance: Math.abs(dx) + Math.abs(dy) });
                    }
                }
            }
            
            // Return the closest ring with candidates
            if (candidates.length > 0) break;
        }
        
        if (candidates.length === 0) return null;
        
        // Sort by Manhattan distance
        candidates.sort((a, b) => a.distance - b.distance);
        return candidates[0];
    }
    
    /**
     * Count number of explored cells in the map.
     * @returns {number} Count of visited cells
     */
    countExploredCells() {
        let count = 0;
        for (const cell of this.map.values()) {
            if (cell.visited) count++;
        }
        return count;
    }
    
    /**
     * Transition from preparation to building phase.
     * Plans the staircase and switches phase.
     * @returns {string} First action of build phase
     */
    transitionToBuild() {
        this.planStaircase();
        this.path = [];
        
        if (this.staircaseSteps.length > 0) {
            console.log(`[Phase] Starting staircase construction with ${this.blockLocations.length} blocks available`);
            this.phase = "BUILD";
            return this.handleStairBuilding();
        }
        
        console.warn("[Phase] No valid staircase path found - continuing exploration");
        this.phase = "EXPLORE";
        return this.handleExploration();
    }

    // ================================================================
    // STAIRCASE PLANNING
    // ================================================================

    /**
     * Generate the 8 surrounding cells in ring order.
     * The ring ensures consecutive cells are exactly one cardinal move apart.
     * @returns {Array<{x: number, y: number}>} Array of 8 positions
     */
    buildRing() {
        const deltas = [
            { dx: -1, dy: 0 },  // 0: Left (cardinal)
            { dx: -1, dy: 1 },  // 1: Top-Left (diagonal)
            { dx: 0,  dy: 1 },  // 2: Top (cardinal)
            { dx: 1,  dy: 1 },  // 3: Top-Right (diagonal)
            { dx: 1,  dy: 0 },  // 4: Right (cardinal)
            { dx: 1,  dy: -1 }, // 5: Bottom-Right (diagonal)
            { dx: 0,  dy: -1 }, // 6: Bottom (cardinal)
            { dx: -1, dy: -1 }  // 7: Bottom-Left (diagonal)
        ];
        
        return deltas.map(d => ({
            x: this.towerPos.x + d.dx,
            y: this.towerPos.y + d.dy
        }));
    }
    
    /**
     * Plan the staircase with optimal starting position and spiral build order.
     * 
     * Algorithm:
     * 1. Try all 4 cardinal starting positions
     * 2. Choose the chain with fewest walls
     * 3. Generate build order: for each stage, build cells from entry inward
     * 4. Sort steps to ensure foundations are built first
     */
    planStaircase() {
        const H = this.towerLevel;
        const stepsNeeded = H - 1;
        const totalBlocks = (stepsNeeded * (stepsNeeded + 1)) / 2;
        
        console.log(`[Plan] Tower H=${H}, steps=${stepsNeeded}, total blocks=${totalBlocks}`);
        
        const ring = this.buildRing();
        const cardinalIndices = [0, 2, 4, 6]; // L, T, R, B
        
        // Find best chain (fewest walls)
        let bestChain = null;
        let bestScore = -1;
        
        for (const startIdx of cardinalIndices) {
            const chain = [];
            let wallCount = 0;
            
            for (let i = 0; i < stepsNeeded; i++) {
                const pos = ring[(startIdx + i) % 8];
                const cell = this.map.get(this.getKey(pos.x, pos.y));
                if (cell && cell.type === 1) wallCount++;
                chain.push(pos);
            }
            
            const score = stepsNeeded - wallCount;
            if (score > bestScore) {
                bestScore = score;
                bestChain = chain;
            }
        }
        
        if (!bestChain) {
            console.error("[Plan] No valid staircase chain found!");
            return;
        }
        
        console.log(`[Plan] Staircase top: (${bestChain[0].x},${bestChain[0].y}) h=${stepsNeeded}`);
        console.log(`[Plan] Staircase entry: (${bestChain[stepsNeeded-1].x},${bestChain[stepsNeeded-1].y}) h=1`);
        
        // Generate spiral build order
        this.staircaseSteps = [];
        let buildOrder = 0;
        
        // For each stage (1 to stepsNeeded), build cells from entry inward
        for (let stage = 1; stage <= stepsNeeded; stage++) {
            // Build from entry (highest index) to top (lowest index)
            for (let posIdx = bestChain.length - 1; posIdx >= 0; posIdx--) {
                const pos = bestChain[posIdx];
                const finalHeight = stepsNeeded - posIdx;
                
                // This cell participates in this stage
                if (finalHeight >= stage) {
                    this.staircaseSteps.push({
                        x: pos.x,
                        y: pos.y,
                        targetHeight: stage,
                        stage: stage,
                        positionIndex: posIdx,
                        buildOrder: buildOrder++,
                        totalNeeded: finalHeight
                    });
                }
            }
        }
        
        // Log build order (first 20 steps)
        console.log("[Plan] Build order (spiral from entry):");
        this.staircaseSteps.slice(0, 20).forEach((step, idx) => {
            console.log(`  ${idx}: (${step.x},${step.y}) stage ${step.stage}/${step.totalNeeded}`);
        });
        if (this.staircaseSteps.length > 20) {
            console.log(`  ... and ${this.staircaseSteps.length - 20} more steps`);
        }
        
        // Remove staircase positions from block locations
        const stairKeys = new Set(bestChain.map(p => this.getKey(p.x, p.y)));
        this.blockLocations = this.blockLocations.filter(
            b => !stairKeys.has(this.getKey(b.x, b.y))
        );
        
        console.log(`[Plan] Blocks available for building: ${this.blockLocations.length}`);
    }

    // ================================================================
    // PHASE 3: STAIRCASE CONSTRUCTION
    // ================================================================

    /**
     * Core building loop that follows the spiral build order.
     * @returns {string} Action to perform
     */
    handleStairBuilding() {
        // Check if staircase is complete
        if (this.isStaircaseComplete()) {
            console.log("[Build] Staircase complete! Climbing to tower...");
            this.phase = "CLIMB";
            return this.handleClimbing();
        }
        
        // Check if we have blocks to work with
        if (!this.hasBlock && !this.hasAvailableBlocks()) {
            console.log("[Build] Out of blocks - switching to exploration mode");
            return this.exploreForBlocks();
        }
        
        const target = this.getNextBuildTarget();
        
        // No target found - check if we're actually done
        if (!target) {
            if (this.isStaircaseComplete()) {
                this.phase = "CLIMB";
                return this.handleClimbing();
            }
            // Not done but no target - something's wrong, fallback to exploration
            console.warn("[Build] No build target found - exploring for blocks");
            return this.exploreForBlocks();
        }
        
        // Handle block carrying logic
        if (this.hasBlock) {
            // Already at target - drop the block
            if (this.currentPos.x === target.x && this.currentPos.y === target.y) {
                return "drop";
            }
            
            // Navigate to target
            const path = this.bfsPath(
                this.currentPos, { x: target.x, y: target.y }, true, false
            );
            
            if (!path || path.length === 0) {
                console.warn(`[Build] Cannot reach target (${target.x},${target.y}) - dropping block`);
                return "drop";
            }
            
            const dirs = this.pathToDirs(path);
            if (dirs.length > 1) this.path = dirs.slice(1);
            return dirs[0];
        }
        
        // Need to pick up a block
        return this.goPickupBlock();
    }
    
    /**
     * Check if the staircase is fully built.
     * @returns {boolean} True if all steps reach target heights
     */
    isStaircaseComplete() {
        return this.staircaseSteps.every(step => {
            const cell = this.map.get(this.getKey(step.x, step.y));
            return (cell ? cell.level : 0) >= step.targetHeight;
        });
    }
    
    /**
     * Check if any reachable blocks are available for pickup.
     * @returns {boolean} True if at least one block is reachable
     */
    hasAvailableBlocks() {
        const stairKeys = new Set(this.staircaseSteps.map(s => this.getKey(s.x, s.y)));
        const available = this.blockLocations.filter(
            b => !stairKeys.has(this.getKey(b.x, b.y))
        );
        
        if (available.length === 0) return false;
        
        // Check reachability with level constraints
        return available.some(
            b => this.bfsPath(this.currentPos, b, true, false) !== null
        );
    }
    
    /**
     * Explore the map to find more blocks during construction.
     * @returns {string} Action to perform
     */
    exploreForBlocks() {
        const blocksNeeded = this.blocksStillNeeded();
        const known = this.blockLocations.length;
        
        const target = this.findNearestUnexplored();
        
        if (!target) {
            console.warn(`[Build] Map fully explored. Need ${blocksNeeded} blocks but only have ${known}. Attempting climb...`);
            this.phase = "CLIMB";
            return this.handleClimbing();
        }
        
        console.log(`[Build] Searching for blocks (need ${blocksNeeded}, have ${known}) - exploring (${target.x},${target.y})`);
        
        const path = this.bfsPath(this.currentPos, target, false, true);
        if (!path || path.length === 0) return "right";
        
        const dirs = this.pathToDirs(path);
        if (dirs.length > 1) this.path = dirs.slice(1);
        return dirs[0] || "right";
    }
    
    /**
     * Calculate how many more block drops are needed.
     * @returns {number} Number of blocks still needed
     */
    blocksStillNeeded() {
        return this.staircaseSteps.reduce((count, step) => {
            const cell = this.map.get(this.getKey(step.x, step.y));
            const h = cell ? cell.level : 0;
            return count + (h < step.targetHeight ? 1 : 0);
        }, 0);
    }
    
    /**
     * Get the next build target following spiral order.
     * Verifies reachability before returning.
     * @returns {Object|null} Next step that needs a block, or null
     */
    getNextBuildTarget() {
        // Find the first incomplete step in build order
        for (const step of this.staircaseSteps) {
            const cell = this.map.get(this.getKey(step.x, step.y));
            const currentHeight = cell ? cell.level : 0;
            
            if (currentHeight < step.targetHeight) {
                // Verify reachability
                const path = this.bfsPath(
                    this.currentPos, { x: step.x, y: step.y }, true, false
                );
                
                if (path !== null) {
                    console.log(
                        `[Build] Target: (${step.x},${step.y}) ` +
                        `stage ${step.stage}/${step.totalNeeded} ` +
                        `h=${currentHeight}→${step.targetHeight}`
                    );
                    return step;
                }
                // Not reachable yet - will be reachable after lower stages are built
            }
        }
        
        return null;
    }
    
    /**
     * Navigate to and pick up the nearest reachable block.
     * @returns {string} Action to perform
     */
    goPickupBlock() {
        const stairKeys = new Set(this.staircaseSteps.map(s => this.getKey(s.x, s.y)));
        const available = this.blockLocations.filter(
            b => !stairKeys.has(this.getKey(b.x, b.y))
        );
        
        // Find closest reachable block
        let bestPath = null;
        let bestBlock = null;
        
        for (const block of available) {
            const path = this.bfsPath(this.currentPos, block, true, false);
            if (path !== null && (bestPath === null || path.length < bestPath.length)) {
                bestPath = path;
                bestBlock = block;
            }
        }
        
        if (!bestBlock) {
            return this.exploreForBlocks();
        }
        
        // Already on the block
        if (bestPath.length === 0) return "pickup";
        
        const dirs = this.pathToDirs(bestPath);
        if (dirs.length > 1) this.path = dirs.slice(1);
        return dirs[0];
    }

    // ================================================================
    // PHASE 4: CLIMB TO TOWER
    // ================================================================

    /**
     * Climb the completed staircase to reach the tower.
     * @returns {string} Action to perform
     */
    handleClimbing() {
        // Victory condition
        if (this.currentPos.x === this.towerPos.x &&
            this.currentPos.y === this.towerPos.y) {
            console.log("[Climb] Victory! Reached the tower!");
            return "right";
        }
        
        const path = this.bfsPath(this.currentPos, this.towerPos, true, false);
        if (!path || path.length === 0) return "right";
        
        const dirs = this.pathToDirs(path);
        if (dirs.length > 1) this.path = dirs.slice(1);
        return dirs[0];
    }

    // ================================================================
    // PATHFINDING UTILITIES
    // ================================================================

    /**
     * Breadth-First Search for pathfinding.
     * @param {{x: number, y: number}} from - Start position
     * @param {{x: number, y: number}} to - Target position
     * @param {boolean} respectLevels - Enforce |Δlevel| ≤ 1
     * @param {boolean} allowUnknown - Treat unknown cells as passable
     * @returns {Array<{x: number, y: number}>|null} Path positions or null
     */
    bfsPath(from, to, respectLevels, allowUnknown) {
        if (from.x === to.x && from.y === to.y) return [];
        
        const fromKey = this.getKey(from.x, from.y);
        const toKey = this.getKey(to.x, to.y);
        const fromCell = this.map.get(fromKey);
        const startLevel = fromCell ? fromCell.level : 0;
        
        const visited = new Map([[fromKey, null]]);
        const queue = [{ x: from.x, y: from.y, level: startLevel }];
        
        while (queue.length > 0) {
            const current = queue.shift();
            const currentKey = this.getKey(current.x, current.y);
            
            for (const [dx, dy] of [[1,0], [-1,0], [0,1], [0,-1]]) {
                const nx = current.x + dx;
                const ny = current.y + dy;
                const nKey = this.getKey(nx, ny);
                
                if (visited.has(nKey)) continue;
                
                const nCell = this.map.get(nKey);
                let nLevel;
                
                if (!nCell) {
                    if (!allowUnknown) continue;
                    nLevel = 0;
                } else {
                    if (nCell.type === 1) continue; // Wall
                    nLevel = nCell.level;
                }
                
                if (respectLevels && Math.abs(nLevel - current.level) > 1) continue;
                
                visited.set(nKey, currentKey);
                
                if (nKey === toKey) {
                    return this.reconstructPath(visited, fromKey, toKey);
                }
                
                queue.push({ x: nx, y: ny, level: nLevel });
            }
        }
        
        return null;
    }
    
    /**
     * Reconstruct path from BFS visited map.
     * @param {Map} visited - Parent pointers
     * @param {string} fromKey - Start key
     * @param {string} toKey - End key
     * @returns {Array<{x: number, y: number}>} Path positions
     */
    reconstructPath(visited, fromKey, toKey) {
        const path = [];
        let current = toKey;
        
        while (current !== fromKey) {
            const [x, y] = current.split(',').map(Number);
            path.unshift({ x, y });
            current = visited.get(current);
            if (current == null) break;
        }
        
        return path;
    }
    
    /**
     * Convert path positions to direction strings.
     * @param {Array<{x: number, y: number}>} path - Path positions
     * @returns {Array<string>} Direction actions
     */
    pathToDirs(path) {
        const result = [];
        let prev = this.currentPos;
        
        for (const pos of path) {
            const dx = pos.x - prev.x;
            const dy = pos.y - prev.y;
            
            if (dx === 1) result.push("right");
            else if (dx === -1) result.push("left");
            else if (dy === 1) result.push("up");
            else if (dy === -1) result.push("down");
            
            prev = pos;
        }
        
        return result;
    }
    
    /**
     * Generate map key from coordinates.
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {string} Map key string
     */
    getKey(x, y) {
        return `${x},${y}`;
    }
}