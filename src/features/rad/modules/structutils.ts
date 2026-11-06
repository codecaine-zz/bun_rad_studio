/**
 * Classic mutable data structures with predictable time complexity: `SimpleStack`, `SimpleQueue`,
 * `SimpleDeque`, `SimpleRingBuffer`, `SimpleMinHeap`, `SimplePriorityQueue`, `SimpleTrie`, and `DisjointSet`.
 */
// Feature: RAD - structutils
// Classic mutable data structures with predictable complexity, all iterable:
// Stack (LIFO), Queue (FIFO, amortised O(1) dequeue), Deque, RingBuffer, MinHeap,
// PriorityQueue, Trie (prefix search / autocomplete) and DisjointSet (union-find).

/**
 * LIFO stack. push/pop/peek are O(1).
 * @example
 * ```ts
 * const s = new SimpleStack<number>();
 * s.push(1); s.push(2);
 * s.pop(); // 2
 * ```
 */
export class SimpleStack<T> {
  private items: T[] = [];

  /** Build a stack from items (last item ends up on top). */
  static from<T>(items: Iterable<T>): SimpleStack<T> {
    const s = new SimpleStack<T>();
    for (const i of items) s.push(i);
    return s;
  }

  /** Pushes an item onto the top of the stack. */
  push(item: T): void {
    this.items.push(item);
  }

  /** Removes and returns the top item, or `undefined` if empty. */
  pop(): T | undefined {
    return this.items.pop();
  }

  /** Returns the top item without removing it, or `undefined` if empty. */
  peek(): T | undefined {
    return this.items[this.items.length - 1];
  }

  /** Returns `true` when the stack contains no items. */
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /** Returns the number of items currently on the stack. */
  size(): number {
    return this.items.length;
  }

  /** Removes all items from the stack. */
  clear(): void {
    this.items = [];
  }

  /** Bottom → top. */
  toArray(): T[] {
    return [...this.items];
  }

  /** Iterates top → bottom (pop order) without removing. */
  *[Symbol.iterator](): IterableIterator<T> {
    for (let i = this.items.length - 1; i >= 0; i--) yield this.items[i]!;
  }
}

/**
 * FIFO queue with amortised O(1) `dequeue` (head pointer + periodic compaction, unlike `Array.shift`).
 * @example
 * ```ts
 * const q = new SimpleQueue<string>();
 * q.enqueue("a"); q.enqueue("b");
 * q.dequeue(); // "a"
 * ```
 */
export class SimpleQueue<T> {
  private items: T[] = [];
  private head = 0;

  /** Builds a `SimpleQueue` containing the elements of `items` in iteration order. */
  static from<T>(items: Iterable<T>): SimpleQueue<T> {
    const q = new SimpleQueue<T>();
    for (const i of items) q.enqueue(i);
    return q;
  }

  /** Appends an item to the back of the queue. */
  enqueue(item: T): void {
    this.items.push(item);
  }

  /** Removes and returns the front item of the queue, or `undefined` if empty. */
  dequeue(): T | undefined {
    if (this.head >= this.items.length) return undefined;
    const item = this.items[this.head];
    this.items[this.head++] = undefined as T;
    if (this.head > 1024 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return item;
  }

  /** Returns the front item without removing it, or `undefined` if empty. */
  peek(): T | undefined {
    return this.items[this.head];
  }

  /** Returns `true` when the queue contains no items. */
  isEmpty(): boolean {
    return this.size() === 0;
  }

  /** Returns the number of items currently in the queue. */
  size(): number {
    return this.items.length - this.head;
  }

  /** Removes all items from the queue. */
  clear(): void {
    this.items = [];
    this.head = 0;
  }

  /** Front → back. */
  toArray(): T[] {
    return this.items.slice(this.head);
  }

  /** Iterates items from front to back without removing them. */
  *[Symbol.iterator](): IterableIterator<T> {
    for (let i = this.head; i < this.items.length; i++) yield this.items[i]!;
  }
}

/**
 * Double-ended queue on a growable circular buffer: O(1) push/pop at both ends.
 * @example
 * ```ts
 * const d = new SimpleDeque<number>();
 * d.pushBack(2); d.pushFront(1); d.pushBack(3);
 * d.popFront(); // 1
 * d.popBack();  // 3
 * ```
 */
export class SimpleDeque<T> {
  private buf: (T | undefined)[] = new Array(16);
  private head = 0;
  private count = 0;

  /** Appends an item to the back of the deque in amortised O(1) time. */
  pushBack(item: T): void {
    this.grow();
    this.buf[(this.head + this.count) % this.buf.length] = item;
    this.count++;
  }

  /** Prepends an item to the front of the deque in amortised O(1) time. */
  pushFront(item: T): void {
    this.grow();
    this.head = (this.head - 1 + this.buf.length) % this.buf.length;
    this.buf[this.head] = item;
    this.count++;
  }

