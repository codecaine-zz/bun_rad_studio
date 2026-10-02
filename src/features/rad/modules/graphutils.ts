// Generic Directed Graph with Topological Sort and Traversal
export class Graph<T extends string | number> {
  private adjacency = new Map<T, Set<T>>();

  addNode(node: T): void {
    if (!this.adjacency.has(node)) {
      this.adjacency.set(node, new Set());
    }
  }

  addEdge(from: T, to: T): void {
    this.addNode(from);
    this.addNode(to);
    this.adjacency.get(from)!.add(to);
  }

  getNeighbors(node: T): T[] {
    return Array.from(this.adjacency.get(node) || []);
  }

  getNodes(): T[] {
    return Array.from(this.adjacency.keys());
  }

  // Kahn's algorithm for topological sorting with cycle detection
  topologicalSort(): T[] {
    const inDegree = new Map<T, number>();
    for (const node of this.getNodes()) {
      inDegree.set(node, 0);
    }
    for (const [, neighbors] of this.adjacency.entries()) {
      for (const neighbor of neighbors) {
        inDegree.set(neighbor, (inDegree.get(neighbor) || 0) + 1);
      }
    }

    const queue: T[] = [];
    for (const [node, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(node);
    }

    const order: T[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      order.push(u);
      const neighbors = this.adjacency.get(u);
      if (neighbors) {
        for (const v of neighbors) {
          inDegree.set(v, inDegree.get(v)! - 1);
          if (inDegree.get(v) === 0) {
            queue.push(v);
          }
        }
      }
    }

    if (order.length !== this.adjacency.size) {
      throw new Error("[graphutils] Cycle detected in directed graph; topological sort impossible");
    }
    return order;
  }

  hasCycle(): boolean {
    try {
      this.topologicalSort();
      return false;
    } catch {
      return true;
    }
  }

  // Breadth-First Search (BFS)
  bfs(start: T): T[] {
    if (!this.adjacency.has(start)) return [];
    const visited = new Set<T>([start]);
    const queue: T[] = [start];
    const order: T[] = [];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      order.push(cur);
      for (const neighbor of this.getNeighbors(cur)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    return order;
  }

  // Depth-First Search (DFS)
  dfs(start: T): T[] {
    if (!this.adjacency.has(start)) return [];
    const visited = new Set<T>();
    const order: T[] = [];

    const traverse = (node: T) => {
      visited.add(node);
      order.push(node);
      for (const neighbor of this.getNeighbors(node)) {
        if (!visited.has(neighbor)) {
          traverse(neighbor);
        }
      }
    };

    traverse(start);
    return order;
  }

  // Shortest unweighted path from start to end (BFS)
  shortestPath(start: T, end: T): T[] | null {
    if (!this.adjacency.has(start) || !this.adjacency.has(end)) return null;
    if (start === end) return [start];

    const visited = new Set<T>([start]);
    const parent = new Map<T, T>();
    const queue: T[] = [start];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur === end) {
        const path: T[] = [end];
        let p = end;
        while (parent.has(p)) {
          p = parent.get(p)!;
          path.unshift(p);
        }
        return path;
      }
      for (const neighbor of this.getNeighbors(cur)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          parent.set(neighbor, cur);
          queue.push(neighbor);
        }
      }
    }
    return null;
  }
}

export function newGraph<T extends string | number>(): Graph<T> {
  return new Graph<T>();
}

export const graphutils = {
  Graph,
  newGraph,
};
