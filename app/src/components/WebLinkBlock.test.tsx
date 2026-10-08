import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ isAuthenticated: false }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("../api", () => ({ apiFetch: vi.fn() }));
import { WebLinkBlock } from "./WebLinkBlock";

const preview = { id: "l1", url: "https://example.com/article", mode: "preview" as const, title: "Article", image: "https://example.com/cover.png" };
const embed = { id: "l2", url: "https://example.com/page", mode: "embed" as const };
const block = (data: typeof preview | typeof embed) => render(<WebLinkBlock data={data} readOnly onChange={vi.fn()} />);

describe("WebLinkBlock for anonymous readers", () => {
  it("loads nothing from the linked site until asked", () => {
    auth.isAuthenticated = false;
    const { container } = block(preview);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Article")).toBeTruthy();

    block(embed);
    expect(container.ownerDocument.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Afficher la page intégrée/ }));
    expect(container.ownerDocument.querySelector("iframe")?.getAttribute("src")).toBe("https://example.com/page");
  });

  it("shows previews directly to signed-in users", () => {
    auth.isAuthenticated = true;
    const { container } = block(preview);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.com/cover.png");
    const embedded = block(embed);
    expect(embedded.container.querySelector("iframe")).not.toBeNull();
  });
});
