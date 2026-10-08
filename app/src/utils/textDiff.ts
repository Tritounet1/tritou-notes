/** One line of a line-by-line comparison between two versions of a text. */
export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
}

/** Line-by-line diff of two texts (greedy: realigns on the nearest common line). */
export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const diff: DiffLine[] = [];

  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    const oldLine = oldLines[oldIndex];
    const newLine = newLines[newIndex];

    if (oldIndex >= oldLines.length) {
      diff.push({ type: "added", content: newLine });
      newIndex++;
    } else if (newIndex >= newLines.length) {
      diff.push({ type: "removed", content: oldLine });
      oldIndex++;
    } else if (oldLine === newLine) {
      diff.push({ type: "unchanged", content: oldLine });
      oldIndex++;
      newIndex++;
    } else {
      const oldInNew = newLines.indexOf(oldLine, newIndex);
      const newInOld = oldLines.indexOf(newLine, oldIndex);

      if (oldInNew === -1 && newInOld === -1) {
        diff.push({ type: "removed", content: oldLine });
        diff.push({ type: "added", content: newLine });
        oldIndex++;
        newIndex++;
      } else if (
        oldInNew !== -1 &&
        (newInOld === -1 || oldInNew - newIndex <= newInOld - oldIndex)
      ) {
        while (newIndex < oldInNew) {
          diff.push({ type: "added", content: newLines[newIndex] });
          newIndex++;
        }
      } else {
        while (oldIndex < newInOld) {
          diff.push({ type: "removed", content: oldLines[oldIndex] });
          oldIndex++;
        }
      }
    }
  }

  return diff;
}