  /** Removes and returns the front item, or `undefined` if empty. */
  popFront(): T | undefined {
    if (this.count === 0) return undefined;
    const item = this.buf[this.head];
    this.buf[this.head] = undefined;
    this.head = (this.head + 1) % this.buf.length;
    this.count--;
    return item;
  }

  /** Removes and returns the back item, or `undefined` if empty. */
  popBack(): T | undefined {
    if (this.count === 0) return undefined;
    const idx = (this.head + this.count - 1) % this.buf.length;
    const item = this.buf[idx];
    this.buf[idx] = undefined;
    this.count--;
    return item;
  }

  /** Returns the front item without removing it, or `undefined` if empty. */
  peekFront(): T | undefined {
    return this.count ? this.buf[this.head] : undefined;
  }

  /** Returns the back item without removing it, or `undefined` if empty. */
  peekBack(): T | undefined {
    return this.count
      ? this.buf[(this.head + this.count - 1) % this.buf.length]
      : undefined;
  }

  /** Item at logical index (0 = front, negative from back). */
  at(index: number): T | undefined {
    const k = index < 0 ? this.count + index : index;
    return k >= 0 && k < this.count
      ? this.buf[(this.head + k) % this.buf.length]
      : undefined;
  }

  /** Returns the number of elements in the deque. */
  size(): number {
    return this.count;
  }

  /** Returns `true` when the deque is empty. */
  isEmpty(): boolean {
    return this.count === 0;
  }

  /** Removes all elements and resets the internal circular buffer. */
  clear(): void {
    this.buf = new Array(16);
    this.head = 0;
    this.count = 0;
  }

  /** Copies the deque contents into an array ordered from front to back. */
  toArray(): T[] {
    return Array.from(
      { length: this.count },
      (_, i) => this.buf[(this.head + i) % this.buf.length] as T,
    );
  }

  /** Iterates elements from front to back. */
  *[Symbol.iterator](): IterableIterator<T> {
    yield* this.toArray();
  }

  private grow(): void {
    if (this.count < this.buf.length) return;
    this.buf = [...this.toArray(), ...new Array(this.buf.length)];
    this.head = 0;
  }
}

/**
 * Fixed-capacity circular buffer; pushing when full overwrites the oldest item.
 * Perfect for "last N log lines" or rolling metrics.
 * @example
 * ```ts
 * const rb = new SimpleRingBuffer<number>(3);
 * [1, 2, 3, 4].forEach((n) => rb.push(n));
 * rb.toArray(); // [2, 3, 4]
 * ```
 */
export class SimpleRingBuffer<T> {
  private buffer: (T | undefined)[];
  private head = 0;
  private tail = 0;
  private count = 0;
  readonly capacity: number;

  /**
   * Creates a fixed-capacity ring buffer.
   * @param capacity - Maximum number of elements held before overwriting oldest items (must be > 0).
   */
  constructor(capacity: number) {
    if (!(capacity > 0))
      throw new Error(
        `[structutils] RingBuffer capacity must be > 0 (got ${capacity})`,
      );
    this.capacity = Math.floor(capacity);
    this.buffer = new Array(this.capacity);
  }

  /** Append; returns the overwritten (evicted) item when full, else `undefined`. */
  push(item: T): T | undefined {
    const evicted = this.isFull() ? this.buffer[this.head] : undefined;
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
    else this.head = (this.head + 1) % this.capacity;
    return evicted;
  }

  /** Remove and return the oldest item. */
  pop(): T | undefined {
    if (this.count === 0) return undefined;
    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined;
    this.head = (this.head + 1) % this.capacity;
    this.count--;
    return item;
  }

  /** Oldest item without removing. */
  peek(): T | undefined {
    return this.count ? this.buffer[this.head] : undefined;
  }

  /** Newest item. */
  peekLast(): T | undefined {
    return this.count
      ? this.buffer[(this.tail - 1 + this.capacity) % this.capacity]
      : undefined;
  }

  /** Item by logical index (0 = oldest, negative from newest). */
  at(index: number): T | undefined {
    const k = index < 0 ? this.count + index : index;
    return k >= 0 && k < this.count
      ? this.buffer[(this.head + k) % this.capacity]
      : undefined;
  }

  /** Returns `true` when the buffer has reached `capacity`. */
  isFull(): boolean {
    return this.count === this.capacity;
  }

  /** Returns `true` when the buffer contains no elements. */
  isEmpty(): boolean {
    return this.count === 0;
  }

  /** Returns the number of elements currently stored in the buffer. */
  size(): number {
    return this.count;
  }

  /** Removes all elements from the buffer. */
  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = this.tail = this.count = 0;
  }

