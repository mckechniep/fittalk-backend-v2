/*
  Warnings:

  - You are about to alter the column `embedding` on the `Embedding` table. The data in that column could be lost. The data in that column will be cast from `vector(1536)` to `Unsupported("vector(1536)")`.

*/
-- AlterTable
ALTER TABLE "Embedding" ALTER COLUMN "embedding" SET DATA TYPE vector(1536);
