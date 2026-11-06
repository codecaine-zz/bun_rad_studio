/**
 * Synthetic test data generator for user profiles, contact details, network endpoints, and
 * formatted Lorem Ipsum placeholder text.
 */

/**
 * Synthetic user profile record generated for testing, prototyping, and UI fixtures.
 */
export interface MockUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "editor" | "viewer" | "developer";
  phone: string;
  avatar: string;
}

const FIRST_NAMES = [
  "Alice",
  "Bob",
  "Charlie",
  "Diana",
  "Evan",
  "Fiona",
  "George",
  "Hannah",
  "Ian",
  "Julia",
];
const LAST_NAMES = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Miller",
  "Davis",
  "Wilson",
  "Taylor",
  "Clark",
];
const ROLES: MockUser["role"][] = ["admin", "editor", "viewer", "developer"];

const LOREM_WORDS = [
  "lorem",
  "ipsum",
  "dolor",
  "sit",
  "amet",
  "consectetur",
  "adipiscing",
  "elit",
  "sed",
  "do",
  "eiusmod",
  "tempor",
  "incididunt",
  "ut",
  "labore",
  "et",
  "dolore",
  "magna",
  "aliqua",
  "ut",
  "enim",
  "ad",
  "minim",
  "veniam",
  "quis",
  "nostrud",
  "exercitation",
  "ullamco",
  "laboris",
  "nisi",
  "ut",
  "aliquip",
  "ex",
  "ea",
  "commodo",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// Doer: Generate synthetic single mock user
/**
 * Generates a single synthetic {@link MockUser} with randomized name, email, role, phone, and avatar URL.
 */
export function mockUser(): MockUser {
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  const name = `${first} ${last}`;
  const id = crypto.randomUUID().slice(0, 8);
  const email = `${first.toLowerCase()}.${last.toLowerCase()}@example.com`;
  const role = pick(ROLES);
  const phone = mockPhone();
  const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${id}`;
  return { id, name, email, role, phone, avatar };
}

// Doer: Generate array of synthetic mock users
/**
 * Generates an array of `count` synthetic {@link MockUser} records.
 */
export function mockUsers(count: number): MockUser[] {
  return Array.from({ length: count }, () => mockUser());
}

// Doer: Generate random mock email
/**
 * Generates a synthetic `@example.com` email address, optionally derived from `name`.
 */
export function mockEmail(name?: string): string {
  const prefix = name
    ? name.toLowerCase().replace(/\s+/g, ".")
    : pick(FIRST_NAMES).toLowerCase();
  const num = Math.floor(Math.random() * 900) + 100;
  return `${prefix}${num}@example.com`;
}

// Doer: Generate synthetic telephone number
/**
 * Generates a synthetic North American (`+1 (XXX) XXX-XXXX`) telephone number string.
 */
export function mockPhone(): string {
  const area = Math.floor(Math.random() * 800) + 200;
  const mid = Math.floor(Math.random() * 900) + 100;
  const last = Math.floor(Math.random() * 9000) + 1000;
  return `+1 (${area}) ${mid}-${last}`;
}

// Doer: Generate synthetic IPv4 address
/**
 * Generates a random dotted-quad IPv4 address string.
 */
export function mockIpv4(): string {
  return Array.from(
    { length: 4 },
    () => Math.floor(Math.random() * 254) + 1,
  ).join(".");
}

// Doer: Generate synthetic web URL
/**
 * Generates a synthetic HTTPS endpoint URL for mock services and APIs.
 */
export function mockUrl(): string {
  const domains = ["example.com", "service.io", "cloud.dev", "api.internal"];
  const paths = ["v1/status", "dashboard", "users", "health", "metrics"];
  return `https://${pick(domains)}/${pick(paths)}`;
}

// Doer: Generate count random placeholder words
/**
 * Generates a space-separated string of `count` random lowercase Lorem Ipsum words.
 */
export function loremWords(count: number): string {
  return Array.from({ length: count }, () => pick(LOREM_WORDS)).join(" ");
}

// Coordinator: Generate formatted lorem ipsum placeholder paragraphs
/**
 * Generates `paragraphs` paragraphs of capitalized, period-terminated Lorem Ipsum sentences.
 */
export function loremText(
  paragraphs = 1,
  minSentences = 3,
  maxSentences = 6,
): string {
  const paras: string[] = [];
  for (let p = 0; p < paragraphs; p++) {
    const numSentences =
      Math.floor(Math.random() * (maxSentences - minSentences + 1)) +
      minSentences;
    const sentences: string[] = [];
    for (let s = 0; s < numSentences; s++) {
      const wordCount = Math.floor(Math.random() * 8) + 6;
      const sentence = loremWords(wordCount);
      sentences.push(
        sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".",
      );
    }
    paras.push(sentences.join(" "));
  }
  return paras.join("\n\n");
}

/**
 * Namespace bundling all synthetic mock data and Lorem Ipsum generator functions.
 */
export const mockutils = {
  mockUser,
  mockUsers,
  mockEmail,
  mockPhone,
  mockIpv4,
  mockUrl,
  loremWords,
  loremText,
};
