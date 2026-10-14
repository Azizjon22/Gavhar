-- Telegram bot: foydalanuvchi o'z hisobini Profil sahifasidagi bir martalik havola orqali ulaydi.
ALTER TABLE "users" ADD COLUMN "telegram_chat_id" TEXT,
ADD COLUMN "telegram_linked_at" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "users_telegram_chat_id_key" ON "users"("telegram_chat_id");
