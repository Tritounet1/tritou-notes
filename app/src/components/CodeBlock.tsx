import { languages } from "@codemirror/language-data";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import CodeMirror, { type ReactCodeMirrorProps } from "@uiw/react-codemirror";
import { useEffect, useRef, useState } from "react";

const options = [
  ["", "Texte brut"], ["javascript", "JavaScript"], ["typescript", "TypeScript"],
  ["jsx", "JSX"], ["tsx", "TSX"], ["python", "Python"], ["html", "HTML"],
  ["css", "CSS"], ["json", "JSON"], ["sql", "SQL"], ["shell", "Shell / Bash"],
  ["java", "Java"], ["c", "C"], ["cpp", "C++"], ["csharp", "C#"],
  ["php", "PHP"], ["go", "Go"], ["rust", "Rust"], ["ruby", "Ruby"],
  ["yaml", "YAML"], ["markdown", "Markdown"], ["xml", "XML"],
];
const aliases: Record<string, string> = {
  js: "javascript", ts: "typescript", py: "python", sh: "shell", bash: "shell",
  zsh: "shell", yml: "yaml", md: "markdown", cs: "csharp", "c#": "csharp", "c++": "cpp",
};

interface CodeBlockProps {
  value: string;
  language: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  onFocus?: () => void;
  onChange?: (value: string, language: string) => void;
  onDelete?: () => void;
}

export function CodeBlock({ value, language, readOnly = false, autoFocus, onFocus, onChange, onDelete }: CodeBlockProps) {
  const selected = aliases[language.toLowerCase()] ?? language.toLowerCase();
  const [loaded, setLoaded] = useState<{ language: string; extensions: ReactCodeMirrorProps["extensions"]; failed: boolean }>();
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const description = languages.find(item =>
      item.name.toLowerCase() === selected || item.alias.some(alias => alias.toLowerCase() === selected),
    );
    (async () => {
      try {
        const support = description ? await description.load() : await Promise.resolve(undefined);
        if (active) setLoaded({ language: selected, extensions: support ? [support] : [], failed: false });
      } catch {
        if (active) setLoaded({ language: selected, extensions: [], failed: true });
      }
    })();
    return () => { active = false; };
  }, [selected]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // HTTP deployments may not expose the Clipboard API.
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        const focused = document.activeElement;
        try {
          textarea.select();
          if (!document.execCommand("copy")) throw new Error("Copie impossible");
        } finally {
          textarea.remove();
          if (focused instanceof HTMLElement) focused.focus();
        }
      }
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopyStatus("idle"), 2500);
  };

  return (
    <section className="document-code-block relative my-4 rounded-[14px] bg-[#202020]" aria-label="Bloc de code">
      <div className="flex justify-end px-2 pt-2">
        <div className="flex h-9 items-center rounded-lg border border-[#383838] bg-[#232323] p-0.5 text-[#a0a0a0]">
          <div className="relative flex items-center">
            <select
              aria-label="Langage du bloc de code"
              value={selected}
              disabled={readOnly}
              onChange={event => onChange?.(value, event.target.value)}
              className="h-7 max-w-44 appearance-none rounded-md bg-transparent py-1 pl-2 pr-7 text-sm outline-none transition hover:bg-white/5 focus-visible:ring-1 focus-visible:ring-gray-500 disabled:cursor-default"
            >
              {!options.some(([id]) => id === selected) && <option value={selected}>{language}</option>}
              {options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <svg aria-hidden="true" className="pointer-events-none absolute right-2 h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 9 6 6 6-6" /></svg>
          </div>
          <span aria-hidden="true" className="mx-1 h-4 w-px bg-[#383838]" />
          <button
            type="button"
            onClick={() => void copy()}
            title={copyStatus === "copied" ? "Copié !" : "Copier"}
            className="flex h-7 w-8 items-center justify-center rounded-md transition hover:bg-white/10 hover:text-gray-200 focus-visible:outline-1 focus-visible:outline-gray-500"
            aria-label={copyStatus === "copied" ? "Code copié" : "Copier tout le code"}
          >
            {copyStatus === "copied" ? (
              <svg aria-hidden="true" className="h-4 w-4 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m5 12 4 4L19 6" /></svg>
            ) : (
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>
            )}
          </button>
          {onDelete && (
            <details className="relative">
              <summary aria-label="Options du bloc de code" title="Options" className="flex h-7 w-8 cursor-pointer list-none items-center justify-center rounded-md transition hover:bg-white/10 hover:text-gray-200 focus-visible:outline-1 focus-visible:outline-gray-500 [&::-webkit-details-marker]:hidden">
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
              </summary>
              <div className="absolute right-0 top-9 z-20 w-48 rounded-lg border border-[#383838] bg-[#252525] p-1 shadow-xl">
                <button type="button" onClick={onDelete} className="w-full rounded-md px-3 py-2 text-left text-xs text-red-300 hover:bg-white/5">Supprimer le bloc</button>
              </div>
            </details>
          )}
        </div>
      </div>
      <CodeMirror
        value={value}
        theme={vscodeDark}
        extensions={loaded?.language === selected ? loaded.extensions : []}
        readOnly={readOnly}
        editable={!readOnly}
        autoFocus={autoFocus}
        onFocus={onFocus}
        onChange={code => onChange?.(code, language)}
        minHeight="85px"
        maxHeight="600px"
        aria-label="Contenu du bloc de code"
        basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false }}
      />
      <p role="status" aria-live="polite" className={copyStatus === "error" || loaded?.failed ? "px-3 py-2 text-xs text-amber-300" : "sr-only"}>
        {copyStatus === "error" ? "La copie a échoué. Sélectionnez le code pour le copier manuellement." : copyStatus === "copied" ? "Code copié dans le presse-papiers." : loaded?.failed ? "Coloration indisponible pour ce langage." : ""}
      </p>
    </section>
  );
}
