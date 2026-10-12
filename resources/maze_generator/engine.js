(function (root, factory) {
  if (typeof define === "function" && define.amd) define([], factory);
  else if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MazeEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Seeded PRNG (Mulberry32) & String Hash
  // ---------------------------------------------------------------------------
  function hashSeed(str) {
    if (typeof str === "number") return (str >>> 0) || 1;
    str = String(str || "default-maze-seed");
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h || 1;
  }

  function mulberry32(a) {
    var s = (a >>> 0) || 1;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------
  // Constants & Dictionaries
  // ---------------------------------------------------------------------------
  var DIFFICULTIES = {
    easy: { size: 11, timeLimit: 35, label: "Easy (11 × 11)" },
    medium: { size: 19, timeLimit: 55, label: "Medium (19 × 19)" },
    hard: { size: 29, timeLimit: 90, label: "Hard (29 × 29)" },
    insane: { size: 39, timeLimit: 150, label: "Insane (39 × 39)" },
  };

  var MODES = {
    classic: { name: "Classic", desc: "Pure exploration at your own pace" },
    timeAttack: { name: "Time Attack", desc: "Beat the neural countdown timer" },
    darkness: { name: "Fog of War", desc: "Darkness with a rotating sonar sweep" },
    solver: { name: "AI Solver", desc: "Watch algorithms explore and navigate" },
  };

  var ALGORITHMS = {
    dfs: { name: "DFS Backtracker", desc: "Long winding corridors with deep solution paths" },
    prim: { name: "Randomized Prim's", desc: "Highly branched labyrinth with numerous dead ends" },
    kruskal: { name: "Randomized Kruskal's", desc: "Balanced tree built via disjoint set edge merges" },
    wilson: { name: "Wilson's (Loop-Erased)", desc: "Completely uniform unbiased random spanning tree" },
    braided: { name: "Braided (Loops)", desc: "Corridors with selective loop connections (no dead ends)" },
  };

  var SOLVERS = {
    astar: { name: "A* Search", desc: "Heuristic-driven shortest path via Manhattan distance" },
    dijkstra: { name: "Dijkstra Wavefront", desc: "Exhaustive uniform-cost wavefront expansion" },
    bfs: { name: "Breadth-First Search", desc: "Standard level-order breadth exploration" },
  };

  var THEMES = {
    cyan: { wall: "#00f0ff", glow: "rgba(0, 240, 255, 0.45)", bg: "#04070d", node: "#00f0ff", name: "Cyan Matrix" },
    magenta: { wall: "#ff0077", glow: "rgba(255, 0, 119, 0.45)", bg: "#0b040a", node: "#ff0077", name: "Neon Sunset" },
    green: { wall: "#00ff9d", glow: "rgba(0, 255, 157, 0.45)", bg: "#030a06", node: "#00ff9d", name: "Emerald Grid" },
    amber: { wall: "#ffd43b", glow: "rgba(255, 212, 59, 0.45)", bg: "#0a0802", node: "#ffd43b", name: "Solar Flare" },
  };

  // ---------------------------------------------------------------------------
  // Grid Factory
  // ---------------------------------------------------------------------------
  function createGrid(cols, rows) {
    var grid = new Array(rows);
    for (var r = 0; r < rows; r++) {
      grid[r] = new Array(cols);
      for (var c = 0; c < cols; c++) {
        grid[r][c] = {
          c: c,
          r: r,
          walls: { top: true, right: true, bottom: true, left: true },
          visited: false,
        };
      }
    }
    return grid;
  }

  // ---------------------------------------------------------------------------
  // Maze Carving Algorithms
  // ---------------------------------------------------------------------------

  // 1. Recursive Backtracker (DFS)
  function carveDFS(grid, cols, rows, rng) {
    rng = rng || Math.random;
    var stack = [];
    var current = grid[0][0];
    current.visited = true;
    var visitedCount = 1;
    var total = cols * rows;

    while (visitedCount < total) {
      var neighbors = [];
      var c = current.c, r = current.r;
      if (r > 0 && !grid[r - 1][c].visited) neighbors.push({ cell: grid[r - 1][c], dir: "top", opp: "bottom" });
      if (c < cols - 1 && !grid[r][c + 1].visited) neighbors.push({ cell: grid[r][c + 1], dir: "right", opp: "left" });
      if (r < rows - 1 && !grid[r + 1][c].visited) neighbors.push({ cell: grid[r + 1][c], dir: "bottom", opp: "top" });
      if (c > 0 && !grid[r][c - 1].visited) neighbors.push({ cell: grid[r][c - 1], dir: "left", opp: "right" });

      if (neighbors.length > 0) {
        var pick = neighbors[Math.floor(rng() * neighbors.length)];
        current.walls[pick.dir] = false;
        pick.cell.walls[pick.opp] = false;
        pick.cell.visited = true;
        visitedCount++;
        stack.push(current);
        current = pick.cell;
      } else if (stack.length > 0) {
        current = stack.pop();
      } else {
        break;
      }
    }
  }

  // 2. Randomized Prim's
  function carvePrims(grid, cols, rows, rng) {
    rng = rng || Math.random;
    var wallsList = [];
    var startCell = grid[0][0];
    startCell.visited = true;

    function addWalls(cell) {
      var c = cell.c, r = cell.r;
      if (r > 0 && !grid[r - 1][c].visited) wallsList.push({ c1: cell, c2: grid[r - 1][c], dir: "top", opp: "bottom" });
      if (c < cols - 1 && !grid[r][c + 1].visited) wallsList.push({ c1: cell, c2: grid[r][c + 1], dir: "right", opp: "left" });
      if (r < rows - 1 && !grid[r + 1][c].visited) wallsList.push({ c1: cell, c2: grid[r + 1][c], dir: "bottom", opp: "top" });
      if (c > 0 && !grid[r][c - 1].visited) wallsList.push({ c1: cell, c2: grid[r][c - 1], dir: "left", opp: "right" });
    }

    addWalls(startCell);

    while (wallsList.length > 0) {
      var randIndex = Math.floor(rng() * wallsList.length);
      var w = wallsList.splice(randIndex, 1)[0];
      if (!w.c2.visited) {
        w.c1.walls[w.dir] = false;
        w.c2.walls[w.opp] = false;
        w.c2.visited = true;
        addWalls(w.c2);
      }
    }
  }

  // 3. Randomized Kruskal's (Disjoint Sets / Union-Find)
  function carveKruskals(grid, cols, rows, rng) {
    rng = rng || Math.random;
    var n = cols * rows;
    var parent = new Int32Array(n);
    var rank = new Uint8Array(n);
    for (var i = 0; i < n; i++) parent[i] = i;

    function find(x) {
      var root = x;
      while (root !== parent[root]) root = parent[root];
      var curr = x;
      while (curr !== root) {
        var nxt = parent[curr];
        parent[curr] = root;
        curr = nxt;
      }
      return root;
    }

    function union(x, y) {
      var rx = find(x), ry = find(y);
      if (rx === ry) return false;
      if (rank[rx] < rank[ry]) parent[rx] = ry;
      else if (rank[rx] > rank[ry]) parent[ry] = rx;
      else {
        parent[ry] = rx;
        rank[rx]++;
      }
      return true;
    }

    // List all interior edges
    var edges = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var idx = r * cols + c;
        if (c < cols - 1) {
          edges.push({ r1: r, c1: c, r2: r, c2: c + 1, dir: "right", opp: "left", idx1: idx, idx2: idx + 1 });
        }
        if (r < rows - 1) {
          edges.push({ r1: r, c1: c, r2: r + 1, c2: c, dir: "bottom", opp: "top", idx1: idx, idx2: idx + cols });
        }
      }
    }

    // Shuffle edges
    for (var e = edges.length - 1; e > 0; e--) {
      var j = Math.floor(rng() * (e + 1));
      var tmp = edges[e];
      edges[e] = edges[j];
      edges[j] = tmp;
    }

    // Kruskal's MST
    for (var k = 0; k < edges.length; k++) {
      var edge = edges[k];
      if (union(edge.idx1, edge.idx2)) {
        grid[edge.r1][edge.c1].walls[edge.dir] = false;
        grid[edge.r2][edge.c2].walls[edge.opp] = false;
      }
    }
  }

  // 4. Wilson's Algorithm (Loop-Erased Random Walk)
  function carveWilsons(grid, cols, rows, rng) {
    rng = rng || Math.random;
    var n = cols * rows;
    var inTree = new Uint8Array(n);

    // Pick first cell into tree
    var rootIdx = Math.floor(rng() * n);
    inTree[rootIdx] = 1;
    var unvisitedCount = n - 1;

    // Direction indices: 0: top, 1: right, 2: bottom, 3: left
    var dirs = [
      { dr: -1, dc: 0, dir: "top", opp: "bottom" },
      { dr: 0, dc: 1, dir: "right", opp: "left" },
      { dr: 1, dc: 0, dir: "bottom", opp: "top" },
      { dr: 0, dc: -1, dir: "left", opp: "right" },
    ];

    var walkDir = new Int8Array(n);
    walkDir.fill(-1);

    while (unvisitedCount > 0) {
      // Pick random unvisited cell
      var startIdx = -1;
      var targetPick = Math.floor(rng() * unvisitedCount);
      var count = 0;
      for (var i = 0; i < n; i++) {
        if (!inTree[i]) {
          if (count === targetPick) {
            startIdx = i;
            break;
          }
          count++;
        }
      }
      if (startIdx === -1) {
        for (var j = 0; j < n; j++) {
          if (!inTree[j]) { startIdx = j; break; }
        }
      }

      // Loop-erased random walk until hitting tree
      var curr = startIdx;
      while (!inTree[curr]) {
        var cr = Math.floor(curr / cols);
        var cc = curr % cols;
        var validDirs = [];
        for (var d = 0; d < 4; d++) {
          var nr = cr + dirs[d].dr;
          var nc = cc + dirs[d].dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            validDirs.push(d);
          }
        }
        var chosenDir = validDirs[Math.floor(rng() * validDirs.length)];
        walkDir[curr] = chosenDir;
        var nextR = cr + dirs[chosenDir].dr;
        var nextC = cc + dirs[chosenDir].dc;
        curr = nextR * cols + nextC;
      }

      // Carve the walk into the tree
      curr = startIdx;
      while (!inTree[curr]) {
        var stepDir = walkDir[curr];
        var stepR = Math.floor(curr / cols);
        var stepC = curr % cols;
        var targetR = stepR + dirs[stepDir].dr;
        var targetC = stepC + dirs[stepDir].dc;

        grid[stepR][stepC].walls[dirs[stepDir].dir] = false;
        grid[targetR][targetC].walls[dirs[stepDir].opp] = false;

        inTree[curr] = 1;
        unvisitedCount--;
        curr = targetR * cols + targetC;
      }
    }
  }

  // 5. Braiding (Removes dead ends by carving walls)
  function braidMaze(grid, cols, rows, factor, rng) {
    factor = typeof factor === "number" ? factor : 0.4;
    rng = rng || Math.random;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var cell = grid[r][c];
        var wallCount = 0;
        if (cell.walls.top) wallCount++;
        if (cell.walls.right) wallCount++;
        if (cell.walls.bottom) wallCount++;
        if (cell.walls.left) wallCount++;

        if (wallCount >= 3 && rng() < factor) {
          var candidates = [];
          if (cell.walls.top && r > 0) candidates.push({ dir: "top", opp: "bottom", target: grid[r - 1][c] });
          if (cell.walls.right && c < cols - 1) candidates.push({ dir: "right", opp: "left", target: grid[r][c + 1] });
          if (cell.walls.bottom && r < rows - 1) candidates.push({ dir: "bottom", opp: "top", target: grid[r + 1][c] });
          if (cell.walls.left && c > 0) candidates.push({ dir: "left", opp: "right", target: grid[r][c - 1] });

          if (candidates.length > 0) {
            var pick = candidates[Math.floor(rng() * candidates.length)];
            cell.walls[pick.dir] = false;
            pick.target.walls[pick.opp] = false;
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Dead Ends & Energy Shards
  // ---------------------------------------------------------------------------
  function findDeadEnds(grid, cols, rows) {
    var deadEnds = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var cell = grid[r][c];
        var wallCount = 0;
        if (cell.walls.top) wallCount++;
        if (cell.walls.right) wallCount++;
        if (cell.walls.bottom) wallCount++;
        if (cell.walls.left) wallCount++;
        if (wallCount >= 3) {
          deadEnds.push({ x: c, y: r });
        }
      }
    }
    return deadEnds;
  }

  function populateShards(grid, cols, rows, exit, rng, shardRatio) {
    rng = rng || Math.random;
    shardRatio = typeof shardRatio === "number" ? shardRatio : 0.65;
    exit = exit || { x: cols - 1, y: rows - 1 };

    var deadEnds = findDeadEnds(grid, cols, rows);
    var shards = [];
    var shardId = 0;

    for (var i = 0; i < deadEnds.length; i++) {
      var de = deadEnds[i];
      if ((de.x === 0 && de.y === 0) || (de.x === exit.x && de.y === exit.y)) continue;
      if (rng() < shardRatio) {
        shards.push({ id: shardId++, x: de.x, y: de.y, collected: false });
      }
    }

    // Ensure at least 1 shard if grid size >= 11 and dead-ends exist
    if (shards.length === 0 && deadEnds.length > 0) {
      for (var j = 0; j < deadEnds.length; j++) {
        var pt = deadEnds[j];
        if ((pt.x === 0 && pt.y === 0) || (pt.x === exit.x && pt.y === exit.y)) continue;
        shards.push({ id: 0, x: pt.x, y: pt.y, collected: false });
        break;
      }
    }

    return shards;
  }

  // ---------------------------------------------------------------------------
  // Solvers: A*, Dijkstra, BFS
  // ---------------------------------------------------------------------------
  function getMoves(grid, cols, rows, x, y) {
    var cell = grid[y][x];
    var moves = [];
    if (!cell.walls.top && y > 0) moves.push({ x: x, y: y - 1 });
    if (!cell.walls.right && x < cols - 1) moves.push({ x: x + 1, y: y });
    if (!cell.walls.bottom && y < rows - 1) moves.push({ x: x, y: y + 1 });
    if (!cell.walls.left && x > 0) moves.push({ x: x - 1, y: y });
    return moves;
  }

  function reconstructPath(cameFrom, currentKey) {
    var totalPath = [];
    var curr = currentKey;
    while (curr) {
      var parts = curr.split(",");
      totalPath.unshift({ x: Number(parts[0]), y: Number(parts[1]) });
      curr = cameFrom[curr];
    }
    return totalPath;
  }

  function solveMaze(grid, cols, rows, start, end, solverType) {
    start = start || { x: 0, y: 0 };
    end = end || { x: cols - 1, y: rows - 1 };
    solverType = solverType || "astar";

    var startKey = start.x + "," + start.y;
    var endKey = end.x + "," + end.y;

    var visitedOrder = [];
    var cameFrom = {};
    var visited = new Set();

    if (startKey === endKey) {
      return { path: [start], visitedOrder: [start], nodesExplored: 1, cost: 0 };
    }

    // A* Search
    if (solverType === "astar") {
      var gScore = {};
      var fScore = {};
      gScore[startKey] = 0;
      var h0 = Math.abs(start.x - end.x) + Math.abs(start.y - end.y);
      fScore[startKey] = h0;

      // Min-priority open set
      var openSet = [{ x: start.x, y: start.y, key: startKey, f: h0 }];

      while (openSet.length > 0) {
        // Find node with lowest f
        var lowestIdx = 0;
        for (var i = 1; i < openSet.length; i++) {
          if (openSet[i].f < openSet[lowestIdx].f) lowestIdx = i;
        }
        var current = openSet.splice(lowestIdx, 1)[0];
        visitedOrder.push({ x: current.x, y: current.y });
        visited.add(current.key);

        if (current.key === endKey) {
          var pA = reconstructPath(cameFrom, endKey);
          return { path: pA, visitedOrder: visitedOrder, nodesExplored: visitedOrder.length, cost: pA.length - 1 };
        }

        var neighborsA = getMoves(grid, cols, rows, current.x, current.y);
        for (var na = 0; na < neighborsA.length; na++) {
          var nextA = neighborsA[na];
          var nextKeyA = nextA.x + "," + nextA.y;
          if (visited.has(nextKeyA)) continue;

          var tentativeG = (gScore[current.key] || 0) + 1;
          if (gScore[nextKeyA] === undefined || tentativeG < gScore[nextKeyA]) {
            cameFrom[nextKeyA] = current.key;
            gScore[nextKeyA] = tentativeG;
            var h = Math.abs(nextA.x - end.x) + Math.abs(nextA.y - end.y);
            var f = tentativeG + h;
            fScore[nextKeyA] = f;

            var inOpen = false;
            for (var oi = 0; oi < openSet.length; oi++) {
              if (openSet[oi].key === nextKeyA) {
                openSet[oi].f = f;
                inOpen = true;
                break;
              }
            }
            if (!inOpen) {
              openSet.push({ x: nextA.x, y: nextA.y, key: nextKeyA, f: f });
            }
          }
        }
      }
      return { path: null, visitedOrder: visitedOrder, nodesExplored: visitedOrder.length, cost: 0 };
    }

    // Dijkstra / Wavefront
    if (solverType === "dijkstra") {
      var dist = {};
      dist[startKey] = 0;
      var queueD = [{ x: start.x, y: start.y, key: startKey, d: 0 }];

      while (queueD.length > 0) {
        var minIdx = 0;
        for (var di = 1; di < queueD.length; di++) {
          if (queueD[di].d < queueD[minIdx].d) minIdx = di;
        }
        var currD = queueD.splice(minIdx, 1)[0];
        if (visited.has(currD.key)) continue;
        visited.add(currD.key);
        visitedOrder.push({ x: currD.x, y: currD.y });

        if (currD.key === endKey) {
          var pD = reconstructPath(cameFrom, endKey);
          return { path: pD, visitedOrder: visitedOrder, nodesExplored: visitedOrder.length, cost: pD.length - 1 };
        }

        var neighborsD = getMoves(grid, cols, rows, currD.x, currD.y);
        for (var nd = 0; nd < neighborsD.length; nd++) {
          var nextD = neighborsD[nd];
          var nextKeyD = nextD.x + "," + nextD.y;
          var newD = currD.d + 1;
          if (dist[nextKeyD] === undefined || newD < dist[nextKeyD]) {
            dist[nextKeyD] = newD;
            cameFrom[nextKeyD] = currD.key;
            queueD.push({ x: nextD.x, y: nextD.y, key: nextKeyD, d: newD });
          }
        }
      }
      return { path: null, visitedOrder: visitedOrder, nodesExplored: visitedOrder.length, cost: 0 };
    }

    // Standard BFS
    var queueB = [{ x: start.x, y: start.y, key: startKey }];
    visited.add(startKey);

    while (queueB.length > 0) {
      var currB = queueB.shift();
      visitedOrder.push({ x: currB.x, y: currB.y });

      if (currB.key === endKey) {
        var pB = reconstructPath(cameFrom, endKey);
        return { path: pB, visitedOrder: visitedOrder, nodesExplored: visitedOrder.length, cost: pB.length - 1 };
      }

      var neighborsB = getMoves(grid, cols, rows, currB.x, currB.y);
      for (var nb = 0; nb < neighborsB.length; nb++) {
        var nextB = neighborsB[nb];
        var nextKeyB = nextB.x + "," + nextB.y;
        if (!visited.has(nextKeyB)) {
          visited.add(nextKeyB);
          cameFrom[nextKeyB] = currB.key;
          queueB.push({ x: nextB.x, y: nextB.y, key: nextKeyB });
        }
      }
    }
    return { path: null, visitedOrder: visitedOrder, nodesExplored: visitedOrder.length, cost: 0 };
  }

  // ---------------------------------------------------------------------------
  // Master Generator
  // ---------------------------------------------------------------------------
  function generatePuzzle(options) {
    options = options || {};
    var diff = options.diff || "medium";
    var diffInfo = DIFFICULTIES[diff] || DIFFICULTIES.medium;
    var cols = options.cols || diffInfo.size;
    var rows = options.rows || diffInfo.size;
    var algo = options.algo || "dfs";
    var braidFactor = typeof options.braidFactor === "number" ? options.braidFactor : 0.4;
    var seedStr = options.seed ? String(options.seed) : Math.random().toString(36).slice(2, 10);
    var rng = mulberry32(hashSeed(seedStr));

    var grid = createGrid(cols, rows);

    if (algo === "prim") {
      carvePrims(grid, cols, rows, rng);
    } else if (algo === "kruskal") {
      carveKruskals(grid, cols, rows, rng);
    } else if (algo === "wilson") {
      carveWilsons(grid, cols, rows, rng);
    } else if (algo === "braided") {
      carveDFS(grid, cols, rows, rng);
      braidMaze(grid, cols, rows, braidFactor, rng);
    } else {
      // Default: DFS Backtracker
      carveDFS(grid, cols, rows, rng);
    }

    var exit = { x: cols - 1, y: rows - 1 };
    var shards = populateShards(grid, cols, rows, exit, rng, 0.65);
    var solution = solveMaze(grid, cols, rows, { x: 0, y: 0 }, exit, "astar");

    return {
      grid: grid,
      cols: cols,
      rows: rows,
      diff: diff,
      algo: algo,
      seed: seedStr,
      exit: exit,
      shards: shards,
      solutionPath: solution.path,
      optimalSteps: solution.path ? solution.path.length - 1 : 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Scoring, Stars & Time Format
  // ---------------------------------------------------------------------------
  function formatTime(ms) {
    if (typeof ms !== "number" || isNaN(ms) || ms < 0) ms = 0;
    var totalSec = Math.floor(ms / 1000);
    var m = Math.floor(totalSec / 60).toString().padStart(2, "0");
    var s = (totalSec % 60).toString().padStart(2, "0");
    return m + ":" + s;
  }

  function calculateStars(steps, cols, rows, optimalSteps) {
    optimalSteps = optimalSteps || ((cols + rows) * 1.2);
    var parSteps = Math.max(optimalSteps * 1.35, (cols + rows) * 1.35);
    if (steps <= parSteps * 1.3) return "★★★";
    if (steps <= parSteps * 1.7) return "★★☆";
    return "★☆☆";
  }

  function dateKey(date) {
    date = date || new Date();
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function dailyConfig(date) {
    var key = dateKey(date);
    var h = hashSeed("CYBER-MAZE-" + key);
    var rng = mulberry32(h);
    var diffKeys = ["easy", "medium", "hard"];
    var algoKeys = ["dfs", "prim", "kruskal", "wilson"];
    var pickDiff = diffKeys[Math.floor(rng() * diffKeys.length)];
    var pickAlgo = algoKeys[Math.floor(rng() * algoKeys.length)];

    return {
      seed: "DAILY-" + key,
      dateKey: key,
      diff: pickDiff,
      algo: pickAlgo,
      mode: "classic",
    };
  }

  // ---------------------------------------------------------------------------
  // Preferences & Statistics Persistence Helpers
  // ---------------------------------------------------------------------------
  function emptyStats() {
    return {
      played: 0,
      won: 0,
      surrendered: 0,
      totalSteps: 0,
      shardsCollected: 0,
      best: {}, // key: `${mode}|${diff}` => { timeMs, steps }
    };
  }

  function sanitizeSettings(s) {
    s = s && typeof s === "object" && !Array.isArray(s) ? s : {};
    return {
      mode: ["classic", "timeAttack", "darkness", "solver"].includes(s.mode) ? s.mode : "classic",
      diff: ["easy", "medium", "hard", "insane"].includes(s.diff) ? s.diff : "medium",
      algo: ["dfs", "prim", "kruskal", "wilson", "braided"].includes(s.algo) ? s.algo : "dfs",
      solver: ["astar", "dijkstra", "bfs"].includes(s.solver) ? s.solver : "astar",
      theme: ["cyan", "magenta", "green", "amber"].includes(s.theme) ? s.theme : "cyan",
      sound: typeof s.sound === "boolean" ? s.sound : true,
      drone: typeof s.drone === "boolean" ? s.drone : false,
      trail: typeof s.trail === "boolean" ? s.trail : true,
      dpad: typeof s.dpad === "boolean" ? s.dpad : true,
    };
  }

  function sanitizeStats(s) {
    if (!s || typeof s !== "object" || Array.isArray(s)) return emptyStats();
    var out = {
      played: typeof s.played === "number" && s.played >= 0 ? Math.floor(s.played) : 0,
      won: typeof s.won === "number" && s.won >= 0 ? Math.floor(s.won) : 0,
      surrendered: typeof s.surrendered === "number" && s.surrendered >= 0 ? Math.floor(s.surrendered) : 0,
      totalSteps: typeof s.totalSteps === "number" && s.totalSteps >= 0 ? Math.floor(s.totalSteps) : 0,
      shardsCollected: typeof s.shardsCollected === "number" && s.shardsCollected >= 0 ? Math.floor(s.shardsCollected) : 0,
      best: {},
    };
    if (s.best && typeof s.best === "object" && !Array.isArray(s.best)) {
      for (var k in s.best) {
        if (Object.prototype.hasOwnProperty.call(s.best, k)) {
          var b = s.best[k];
          if (b && typeof b === "object") {
            out.best[k] = {
              timeMs: typeof b.timeMs === "number" && b.timeMs > 0 ? b.timeMs : null,
              steps: typeof b.steps === "number" && b.steps > 0 ? b.steps : null,
            };
          }
        }
      }
    }
    return out;
  }

  function recordGame(stats, result) {
    stats = sanitizeStats(stats);
    result = result || {};
    stats.played++;
    if (result.won) stats.won++;
    if (result.surrendered) stats.surrendered++;
    if (typeof result.steps === "number") stats.totalSteps += result.steps;
    if (typeof result.shards === "number") stats.shardsCollected += result.shards;

    var mode = result.mode || "classic";
    var diff = result.diff || "medium";
    var key = mode + "|" + diff;

    var isNewBestTime = false;
    var isNewBestSteps = false;

    if (result.won && typeof result.timeMs === "number" && result.timeMs > 0) {
      var prev = stats.best[key];
      if (!prev || !prev.timeMs || result.timeMs < prev.timeMs) {
        stats.best[key] = stats.best[key] || {};
        stats.best[key].timeMs = result.timeMs;
        isNewBestTime = true;
      }
      if (typeof result.steps === "number" && (!prev || !prev.steps || result.steps < prev.steps)) {
        stats.best[key] = stats.best[key] || {};
        stats.best[key].steps = result.steps;
        isNewBestSteps = true;
      }
    }

    return {
      stats: stats,
      isNewBestTime: isNewBestTime,
      isNewBestSteps: isNewBestSteps,
    };
  }

  return {
    hashSeed: hashSeed,
    mulberry32: mulberry32,
    DIFFICULTIES: DIFFICULTIES,
    MODES: MODES,
    ALGORITHMS: ALGORITHMS,
    SOLVERS: SOLVERS,
    THEMES: THEMES,
    createGrid: createGrid,
    carveDFS: carveDFS,
    carvePrims: carvePrims,
    carveKruskals: carveKruskals,
    carveWilsons: carveWilsons,
    braidMaze: braidMaze,
    findDeadEnds: findDeadEnds,
    populateShards: populateShards,
    solveMaze: solveMaze,
    generatePuzzle: generatePuzzle,
    formatTime: formatTime,
    calculateStars: calculateStars,
    dateKey: dateKey,
    dailyConfig: dailyConfig,
    emptyStats: emptyStats,
    sanitizeSettings: sanitizeSettings,
    sanitizeStats: sanitizeStats,
    recordGame: recordGame,
  };
});
