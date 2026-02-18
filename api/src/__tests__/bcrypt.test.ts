import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../utils/bcryptUtils";

describe("Bcrypt tests", () => {
  it("hashed password is equal to password", async () => {
    const password = "test1234";
    const hashedPassword = await hashPassword(password);
    expect(await verifyPassword(password, hashedPassword)).toBe(true);
  });

  it("hashed password is not equal to password", async () => {
    const password = "test1234";
    const hashedPassword = await hashPassword(password);
    const newPassword = "test12";
    expect(await verifyPassword(newPassword, hashedPassword)).toBe(false);
  });
});
