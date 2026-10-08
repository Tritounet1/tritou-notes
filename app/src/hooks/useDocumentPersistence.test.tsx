import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../api", () => ({ apiFetch: api.fetch }));
import { useDocumentPersistence } from "./useDocumentPersistence";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const page = { id: 5, title: "Notes", text: "Avant", public: false, last_update: "2026-10-08T10:00:00.000Z", authorId: 1, type: "TEXT", parentId: null, folderId: null };
const puts = () => api.fetch.mock.calls.filter(([, init]) => init?.method === "PUT").map(([, init]) => JSON.parse(init.body));

const load = async () => {
  const hook = renderHook(() => useDocumentPersistence("5"));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

beforeEach(() => {
  api.fetch.mockReset();
  api.fetch.mockImplementation(async (_url: string, init?: RequestInit) => (init?.method === "PUT" ? json({ ...page, last_update: "2026-10-08T10:00:05.000Z" }) : json(page)));
});

describe("useDocumentPersistence", () => {
  it("loads the page", async () => {
    const { result } = await load();
    expect(api.fetch).toHaveBeenCalledWith("/api/documents/5");
    expect(result.current).toMatchObject({ title: "Notes", text: "Avant", isPublic: false, error: "", conflict: false });
  });

  it("sends the version each save is based on, one save after the other", async () => {
    const { result } = await load();
    await act(async () => {
      void result.current.saveDocument("Notes", "Un", false);
      await result.current.saveDocument("Notes", "Deux", false);
    });
    // The second save waits for the first and uses the version it returned.
    expect(puts()).toEqual([
      { title: "Notes", text: "Un", is_public: false, expectedLastUpdate: "2026-10-08T10:00:00.000Z" },
      { title: "Notes", text: "Deux", is_public: false, expectedLastUpdate: "2026-10-08T10:00:05.000Z" },
    ]);
  });

  it("stops autosaving on a conflict until the user keeps their version", async () => {
    const { result } = await load();
    api.fetch.mockImplementationOnce(async () => json({ message: "modifiée entre-temps" }, 409));
    await act(() => result.current.saveDocument("Notes", "Mine", false));
    expect(result.current.conflict).toBe(true);

    await act(() => result.current.saveDocument("Notes", "Mine again", false));
    expect(puts()).toHaveLength(1);

    // Keeping my version overwrites, without an expected version.
    await act(async () => result.current.keepMyVersion());
    await waitFor(() => expect(result.current.conflict).toBe(false));
    expect(puts().at(-1)).toEqual({ title: "Notes", text: "Avant", is_public: false });
  });

  it("keeps the text and reports a failed save", async () => {
    const { result } = await load();
    api.fetch.mockImplementationOnce(async () => {
      throw new TypeError("Failed to fetch");
    });
    act(() => result.current.setText("Pas encore enregistré"));
    await act(() => result.current.saveDocument("Notes", "Pas encore enregistré", false));
    expect(result.current.actionError).toMatchObject({ retrySave: true });
    expect(result.current.text).toBe("Pas encore enregistré");
    await act(() => result.current.saveDocument("Notes", "Pas encore enregistré", false));
    expect(result.current.actionError).toBeNull();
  });

  it("reloads after an assistant change only when no local edit conflicts", async () => {
    const { result } = await load();
    api.fetch.mockImplementationOnce(async () => json({ ...page, text: "Écrit par l’assistant", last_update: "2026-10-08T10:01:00.000Z" }));
    await act(async () => result.current.handleExternalChange());
    await waitFor(() => expect(result.current.text).toBe("Écrit par l’assistant"));
  });

  it("shows a load error", async () => {
    api.fetch.mockImplementation(async () => json({ message: "Document introuvable" }, 404));
    const { result } = renderHook(() => useDocumentPersistence("404"));
    await waitFor(() => expect(result.current.error).toBe("Document non trouvé"));
  });
});
