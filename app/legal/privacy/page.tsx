import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy Notice" };

// DRAFT — for advocate review. Not legal advice.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Notice" updated="7 November 2026">
      <p>
        7H Music Group Ltd runs East Sound Technologies and is responsible for the personal data described here, under Uganda&rsquo;s
        Data Protection and Privacy Act, 2019.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> your name, email address, role (artist, label, broadcaster, CMO, venue) and organisation.</li>
        <li><strong>Music details:</strong> song titles, credits, ISRC/UPC codes and the reference audio you upload.</li>
        <li><strong>Alert settings:</strong> which alerts you want, and a mobile number if you choose to add one.</li>
        <li><strong>Airplay evidence:</strong> short clips recorded from public radio broadcasts when a registered song is detected.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To run your account and dashboards, recognise your songs on air and show you the evidence.</li>
        <li>To send the airplay alerts you switched on, and account emails such as password resets.</li>
        <li>To keep the service secure and fix problems.</li>
      </ul>
      <p>We don&rsquo;t sell your data or use it for advertising.</p>

      <h2>Who else handles it</h2>
      <p>
        We use trusted providers to run the service: Supabase (database and storage), Vercel (website), our monitoring server
        host, and Brevo (email). They process data only on our instructions. Some of them store data outside Uganda, with
        safeguards in place.
      </p>

      <h2>How long we keep it</h2>
      <p>Account and music data are kept while your account is open. Delete a song and its reference audio is removed. Close your account and we delete your personal data, except records the law requires us to keep.</p>

      <h2>Your rights</h2>
      <p>You can ask to see, correct or delete your personal data, or object to how we use it. Email <span className="select-all">7hmusicgroupug@gmail.com</span>. You can also complain to Uganda&rsquo;s Personal Data Protection Office.</p>
    </LegalPage>
  );
}
