import { vi } from "vitest";

const models = ["user", "userPermissions", "invitation", "document", "documentImage", "documentHistory", "conversation", "aiMessage", "scraper", "instanceScrape", "instanceScrapeHistory", "scrapingScheduler", "settings", "images"] as const;
const methods = ["findUnique", "findFirst", "findFirstOrThrow", "findMany", "create", "update", "delete", "deleteMany", "count"] as const;
export const db = Object.fromEntries(models.map(model => [model, Object.fromEntries(methods.map(method => [method, vi.fn()]))])) as Record<typeof models[number], Record<typeof methods[number], ReturnType<typeof vi.fn>>>;
export const user = { id: 7, email: "user@example.com", username: "user", role: "ADMIN", password: "stored-hash" };
export function resetDatabase() {
  for (const model of Object.values(db)) {
    for (const [method, mock] of Object.entries(model)) {
      mock.mockReset();
      mock.mockResolvedValue(method === "findMany" ? [] : method === "count" ? 1 : { id: 12 });
    }
  }
  db.user.findFirst.mockResolvedValue(user);
  db.user.findUnique.mockResolvedValue(user);
  db.user.create.mockResolvedValue(user);
  db.user.update.mockResolvedValue(user);
  db.user.delete.mockResolvedValue(user);
}
