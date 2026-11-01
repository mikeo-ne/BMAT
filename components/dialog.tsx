"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Native modal focus containment, Escape dismissal and focus restoration. */
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (typeof dialog.close === "function") dialog.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-modal="true"
      className={`east-dialog ${wide ? "max-w-3xl" : "max-w-xl"}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-5">
        <h2 id={titleId} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          <X size={18} />
        </button>
      </div>
      <div className="p-6">{children}</div>
    </dialog>,
    document.body,
  );
}
