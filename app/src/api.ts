export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// Debug: affiche l'URL de l'API dans la console
console.log("[API] URL configured:", API_URL);
console.log("[API] VITE_API_URL env:", import.meta.env.VITE_API_URL);

export async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  return fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });
}
