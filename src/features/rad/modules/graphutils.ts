/**
 * graphutils — Generic directed/undirected, optionally weighted graph.
 *
 * Nodes are strings or numbers. Edges carry a numeric weight (default `1`).
 * All traversals are iterative (no recursion-depth limits) except Tarjan SCC
 * and directed cycle-path search, which recurse once per node.
 *
 * @example
 * import { newGraph } from "./graphutils";
 * const g = newGraph<string>();
 * g.addEdge("build", "test");
 * g.addEdge("test", "deploy");
 * g.topologicalSort(); // ["build", "test", "deploy"]
 */

/** Allowed node identifier types. */
export type GraphNode = string | number;

/** Construction options for {@link Graph}. */
export interface GraphOptions {
  /** `true` (default) for directed edges; `false` mirrors every edge. */
  directed?: boolean;
}

/** A single edge record. For undirected graphs each edge is listed once. */
export interface GraphEdge<T extends GraphNode> {
  from: T;
  to: T;
  weight: number;
}

/** Plain serialisable snapshot produced by {@link Graph.toJSON}. */
export interface GraphJSON<T extends GraphNode> {
  directed: boolean;
  nodes: T[];
  edges: GraphEdge<T>[];
}

/** Result of {@link Graph.dijkstra}. */
export interface WeightedPath<T extends GraphNode> {
  path: T[];
  distance: number;
}

type HeapItem<T> = { node: T; dist: number };

function heapPush<T>(heap: HeapItem<T>[], item: HeapItem<T>): void {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p]!.dist <= heap[i]!.dist) break;
    [heap[p], heap[i]] = [heap[i]!, heap[p]!];
    i = p;
  }
}

function heapPop<T>(heap: HeapItem<T>[]): HeapItem<T> | undefined {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length === 0 || last === undefined) return top;
  heap[0] = last;
  let i = 0;
  for (;;) {
    const l = 2 * i + 1, r = l + 1;
    let m = i;
    if (l < heap.length && heap[l]!.dist < heap[m]!.dist) m = l;
    if (r < heap.length && heap[r]!.dist < heap[m]!.dist) m = r;
    if (m === i) break;
    [heap[m], heap[i]] = [heap[i]!, heap[m]!];
    i = m;
  }
  return top;
}

function rebuildPath<T>(parent: Map<T, T>, end: T): T[] {
  const path: T[] = [end];
  let p = end;
  while (parent.has(p)) {
    p = parent.get(p)!;
    path.push(p);
  }
  return path.reverse();
}

/**
 * Adjacency-map graph. Holds mutable state, hence a class.
 *
 * @example
 * const g = new Graph<string>({ directed: false });
 * g.addEdge("a", "b", 4).addEdge("b", "c", 1).addEdge("a", "c", 10);
 * g.dijkstra("a", "c"); // { path: ["a","b","c"], distance: 5 }
 */
export class Graph<T extends GraphNode> {
  private adjacency = new Map<T, Map<T, number>>();
  /** Whether edges are directed. */
  readonly directed: boolean;

  /** @param options - `{ directed }` (default directed). */
  constructor(options: GraphOptions = {}) {
    this.directed = options.directed ?? true;
  }

  /**
   * Build a graph from an edge list (`[from, to]` or `[from, to, weight]`).
   * @example Graph.fromEdges([["a","b"],["b","c",2]]).edgeCount; // 2
   */
  static fromEdges<T extends GraphNode>(
    edges: Iterable<readonly [T, T] | readonly [T, T, number]>,
    options: GraphOptions = {},
  ): Graph<T> {
    const g = new Graph<T>(options);
    for (const [from, to, weight] of edges) g.addEdge(from, to, weight ?? 1);
    return g;
  }

  /**
   * Restore a graph from {@link Graph.toJSON} output.
   * @example Graph.fromJSON(g.toJSON()).getNodes();
   */
  static fromJSON<T extends GraphNode>(json: GraphJSON<T>): Graph<T> {
    const g = new Graph<T>({ directed: json.directed });
    for (const n of json.nodes) g.addNode(n);
    for (const e of json.edges) g.addEdge(e.from, e.to, e.weight);
    return g;
  }

  /** Add a node (no-op if present). Returns `this` for chaining. */
  addNode(node: T): this {
    if (!this.adjacency.has(node)) this.adjacency.set(node, new Map());
    return this;
  }

