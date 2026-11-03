"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Clock, Sparkles } from "lucide-react";
import {
  ARTICLES,
  ARTICLE_CATEGORIES,
  type Article,
  type ArticleCategory,
} from "@/lib/site-content";
import { useLanguage } from "@/components/language-provider";

const CATEGORY_STYLES: Record<ArticleCategory, string> = {
  "Airplay Charts": "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  "UPRS & Rights": "border-sky-500/30 bg-sky-500/10 text-sky-300",
  "Music Tech": "border-violet-500/30 bg-violet-500/10 text-violet-300",
  "Ad Auditing": "border-amber-500/30 bg-amber-500/10 text-amber-300",
};

export function BlogBrowser({ articles }: { articles: Article[] }) {
  const { t } = useLanguage();
  const [category, setCategory] = useState<ArticleCategory | "All">("All");

  const visible = useMemo(() => {
    const list =
      category === "All"
        ? articles
        : articles.filter((article) => article.category === category);
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [articles, category]);

  const [featured, ...rest] = visible;

  return (
    <div className="space-y-10">
      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        <CategoryPill
          active={category === "All"}
          onClick={() => setCategory("All")}
        >
          {t("blog.allArticles")}
        </CategoryPill>
        {ARTICLE_CATEGORIES.map((option) => (
          <CategoryPill
            key={option}
            active={category === option}
            onClick={() => setCategory(option)}
          >
            {option}
          </CategoryPill>
        ))}
      </div>

      {featured && <FeaturedCard article={featured} />}

      {rest.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryPill({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 rounded-full border px-4 text-xs font-bold transition-colors ${
        active
          ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-300"
          : "border-slate-700 bg-slate-900/60 text-slate-400 hover:border-slate-600 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function ArticleMeta({ article }: { article: Article }) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-3 text-xs text-slate-500">
      <span className="font-semibold text-slate-400">{article.author}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={article.date}>
        {new Intl.DateTimeFormat("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "Africa/Nairobi",
        }).format(new Date(`${article.date}T00:00:00+03:00`))}
      </time>
      <span aria-hidden="true">·</span>
      <span className="inline-flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {t("blog.minutes", { n: article.readMinutes })}
      </span>
    </div>
  );
}

function FeaturedCard({ article }: { article: Article }) {
  const { t } = useLanguage();
  return (
    <article className="group relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/40">
      <div className={`relative h-52 bg-gradient-to-br ${article.cover} sm:h-64`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(52,211,153,0.12),transparent_45%)]" />
        <span
          className={`absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold ${CATEGORY_STYLES[article.category]}`}
        >
          <Sparkles className="h-3 w-3" />
          {t("blog.featured")} · {article.category}
        </span>
      </div>
      <div className="p-6 sm:p-8">
        <h3 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          {article.title}
        </h3>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
          {article.excerpt}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <ArticleMeta article={article} />
          <Link
            href={`/blog/${article.slug}`}
            className="flex h-12 items-center gap-2 rounded-xl bg-emerald-400 px-5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-300"
          >
            {t("blog.readMore")}
          </Link>
        </div>
      </div>
    </article>
  );
}

function ArticleCard({ article }: { article: Article }) {
  const { t } = useLanguage();
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/40 transition-all duration-300 hover:-translate-y-1 hover:border-white/15 hover:shadow-xl hover:shadow-emerald-500/10">
      <Link
        href={`/blog/${article.slug}`}
        className={`relative h-36 bg-gradient-to-br ${article.cover}`}
      >
        <span
          className={`absolute left-3 top-3 rounded-full border px-2.5 py-1 text-[10px] font-bold ${CATEGORY_STYLES[article.category]}`}
        >
          {article.category}
        </span>
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-base font-bold leading-snug text-white">
          {article.title}
        </h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">
          {article.excerpt}
        </p>
        <ArticleMeta article={article} />
        <Link
          href={`/blog/${article.slug}`}
          className="mt-4 inline-flex h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 text-sm font-bold text-slate-200 transition-colors group-hover:border-emerald-400/40 group-hover:text-emerald-300"
        >
          {t("blog.readMore")}
        </Link>
      </div>
    </article>
  );
}

export { ARTICLES };
