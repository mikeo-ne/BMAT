import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The terms for using East Sound Technologies, the airplay monitoring service run by 7H Music Group Ltd in Kampala, Uganda.",
  alternates: { canonical: "/legal/terms" },
};

// DRAFT — for advocate review. Not legal advice.
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="7 November 2026">
      <p>
        These terms apply to everyone who uses East Sound Technologies (&ldquo;East Sound&rdquo;, &ldquo;we&rdquo;), the airplay
        monitoring service at eastsound.vercel.app, run by <strong>7H Music Group Ltd</strong>, Kampala, Uganda. By creating an
        account or using the site you agree to them.
      </p>

      <h2>1. Who owns what</h2>
      <ul>
        <li><strong>Your music stays yours.</strong> Uploading a song does not transfer any copyright, master or publishing right to us.</li>
        <li>
          You give East Sound a limited, non-exclusive licence to store the reference copy you upload and its audio fingerprint,
          only to recognise the song on air and show you the results. The licence ends when you delete the song or your account.
        </li>
        <li>
          The East Sound name, logo, software, design, charts, reports and data compilations belong to 7H Music Group Ltd and are
          protected by the Copyright and Neighbouring Rights Act 2006 and other laws. You may not copy, scrape, resell, or
          reverse-engineer them without written permission.
        </li>
      </ul>

      <h2>2. Your account</h2>
      <ul>
        <li>Give accurate details and keep your password private. You are responsible for activity on your account.</li>
        <li>Only upload music you own or are authorised to manage, with the correct ISRC and UPC codes from your distributor.</li>
        <li>Claiming a recording that isn&rsquo;t yours may lead to suspension and to the claim going to the rights-holder and the CMO.</li>
      </ul>

      <h2>3. What the service does, and its limits</h2>
      <ul>
        <li>East Sound monitors the radio stations listed on the site from their online streams. Coverage can change, and a station&rsquo;s stream can go offline.</li>
        <li>Detections are evidence produced by audio fingerprinting. They are accurate but not guaranteed to capture every play.</li>
        <li>Royalty figures in dashboards are <strong>estimates</strong> until a collective management organisation (such as UPRS) issues a final statement. East Sound does not collect or pay royalties.</li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>Don&rsquo;t misuse the service: no attempts to access other people&rsquo;s data, overload the system, scrape it automatically, or upload unlawful content.</p>

      <h2>5. Alerts</h2>
      <p>Airplay alerts are sent by email to the address you sign in with. You can change or switch them off under Alerts in your dashboard.</p>

      <h2>6. Liability</h2>
      <p>
        The service is provided as it is. To the extent the law allows, 7H Music Group Ltd is not liable for indirect losses, lost
        royalties or lost profits, and our total liability is limited to the fees you paid us in the 12 months before the claim.
      </p>

      <h2>7. Ending your account</h2>
      <p>You can stop using East Sound at any time. We may suspend accounts that break these terms, after notice where possible.</p>

      <h2>8. Law and disputes</h2>
      <p>
        These terms are governed by the laws of Uganda, including the Contracts Act 2010. Disputes will first be referred to
        arbitration under the Arbitration and Conciliation Act before any other step.
      </p>

      <h2>9. Contact</h2>
      <p>7H Music Group Ltd · Kampala, Uganda · <span className="select-all">7hmusicgroupug@gmail.com</span></p>
    </LegalPage>
  );
}
