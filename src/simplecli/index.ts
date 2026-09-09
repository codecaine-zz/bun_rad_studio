/**
 * bun-simplcli - Comprehensive zero-dependency headless console & RAD toolkit for Bun
 */

export * from './core/types.ts';
export * from './core/ansi.ts';
export * from './core/logger.ts';
export * from './core/prompts.ts';
export * from './core/pipeline.ts';
export * from './core/config.ts';
export * from './core/redis.ts';
export * from './core/SimpleCLI.ts';
export * from './sys/index.ts';
export * from './stdlib/index.ts';

import { SimpleCLI } from './core/SimpleCLI.ts';

export function newApp(name: string, version: string = '1.0.0'): SimpleCLI {
  return new SimpleCLI(name, version);
}

export function createApp(name: string, version: string = '1.0.0'): SimpleCLI {
  return new SimpleCLI(name, version);
}

export function initApp(): SimpleCLI {
  return SimpleCLI.initApp();
}

export default SimpleCLI;
