import type { Metadata } from "next";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { BlogHub } from "@/components/site/BlogHub";

export const metadata: Metadata = { title: "Blog" };

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
