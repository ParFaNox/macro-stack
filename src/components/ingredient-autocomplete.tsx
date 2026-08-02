"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Plus } from "lucide-react";

interface Suggestion {
  label: string;
  family?: string;
  hint: string;
  auditable: boolean;
}

/**
 * Predictive autocomplete for the stack builder.
 *
 * A native <datalist> was not enough: it gives no ranking, no secondary line,
 * and no way to show that a supplement is recognised but not yet priceable.
 * This queries /api/ingredients as you type, debounced, and supports keyboard
 * navigation because a search box you cannot drive from the keyboard is
 * annoying to demo.
 */
export function IngredientAutocomplete({
  onAdd,
  existing,
}: {
  onAdd: (item: string) => void;
  existing: string[];
}) {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced so a fast typist doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ingredients?q=${encodeURIComponent(value)}`);
        const body = await res.json();
        setSuggestions((body.suggestions ?? []).filter((s: Suggestion) => !existing.includes(s.label)));
        setActive(0);
      } catch {
        setSuggestions([]);
      }
    }, 120);
    return () => clearTimeout(id);
  }, [value, existing]);

  // Close when focus leaves the component entirely.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const commit = useCallback(
    (item: string) => {
      if (!item.trim()) return;
      onAdd(item.trim());
      setValue("");
      setOpen(false);
    },
    [onAdd],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        commit(value);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(suggestions[active]?.label ?? value);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-[#646473] pointer-events-none" />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search supplements — try “wey” or “citrul”"
          role="combobox"
          aria-label="Search supplements"
          aria-autocomplete="list"
          aria-controls="ingredient-suggestions"
          aria-expanded={open}
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#08080a] border border-[#22222c] text-white placeholder-[#646473] text-xs focus:outline-none focus:border-cyan-400 transition-colors font-medium"
        />

        {open && suggestions.length > 0 && (
          <ul
            id="ingredient-suggestions"
            role="listbox"
            className="absolute z-30 left-0 right-0 mt-1 rounded-xl bg-[#121217] border border-[#22222c] shadow-2xl overflow-hidden"
          >
            {suggestions.map((s, i) => (
              <li key={s.label}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => commit(s.label)}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    i === active ? "bg-cyan-500/10" : "hover:bg-[#1a1a22]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold text-white truncate">{s.label}</span>
                    <span className="block text-[10px] text-[#646473] truncate">{s.hint}</span>
                  </span>
                  <span
                    className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                      s.auditable
                        ? "text-cyan-300 border-cyan-400/30 bg-cyan-500/10"
                        : "text-amber-300/80 border-amber-400/25 bg-amber-500/10"
                    }`}
                  >
                    {s.auditable ? "auditable" : "no data"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => commit(value)}
        className="px-3 py-2 rounded-lg bg-white hover:bg-slate-200 text-slate-950 font-bold text-xs transition-all cursor-pointer flex items-center gap-1 shrink-0"
      >
        <Plus className="w-3.5 h-3.5" /> Add
      </button>
    </div>
  );
}
