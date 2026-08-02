import { prismaAdapter } from 'better-auth/adapters/prisma';
import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { admin } from 'better-auth/plugins';
import type { AccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultAc, userAc } from 'better-auth/plugins/admin/access';

import { prisma } from '@/lib/prisma';

export const auth = betterAuth({
  appName: 'Electronics Shop Inventory',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
    transaction: true,
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  user: {
    additionalFields: {
      isActive: {
        type: 'boolean',
        required: false,
        defaultValue: true,
        input: false,
      },
      locale: {
        type: 'string',
        required: false,
        defaultValue: 'en',
        input: false,
      },
    },
  },
  plugins: [
    admin({
      // Better Auth's public AccessControl type erases the concrete statement
      // keys; the roles retain their runtime controller from defaultAc.
      ac: defaultAc as unknown as AccessControl,
      roles: {
        ADMIN: adminAc,
        MANAGER: userAc,
        STAFF: userAc,
      },
      defaultRole: 'STAFF',
      adminRoles: ['ADMIN'],
    }),
    // Must remain last so Server Actions receive Better Auth's Set-Cookie headers.
    nextCookies(),
  ],
});
