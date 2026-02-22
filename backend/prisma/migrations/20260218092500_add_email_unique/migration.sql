-- AlterTable: Add email column to Admin
ALTER TABLE "Admin" ADD COLUMN "email" TEXT;

-- CreateIndex: Unique constraint on User.email
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex: Unique constraint on Admin.email
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");
