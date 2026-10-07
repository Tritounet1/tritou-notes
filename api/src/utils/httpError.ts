/** An error whose message is meant for the client, with its HTTP status (see errorHandler). */
export const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });

export const notFound = (message: string) => httpError(message, 404);

/** Client-facing status and message for an error; internal details are never sent. */
export const toHttpError = (error: unknown): { status: number; message: string } => {
  const err = error as { status?: unknown; code?: unknown; name?: unknown; message?: unknown };
  // Errors created on purpose (httpError, body parser, OpenRouter…) carry a status and a safe message.
  if (typeof err?.status === "number") return { status: err.status, message: String(err.message || "Erreur") };
  if (err?.code === "P2025") return { status: 404, message: "Élément introuvable." };
  if (err?.code === "P2002") return { status: 409, message: "Cet élément existe déjà." };
  if (err?.code === "P2003") return { status: 409, message: "Cet élément est encore utilisé ailleurs." };
  // Invalid query arguments, e.g. a non-numeric id parsed to NaN.
  if (err?.name === "PrismaClientValidationError") return { status: 400, message: "Requête invalide." };
  return { status: 500, message: "Erreur interne du serveur." };
};
