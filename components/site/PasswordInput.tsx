"use client";

import { useState, type InputHTMLAttributes, type Ref } from "react";

/** Password field with a Show / Hide button. Hidden again whenever the field is re-mounted. */
export function PasswordInput({ inputRef, className = "input", ...props }: InputHTMLAttributes<HTMLInputElement> & { inputRef?: Ref<HTMLInputElement> }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} ref={inputRef} type={shown ? "text" : "password"} className={`${className} pr-16`} autoCapitalize="none" spellCheck={false} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        aria-label={shown ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex items-center gap-1 px-3 text-xs font-semibold text-slate-400 hover:text-emerald-300"
      >
        {shown ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 9 4.5 10 7a13 13 0 01-3.2 4.3M6.6 6.6C4.4 8 2.8 10 2 12c1 2.5 5 7 10 7 1.6 0 3-.4 4.4-1" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
        )}
        <span>{shown ? "Hide" : "Show"}</span>
      </button>
    </div>
  );
}
