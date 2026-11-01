import type { ReactNode } from "react";
export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <p className="eyebrow flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          {eyebrow}
        </p>
        <h2 className="mt-2 text-[27px] font-semibold leading-tight tracking-[-0.035em] sm:text-[32px]">
          {title}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-muted sm:text-[13px]">
          {description}
        </p>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
