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
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              {completedCount} / {totalCount} terminees
            </span>
            <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Liste des todos */}
      <div className="flex-1 overflow-y-auto p-4">
        {todos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-lg">Aucune tache</p>
            <p className="text-sm">Cliquez sur + pour ajouter une tache</p>
          </div>
        ) : (
          <div className="space-y-3">
            {todos.map((todo) => (
              <div
                key={todo.id}
                className={`group bg-white border rounded-xl p-4 transition-all ${
                  todo.completed
                    ? "border-gray-200 bg-gray-50"
                    : "border-gray-200 hover:border-purple-300 hover:shadow-sm"
                }`}
              >
                {editingId === todo.id ? (
                  // Mode edition
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Titre de la tache..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      autoFocus
                    />
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Description (optionnel)..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                      rows={2}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={handleCancelEdit}
                        className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                      >
                        Enregistrer
                      </button>
                    </div>
                  </div>
                ) : (
                  // Mode affichage
                  <div className="flex gap-3">
                    {/* Checkbox */}
                    <button
                      onClick={() => handleToggleComplete(todo.id)}
                      disabled={readOnly}
                      className={`flex-shrink-0 w-6 h-6 mt-0.5 rounded-full border-2 flex items-center justify-center transition ${
                        todo.completed
                          ? "bg-purple-500 border-purple-500"
                          : "border-gray-300 hover:border-purple-400"
                      } ${readOnly ? "cursor-default" : "cursor-pointer"}`}
                    >
                      {todo.completed && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    {/* Contenu */}
                    <div
                      className={`flex-1 min-w-0 ${!readOnly ? "cursor-pointer" : ""}`}
                      onClick={() => !readOnly && handleStartEdit(todo)}
                    >
                      <p className={`font-medium ${todo.completed ? "text-gray-400 line-through" : "text-gray-900"}`}>
                        {todo.title || "Sans titre"}
                      </p>
                      {todo.description && (
                        <p className={`text-sm mt-1 ${todo.completed ? "text-gray-400" : "text-gray-500"}`}>
                          {todo.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        Cree le {formatDate(todo.createdAt)}
                      </p>
                    </div>

                    {/* Actions */}
                    {!readOnly && (
                      <button
                        onClick={() => handleDeleteTodo(todo.id)}
                        className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Supprimer"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bouton ajouter */}
      {!readOnly && (
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={handleAddTodo}
            className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50/50 transition-all flex items-center justify-center gap-2 group"
          >
            <div className="w-8 h-8 rounded-full bg-gray-100 group-hover:bg-purple-100 flex items-center justify-center transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="font-medium">Ajouter une tache</span>
          </button>
        </div>
      )}
    </div>
  );
};
