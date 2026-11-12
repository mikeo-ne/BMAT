import type { Metadata } from "next";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { ProofCard } from "@/components/site/ProofCard";

// One play, published by the song's owner. Private by default: only people with the link see it.
export const metadata: Metadata = {
  title: "Proof of airplay",
  description: "A song play detected by East Sound on Ugandan radio, with the station, the time and a 10-second audio clip.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Proof of airplay · East Sound",
    description: "Hear the 10-second clip East Sound recorded when this song played on air.",
  },
};

export default async function ProofPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
        <ProofCard token={token} />
      </main>
      <Footer />
    </>
  );
}
