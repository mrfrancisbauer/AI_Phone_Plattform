/**
 * Create (or promote) a platform owner — a super admin who can manage every
 * tenant on the platform.
 *
 * Super admins are stored like any user, but with the `super_admin` role on a
 * dedicated internal "platform" home tenant (created automatically here) rather
 * than on a customer tenant. The super_admin role bypasses tenant filters, so
 * which tenant the membership row points at does not affect access — it just
 * gives the owner a home tenant to sign into.
 *
 * Usage:
 *   npm run create:super-admin --workspace @ai-phone/api -- \
 *     --email you@example.com --password "a-strong-password" [--name "Your Name"]
 *
 *   # or via env:
 *   SUPER_ADMIN_EMAIL=you@example.com SUPER_ADMIN_PASSWORD=... \
 *     npm run create:super-admin --workspace @ai-phone/api
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('--email') ?? process.env.SUPER_ADMIN_EMAIL;
  const password = arg('--password') ?? process.env.SUPER_ADMIN_PASSWORD;
  const name = arg('--name') ?? process.env.SUPER_ADMIN_NAME ?? 'Platform Owner';

  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.error('Usage: --email <email> --password <password> [--name <name>]');
    process.exit(1);
  }
  if (password.length < 8) {
    // eslint-disable-next-line no-console
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  // Dedicated internal home tenant for platform staff.
  const platform = await prisma.tenant.upsert({
    where: { slug: 'platform' },
    update: {},
    create: {
      name: 'Platform',
      slug: 'platform',
      locale: 'de',
      retentionSetting: { create: { retentionDays: 90 } },
    },
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hashPassword(password), name },
    create: { email, name, passwordHash: hashPassword(password) },
  });

  await prisma.tenantUser.upsert({
    where: { tenantId_userId: { tenantId: platform.id, userId: user.id } },
    update: { role: 'super_admin' },
    create: { tenantId: platform.id, userId: user.id, role: 'super_admin' },
  });

  // eslint-disable-next-line no-console
  console.log(`✅ Super admin ready: ${email}`);
  // eslint-disable-next-line no-console
  console.log('   Sign in at the dashboard and open "Admin (Mandanten)" to manage customers.');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