  /** Oldest → newest. */
  toArray(): T[] {
    return Array.from(
      { length: this.count },
      (_, i) => this.buffer[(this.head + i) % this.capacity] as T,
    );
  }

  /** Iterates elements from oldest to newest. */
  *[Symbol.iterator](): IterableIterator<T> {
    yield* this.toArray();
  }
}

/**
 * Binary min-heap (smallest first by `compareFn`). push/pop O(log n), peek O(1).
 * For a max-heap pass `(a, b) => b - a`.
 * @example
 * ```ts
 * const h = new SimpleMinHeap<number>();
 * [5, 1, 3].forEach((n) => h.push(n));
 * h.pop(); // 1
 * const tasks = new SimpleMinHeap<{ due: number }>((a, b) => a.due - b.due);
 * ```
 */
export class SimpleMinHeap<T> {
  private heap: T[] = [];
  private compare: (a: T, b: T) => number;

  /**
   * Creates a binary min-heap ordered by `compareFn`.
   * @param compareFn - Comparator returning negative when `a < b` (defaults to `<` / `>` ordering).
   */
  constructor(
    compareFn: (a: T, b: T) => number = (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  ) {
    this.compare = compareFn;
  }

  /** Build in O(n) from existing items (heapify). */
  static from<T>(
    items: Iterable<T>,
    compareFn?: (a: T, b: T) => number,
  ): SimpleMinHeap<T> {
    const h = new SimpleMinHeap<T>(compareFn);
    h.heap = [...items];
    for (let i = (h.heap.length >> 1) - 1; i >= 0; i--) h.sinkDown(i);
    return h;
  }

  /** Inserts an item into the heap in O(log n) time. */
  push(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  /** Removes and returns the smallest item according to `compareFn`, or `undefined` if empty. */
  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.sinkDown(0);
    }
    return top;
  }

  /** Returns the smallest item without removing it, or `undefined` if empty. */
  peek(): T | undefined {
    return this.heap[0];
  }

  /** Returns the number of elements in the heap. */
  size(): number {
    return this.heap.length;
  }

  /** Returns `true` when the heap is empty. */
  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /** Removes all elements from the heap. */
  clear(): void {
    this.heap = [];
  }

  /** Internal heap order (NOT sorted). Use `drain()` for sorted output. */
  toArray(): T[] {
    return [...this.heap];
  }

  /** Pop everything in sorted order (empties the heap). */
  drain(): T[] {
    const out: T[] = [];
    while (this.heap.length) out.push(this.pop()!);
    return out;
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.compare(this.heap[idx]!, this.heap[parent]!) >= 0) break;
      [this.heap[idx], this.heap[parent]] = [
        this.heap[parent]!,
        this.heap[idx]!,
      ];
      idx = parent;
    }
  }

  private sinkDown(idx: number): void {
    const len = this.heap.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = left + 1;
      if (
        left < len &&
        this.compare(this.heap[left]!, this.heap[smallest]!) < 0
      )
        smallest = left;
      if (
        right < len &&
        this.compare(this.heap[right]!, this.heap[smallest]!) < 0
      )
        smallest = right;
      if (smallest === idx) return;
      [this.heap[idx], this.heap[smallest]] = [
        this.heap[smallest]!,
        this.heap[idx]!,
      ];
      idx = smallest;
    }
  }
}

/**
 * Priority queue keyed by a numeric priority (lowest number served first; FIFO among equals).
 * @example
 * ```ts
 * const pq = new SimplePriorityQueue<string>();
 * pq.enqueue("low", 10); pq.enqueue("urgent", 0); pq.enqueue("normal", 5);
 * pq.dequeue(); // "urgent"
 * ```
 */
export class SimplePriorityQueue<T> {
  private seq = 0;
  private heap = new SimpleMinHeap<{ item: T; priority: number; seq: number }>(
    (a, b) => a.priority - b.priority || a.seq - b.seq,
  );

  /** Enqueues `item` with numeric `priority` (lower value = higher urgency, default `0`). */
  enqueue(item: T, priority = 0): void {
    this.heap.push({ item, priority, seq: this.seq++ });
  }

  /** Removes and returns the highest-priority item (FIFO on ties), or `undefined` if empty. */
  dequeue(): T | undefined {
    return this.heap.pop()?.item;
  }

  /** Returns the highest-priority item without removing it, or `undefined` if empty. */
  peek(): T | undefined {
    return this.heap.peek()?.item;
  }

  /** Returns the number of queued items. */
  size(): number {
    return this.heap.size();
  }

  /** Returns `true` when the priority queue is empty. */
  isEmpty(): boolean {
    return this.heap.isEmpty();
  }

  /** Removes all items from the priority queue. */
  clear(): void {
    this.heap.clear();
  }
}

interface TrieNode {
  children: Map<string, TrieNode>;
  terminal: boolean;
}

