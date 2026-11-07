import type { Metadata } from "next";
import { og } from "@/lib/seo";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { BlogHub } from "@/components/site/BlogHub";

export const metadata: Metadata = {
  title: "Blog — Airplay, Royalties and the Ugandan Music Business",
  description:
    "Guides and updates on radio airplay, proof of play, music royalties, charts and copyright for Ugandan artists, labels, broadcasters and venues.",
  alternates: { canonical: "/blog" },
  openGraph: og(
    "/blog",
    "East Sound Blog — Airplay, Royalties and the Ugandan Music Business",
    "Guides and updates on radio airplay, proof of play, music royalties, charts and copyright in Uganda.",
  ),
};

export default function BlogPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <BlogHub />
      </main>
      <Footer />
    </>
  );
}