  /**
   * Add (or re-weight) an edge, creating missing nodes.
   * @throws if `weight` is not a finite number.
   */
  addEdge(from: T, to: T, weight = 1): this {
    if (!Number.isFinite(weight)) {
      throw new Error(`[graphutils.addEdge] Edge ${String(from)}->${String(to)} has non-finite weight ${weight}`);
    }
    this.addNode(from).addNode(to);
    this.adjacency.get(from)!.set(to, weight);
    if (!this.directed) this.adjacency.get(to)!.set(from, weight);
    return this;
  }

  /** Remove a node and every edge touching it. Returns `true` if it existed. */
  removeNode(node: T): boolean {
    if (!this.adjacency.delete(node)) return false;
    for (const edges of this.adjacency.values()) edges.delete(node);
    return true;
  }

  /** Remove an edge (both directions when undirected). Returns `true` if it existed. */
  removeEdge(from: T, to: T): boolean {
    const removed = this.adjacency.get(from)?.delete(to) ?? false;
    if (!this.directed) this.adjacency.get(to)?.delete(from);
    return removed;
  }

  /** `true` if the node exists. */
  hasNode(node: T): boolean {
    return this.adjacency.has(node);
  }

  /** `true` if an edge `from -> to` exists. */
  hasEdge(from: T, to: T): boolean {
    return this.adjacency.get(from)?.has(to) ?? false;
  }

  /** Weight of edge `from -> to`, or `undefined` when absent. */
  getEdgeWeight(from: T, to: T): number | undefined {
    return this.adjacency.get(from)?.get(to);
  }

  /** Outgoing neighbours in insertion order (empty for unknown nodes). */
  getNeighbors(node: T): T[] {
    return Array.from(this.adjacency.get(node)?.keys() ?? []);
  }

  /** Nodes with an edge pointing *to* `node`. */
  predecessors(node: T): T[] {
    const out: T[] = [];
    for (const [from, edges] of this.adjacency) if (edges.has(node)) out.push(from);
    return out;
  }

  /** All nodes in insertion order. */
  getNodes(): T[] {
    return Array.from(this.adjacency.keys());
  }

  /** All edges. Undirected edges appear once (first-seen orientation). */
  getEdges(): GraphEdge<T>[] {
    const out: GraphEdge<T>[] = [];
    const seen = new Set<T>();
    for (const [from, edges] of this.adjacency) {
      for (const [to, weight] of edges) {
        if (!this.directed && seen.has(to)) continue;
        out.push({ from, to, weight });
      }
      seen.add(from);
    }
    return out;
  }

  /** Number of nodes. */
  get nodeCount(): number {
    return this.adjacency.size;
  }

  /** Number of edges (undirected edges counted once). */
  get edgeCount(): number {
    return this.getEdges().length;
  }

  /** Count of outgoing edges (equals degree for undirected graphs). */
  outDegree(node: T): number {
    return this.adjacency.get(node)?.size ?? 0;
  }

  /** Count of incoming edges (equals degree for undirected graphs). */
  inDegree(node: T): number {
    return this.directed ? this.predecessors(node).length : this.outDegree(node);
  }

  private inDegreeMap(): Map<T, number> {
    const deg = new Map<T, number>();
    for (const node of this.adjacency.keys()) deg.set(node, 0);
    for (const edges of this.adjacency.values()) {
      for (const to of edges.keys()) deg.set(to, deg.get(to)! + 1);
    }
    return deg;
  }

  /**
   * Kahn's topological order (ties broken by insertion order).
   * @throws on cycles or when called on an undirected graph.
   * @example newGraph<string>().addEdge("a","b").topologicalSort(); // ["a","b"]
   */
  topologicalSort(): T[] {
    if (!this.directed) throw new Error("[graphutils.topologicalSort] Undirected graphs have no topological order");
    const deg = this.inDegreeMap();
    const queue: T[] = [];
    for (const [node, d] of deg) if (d === 0) queue.push(node);
    for (let head = 0; head < queue.length; head++) {
      for (const v of this.adjacency.get(queue[head]!)!.keys()) {
        const d = deg.get(v)! - 1;
        deg.set(v, d);
        if (d === 0) queue.push(v);
      }
    }
    if (queue.length !== this.adjacency.size) {
      const stuck = this.getNodes().filter((n) => deg.get(n)! > 0).map(String).join(", ");
      throw new Error(`[graphutils.topologicalSort] Cycle detected in directed graph; topological sort impossible (nodes on/after cycle: ${stuck})`);
    }
    return queue;
  }

