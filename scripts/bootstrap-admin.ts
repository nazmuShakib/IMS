import { auth } from '@/lib/auth';
import { uuidv7 } from '@/lib/ids';
import { prisma } from '@/lib/prisma';

async function main() {
  const name = process.env.INITIAL_ADMIN_NAME?.trim();
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!name || !email || !password || password.length < 12) {
    throw new Error(
      'Set INITIAL_ADMIN_NAME, INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD ' +
        '(at least 12 characters) in .env.local.',
    );
  }

  if ((await prisma.user.count()) > 0) {
    throw new Error('Bootstrap refused: an authentication user already exists.');
  }

  const created = await auth.api.createUser({
    body: { name, email, password, role: 'ADMIN' as never, data: { isActive: true } },
  });

  await prisma.auditLog.create({
    data: {
      id: uuidv7(),
      actorId: created.user.id,
      action: 'user.bootstrap_admin',
      entity: 'User',
      entityId: created.user.id,
      after: { name, email, role: 'ADMIN', isActive: true },
    },
  });

  console.log(`Created initial ADMIN: ${email}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
