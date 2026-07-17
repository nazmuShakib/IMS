import { jsonRepositories } from './json';
import type { Repositories } from './types';

/**
 * ⚠️ THE ONLY FILE THAT CHANGES WHEN YOU MIGRATE TO POSTGRES. PLAN.md §13.4.
 *
 * Phase 1:
 *   import { prismaRepositories } from './prisma';
 *   ...
 *   process.env.DATA_SOURCE === 'postgres' ? prismaRepositories : jsonRepositories
 *
 * Nothing above this file — services, server actions, UI — may import from
 * './json' or './prisma' directly. Import from '@/repositories' only.
 */
const source = process.env.DATA_SOURCE ?? 'json';

if (source === 'postgres') {
  throw new Error(
    'DATA_SOURCE=postgres, but the Prisma repositories are not implemented yet. ' +
      'That is Phase 6 (PLAN.md §14). Set DATA_SOURCE=json for now.',
  );
}

export const db: Repositories = jsonRepositories;

export type * from './types';
