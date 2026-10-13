// jsdom ships no type definitions. Only the small part the tests use is declared here, to avoid a @types package.
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string, options?: Record<string, unknown>);
    window: Window & typeof globalThis & { document: Document; KeyboardEvent: typeof KeyboardEvent };
  }
}
