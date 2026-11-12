import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { CopyrightReportForm } from "@/components/legal/CopyrightReportForm";

export const metadata: Metadata = {
  title: "Copyright and takedown policy",
  description: "How to report a song uploaded to East Sound without the right to it, and how East Sound handles copyright complaints.",
  alternates: { canonical: "/legal/copyright" },
};

// Wording reviewed against the house rules in contract-drafter; still for advocate review before relying on it.
export default function CopyrightPage() {
  return (
    <LegalPage title="Copyright and takedown policy" updated="12 November 2026">
      <p>
        East Sound respects the rights of songwriters, performers, labels, publishers and broadcasters. Only rights holders, or people
        authorised by them, may upload a song. If you believe a song on East Sound was uploaded or claimed without the right to do so,
        tell us using the form below.
      </p>

      <h2>What happens when you report</h2>
      <ul>
        <li>We acknowledge your report by email within <strong>3 working days</strong>.</li>
        <li>While we review it, we can <strong>hide the disputed song from charts, reports and proof links</strong>.</li>
        <li>We contact the uploader and ask for evidence of their rights, such as a distribution agreement, split sheet or URSB registration.</li>
        <li>We aim to decide within <strong>14 days</strong>. If the uploader cannot show their rights, the song and its plays are removed from their account.</li>
        <li>Disputes between two claimants with evidence are referred to the parties and, where relevant, to UPRS. East Sound does not decide who owns a copyright.</li>
        <li>Accounts that repeatedly upload music they do not control are closed.</li>
      </ul>

      <h2>Broadcasters</h2>
      <p>
        East Sound keeps a short audio clip (about 10 seconds) of each detected play as evidence. If you are a broadcaster and want a
        specific clip removed from a public proof link, use the form and choose &ldquo;Broadcaster&rdquo; in the details.
      </p>

      <h2>False reports</h2>
      <p>Reports must be made in good faith. Knowingly false claims can lead to the reporting account being closed and may have legal consequences.</p>

      <h2>Report a copyright problem</h2>
      <CopyrightReportForm />

      <p className="text-sm text-slate-500">
        You can also email <span className="select-all">7hmusicgroupug@gmail.com</span> with the subject &ldquo;Copyright report&rdquo;.
      </p>
    </LegalPage>
  );
}
