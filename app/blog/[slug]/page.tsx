import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { POSTS } from "@/lib/data/public";

export function generateStaticParams() {
  return (POSTS || []).map((p) => ({ slug: p.slug }));
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = (POSTS || []).find((p) => p.slug === slug);
  if (!post) notFound();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <Link href="/blog" className="text-sm text-emerald-400 hover:text-emerald-300">
          ← All articles
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-emerald-400">{post.category}</p>
        <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{post.title}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {post.date} · {post.minutes} min read
        </p>
        <div className="mt-8 space-y-5 text-lg leading-relaxed text-slate-300">
          {(post.body || []).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
