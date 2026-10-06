// Folder rows as returned by GET /api/folders, and helpers shared by the sidebar and pickers.

export interface FolderRow {
  id: number;
  name: string;
  parentId: number | null;
}

/** "Parent / Child / Folder" for each folder; cycles in bad data are cut. */
export const folderPaths = (folders: FolderRow[]) => {
  const byId = new Map(folders.map((f) => [f.id, f]));
  return new Map(
    folders.map((folder) => {
      const names: string[] = [];
      const seen = new Set<number>();
      for (let f: FolderRow | undefined = folder; f && !seen.has(f.id); f = f.parentId === null ? undefined : byId.get(f.parentId)) {
        seen.add(f.id);
        names.unshift(f.name);
      }
      return [folder.id, names.join(" / ")];
    }),
  );
};

/** Whether `id` is `ancestorId` or one of its subfolders. */
export const isInFolder = (folders: FolderRow[], id: number, ancestorId: number) => {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const seen = new Set<number>();
  for (let f = byId.get(id); f && !seen.has(f.id); f = f.parentId === null ? undefined : byId.get(f.parentId)) {
    if (f.id === ancestorId) return true;
    seen.add(f.id);
  }
  return false;
};
