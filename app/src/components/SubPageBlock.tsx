import { Link } from "react-router-dom";
import { docTypeStyles } from "../utils/docTypes";

export interface SubPage {
  id: number;
  title: string;
  type: keyof typeof docTypeStyles;
}

interface SubPageBlockProps {
  /** Undefined when the referenced page no longer is a child (deleted or moved). */
  page?: SubPage;
  onDelete?: () => void;
}

const pageIcon = "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5";

/** Notion-style link to a sub-page, rendered from a `::page[id]::` block. */
export const SubPageBlock = ({ page, onDelete }: SubPageBlockProps) => {
  const style = page ? (docTypeStyles[page.type] ?? docTypeStyles.TEXT) : null;
  return (
    <div className="group relative my-1 flex items-center" onClick={(event) => event.stopPropagation()}>
      {page && style ? (
        <Link
          to={`/document/${page.id}`}
          className="flex min-h-11 flex-1 items-center gap-3 rounded-[10px] px-2 py-1.5 text-ink transition hover:bg-chip"
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${style.chip}`}>
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d={pageIcon} />
            </svg>
          </span>
          <span className="truncate font-medium underline decoration-line-strong decoration-1 underline-offset-4 group-hover:decoration-muted">
            {page.title || "Sans titre"}
          </span>
        </Link>
      ) : (
        <span className="flex min-h-11 flex-1 items-center gap-3 rounded-[10px] px-2 py-1.5 text-muted">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-chip">
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d={pageIcon} />
            </svg>
          </span>
          Page introuvable ou déplacée
        </span>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Retirer le lien vers la sous-page"
          title="Retirer le lien (la sous-page est conservée)"
          className="icon-btn absolute right-1 h-8 w-8 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
        >
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </div>
  );
};
