-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('starter', 'business', 'enterprise');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'platform_support';
ALTER TYPE "Role" ADD VALUE 'billing';

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'DE',
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "openaiMode" TEXT NOT NULL DEFAULT 'platform',
ADD COLUMN     "plan" "Plan" NOT NULL DEFAULT 'starter',
ADD COLUMN     "telephonyMode" TEXT NOT NULL DEFAULT 'platform_twilio',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "prompt_versions" (
    "id" TEXT NOT NULL,
    "version" SERIAL NOT NULL,
    "label" TEXT,
    "content" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backups" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sizeBytes" BIGINT,
    "location" TEXT,
    "note" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT,

    CONSTRAINT "backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_logs" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "channel" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "tenantId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prompt_versions_version_key" ON "prompt_versions"("version");

-- CreateIndex
CREATE INDEX "app_logs_channel_idx" ON "app_logs"("channel");

-- CreateIndex
CREATE INDEX "app_logs_level_idx" ON "app_logs"("level");

-- CreateIndex
CREATE INDEX "app_logs_createdAt_idx" ON "app_logs"("createdAt");

