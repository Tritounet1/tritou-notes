import { useCallback, useEffect, useRef, useState } from "react";

interface CellData {
  value: string;
  formula?: string;
}

interface SpreadsheetData {
  [key: string]: CellData;
}

interface SpreadsheetEditorProps {
  data: string;
  onChange: (data: string) => void;
  readOnly?: boolean;
}

const INITIAL_ROWS = 50;
const INITIAL_COLS = 26;

const getColumnLabel = (index: number): string => {
  let label = "";
  let i = index;
  while (i >= 0) {
    label = String.fromCharCode(65 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  }
  return label;
};

const getCellKey = (row: number, col: number): string => {
  return `${getColumnLabel(col)}${row + 1}`;
};

const parseCellKey = (key: string): { row: number; col: number } | null => {
  const match = key.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;

  const colStr = match[1];
  const row = parseInt(match[2]) - 1;

  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }
  col -= 1;

  return { row, col };
};

export const SpreadsheetEditor = ({
  data,
  onChange,
  readOnly = false,
}: SpreadsheetEditorProps) => {
  const [cells, setCells] = useState<SpreadsheetData>(() => {
    try {
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  });

  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selectionStart, setSelectionStart] = useState<string | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Sync changes to parent
  useEffect(() => {
    const jsonData = JSON.stringify(cells);
    if (jsonData !== data) {
      onChange(jsonData);
    }
  }, [cells, data, onChange]);

  // Calculate cell value (handle formulas)
  const calculateValue = useCallback(
    (cellKey: string, visited: Set<string> = new Set()): string => {
      const cell = cells[cellKey];
      if (!cell) return "";

      const value = cell.formula || cell.value;

      if (!value.startsWith("=")) {
        return value;
      }

      // Prevent circular references
      if (visited.has(cellKey)) {
        return "#CIRCULAR!";
      }
      visited.add(cellKey);

      const formula = value.slice(1).toUpperCase();

      try {
        // Handle SUM function
        const sumMatch = formula.match(/^SUM\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
        if (sumMatch) {
          const start = parseCellKey(sumMatch[1]);
          const end = parseCellKey(sumMatch[2]);
          if (!start || !end) return "#REF!";

          let sum = 0;
          for (
            let r = Math.min(start.row, end.row);
            r <= Math.max(start.row, end.row);
            r++
          ) {
            for (
              let c = Math.min(start.col, end.col);
              c <= Math.max(start.col, end.col);
              c++
            ) {
              const key = getCellKey(r, c);
              const val = parseFloat(calculateValue(key, new Set(visited)));
              if (!isNaN(val)) sum += val;
            }
          }
          return sum.toString();
        }

        // Handle AVERAGE function
        const avgMatch = formula.match(/^AVERAGE\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
        if (avgMatch) {
          const start = parseCellKey(avgMatch[1]);
          const end = parseCellKey(avgMatch[2]);
          if (!start || !end) return "#REF!";

          let sum = 0;
          let count = 0;
          for (
            let r = Math.min(start.row, end.row);
            r <= Math.max(start.row, end.row);
            r++
          ) {
            for (
              let c = Math.min(start.col, end.col);
              c <= Math.max(start.col, end.col);
              c++
            ) {
              const key = getCellKey(r, c);
              const val = parseFloat(calculateValue(key, new Set(visited)));
              if (!isNaN(val)) {
                sum += val;
                count++;
              }
            }
          }
          return count > 0 ? (sum / count).toString() : "0";
        }

        // Handle simple cell references and arithmetic
        const expression = formula.replace(/([A-Z]+\d+)/g, (match) => {
          const val = calculateValue(match, new Set(visited));
          const num = parseFloat(val);
          return isNaN(num) ? "0" : num.toString();
        });

        // Evaluate simple arithmetic

        const result = new Function(`return ${expression}`)();
        return isNaN(result) ? "#ERROR!" : result.toString();
      } catch {
        return "#ERROR!";
      }
    },
    [cells],
  );

  const handleCellClick = (cellKey: string, e: React.MouseEvent) => {
    if (e.shiftKey && selectedCell) {
      setSelectionEnd(cellKey);
    } else {
      setSelectedCell(cellKey);
      setSelectionStart(cellKey);
      setSelectionEnd(null);
    }

    if (editingCell && editingCell !== cellKey) {
      commitEdit();
    }
  };

  const handleCellDoubleClick = (cellKey: string) => {
    if (readOnly) return;
    setEditingCell(cellKey);
    const cell = cells[cellKey];
    setEditValue(cell?.formula || cell?.value || "");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitEdit = () => {
    if (!editingCell) return;

    const isFormula = editValue.startsWith("=");
    setCells((prev) => ({
      ...prev,
      [editingCell]: {
        value: isFormula ? "" : editValue,
        formula: isFormula ? editValue : undefined,
      },
    }));
    setEditingCell(null);
    setEditValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!selectedCell) return;

    const parsed = parseCellKey(selectedCell);
    if (!parsed) return;

    let { row, col } = parsed;

    if (editingCell) {
      if (e.key === "Enter") {
        e.preventDefault();
        commitEdit();
        // Move down after enter
        const newKey = getCellKey(Math.min(row + 1, INITIAL_ROWS - 1), col);
        setSelectedCell(newKey);
        setSelectionStart(newKey);
        setSelectionEnd(null);
      } else if (e.key === "Escape") {
        setEditingCell(null);
        setEditValue("");
      } else if (e.key === "Tab") {
        e.preventDefault();
        commitEdit();
        const newKey = getCellKey(row, Math.min(col + 1, INITIAL_COLS - 1));
        setSelectedCell(newKey);
        setSelectionStart(newKey);
        setSelectionEnd(null);
      }
      return;
    }

    // Navigation
    if (e.key === "ArrowUp") {
      e.preventDefault();
      row = Math.max(0, row - 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      row = Math.min(INITIAL_ROWS - 1, row + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      col = Math.max(0, col - 1);
    } else if (e.key === "ArrowRight" || e.key === "Tab") {
      e.preventDefault();
      col = Math.min(INITIAL_COLS - 1, col + 1);
    } else if (e.key === "Enter" && !readOnly) {
      e.preventDefault();
      handleCellDoubleClick(selectedCell);
      return;
    } else if ((e.key === "Delete" || e.key === "Backspace") && !readOnly) {
      e.preventDefault();
      // Delete selected cells
      if (selectionStart && selectionEnd) {
        const start = parseCellKey(selectionStart);
        const end = parseCellKey(selectionEnd);
        if (start && end) {
          setCells((prev) => {
            const newCells = { ...prev };
            for (
              let r = Math.min(start.row, end.row);
              r <= Math.max(start.row, end.row);
              r++
            ) {
              for (
                let c = Math.min(start.col, end.col);
                c <= Math.max(start.col, end.col);
                c++
              ) {
                delete newCells[getCellKey(r, c)];
              }
            }
            return newCells;
          });
        }
      } else {
        setCells((prev) => {
          const newCells = { ...prev };
          delete newCells[selectedCell];
          return newCells;
        });
      }
      return;
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !readOnly) {
      // Start editing on any character key
      handleCellDoubleClick(selectedCell);
      setEditValue(e.key);
      return;
    }

    const newKey = getCellKey(row, col);
    if (e.shiftKey) {
      setSelectionEnd(newKey);
    } else {
      setSelectedCell(newKey);
      setSelectionStart(newKey);
      setSelectionEnd(null);
    }
  };

  const isInSelection = (cellKey: string): boolean => {
    if (!selectionStart) return false;
    if (!selectionEnd) return cellKey === selectionStart;

    const start = parseCellKey(selectionStart);
    const end = parseCellKey(selectionEnd);
    const current = parseCellKey(cellKey);

    if (!start || !end || !current) return false;

    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);

    return (
      current.row >= minRow &&
      current.row <= maxRow &&
      current.col >= minCol &&
      current.col <= maxCol
    );
  };

  return (
    <div
      className="flex flex-col h-full"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Formula bar */}
      <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 border-b border-gray-200">
        <span className="text-sm font-mono text-gray-600 w-12 text-center">
          {selectedCell || ""}
        </span>
        <div className="w-px h-5 bg-gray-300" />
        <input
          type="text"
          value={
            editingCell
              ? editValue
              : cells[selectedCell || ""]?.formula ||
                cells[selectedCell || ""]?.value ||
                ""
          }
          onChange={(e) => {
            if (readOnly) return;
            if (editingCell) {
              setEditValue(e.target.value);
            } else if (selectedCell) {
              handleCellDoubleClick(selectedCell);
              setEditValue(e.target.value);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitEdit();
            }
          }}
          className="flex-1 px-2 py-1 text-sm font-mono border-none outline-none bg-transparent"
          placeholder={
            readOnly
              ? ""
              : "Entrez une valeur ou une formule (=SUM, =AVERAGE...)"
          }
          readOnly={readOnly}
        />
      </div>

      {/* Grid */}
      <div ref={gridRef} className="flex-1 overflow-auto">
        <table className="border-collapse min-w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 w-10 min-w-10 h-7 bg-gray-100 border border-gray-300 text-xs text-gray-500" />
              {Array.from({ length: INITIAL_COLS }, (_, i) => (
                <th
                  key={i}
                  className="w-24 min-w-24 h-7 bg-gray-100 border border-gray-300 text-xs font-medium text-gray-600"
                >
                  {getColumnLabel(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: INITIAL_ROWS }, (_, rowIndex) => (
              <tr key={rowIndex}>
                <td className="sticky left-0 z-10 w-10 min-w-10 h-7 bg-gray-100 border border-gray-300 text-xs text-gray-500 text-center font-medium">
                  {rowIndex + 1}
                </td>
                {Array.from({ length: INITIAL_COLS }, (_, colIndex) => {
                  const cellKey = getCellKey(rowIndex, colIndex);
                  const isSelected = selectedCell === cellKey;
                  const isEditing = editingCell === cellKey;
                  const inSelection = isInSelection(cellKey);
                  const cell = cells[cellKey];
                  const displayValue = cell ? calculateValue(cellKey) : "";

                  return (
                    <td
                      key={colIndex}
                      className={`
                        w-24 min-w-24 h-7 border border-gray-200 p-0 relative
                        ${isSelected ? "outline-2 outline-blue-500 z-10" : ""}
                        ${inSelection && !isSelected ? "bg-blue-50" : ""}
                        ${!isSelected && !inSelection ? "hover:bg-gray-50" : ""}
                      `}
                      onClick={(e) => handleCellClick(cellKey, e)}
                      onDoubleClick={() => handleCellDoubleClick(cellKey)}
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="absolute inset-0 w-full h-full px-1 text-sm font-mono border-none outline-none bg-white"
                          onBlur={commitEdit}
                        />
                      ) : (
                        <span className="block px-1 text-sm truncate">
                          {displayValue}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
