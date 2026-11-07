import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { POSTS } from "@/lib/data/public";
import { ORG_NAME, SITE_NAME, abs, jsonLd, og } from "@/lib/seo";

export function generateStaticParams() {
  return (POSTS || []).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = (POSTS || []).find((p) => p.slug === slug);
  if (!post) return { title: "Article not found", robots: { index: false } };
  const url = `/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: url },
    openGraph: { ...og(url, post.title, post.excerpt, "article"), publishedTime: post.date, section: post.category },
    twitter: { card: "summary_large_image", title: post.title, description: post.excerpt },
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = (POSTS || []).find((p) => p.slug === slug);
  if (!post) notFound();

  return (
    <>
      <Header />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            description: post.excerpt,
            datePublished: post.date,
            articleSection: post.category,
            url: abs(`/blog/${post.slug}`),
            mainEntityOfPage: abs(`/blog/${post.slug}`),
            author: { "@type": "Organization", name: SITE_NAME },
            publisher: { "@type": "Organization", name: ORG_NAME, logo: { "@type": "ImageObject", url: abs("/icon.svg") } },
          }),
        }}
      />
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
