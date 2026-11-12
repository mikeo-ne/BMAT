import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Notice",
  description: "How East Sound Technologies collects, uses, stores and protects personal data under Uganda's Data Protection and Privacy Act, 2019.",
  alternates: { canonical: "/legal/privacy" },
};

// DRAFT — for advocate review. Not legal advice. Version 2026-11-12 (lib/legal.ts TERMS_VERSION).
// RISK: PDPO registration must be completed and its number added below; retention periods are commitments — keep them.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Notice" updated="12 November 2026 · Version 2026-11-12">
      <p>
        <strong>7H Music Group Ltd</strong> (Kampala, Uganda) runs East Sound Technologies and is the data controller for the personal data
        described here. We follow Uganda&apos;s <strong>Data Protection and Privacy Act, 2019</strong> and its 2021 Regulations.
        Registration with the Personal Data Protection Office (PDPO): <em>in progress — our number will appear here.</em>
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> name or organisation name, email, password (stored encrypted by our login provider), the type of account you chose.</li>
        <li><strong>Contact details you choose to add:</strong> a mobile number for alerts.</li>
        <li><strong>Your music and its details:</strong> listening copies you upload, their fingerprints, titles, writers, splits, ISRC, UPC and release dates.</li>
        <li><strong>Airplay records:</strong> when and where your songs were detected, with short broadcast clips as evidence.</li>
        <li><strong>Records of your choices:</strong> which version of these terms you accepted and when, alert settings, deletion requests.</li>
        <li><strong>Technical data:</strong> basic logs (time, page, device type, IP address) kept for security.</li>
        <li><strong>Copyright reports:</strong> the name, email and details of anyone who reports a song.</li>
      </ul>

      <h2>2. Why we use it, and on what basis</h2>
      <ul>
        <li>To run your account and the monitoring service you signed up for (performing our agreement with you).</li>
        <li>To send the alerts and reports you asked for (your consent, which you can switch off).</li>
        <li>To keep the service secure, prevent fraud and handle copyright complaints (our legitimate interest).</li>
        <li>To keep records the law requires (legal obligation).</li>
      </ul>
      <p>We do not sell personal data, and we do not use it for advertising.</p>

      <h2>3. Who we share it with</h2>
      <ul>
        <li><strong>People the service is built for:</strong> airplay data about a song is shared with its owners, the broadcaster that played it and authorised collecting societies such as UPRS.</li>
        <li><strong>Service providers that process data for us:</strong> Supabase (database and login), Vercel (website hosting), Railway (monitoring server) and Brevo (email). They may only use it to provide their service to us.</li>
        <li><strong>Authorities:</strong> when the law requires it.</li>
      </ul>

      <h2>4. Storage outside Uganda</h2>
      <p>
        Our database and servers are in the <strong>European Union</strong> (Ireland, Germany and the Netherlands), which has data
        protection law at least as strong as Uganda&apos;s. When you sign up we ask for your consent to this. Our providers are bound by
        data-protection terms, and data is encrypted in transit and at rest.
      </p>

      <h2>5. How long we keep it</h2>
      <ul>
        <li>Account details, songs and fingerprints: while your account is open, and up to 30 days after you ask us to delete it.</li>
        <li>Evidence clips: up to 24 months after the play, then deleted. Plays themselves (without clips) are kept for royalty history.</li>
        <li>Security logs: up to 12 months. Copyright reports: up to 3 years after they are closed.</li>
        <li>Records needed for open disputes, accounting or legal reasons are kept as long as those reasons last.</li>
      </ul>

      <h2>6. Your rights</h2>
      <ul>
        <li><strong>See your data:</strong> use &ldquo;Download my data&rdquo; in your dashboard, or email us.</li>
        <li><strong>Correct it:</strong> edit it in your dashboard, or ask us.</li>
        <li><strong>Delete it:</strong> use &ldquo;Delete my account&rdquo; in your dashboard. We complete deletions within 30 days.</li>
        <li><strong>Object or withdraw consent:</strong> for example, switch off alerts. Withdrawing consent to storage outside Uganda means we cannot provide the service.</li>
        <li><strong>Complain:</strong> to us first if you can, or to the Personal Data Protection Office.</li>
      </ul>

      <h2>7. Security</h2>
      <p>
        Data is encrypted in transit, and the database enforces who can see what: artists and labels see only their own songs, broadcasters
        only their own station, and public proof links show only what an owner chose to share. If a breach affects your data, we will tell
        you and the PDPO as the law requires.
      </p>

      <h2>8. Children</h2>
      <p>East Sound is for people 18 and over. We do not knowingly collect data from children; artists under 18 are registered by a parent, guardian or label.</p>

      <h2>9. Cookies and local storage</h2>
      <p>We use only what is needed to keep you signed in and remember your settings. We do not use advertising or tracking cookies.</p>

      <h2>10. Contact and changes</h2>
      <p>
        Data protection questions: <span className="select-all">7hmusicgroupug@gmail.com</span> · 7H Music Group Ltd, Kampala, Uganda. If this
        notice changes in a way that matters, we will tell you in your dashboard. See also our <Link href="/legal/terms">Terms of Use</Link> and{" "}
        <Link href="/legal/copyright">Copyright and takedown policy</Link>.
      </p>
    </LegalPage>
  );
}
