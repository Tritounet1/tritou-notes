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
    <section className="document-code-block relative my-4 rounded-[14px] bg-code" aria-label="Bloc de code">
      <div className="flex items-center justify-between gap-2 border-b border-code-line py-2 pr-3 pl-4">
        <label className="flex items-center gap-2 font-mono text-xs text-code-faint">
          Langage
          <span className="relative flex items-center">
            <select
              aria-label="Langage du bloc de code"
              value={selected}
              disabled={readOnly}
              onChange={event => onChange?.(value, event.target.value)}
              className="max-w-44 appearance-none rounded-md border border-code-line-strong bg-code-raised py-[3px] pr-6 pl-1.5 text-code-ink outline-none transition hover:border-code-edge focus-visible:border-indigo disabled:cursor-default disabled:opacity-100"
            >
              {!options.some(([id]) => id === selected) && <option value={selected}>{language}</option>}
              {options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <svg aria-hidden="true" className="pointer-events-none absolute right-1.5 h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </span>
        </label>
        <div className="flex items-center gap-0.5 text-code-faint">
          <button
            type="button"
            onClick={() => void copy()}
            title={copyStatus === "copied" ? "Copié !" : "Copier"}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-[7px] transition hover:bg-white/10 hover:text-code-ink focus-visible:outline-1 focus-visible:outline-code-faint"
            aria-label={copyStatus === "copied" ? "Code copié" : "Copier tout le code"}
          >
            {copyStatus === "copied" ? (
              <svg aria-hidden="true" className="h-[15px] w-[15px] text-neon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>
            ) : (
              <svg aria-hidden="true" className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>
            )}
          </button>
          {onDelete && (
            <details className="relative">
              <summary aria-label="Options du bloc de code" title="Options" className="flex h-[30px] w-[30px] cursor-pointer list-none items-center justify-center rounded-[7px] transition hover:bg-white/10 hover:text-code-ink focus-visible:outline-1 focus-visible:outline-code-faint [&::-webkit-details-marker]:hidden">
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
              </summary>
              <div className="absolute right-0 top-9 z-20 w-48 rounded-[10px] border border-code-line-strong bg-code-raised p-1 shadow-xl">
                <button type="button" onClick={onDelete} className="w-full cursor-pointer rounded-md px-3 py-2 text-left text-xs text-danger-on-dark hover:bg-white/5">Supprimer le bloc</button>
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
      <p role="status" aria-live="polite" className={copyStatus === "error" || loaded?.failed ? "px-4 py-2 font-mono text-xs text-neon" : "sr-only"}>
        {copyStatus === "error" ? "La copie a échoué. Sélectionnez le code pour le copier manuellement." : copyStatus === "copied" ? "Code copié dans le presse-papiers." : loaded?.failed ? "Coloration indisponible pour ce langage." : ""}
      </p>
    </section>
  );
}
