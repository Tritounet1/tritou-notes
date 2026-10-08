import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

const open = (onClose = vi.fn(), closeOnBackdrop = false) => {
  const trigger = document.createElement("button");
  document.body.appendChild(trigger);
  trigger.focus();
  const view = render(
    <Dialog onClose={onClose} className="modal" labelledBy="t" closeOnBackdrop={closeOnBackdrop}>
      <h2 id="t">Titre</h2>
      <input aria-label="Premier" />
      <button type="button">Dernier</button>
    </Dialog>,
  );
  return { trigger, onClose, ...view };
};

describe("Dialog", () => {
  it("is a labelled modal dialog that takes the focus", () => {
    open();
    const dialog = screen.getByRole("dialog", { name: "Titre" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Premier"));
  });

  it("closes on Escape and gives the focus back", () => {
    const { onClose, trigger, unmount } = open();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps Tab inside", () => {
    open();
    const first = screen.getByLabelText("Premier");
    const last = screen.getByRole("button", { name: "Dernier" });
    // jsdom has no layout: make the elements count as visible.
    for (const element of [first, last]) Object.defineProperty(element, "offsetParent", { get: () => document.body });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("closes on the backdrop only when asked", () => {
    const { onClose, container } = open(vi.fn(), true);
    fireEvent.click(container.querySelector(".modal-backdrop")!);
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
