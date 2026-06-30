/**
 * Seed script — creates a demo tenant with two users, an assistant (incl. an
 * example system prompt), an example questionnaire with a conditional
 * follow-up, a phone number and a summary recipient. Idempotent: re-running
 * upserts by stable slugs/emails.
 *
 * Run: npm run db:seed   (after db:migrate)
 *
 * Demo login:  admin@demo-kanzlei.de  /  demo-password-123
 */
import { PrismaClient } from '@prisma/client';
import { createHmac, createCipheriv, randomBytes, scryptSync } from 'node:crypto';

const prisma = new PrismaClient();

// Inline copies of crypto helpers so the seed has no app-internal imports.
const KEY = Buffer.from(
  process.env.ENCRYPTION_KEY ??
    '0000000000000000000000000000000000000000000000000000000000000000',
  'hex',
);
function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}
function blindHash(value: string): string {
  return createHmac('sha256', KEY).update(value.trim()).digest('hex');
}
function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

const EXAMPLE_SYSTEM_PROMPT = `Du bist der freundliche, professionelle KI-Telefonassistent der Kanzlei Demo & Partner.

Deine Aufgabe:
- Begrüße den Anrufer herzlich und führe ein natürliches, höfliches Gespräch auf Deutsch.
- Arbeite den hinterlegten Fragebogen ab und stelle immer NUR EINE Frage auf einmal.
- Höre aktiv zu. Wenn eine Antwort unklar oder unvollständig ist, stelle eine kurze Rückfrage.
- Erkenne, wenn eine Frage bereits beantwortet wurde, und überspringe sie.
- Fasse am Ende das Gespräch kurz zusammen und frage, ob alles korrekt ist.

Strikte Regeln:
- Erfinde niemals Informationen. Gib keine Rechtsberatung und keine verbindlichen Zusagen.
- Vermeide sensible oder rechtlich kritische Aussagen.
- Wenn du etwas nicht sicher weißt, sage exakt: "Das kann ich nicht zuverlässig beantworten, ich gebe es an das Team weiter."
- Bleibe stets sachlich, empathisch und kurz angebunden. Keine langen Monologe.`;

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-kanzlei' },
    update: {},
    create: {
      name: 'Kanzlei Demo & Partner',
      slug: 'demo-kanzlei',
      locale: 'de',
      monthlyBudgetLimit: '250.0000',
      autoPauseOnBudget: true,
      retentionSetting: { create: { retentionDays: 90, storeAudio: false } },
    },
  });

  // Users: admin + read-only.
  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo-kanzlei.de' },
    update: {},
    create: {
      email: 'admin@demo-kanzlei.de',
      name: 'Demo Admin',
      passwordHash: hashPassword('demo-password-123'),
    },
  });
  await prisma.tenantUser.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: admin.id } },
    update: { role: 'tenant_admin' },
    create: { tenantId: tenant.id, userId: admin.id, role: 'tenant_admin' },
  });

  const viewer = await prisma.user.upsert({
    where: { email: 'viewer@demo-kanzlei.de' },
    update: {},
    create: { email: 'viewer@demo-kanzlei.de', name: 'Demo Viewer', passwordHash: hashPassword('demo-password-123') },
  });
  await prisma.tenantUser.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: viewer.id } },
    update: { role: 'read_only' },
    create: { tenantId: tenant.id, userId: viewer.id, role: 'read_only' },
  });

  // Example questionnaire (with a conditional follow-up question).
  const questionnaire = await prisma.questionnaire.create({
    data: {
      tenantId: tenant.id,
      name: 'Erstkontakt Mandantenanfrage',
      questions: {
        create: [
          { tenantId: tenant.id, key: 'caller_name', prompt: 'Wie ist Ihr Name?', type: 'free_text', required: true, order: 1 },
          { tenantId: tenant.id, key: 'anliegen', prompt: 'Worum geht es bei Ihrem Anliegen?', type: 'free_text', required: true, order: 2 },
          {
            tenantId: tenant.id,
            key: 'rechtsgebiet',
            prompt: 'Um welches Rechtsgebiet geht es?',
            type: 'multiple_choice',
            required: true,
            order: 3,
            options: [
              { value: 'arbeitsrecht', label: 'Arbeitsrecht' },
              { value: 'mietrecht', label: 'Mietrecht' },
              { value: 'familienrecht', label: 'Familienrecht' },
              { value: 'sonstiges', label: 'Sonstiges' },
            ],
          },
          { tenantId: tenant.id, key: 'is_urgent', prompt: 'Ist Ihr Anliegen dringend?', type: 'yes_no', required: true, order: 4 },
          {
            tenantId: tenant.id,
            key: 'callback_time',
            prompt: 'Wann dürfen wir Sie am besten zurückrufen?',
            type: 'free_text',
            required: false,
            order: 5,
            condition: { questionKey: 'is_urgent', operator: 'equals', value: true },
          },
          { tenantId: tenant.id, key: 'urgency_level', prompt: 'Wie dringend ist es auf einer Skala von 1 bis 10?', type: 'scale', required: false, order: 6, scaleMin: 1, scaleMax: 10 },
          { tenantId: tenant.id, key: 'budget', prompt: 'Haben Sie ein ungefähres Budget im Kopf?', type: 'budget', required: false, order: 7 },
          { tenantId: tenant.id, key: 'caller_phone', prompt: 'Unter welcher Telefonnummer erreichen wir Sie?', type: 'phone', required: true, order: 8 },
          { tenantId: tenant.id, key: 'caller_email', prompt: 'Wie lautet Ihre E-Mail-Adresse?', type: 'email', required: false, order: 9 },
        ],
      },
    },
  });

  const assistant = await prisma.assistant.create({
    data: {
      tenantId: tenant.id,
      name: 'Kanzlei-Assistent',
      greetingText: 'Guten Tag, hier ist der digitale Assistent der Kanzlei Demo und Partner.',
      consentText:
        'Hinweis: Dieses Gespräch wird von einem KI-Assistenten geführt und zur Bearbeitung Ihres Anliegens transkribiert. Sind Sie damit einverstanden?',
      systemPrompt: EXAMPLE_SYSTEM_PROMPT,
      voice: 'alloy',
      locale: 'de',
      recordAudio: false,
      questionnaireId: questionnaire.id,
    },
  });

  // Phone number (demo). Replace with a real provisioned number in production.
  const demoNumber = '+493012345678';
  await prisma.phoneNumber.upsert({
    where: { e164Hash: blindHash(demoNumber) },
    update: { assistantId: assistant.id },
    create: {
      tenantId: tenant.id,
      provider: 'twilio',
      e164Enc: encrypt(demoNumber),
      e164Hash: blindHash(demoNumber),
      assistantId: assistant.id,
      active: true,
    },
  });

  await prisma.emailRecipient.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'team@demo-kanzlei.de' } },
    update: {},
    create: { tenantId: tenant.id, email: 'team@demo-kanzlei.de', label: 'Team-Postfach' },
  });

  // A super admin who can manage every tenant.
  const superAdmin = await prisma.user.upsert({
    where: { email: 'super@platform.local' },
    update: {},
    create: { email: 'super@platform.local', name: 'Platform Super Admin', passwordHash: hashPassword('super-password-123') },
  });
  await prisma.tenantUser.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: superAdmin.id } },
    update: { role: 'super_admin' },
    create: { tenantId: tenant.id, userId: superAdmin.id, role: 'super_admin' },
  });

  // Industry/plan metadata for the demo tenant (admin console).
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { industry: 'Kanzlei', plan: 'business', country: 'DE' },
  });

  // --- Admin-console dummy data (development only) --------------------------

  // A couple more tenants so the platform dashboard/list looks populated.
  const extraTenants: { name: string; slug: string; industry: string; plan: 'starter' | 'business' | 'enterprise' }[] = [
    { name: 'Praxis Dr. Müller', slug: 'praxis-mueller', industry: 'Arztpraxis', plan: 'starter' },
    { name: 'Bauer Immobilien GmbH', slug: 'bauer-immobilien', industry: 'Immobilien', plan: 'enterprise' },
  ];
  for (const t of extraTenants) {
    await prisma.tenant.upsert({
      where: { slug: t.slug },
      update: {},
      create: {
        name: t.name,
        slug: t.slug,
        industry: t.industry,
        plan: t.plan,
        country: 'DE',
        retentionSetting: { create: { retentionDays: 90 } },
      },
    });
  }

  // Global AI defaults + an active prompt version.
  await prisma.platformSetting.upsert({
    where: { key: 'ai' },
    update: {},
    create: {
      key: 'ai',
      value: { defaultModel: 'gpt-4o-mini', fallbackModel: 'gpt-4o', temperature: 0.3, maxTokens: 1024, voice: 'alloy' },
    },
  });
  const hasPrompt = await prisma.promptVersion.findFirst();
  if (!hasPrompt) {
    await prisma.promptVersion.create({
      data: { label: 'Initial', content: EXAMPLE_SYSTEM_PROMPT, active: true, createdBy: 'seed' },
    });
  }

  // Sample app logs across channels for the Logs view.
  const logCount = await prisma.appLog.count();
  if (logCount === 0) {
    await prisma.appLog.createMany({
      data: [
        { level: 'info', channel: 'system', message: 'Platform gestartet.' },
        { level: 'info', channel: 'login', message: 'Super Admin angemeldet.' },
        { level: 'info', channel: 'telephony', message: 'Eingehender Anruf verarbeitet.' },
        { level: 'warn', channel: 'openai', message: 'OpenAI nicht konfiguriert – lokaler Fallback aktiv.' },
        { level: 'info', channel: 'webhook', message: 'Twilio-Webhook empfangen.' },
        { level: 'error', channel: 'api', message: 'Beispiel-Fehler (Demo-Daten).' },
      ],
    });
  }

  // eslint-disable-next-line no-console
  console.log('✅ Seed complete.');
  // eslint-disable-next-line no-console
  console.log(`   Tenant:        ${tenant.name} (${tenant.slug})`);
  // eslint-disable-next-line no-console
  console.log(`   Admin login:   admin@demo-kanzlei.de / demo-password-123`);
  // eslint-disable-next-line no-console
  console.log(`   Demo number:   ${demoNumber}`);
  // eslint-disable-next-line no-console
  console.log(`   Super admin:   super@platform.local / super-password-123  (Admin-Konsole)`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
