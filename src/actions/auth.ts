'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { getSession } from '@/lib/session';

export interface LoginState {
  error?: string;
}

const loginSchema = z.object({
  email: z.email('Enter a valid email address').trim().toLowerCase(),
  password: z.string().min(1, 'Enter your password'),
  next: z.string().optional(),
});

function formString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' ? value : undefined;
}

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formString(formData, 'email') ?? '',
    password: formString(formData, 'password') ?? '',
    next: formString(formData, 'next'),
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid login' };

  try {
    const result = await auth.api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password },
      headers: await headers(),
    });

    await writeAudit({
      actorId: result.user.id,
      action: 'auth.login',
      entity: 'User',
      entityId: result.user.id,
      after: { email: result.user.email },
    });
  } catch {
    return { error: 'Invalid email or password' };
  }

  const destination =
    parsed.data.next?.startsWith('/') && !parsed.data.next.startsWith('//')
      ? parsed.data.next
      : '/products';
  revalidatePath('/', 'layout');
  redirect(destination);
}

export async function logoutAction(): Promise<void> {
  const { user } = await getSession();
  await writeAudit({
    actorId: user.id,
    action: 'auth.logout',
    entity: 'User',
    entityId: user.id,
  });
  await auth.api.signOut({ headers: await headers() });
  revalidatePath('/', 'layout');
  redirect('/login');
}
