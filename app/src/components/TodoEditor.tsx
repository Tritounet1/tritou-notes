import { useEffect, useState } from "react";

interface TodoItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  createdAt: string;
}

interface TodoData {
  todos: TodoItem[];
}

interface TodoEditorProps {
  data: string;
  onChange: (data: string) => void;
  readOnly?: boolean;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export const TodoEditor = ({ data, onChange, readOnly = false }: TodoEditorProps) => {
  const [todos, setTodos] = useState<TodoItem[]>(() => {
    try {
      const parsed: TodoData = data ? JSON.parse(data) : { todos: [] };
      return parsed.todos || [];
    } catch {
      return [];
    }
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Sync changes to parent
  useEffect(() => {
    const jsonData = JSON.stringify({ todos });
    if (jsonData !== data) {
      onChange(jsonData);
    }
  }, [todos, data, onChange]);

  const handleAddTodo = () => {
    if (readOnly) return;
    const newTodo: TodoItem = {
      id: generateId(),
      title: "",
      description: "",
      completed: false,
      createdAt: new Date().toISOString(),
    };
    setTodos([...todos, newTodo]);
    setEditingId(newTodo.id);
    setEditTitle("");
    setEditDescription("");
  };

  const handleToggleComplete = (id: string) => {
    if (readOnly) return;
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };

  const handleStartEdit = (todo: TodoItem) => {
    if (readOnly) return;
    setEditingId(todo.id);
    setEditTitle(todo.title);
    setEditDescription(todo.description);
  };

  const handleSaveEdit = () => {
    if (!editingId) return;

    // Si le titre est vide, supprimer la todo
    if (!editTitle.trim()) {
      setTodos(todos.filter(todo => todo.id !== editingId));
    } else {
      setTodos(todos.map(todo =>
        todo.id === editingId
          ? { ...todo, title: editTitle.trim(), description: editDescription.trim() }
          : todo
      ));
    }
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
  };

  const handleCancelEdit = () => {
    // Si c'est une nouvelle todo sans titre, la supprimer
    const todo = todos.find(t => t.id === editingId);
    if (todo && !todo.title.trim()) {
      setTodos(todos.filter(t => t.id !== editingId));
    }
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
  };

  const handleDeleteTodo = (id: string) => {
    if (readOnly) return;
    setTodos(todos.filter(todo => todo.id !== id));
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== draggingId) setDragOverId(id);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggingId || draggingId === targetId) return;
    const fromIndex = todos.findIndex((t) => t.id === draggingId);
    const toIndex = todos.findIndex((t) => t.id === targetId);
    const reordered = [...todos];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setTodos(reordered);
    setDraggingId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const completedCount = todos.filter(t => t.completed).length;
  const totalCount = todos.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header avec stats */}
      {totalCount > 0 && (
        <div className="pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[13px] text-muted">
              {completedCount} / {totalCount} terminées
            </span>
            <div className="w-32 h-1.5 bg-chip rounded-full overflow-hidden">
              <div
                className="h-full bg-neon-dot rounded-full transition-all duration-300"
                style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Liste des todos */}
      <div className="flex-1 overflow-y-auto">
        {todos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-muted">
            <svg aria-hidden="true" className="w-12 h-12 mb-3 text-line-strong" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="font-display text-lg font-semibold text-ink">Aucune tâche</p>
            <p className="text-sm">Ajoutez votre première tâche ci-dessous.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {todos.map((todo) => {
              const isDragging = draggingId === todo.id;
              const isDragOver = dragOverId === todo.id;
              const canDrag = !readOnly && editingId !== todo.id;

              return (
                <div
                  key={todo.id}
                  draggable={canDrag}
                  onDragStart={(e) => canDrag && handleDragStart(e, todo.id)}
                  onDragOver={(e) => handleDragOver(e, todo.id)}
                  onDrop={(e) => handleDrop(e, todo.id)}
                  onDragEnd={handleDragEnd}
                  className={`group bg-paper border rounded-2xl px-3.5 py-3 transition-all ${
                    isDragging ? "opacity-40 scale-[0.98]" : ""
                  } ${
                    isDragOver && !isDragging
                      ? "border-indigo ring-4 ring-indigo-tint"
                      : todo.completed
                        ? "border-line-soft bg-paper-warm"
                        : "border-line hover:border-line-strong hover:bg-paper-warm"
                  }`}
                >
                  {editingId === todo.id ? (
                    // Mode edition
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Titre de la tâche…"
                        aria-label="Titre de la tâche"
                        className="input"
                        autoFocus
                      />
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Description (optionnelle)…"
                        aria-label="Description de la tâche"
                        className="input py-2 resize-none"
                        rows={2}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={handleCancelEdit}
                          className="btn-secondary min-h-9"
                        >
                          Annuler
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="btn-primary min-h-9"
                        >
                          Enregistrer
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Mode affichage
                    <div className="flex gap-3 items-start">
                      {/* Poignée de déplacement */}
                      {!readOnly && (
                        <div
                          className="flex-shrink-0 mt-1 text-muted opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                          title="Déplacer"
                        >
                          <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                            <circle cx="5.5" cy="3.5" r="1.2" />
                            <circle cx="10.5" cy="3.5" r="1.2" />
                            <circle cx="5.5" cy="8" r="1.2" />
                            <circle cx="10.5" cy="8" r="1.2" />
                            <circle cx="5.5" cy="12.5" r="1.2" />
                            <circle cx="10.5" cy="12.5" r="1.2" />
                          </svg>
                        </div>
                      )}

                      {/* Checkbox */}
                      <button
                        onClick={() => handleToggleComplete(todo.id)}
                        disabled={readOnly}
                        role="checkbox"
                        aria-checked={todo.completed}
                        aria-label={todo.title || "Sans titre"}
                        className={`flex-shrink-0 w-[18px] h-[18px] mt-[3px] rounded-[6px] flex items-center justify-center transition ${
                          todo.completed
                            ? "bg-ink text-neon"
                            : "border-[1.5px] border-stone hover:border-ink"
                        } ${readOnly ? "cursor-default" : "cursor-pointer"}`}
                      >
                        {todo.completed && (
                          <svg aria-hidden="true" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="m5 12 5 5 9-10" />
                          </svg>
                        )}
                      </button>

                      {/* Contenu */}
                      <div
                        className={`flex-1 min-w-0 ${!readOnly ? "cursor-pointer" : ""}`}
                        onClick={() => !readOnly && handleStartEdit(todo)}
                      >
                        <p className={`font-medium leading-snug ${todo.completed ? "text-muted line-through" : "text-ink"}`}>
                          {todo.title || "Sans titre"}
                        </p>
                        {todo.description && (
                          <p className={`text-sm mt-1 ${todo.completed ? "text-muted" : "text-ink-2"}`}>
                            {todo.description}
                          </p>
                        )}
                        <p className="font-mono text-[11px] text-muted mt-1.5">
                          Créé le {formatDate(todo.createdAt)}
                        </p>
                      </div>

                      {/* Supprimer */}
                      {!readOnly && (
                        <button
                          onClick={() => handleDeleteTodo(todo.id)}
                          className="flex-shrink-0 w-8 h-8 -my-1 flex items-center justify-center rounded-lg text-muted hover:bg-danger-tint hover:text-danger-ink opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition"
                          title="Supprimer"
                          aria-label="Supprimer la tâche"
                        >
                          <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bouton ajouter */}
      {!readOnly && (
        <div className="pt-3">
          <button
            onClick={handleAddTodo}
            className="w-full py-3 border-[1.5px] border-dashed border-line-strong rounded-2xl text-muted hover:border-indigo hover:text-indigo-ink hover:bg-indigo-tint/50 transition-all flex items-center justify-center gap-2 group cursor-pointer"
          >
            <div className="w-7 h-7 rounded-[9px] bg-chip group-hover:bg-indigo group-hover:text-white flex items-center justify-center transition">
              <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="font-medium">Ajouter une tâche</span>
          </button>
        </div>
      )}
    </div>
  );
};
