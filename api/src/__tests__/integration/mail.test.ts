import { beforeAll, expect, it } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client";

// Real nodemailer against a Mailpit SMTP server (docker-compose.test.yml).
const MAILPIT = "http://127.0.0.1:58025/api/v1";
let prisma: PrismaClient;

beforeAll(async () => {
  ({ prisma } = await import("../../config/prismaClient"));
  const { encrypt } = await import("../../utils/utils");
  const smtp = { smtpHost: encrypt("127.0.0.1"), smtpPort: 51025, smtpUser: encrypt("tests@tritou.test"), smtpPassword: encrypt("secret") };
  const existing = await prisma.settings.findFirst();
  if (existing) await prisma.settings.update({ where: { id: existing.id }, data: smtp });
  else await prisma.settings.create({ data: smtp });
  await fetch(`${MAILPIT}/messages`, { method: "DELETE" });
});

it("delivers an email through the configured SMTP server", async () => {
  const { sendEmail } = await import("../../config/mailClient");
  await sendEmail("invited@tritou.test", "Invitation Tritou Notes", "<p>Bienvenue <b>à bord</b></p>");
  const { messages } = await (await fetch(`${MAILPIT}/messages`)).json();
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({ Subject: "Invitation Tritou Notes", From: { Address: "tests@tritou.test" }, To: [{ Address: "invited@tritou.test" }] });
  const full = await (await fetch(`${MAILPIT}/message/${messages[0].ID}`)).json();
  expect(full.HTML).toContain("<b>à bord</b>");
});
