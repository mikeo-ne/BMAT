import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import {
  ARTICLES,
  type ArticleBlock,
} from "@/lib/site-content";

export function generateStaticParams() {
  return ARTICLES.map((article) => ({ slug: article.slug }));
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return params.then(({ slug }) => {
    const article = ARTICLES.find((a) => a.slug === slug);
    return {
      title: article?.title,
      description: article?.excerpt,
    };
  });
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = ARTICLES.find((a) => a.slug === slug);
  if (!article) notFound();

  const related = ARTICLES.filter(
    (a) => a.slug !== article.slug && a.category === article.category,
  ).slice(0, 2);
  const fallbackRelated = ARTICLES.filter(
    (a) => a.slug !== article.slug && !related.includes(a),
  ).slice(0, 2 - related.length);
  const siblings = [...related, ...fallbackRelated];

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 lg:px-8 lg:py-16">
      <Link
        href="/blog"
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 text-sm font-bold text-slate-300 transition-colors hover:border-emerald-400/40 hover:text-emerald-300"
      >
        <ArrowLeft className="h-4 w-4" />
        All articles
      </Link>

      <header className="mt-8">
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-300">
          {article.category}
        </span>
        <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
          {article.title}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-400">
          {article.excerpt}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-y border-slate-800 py-4 text-xs text-slate-500">
          <span className="font-semibold text-slate-400">{article.author}</span>
          <span aria-hidden="true">·</span>
          <span>{article.authorRole}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={article.date}>
            {new Intl.DateTimeFormat("en-GB", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              timeZone: "Africa/Nairobi",
            }).format(new Date(`${article.date}T00:00:00+03:00`))}
          </time>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {article.readMinutes} min read
          </span>
        </div>
      </header>

      <div
        className={`relative mt-8 h-48 overflow-hidden rounded-3xl bg-gradient-to-br ${article.cover} sm:h-56`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(52,211,153,0.15),transparent_45%)]" />
      </div>

      <div className="mt-10 space-y-8">
        {article.body.map((block, index) => (
          <BlockRenderer key={index} block={block} />
        ))}
      </div>

      <div className="mt-10 flex flex-wrap gap-2">
        {article.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs font-semibold text-slate-400"
          >
            #{tag}
          </span>
        ))}
      </div>

      {siblings.length > 0 && (
        <section className="mt-14 border-t border-slate-800 pt-10">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            More from the panel
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {siblings.map((sibling) => (
              <Link
                key={sibling.slug}
                href={`/blog/${sibling.slug}`}
                className="group flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition-colors hover:border-emerald-400/25"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  {sibling.category}
                </span>
                <h3 className="mt-2 text-sm font-bold leading-snug text-white">
                  {sibling.title}
                </h3>
                <p className="mt-2 flex-1 text-xs leading-relaxed text-slate-400">
                  {sibling.excerpt}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function BlockRenderer({ block }: { block: ArticleBlock }) {
  switch (block.type) {
    case "heading":
      return (
        <h2 className="text-2xl font-extrabold tracking-tight text-white">
          {block.text}
        </h2>
      );
    case "paragraph":
      return (
        <p className="text-base leading-relaxed text-slate-300">{block.text}</p>
      );
    case "list":
      return (
        <ul className="space-y-2.5">
          {block.items.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-300"
            >
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              {item}
            </li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <p className="text-lg font-semibold leading-relaxed text-emerald-200">
            &ldquo;{block.text}&rdquo;
          </p>
          {block.cite && (
            <footer className="mt-3 text-xs text-slate-500">
              {block.cite}
            </footer>
          )}
        </blockquote>
      );
    case "callout":
      return (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6">
          <p className="text-base font-semibold leading-relaxed text-emerald-200">
            {block.text}
          </p>
        </div>
      );
  }
}
