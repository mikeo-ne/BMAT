import Link from "next/link";
import { POSTS } from "@/lib/data/public";

type Block = { kind: "h2"; text: string } | { kind: "p"; text: string } | { kind: "ul"; items: string[] };

/** "## " heading, "- " bullet (consecutive bullets form one list), anything else a paragraph. */
export function toBlocks(lines: string[]): Block[] {
  const out: Block[] = [];
  for (const line of lines) {
    if (line.startsWith("## ")) out.push({ kind: "h2", text: line.slice(3) });
    else if (line.startsWith("- ")) {
      const last = out[out.length - 1];
      if (last?.kind === "ul") last.items.push(line.slice(2));
      else out.push({ kind: "ul", items: [line.slice(2)] });
    } else out.push({ kind: "p", text: line });
  }
  return out;
}

export function ArticleBody({ lines }: { lines: string[] }) {
  return (
    <div className="mt-8 space-y-5 text-lg leading-relaxed text-slate-300">
      {toBlocks(lines).map((b, i) =>
        b.kind === "h2" ? (
          <h2 key={i} className="!mt-10 text-2xl font-bold text-white">{b.text}</h2>
        ) : b.kind === "ul" ? (
          <ul key={i} className="list-disc space-y-2 pl-6 marker:text-emerald-400">
            {b.items.map((it, j) => <li key={j}>{it}</li>)}
          </ul>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </div>
  );
}

/** Internal links between guides help readers and search engines find the rest. */
export function RelatedPosts({ current }: { current: string }) {
  const guides = POSTS.filter((p) => p.category === "Guides" && p.slug !== current).slice(0, 3);
  if (!guides.length) return null;
  return (
    <section className="mt-12 border-t border-slate-800 pt-6">
      <h2 className="text-lg font-bold text-white">More guides</h2>
      <ul className="mt-4 space-y-3">
        {guides.map((p) => (
          <li key={p.slug}>
            <Link href={`/blog/${p.slug}`} className="font-semibold text-emerald-400 hover:text-emerald-300">{p.title}</Link>
            <p className="text-sm text-slate-400">{p.excerpt}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
