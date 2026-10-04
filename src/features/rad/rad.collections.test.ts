import { describe, expect, test } from "bun:test";
import {
  arrutils,
  bitutils,
  graphutils,
  mathutils,
  objutils,
  statutils,
  structutils,
} from "./index.ts";

describe("rad collections: arrutils", () => {
  test("access, ranges, and windows", () => {
    expect(arrutils.first([1, 2, 3])).toBe(1);
    expect(arrutils.head([])).toBeUndefined();
    expect(arrutils.last([1, 2, 3])).toBe(3);
    expect(arrutils.initial([1, 2, 3])).toEqual([1, 2]);
    expect(arrutils.range(5)).toEqual([0, 1, 2, 3, 4]);
    expect(arrutils.range(1, 10, 3)).toEqual([1, 4, 7]);
    expect(arrutils.range(3, 0, -1)).toEqual([3, 2, 1]);
    expect(arrutils.windowed([1, 2, 3, 4], 2)).toEqual([[1, 2], [2, 3], [3, 4]]);
    expect(arrutils.pairwise(["a", "b", "c"])).toEqual([["a", "b"], ["b", "c"]]);
    expect(arrutils.flattenDeep([1, [2, [3, [4]]]])).toEqual([1, 2, 3, 4]);
    expect(arrutils.filterMap(["1", "x", "3"], (s) => (Number.isNaN(+s) ? null : +s))).toEqual([1, 3]);
    expect(arrutils.count([1, 2, 3, 4], (n) => n % 2 === 0)).toBe(2);
  });

  test("set algebra", () => {
    expect(arrutils.union([1, 2], [2, 3], [4])).toEqual([1, 2, 3, 4]);
    expect(arrutils.xor([1, 2, 3], [3, 4])).toEqual([1, 2, 4]);
    const a = [{ id: 1 }, { id: 2 }];
    const b = [{ id: 2 }, { id: 3 }];
    expect(arrutils.intersectionBy(a, b, (x) => x.id)).toEqual([{ id: 2 }]);
    expect(arrutils.differenceBy(a, b, (x) => x.id)).toEqual([{ id: 1 }]);
    expect(arrutils.unionBy(a, b, (x) => x.id).map((x) => x.id)).toEqual([1, 2, 3]);
    expect(arrutils.zipWith([1, 2], [10, 20], (x, y) => x + y)).toEqual([11, 22]);
    expect(arrutils.cartesianProduct<number | string>([1, 2], ["a", "b"])).toEqual([[1, "a"], [1, "b"], [2, "a"], [2, "b"]] as (number | string)[][]);
  });

  test("sorting, searching, and immutable edits", () => {
    const people = [
      { name: "b", age: 30 },
      { name: "a", age: 30 },
      { name: "c", age: 20 },
    ];
    expect(arrutils.orderBy(people, [(p) => p.age, (p) => p.name], ["desc", "asc"]).map((p) => p.name)).toEqual(["a", "b", "c"]);
    expect(arrutils.isSorted([1, 2, 2, 5])).toBe(true);
    expect(arrutils.isSorted([2, 1])).toBe(false);
    expect(arrutils.binarySearch([1, 3, 5, 7], 5)).toBe(2);
    expect(arrutils.binarySearch([1, 3, 5, 7], 4)).toBe(-1);
    expect(arrutils.sortedIndex([1, 3, 5], 4)).toBe(2);
    expect(arrutils.insertAt([1, 4], 1, 2, 3)).toEqual([1, 2, 3, 4]);
    expect(arrutils.removeAt([1, 2, 3], 1)).toEqual([1, 3]);
    expect(arrutils.moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(arrutils.rotate([1, 2, 3, 4], 1)).toEqual([2, 3, 4, 1]);
    expect(arrutils.rotate([1, 2, 3, 4], -1)).toEqual([4, 1, 2, 3]);
    expect(arrutils.toggleItem([1, 2], 2)).toEqual([1]);
    expect(arrutils.toggleItem([1], 2)).toEqual([1, 2]);
  });

  test("seeded shuffle/sample are deterministic", () => {
    const a = arrutils.shuffle([1, 2, 3, 4, 5], mathutils.seededRandom(42));
    const b = arrutils.shuffle([1, 2, 3, 4, 5], mathutils.seededRandom(42));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(arrutils.sample([1, 2, 3], 2, mathutils.seededRandom(1))).toHaveLength(2);
  });
});

describe("rad collections: objutils", () => {
  test("paths, safety, and transforms", () => {
    const o: any = {};
    objutils.set(o, 'a["b.c"][0]', 1);
    expect(o).toEqual({ a: { "b.c": [1] } });
    expect(() => objutils.set({}, "__proto__.polluted", true)).toThrow();
    expect(({} as any).polluted).toBeUndefined();
    expect(objutils.isPlainObject(new Date())).toBe(false);
    expect(objutils.isPlainObject(Object.create(null))).toBe(true);
    expect(objutils.isPrimitive("x")).toBe(true);
    expect(objutils.compactObject({ a: 1, b: null, c: undefined })).toEqual({ a: 1 });
    expect(objutils.renameKeys({ a: 1, b: 2 }, { a: "x" })).toEqual({ x: 1, b: 2 });
    expect(objutils.defaults({ a: 1 } as { a: number; b?: number }, { a: 9, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(objutils.typedKeys({ a: 1, b: 2 })).toEqual(["a", "b"]);
    const frozen = objutils.deepFreeze({ nested: { x: 1 } });
    expect(Object.isFrozen(frozen.nested)).toBe(true);
  });

  test("flatten, unflatten, diff", () => {
    const flat = objutils.flattenObject({ a: { b: 1, c: {} }, d: [1, 2] });
    expect(flat).toEqual({ "a.b": 1, "a.c": {}, d: [1, 2] });
    expect(objutils.flattenObject({ d: [1, 2] }, "", true)).toEqual({ "d.0": 1, "d.1": 2 });
    expect(objutils.unflattenObject({ "a.b": 1, "a.c": 2 })).toEqual({ a: { b: 1, c: 2 } });
    const diff = objutils.objectDiff({ a: 1, b: 2, c: { d: 1 } }, { a: 1, b: 3, e: 4, c: { d: 2 } });
    expect(diff.added).toEqual(["e"]);
    expect(diff.changed.sort()).toEqual(["b", "c.d"].sort());
    expect(diff.removed).toEqual([]);
  });
});

describe("rad collections: structutils", () => {
  test("queue, deque, ring buffer, heap", () => {
    const q = structutils.SimpleQueue.from([1, 2, 3]);
    expect(q.dequeue()).toBe(1);
    expect([...q.toArray()]).toEqual([2, 3]);

    const d = new structutils.SimpleDeque<number>();
    d.pushBack(2); d.pushFront(1); d.pushBack(3);
    expect(d.toArray()).toEqual([1, 2, 3]);
    expect(d.popBack()).toBe(3);
    expect(d.popFront()).toBe(1);

    const rb = new structutils.SimpleRingBuffer<number>(2);
    rb.push(1); rb.push(2);
    expect(rb.push(3)).toBe(1);
    expect(rb.toArray()).toEqual([2, 3]);
    expect(rb.peekLast()).toBe(3);

    expect(structutils.SimpleMinHeap.from([5, 1, 4, 2]).drain()).toEqual([1, 2, 4, 5]);
  });

  test("priority queue, trie, disjoint set", () => {
    const pq = new structutils.SimplePriorityQueue<string>();
    pq.enqueue("low", 5); pq.enqueue("high", 1); pq.enqueue("mid", 3);
    expect([pq.dequeue(), pq.dequeue(), pq.dequeue()]).toEqual(["high", "mid", "low"]);

    const trie = new structutils.SimpleTrie(["car", "cart", "cat", "dog"]);
    expect(trie.withPrefix("ca").sort()).toEqual(["car", "cart", "cat"]);
    expect(trie.hasPrefix("do")).toBe(true);
    expect(trie.delete("car")).toBe(true);
    expect(trie.has("car")).toBe(false);
    expect(trie.has("cart")).toBe(true);

    const ds = new structutils.DisjointSet<string>();
    ds.union("a", "b"); ds.union("c", "d"); ds.union("b", "c");
    ds.add("z");
    expect(ds.connected("a", "d")).toBe(true);
    expect(ds.setSize("a")).toBe(4);
    expect(ds.groups()).toHaveLength(2);
  });
});

describe("rad collections: statutils", () => {
  test("means, spread, and robust stats", () => {
    expect(statutils.weightedMean([1, 3], [3, 1])).toBe(1.5);
    expect(statutils.geometricMean([2, 8])).toBeCloseTo(4);
    expect(statutils.harmonicMean([1, 4, 4])).toBeCloseTo(2);
    expect(statutils.minMax([3, 1, 2])).toEqual({ min: 1, max: 3 });
    expect(statutils.percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(statutils.detectOutliers([10, 12, 11, 13, 12, 11, 95])).toEqual([95]);
    expect(statutils.rank([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    expect(statutils.spearmanCorrelation([1, 2, 3], [10, 20, 30])).toBeCloseTo(1);
    expect(statutils.normalize([0, 5, 10])).toEqual([0, 0.5, 1]);
  });

  test("models, histograms, summary", () => {
    const model = statutils.linearRegression([1, 2, 3], [2, 4, 6]);
    expect(statutils.predictLinear(model, 10)).toBeCloseTo(20);
    expect(model.r2).toBeCloseTo(1);
    expect(statutils.exponentialMovingAverage([1, 1, 1], 0.5)).toEqual([1, 1, 1]);
    const bins = statutils.histogram([1, 2, 3, 4], 2);
    expect(bins.map((b) => b.count)).toEqual([2, 2]);
    const s = statutils.summarize([1, 2, 3, 4, 5]);
    expect(s.count).toBe(5);
    expect(s.median).toBe(3);
    expect(s.sum).toBe(15);
    expect(statutils.zScores([1, 2, 3])[1]).toBeCloseTo(0);
  });
});

describe("rad collections: mathutils", () => {
  test("interpolation, rounding, geometry", () => {
    expect(mathutils.inverseLerp(0, 10, 2.5)).toBe(0.25);
    expect(mathutils.wrap(370, 0, 360)).toBe(10);
    expect(mathutils.wrap(-10, 0, 360)).toBe(350);
    expect(mathutils.round(1.005, 2)).toBe(1.01);
    expect(mathutils.approxEqual(0.1 + 0.2, 0.3)).toBe(true);
    expect(mathutils.radToDeg(mathutils.degToRad(90))).toBeCloseTo(90);
    const r = mathutils.rotatePoint({ x: 1, y: 0 }, Math.PI / 2);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(1);
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 5, y: 5, width: 10, height: 10 };
    expect(mathutils.rectIntersection(a, b)).toEqual({ x: 5, y: 5, width: 5, height: 5 });
    expect(mathutils.rectUnion(a, b)).toEqual({ x: 0, y: 0, width: 15, height: 15 });
    expect(mathutils.rectContainsPoint(a, { x: 3, y: 3 })).toBe(true);
  });

  test("number theory and randomness", () => {
    expect(mathutils.nextPowerOfTwo(17)).toBe(32);
    expect(mathutils.isPrime(97)).toBe(true);
    expect(mathutils.primeFactors(60)).toEqual([2, 2, 3, 5]);
    expect(mathutils.factorial(20)).toBe(2432902008176640000n);
    expect(mathutils.binomial(5, 2)).toBe(10);
    expect(mathutils.product([2, 3, 4])).toBe(24);
    expect(mathutils.percentOf(25, 200)).toBe(12.5);
    expect(mathutils.percentChange(100, 150)).toBe(50);
    const n = mathutils.secureRandomInt(1, 6);
    expect(n >= 1 && n <= 6).toBe(true);
    const r1 = mathutils.seededRandom(7), r2 = mathutils.seededRandom(7);
    expect(r1()).toBe(r2());
  });
});

describe("rad collections: bitutils", () => {
  test("BitSet algebra and scanning", () => {
    const a = bitutils.BitSet.fromIndices(8, [0, 2, 4]);
    const b = bitutils.BitSet.fromBinaryString("00001111");
    expect(a.toIndices()).toEqual([0, 2, 4]);
    expect(a.nextSetBit(1)).toBe(2);
    expect(a.and(a.clone()).equals(a)).toBe(true);
    expect(a.or(b).countSet()).toBeGreaterThanOrEqual(a.countSet());
    expect(a.xor(a).none()).toBe(true);
    expect(a.andNot(a).any()).toBe(false);
    const full = new bitutils.BitSet(5);
    full.fill();
    expect(full.all()).toBe(true);
  });

  test("integer bits and named flags", () => {
    expect(bitutils.getBit(0b100, 2)).toBe(true);
    expect(bitutils.setBit(0, 3)).toBe(8);
    expect(bitutils.clearBit(8, 3)).toBe(0);
    expect(bitutils.toggleBit(1, 0)).toBe(0);
    expect(bitutils.countTrailingZeros(8)).toBe(3);
    expect(bitutils.toBinary(5, 4)).toBe("0101");
    const F = bitutils.defineFlags(["read", "write", "exec"] as const);
    const perms = bitutils.combineFlags(F, ["read", "exec"]);
    expect(bitutils.describeFlags(perms, F)).toEqual(["read", "exec"]);
    expect(bitutils.hasAnyFlag(perms, F.write | F.exec)).toBe(true);
  });
});

describe("rad collections: graphutils", () => {
  test("weighted undirected graph + Dijkstra", () => {
    const g = graphutils.newGraph<string>({ directed: false });
    g.addEdge("a", "b", 4).addEdge("b", "c", 1).addEdge("a", "c", 10);
    expect(g.dijkstra("a", "c")).toEqual({ path: ["a", "b", "c"], distance: 5 });
    expect(g.shortestPath("a", "c")).toEqual(["a", "c"]);
    expect(g.edgeCount).toBe(3);
    expect(g.hasEdge("c", "b")).toBe(true);
    expect(g.distancesFrom("a").get("c")).toBe(5);
    expect(() => g.topologicalSort()).toThrow("[graphutils.topologicalSort]");
    expect(g.findCycle()).not.toBeNull();
  });

  test("directed cycles, components, mutation, JSON", () => {
    const g = graphutils.Graph.fromEdges<number>([[1, 2], [2, 3], [3, 1], [4, 5]]);
    expect(g.findCycle()).toEqual([1, 2, 3, 1]);
    expect(g.connectedComponents()).toEqual([[1, 2, 3], [4, 5]]);
    expect(g.stronglyConnectedComponents().map((c) => c.length).sort()).toEqual([1, 1, 3]);
    expect(g.inDegree(1)).toBe(1);
    expect(g.predecessors(1)).toEqual([3]);
    expect(g.reverse().hasEdge(2, 1)).toBe(true);
    g.removeEdge(3, 1);
    expect(g.hasCycle()).toBe(false);
    expect(g.topologicalSort().indexOf(1)).toBeLessThan(g.topologicalSort().indexOf(3));
    const copy = graphutils.Graph.fromJSON(JSON.parse(JSON.stringify(g)));
    expect(copy.getEdges()).toEqual(g.getEdges());
    expect(g.removeNode(2)).toBe(true);
    expect(g.hasEdge(1, 2)).toBe(false);
    expect(g.reachableFrom(4)).toEqual([5]);
  });

  test("undirected tree has no cycle; negative weights rejected", () => {
    const tree = graphutils.Graph.fromEdges<string>([["a", "b"], ["a", "c"]], { directed: false });
    expect(tree.hasCycle()).toBe(false);
    const neg = graphutils.Graph.fromEdges<string>([["a", "b", -1]]);
    expect(() => neg.dijkstra("a", "b")).toThrow("Negative weight");
    expect(() => neg.addEdge("x", "y", NaN)).toThrow("non-finite");
  });
});
