import { db } from '@/repositories';
import type { Role, User } from '@/domain/types';

/**
 * ⚠️ TEMPORARY. Phase 3 replaces this with Better Auth (PLAN.md §16).
 *
 * It exists now so that the DTO layer (§9.2) and the actor on every movement are
 * wired from the start. Retrofitting `actorId` and role-based field stripping
 * later means touching every action — so we don't.
 *
 * Phase 3: replace the body with Better Auth's session lookup. The signature
 * stays the same, so nothing that calls it changes.
 */
export async function getSession(): Promise<{ user: User; role: Role }> {
  const users = await db.users.findAll();
  // Flip 'ADMIN' to 'STAFF' here to see the app as a staff member: cost prices,
  // stock valuation and the profit column vanish from the payload entirely (§9.2).
  const user = users.find((u) => u.role === 'ADMIN') ?? users[0];

  if (!user) {
    throw new Error('No users found. Run `npm run seed` first.');
  }
  return { user, role: user.role };
}

/** Throws unless the current role is allowed. Call at the TOP of every mutating action. */
export async function requireRole(...allowed: Role[]): Promise<User> {
  const { user, role } = await getSession();
  if (!allowed.includes(role)) {
    throw new Error(`Not allowed: this action requires ${allowed.join(' or ')}, you are ${role}`);
  }
  return user;
}

/** STAFF must never see cost prices or margins. PLAN.md §9.2. */
export function canSeeCosts(role: Role): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}