/**
 * Prefix tree for fast autocomplete and prefix membership (O(length of word)).
 * @example
 * ```ts
 * const t = new SimpleTrie(["bun", "bundle", "bunx", "node"]);
 * t.has("bun");              // true
 * t.withPrefix("bund");      // ["bundle"]
 * t.withPrefix("bun", 2);    // ["bun", "bundle"]
 * ```
 */
export class SimpleTrie {
  private root: TrieNode = { children: new Map(), terminal: false };
  private count = 0;

  /**
   * Creates a prefix trie optionally pre-populated with `words`.
   */
  constructor(words: Iterable<string> = []) {
    for (const w of words) this.add(w);
  }

  /** Insert a word. @returns `false` when it already existed. */
  add(word: string): boolean {
    let node = this.root;
    for (const ch of word) {
      if (!node.children.has(ch))
        node.children.set(ch, { children: new Map(), terminal: false });
      node = node.children.get(ch)!;
    }
    if (node.terminal) return false;
    node.terminal = true;
    this.count++;
    return true;
  }

  /** Exact membership. */
  has(word: string): boolean {
    return this.find(word)?.terminal ?? false;
  }

  /** `true` when any stored word starts with `prefix`. */
  hasPrefix(prefix: string): boolean {
    return this.find(prefix) !== undefined;
  }

  /** Remove a word. @returns `true` when it existed. */
  delete(word: string): boolean {
    const node = this.find(word);
    if (!node?.terminal) return false;
    node.terminal = false;
    this.count--;
    return true;
  }

  /** Words starting with `prefix` (insertion-agnostic, depth-first order), up to `limit`. */
  withPrefix(prefix: string, limit = Infinity): string[] {
    const start = this.find(prefix);
    const out: string[] = [];
    const walk = (node: TrieNode, acc: string): void => {
      if (out.length >= limit) return;
      if (node.terminal) out.push(acc);
      for (const [ch, child] of node.children) walk(child, acc + ch);
    };
    if (start) walk(start, prefix);
    return out;
  }

  /** Returns the total number of distinct words stored in the trie. */
  size(): number {
    return this.count;
  }

  private find(s: string): TrieNode | undefined {
    let node: TrieNode | undefined = this.root;
    for (const ch of s) {
      node = node.children.get(ch);
      if (!node) return undefined;
    }
    return node;
  }
}

/**
 * Union-find with path compression + union by size (near-O(1) operations).
 * Great for clustering, connected components and de-duplicating linked records.
 * @example
 * ```ts
 * const ds = new DisjointSet<string>();
 * ds.union("a", "b"); ds.union("c", "d");
 * ds.connected("a", "b"); // true
 * ds.groups();            // [["a","b"],["c","d"]]
 * ```
 */
export class DisjointSet<T> {
  private parent = new Map<T, T>();
  private sizes = new Map<T, number>();

  /** Ensure `x` exists as its own singleton set. */
  add(x: T): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.sizes.set(x, 1);
    }
  }

  /** Representative of `x`'s set (adds `x` if unknown). */
  find(x: T): T {
    this.add(x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    while (this.parent.get(x) !== root) {
      const next = this.parent.get(x)!;
      this.parent.set(x, root);
      x = next;
    }
    return root;
  }

  /** Merge the sets of `a` and `b`. @returns `false` when already joined. */
  union(a: T, b: T): boolean {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return false;
    if (this.sizes.get(ra)! < this.sizes.get(rb)!) [ra, rb] = [rb, ra];
    this.parent.set(rb, ra);
    this.sizes.set(ra, this.sizes.get(ra)! + this.sizes.get(rb)!);
    return true;
  }

  /** Returns `true` if `a` and `b` belong to the same disjoint set. */
  connected(a: T, b: T): boolean {
    return this.find(a) === this.find(b);
  }

  /** Size of the set containing `x`. */
  setSize(x: T): number {
    return this.sizes.get(this.find(x))!;
  }

  /** All sets as arrays (members in insertion order). */
  groups(): T[][] {
    const by = new Map<T, T[]>();
    for (const x of this.parent.keys()) {
      const r = this.find(x);
      if (!by.has(r)) by.set(r, []);
      by.get(r)!.push(x);
    }
    return [...by.values()];
  }
}

/**
 * Namespace of classic mutable data structures (`SimpleStack`, `SimpleQueue`, `SimpleDeque`, `SimpleRingBuffer`, `SimpleMinHeap`, `SimplePriorityQueue`, `SimpleTrie`, `DisjointSet`).
 */
export const structutils = {
  SimpleStack,
  SimpleQueue,
  SimpleDeque,
  SimpleRingBuffer,
  SimpleMinHeap,
  SimplePriorityQueue,
  SimpleTrie,
  DisjointSet,
};