  /** `true` if the graph contains a cycle (undirected: excludes the trivial a-b-a). */
  hasCycle(): boolean {
    return this.findCycle() !== null;
  }

  /**
   * Return one cycle as a closed node path (`[a, b, c, a]`), or `null`.
   * @example newGraph<number>().addEdge(1,2).addEdge(2,1).findCycle(); // [1,2,1]
   */
  findCycle(): T[] | null {
    return this.directed ? this.findDirectedCycle() : this.findUndirectedCycle();
  }

  private findDirectedCycle(): T[] | null {
    const state = new Map<T, 1 | 2>();
    const stack: T[] = [];
    const visit = (node: T): T[] | null => {
      state.set(node, 1);
      stack.push(node);
      for (const next of this.adjacency.get(node)!.keys()) {
        if (state.get(next) === 1) return [...stack.slice(stack.indexOf(next)), next];
        if (!state.has(next)) {
          const found = visit(next);
          if (found) return found;
        }
      }
      stack.pop();
      state.set(node, 2);
      return null;
    };
    for (const node of this.adjacency.keys()) {
      if (!state.has(node)) {
        const found = visit(node);
        if (found) return found;
      }
    }
    return null;
  }

  private findUndirectedCycle(): T[] | null {
    const parent = new Map<T, T | undefined>();
    for (const root of this.adjacency.keys()) {
      if (parent.has(root)) continue;
      parent.set(root, undefined);
      const stack: T[] = [root];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        for (const next of this.adjacency.get(cur)!.keys()) {
          if (next === parent.get(cur)) continue;
          if (parent.has(next)) return this.closeUndirectedCycle(parent, cur, next);
          parent.set(next, cur);
          stack.push(next);
        }
      }
    }
    return null;
  }

  private closeUndirectedCycle(parent: Map<T, T | undefined>, a: T, b: T): T[] {
    const ancestors = (n: T): T[] => {
      const out: T[] = [n];
      for (let p = parent.get(n); p !== undefined; p = parent.get(p)) out.push(p);
      return out;
    };
    const pathA = ancestors(a), pathB = ancestors(b);
    const setB = new Set(pathB);
    const meet = pathA.find((n) => setB.has(n))!;
    const down = pathA.slice(0, pathA.indexOf(meet)).reverse();
    const up = pathB.slice(0, pathB.indexOf(meet));
    return [meet, ...down, ...up, meet];
  }

  /** Breadth-first visitation order from `start` (empty for unknown nodes). */
  bfs(start: T): T[] {
    if (!this.adjacency.has(start)) return [];
    const visited = new Set<T>([start]);
    const order: T[] = [start];
    for (let head = 0; head < order.length; head++) {
      for (const n of this.adjacency.get(order[head]!)!.keys()) {
        if (!visited.has(n)) {
          visited.add(n);
          order.push(n);
        }
      }
    }
    return order;
  }

  /** Depth-first pre-order from `start` (iterative; same order as recursive DFS). */
  dfs(start: T): T[] {
    if (!this.adjacency.has(start)) return [];
    const visited = new Set<T>();
    const order: T[] = [];
    const stack: T[] = [start];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      order.push(cur);
      const next = this.getNeighbors(cur);
      for (let i = next.length - 1; i >= 0; i--) if (!visited.has(next[i]!)) stack.push(next[i]!);
    }
    return order;
  }

  /** Fewest-hops path (ignores weights), or `null` if unreachable. */
  shortestPath(start: T, end: T): T[] | null {
    if (!this.adjacency.has(start) || !this.adjacency.has(end)) return null;
    if (start === end) return [start];
    const parent = new Map<T, T>();
    const visited = new Set<T>([start]);
    const queue: T[] = [start];
    for (let head = 0; head < queue.length; head++) {
      for (const n of this.adjacency.get(queue[head]!)!.keys()) {
        if (visited.has(n)) continue;
        visited.add(n);
        parent.set(n, queue[head]!);
        if (n === end) return rebuildPath(parent, end);
        queue.push(n);
      }
    }
    return null;
  }

  private runDijkstra(start: T): { dist: Map<T, number>; parent: Map<T, T> } {
    const dist = new Map<T, number>([[start, 0]]);
    const parent = new Map<T, T>();
    const heap: HeapItem<T>[] = [{ node: start, dist: 0 }];
    for (let item = heapPop(heap); item; item = heapPop(heap)) {
      if (item.dist > dist.get(item.node)!) continue;
      for (const [to, w] of this.adjacency.get(item.node)!) {
        if (w < 0) throw new Error(`[graphutils.dijkstra] Negative weight ${w} on edge ${String(item.node)}->${String(to)}`);
        const nd = item.dist + w;
        if (nd < (dist.get(to) ?? Infinity)) {
          dist.set(to, nd);
          parent.set(to, item.node);
          heapPush(heap, { node: to, dist: nd });
        }
      }
    }
    return { dist, parent };
  }

  /**
   * Lowest total-weight path via Dijkstra, or `null` if unreachable.
   * @throws on negative edge weights.
   */
  dijkstra(start: T, end: T): WeightedPath<T> | null {
    if (!this.adjacency.has(start) || !this.adjacency.has(end)) return null;
    const { dist, parent } = this.runDijkstra(start);
    if (!dist.has(end)) return null;
    return { path: rebuildPath(parent, end), distance: dist.get(end)! };
  }

  /** Weighted distance from `start` to every reachable node. */
  distancesFrom(start: T): Map<T, number> {
    if (!this.adjacency.has(start)) return new Map();
    return this.runDijkstra(start).dist;
  }

  /** Nodes reachable from `start` (excluding `start` unless on a cycle). */
  reachableFrom(start: T): T[] {
    return this.bfs(start).slice(1);
  }

  /**
   * Weakly connected components (edge direction ignored), in insertion order.
   * @example Graph.fromEdges([[1,2],[3,4]]).connectedComponents(); // [[1,2],[3,4]]
   */
  connectedComponents(): T[][] {
    const undirected = new Graph<T>({ directed: false });
    for (const n of this.adjacency.keys()) undirected.addNode(n);
    for (const e of this.getEdges()) undirected.addEdge(e.from, e.to, e.weight);
    const seen = new Set<T>();
    const out: T[][] = [];
    for (const n of this.adjacency.keys()) {
      if (seen.has(n)) continue;
      const comp = undirected.bfs(n);
      comp.forEach((c) => seen.add(c));
      out.push(comp);
    }
    return out;
  }

  /** Strongly connected components (Tarjan). Each SCC is one array. */
  stronglyConnectedComponents(): T[][] {
    let index = 0;
    const idx = new Map<T, number>(), low = new Map<T, number>();
    const onStack = new Set<T>(), stack: T[] = [], out: T[][] = [];
    const visit = (v: T): void => {
      idx.set(v, index); low.set(v, index); index++;
      stack.push(v); onStack.add(v);
      for (const w of this.adjacency.get(v)!.keys()) {
        if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
        else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
      }
      if (low.get(v) !== idx.get(v)) return;
      const comp: T[] = [];
      let w: T;
      do { w = stack.pop()!; onStack.delete(w); comp.push(w); } while (w !== v);
      out.push(comp.reverse());
    };
    for (const n of this.adjacency.keys()) if (!idx.has(n)) visit(n);
    return out;
  }

  /** New graph with every edge reversed (copy for undirected graphs). */
  reverse(): Graph<T> {
    const g = new Graph<T>({ directed: this.directed });
    for (const n of this.adjacency.keys()) g.addNode(n);
    for (const e of this.getEdges()) g.addEdge(e.to, e.from, e.weight);
    return g;
  }

  /** Deep copy. */
  clone(): Graph<T> {
    return Graph.fromJSON(this.toJSON());
  }

  /** Remove all nodes and edges. */
  clear(): void {
    this.adjacency.clear();
  }

  /** Plain JSON snapshot (safe for `JSON.stringify`). */
  toJSON(): GraphJSON<T> {
    return { directed: this.directed, nodes: this.getNodes(), edges: this.getEdges() };
  }
}

/**
 * Factory for {@link Graph}.
 * @example const g = newGraph<string>({ directed: false });
 */
export function newGraph<T extends GraphNode>(options: GraphOptions = {}): Graph<T> {
  return new Graph<T>(options);
}

/** Namespace bundle. */
export const graphutils = {
  Graph,
  newGraph,
};
