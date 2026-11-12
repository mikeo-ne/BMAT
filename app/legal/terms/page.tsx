import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The terms for using East Sound Technologies, the airplay monitoring service run by 7H Music Group Ltd in Kampala, Uganda.",
  alternates: { canonical: "/legal/terms" },
};

// DRAFT — for advocate review. Not legal advice. Version 2026-11-12 (lib/legal.ts TERMS_VERSION).
// RISK: the evidence-clip licence (s.6) and public proof links rely on broadcaster consent and on fair-dealing arguments under
// the Copyright and Neighbouring Rights Act 2006 (as amended in 2026) — confirm both with an advocate before scaling.
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="12 November 2026 · Version 2026-11-12">
      <p>
        These terms are an agreement between you and <strong>7H Music Group Ltd</strong>, Kampala, Uganda (&ldquo;East Sound&rdquo;,
        &ldquo;we&rdquo;), which runs East Sound Technologies at eastsound.vercel.app. By creating an account or using the service you
        agree to them and to our <Link href="/legal/privacy">Privacy Notice</Link>. If you use East Sound for a company, label,
        station or society, you confirm you may bind it to these terms.
      </p>

      <h2>1. Who may use East Sound</h2>
      <ul>
        <li>You must be <strong>18 or older</strong>. Artists under 18 must be registered by a parent, guardian or label that accepts these terms for them.</li>
        <li>Give accurate details and keep your login private. You are responsible for what happens on your account.</li>
        <li>Collecting society (CMO) and broadcaster accounts are checked by East Sound before they can see data.</li>
      </ul>

      <h2>2. What East Sound does, and its limits</h2>
      <ul>
        <li>East Sound listens to the radio stations listed on the site through their online streams and recognises registered songs by audio fingerprinting.</li>
        <li>Coverage changes, and streams go offline. Detections are evidence, not a guarantee that every play was captured.</li>
        <li>Royalty figures shown are <strong>estimates</strong>. East Sound does not collect, hold or pay royalties; collecting societies such as UPRS do.</li>
        <li>Features marked &ldquo;coming soon&rdquo; or &ldquo;preview&rdquo; may change or be withdrawn.</li>
      </ul>

      <h2>3. Your music stays yours</h2>
      <ul>
        <li>Uploading a song transfers <strong>no copyright, master or publishing right</strong> to us.</li>
        <li>
          You give East Sound a non-exclusive, royalty-free licence, only for running the service, to store the listening copy you upload,
          create its fingerprint, recognise it on air, and show the results to you and to the people the service is built for (for example
          the collecting society that pays your royalties). The licence ends when you delete the song or your account, except for records
          we must keep (section 10).
        </li>
        <li>Song details you add from streaming links are suggestions. You must check them before saving.</li>
      </ul>

      <h2>4. What you promise about the music you upload</h2>
      <ul>
        <li>You own the song, or you are authorised by everyone who does, to register it for monitoring.</li>
        <li>The title, writers, splits, ISRC and UPC you give are correct to the best of your knowledge, and come from your distributor where they exist.</li>
        <li>You will not register a song to claim plays or money that belong to someone else.</li>
        <li>
          If a claim that you broke these promises is made against East Sound, you will cover our reasonable costs of dealing with it, up to
          the amount you paid us in the previous 12 months plus any amount a court or arbitrator orders.
        </li>
      </ul>

      <h2>5. Copyright complaints and takedown</h2>
      <p>
        Anyone can report a song uploaded without the right to it through our <Link href="/legal/copyright">Copyright and takedown
        policy</Link>. We may hide a disputed song while we review a report, ask you for evidence of your rights, and remove songs or close
        accounts that break these terms.
      </p>

      <h2>6. Evidence clips and proof links</h2>
      <ul>
        <li>When a song is detected, East Sound keeps a short clip of the broadcast (about 10 seconds) as evidence of the play.</li>
        <li>Clips are shown only to the song&apos;s owners, the broadcaster that aired it and authorised collecting societies, unless the owner creates a public proof link.</li>
        <li>Proof links are for evidence and promotion of that single play. They must not be used to redistribute broadcasts. A broadcaster can ask us to remove a clip from a public link.</li>
      </ul>

      <h2>7. Broadcasters</h2>
      <p>
        Stations that claim their station on East Sound agree that their public stream may be monitored and short evidence clips kept as
        described above, and may download cue sheets and playout logs for their own reporting.
      </p>

      <h2>8. What you may not do</h2>
      <ul>
        <li>Access other people&apos;s data, test or break our security, or overload the service.</li>
        <li>Scrape, copy, resell or build a competing database from East Sound&apos;s data, charts or reports without written permission.</li>
        <li>Upload anything unlawful, or use the service to harass or mislead anyone.</li>
      </ul>

      <h2>9. Our rights</h2>
      <p>
        The East Sound name and logo, the software, the fingerprinting system, the design, charts, reports and data compilations belong to
        7H Music Group Ltd and are protected under the Copyright and Neighbouring Rights Act 2006 (as amended in 2026) and other law.
      </p>

      <h2>10. Ending your account</h2>
      <ul>
        <li>You can ask to delete your account at any time from &ldquo;Your data&rdquo; in your dashboard. We complete deletions within 30 days.</li>
        <li>We may suspend or close accounts that break these terms, with notice where possible and a chance to respond, except where there is a risk to others.</li>
        <li>We keep only what we must after closure: records needed for open disputes, accounting, or legal requirements, without your login.</li>
        <li>Sections 3–4, 6, 9, 11 and 12 continue after your account ends.</li>
      </ul>

      <h2>11. Liability</h2>
      <p>
        The service is provided as it is. To the extent the law allows, 7H Music Group Ltd is not liable for indirect loss, lost royalties
        or lost profits. Our total liability to you is limited to the fees you paid us in the 12 months before the claim. Nothing here limits
        liability that cannot be limited under Ugandan law.
      </p>

      <h2>12. Law and disputes</h2>
      <p>
        These terms are governed by the laws of Uganda, including the Contracts Act 2010. Before going to court, both sides will try to settle
        a dispute by talking for 14 days, then by arbitration in Kampala under the Arbitration and Conciliation Act. We will not close an
        account for a disputed matter until that process has run, except where there is a risk to others.
      </p>

      <h2>13. Changes</h2>
      <p>
        If we change these terms in a way that matters, we will tell you in your dashboard and ask you to accept the new version. Paid plans
        will not change price without notice and will not renew automatically.
      </p>

      <h2>14. Contact</h2>
      <p>7H Music Group Ltd · Kampala, Uganda · <span className="select-all">7hmusicgroupug@gmail.com</span></p>
    </LegalPage>
  );
}
