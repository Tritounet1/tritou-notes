import { AiChat } from "./components/AiChat";

/** Global assistant: conversations not tied to a page; tools still reach every page. */
export const AssistantPage = () => (
  <div className="mx-auto flex h-[calc(100vh-20px)] max-w-[860px] flex-col gap-4 px-6 pt-10 pb-4 sm:px-10">
    <header className="flex items-center gap-3">
      <span aria-hidden="true" className="flex h-12 w-12 -rotate-6 items-center justify-center rounded-[14px] bg-ink text-neon">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z" />
          <path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" />
        </svg>
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="page-title text-[36px]">Assistant</h1>
        <p className="text-[15px] text-ink-2">Cherche, crée et modifie tes pages en discutant.</p>
      </div>
    </header>
    <AiChat documentId={null} variant="page" />
  </div>
);
