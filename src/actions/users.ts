'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { requireCapability } from '@/lib/session';
import { ROLES } from '@/domain/types';

export interface UserActionState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(12).max(128),
  role: z.enum(ROLES),
});

function value(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === 'string' ? raw : '';
}

export async function createUserAction(
  _previous: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await requireCapability('MANAGE_USERS');
  const parsed = createSchema.safeParse({
    name: value(formData, 'name'),
    email: value(formData, 'email'),
    password: value(formData, 'password'),
    role: value(formData, 'role'),
  });

  if (!parsed.success) {
    return {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [String(issue.path[0] ?? '_'), issue.message]),
      ),
    };
  }

  try {
    const created = await auth.api.createUser({
      body: { ...parsed.data, role: parsed.data.role as never, data: { isActive: true } },
    });
    await writeAudit({
      actorId: actor.id,
      action: 'user.create',
      entity: 'User',
      entityId: created.user.id,
      after: { ...parsed.data, password: undefined, isActive: true },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not create the user' };
  }

  revalidatePath('/users');
  return { ok: `Created ${parsed.data.name}.` };
}

export async function changeUserRole(formData: FormData): Promise<void> {
  const actor = await requireCapability('MANAGE_USERS');
  const userId = value(formData, 'userId');
  const parsedRole = z.enum(ROLES).safeParse(value(formData, 'role'));
  if (!userId || !parsedRole.success) throw new Error('Invalid user or role');
  if (userId === actor.id) throw new Error('You cannot change your own role.');

  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const after = await prisma.user.update({
    where: { id: userId },
    data: { role: parsedRole.data },
  });

  await writeAudit({
    actorId: actor.id,
    action: 'user.role_change',
    entity: 'User',
    entityId: userId,
    before: { role: before.role },
    after: { role: after.role },
  });
  revalidatePath('/users');
  revalidatePath('/', 'layout');
}

export async function toggleUserActive(formData: FormData): Promise<void> {
  const actor = await requireCapability('MANAGE_USERS');
  const userId = value(formData, 'userId');
  if (!userId) throw new Error('Missing user');
  if (userId === actor.id) throw new Error('You cannot deactivate your own account.');

  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const nextActive = !before.isActive;

  const after = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.user.update({
      where: { id: userId },
      data: {
        isActive: nextActive,
        banned: !nextActive,
        banReason: nextActive ? null : 'Account deactivated by administrator',
        banExpires: null,
      },
    });
    if (!nextActive) await transaction.session.deleteMany({ where: { userId } });
    return updated;
  });

  await writeAudit({
    actorId: actor.id,
    action: nextActive ? 'user.activate' : 'user.deactivate',
    entity: 'User',
    entityId: userId,
    before: { isActive: before.isActive },
    after: { isActive: after.isActive },
  });
  revalidatePath('/users');
}
