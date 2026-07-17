import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import type { Role, User } from '@/domain/types';
import { auth } from '@/lib/auth';
import {
  CAPABILITY_ROLES,
  canUseAccount,
  type Capability,
} from '@/lib/permissions';
import { prisma } from '@/lib/prisma';

export { canSeeCosts } from '@/lib/permissions';

function toDomainUser(user: Awaited<ReturnType<typeof prisma.user.findUniqueOrThrow>>): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/** Resolve both the signed session and the current database role on every request. */
export async function getSession(): Promise<{ user: User; role: Role }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const current = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!current || !canUseAccount(current)) {
    redirect('/login?error=inactive');
  }

  const user = toDomainUser(current);
  return { user, role: user.role };
}

/** Throws unless the current database role is allowed. Call first in every mutation. */
export async function requireRole(...allowed: Role[]): Promise<User> {
  const { user, role } = await getSession();
  if (!allowed.includes(role)) {
    throw new Error(`Not allowed: this action requires ${allowed.join(' or ')}, you are ${role}`);
  }
  return user;
}

/** Enforce the canonical PLAN.md §9.1 capability matrix at a server boundary. */
export async function requireCapability(capability: Capability): Promise<User> {
  return requireRole(...CAPABILITY_ROLES[capability]);
}
