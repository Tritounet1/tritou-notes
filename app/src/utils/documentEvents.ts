// Lets the sidebar tree refresh when pages are created, renamed, moved or deleted.
export const DOCUMENTS_CHANGED = "tritou:documents-changed";

export const notifyDocumentsChanged = () => window.dispatchEvent(new Event(DOCUMENTS_CHANGED));
