/** Public, sourced partnership proposals — not claims of endorsement. */
export type PartnerProposal = {
  id: string;
  name: string;
  role: string;
  priority: string;
  offer: string;
  ask: string;
  boundary: string;
  sources: { label: string; url: string }[];
};

export const PARTNERS: PartnerProposal[] = [
  {
    id: "ursb", name: "URSB", role: "Uganda Registration Services Bureau · copyright registrar and CMO regulator",
    priority: "URSB describes registration of works, CMO supervision, enforcement and copyright awareness as part of its work. Its strategic plan also prioritises access to registration and communication.",
    offer: "A proposed, independently reviewable picture of detected music use on an agreed radio panel: station and time, catalogue identifiers when available, monthly summaries and records for follow-up. It could support discussions about transparency and awareness.",
    ask: "Help define the questions, data standard and evidence requirements for a limited pilot; advise how results could complement official registration and oversight.",
    boundary: "East Sound is not URSB's register or an approved regulatory system. A match does not establish ownership, licence status, a legal breach or a fair distribution.",
    sources: [
      { label: "URSB: copyright directorate", url: "https://ursb.go.ug/2025/03/19/its-all-systems-go-for-the-directorate-of-copyright-and-neighbouring-rights/" },
      { label: "URSB strategic plan 2025–2030", url: "https://ursb.go.ug/wp-content/uploads/2025/09/URSB-Strategic-Plan-IV-2025-2030.pdf" },
    ],
  },
  {
    id: "uprs", name: "UPRS and other music CMOs", role: "Music licensing and royalty administration",
    priority: "UPRS describes membership, licensing, accurate works information, usage reporting and royalty administration as its core services.",
    offer: "A CMO dashboard, monthly station summaries, exports and a token-authenticated airplay feed can help staff compare detected plays with their own repertoire and records, subject to access and technical limits.",
    ask: "Choose a small repertoire and stations, share approved reference logs and required fields, and jointly evaluate matches before considering any use in distribution.",
    boundary: "The CMO decides eligibility, rights, allocation, licensing and payment. Cue-sheet acceptance and fit with its systems are not yet agreed.",
    sources: [{ label: "UPRS: what we do", url: "https://uprs.go.ug/what-we-do/" }, { label: "UPRS: licensing", url: "https://www.uprs.go.ug/music-users/licence" }],
  },
  {
    id: "ucc", name: "UCC", role: "Uganda Communications Commission · communications and broadcasting regulator",
    priority: "UCC regulates broadcasting and describes licensing, monitoring and standards among its responsibilities. Its FM guidance refers to programming registers and logs.",
    offer: "Station-level music-use summaries for an agreed, permitted panel could help a conversation about reporting and local-content research, alongside the broadcaster's own records.",
    ask: "Advise on an appropriate reporting scope, privacy and accuracy requirements; introduce willing broadcasters for a pilot.",
    boundary: "Music detections are not a full programme log, proof of UCC compliance or a measurement of audience reach. No UCC endorsement or circular is implied.",
    sources: [{ label: "UCC: broadcasting", url: "https://www.ucc.co.ug/broadcasting/" }, { label: "UCC: FM station guidelines", url: "https://www.ucc.co.ug/wp-content/uploads/2023/10/Guidelines-on-Establishment-and-Operation-of-FM-Radio-Stations-in-Uganda_-March-2019.pdf" }],
  },
  {
    id: "unmf", name: "UNMF and the CMS team", role: "Uganda National Musicians Federation · creator advocacy and proposed CMS collaboration",
    priority: "Reporting on the federation's Copyright Management System describes registration, collection and distribution as its three pillars, with creator awareness planned.",
    offer: "An optional radio-usage data source and artist-facing catalogue and airplay views could complement those objectives, if the CMS team finds them useful.",
    ask: "Meet the system owners to confirm responsibilities, whether additional usage data is needed, integration requirements and a consent-based pilot with creators.",
    boundary: "There is no agreed CMS integration, endorsement or verified production schema. East Sound does not register works with the CMS or distribute royalties.",
    sources: [{ label: "Nile Post report via allAfrica: CMS unveiling", url: "https://allafrica.com/stories/202606180611.html" }],
  },
  {
    id: "broadcasters", name: "NAB and broadcasters", role: "National Association of Broadcasters · station operators",
    priority: "NAB reported a 2021 agreement on broadcasters' royalty payments and a fair mechanism for monitoring use. URSB reported a 2025 discussion on implementation.",
    offer: "Broadcasters can request to claim or add a station; after approval, the dashboard shows detected music and offers PDF and Excel cue-sheet exports for review.",
    ask: "Nominate consenting stations, supply authorised streams and reference playout logs, and review reporting fields and missed or incorrect matches with UPRS.",
    boundary: "Exports contain detected matches, not all programming; duration may be estimated. UPRS has not confirmed acceptance or format. Access and permission to monitor require verification.",
    sources: [{ label: "NAB: 2021 agreement", url: "https://nab.co.ug/2021/06/16/nab-enters-deal-for-radio-tv-stations-to-start-paying-musicians-for-playing-their-songs/" }, { label: "URSB: 2025 MOU discussion", url: "https://ursb.go.ug/2025/02/20/ursb-meets-with-uprs-ceo-to-discuss-mou-compliance-and-royalties-for-creators/" }],
  },
  {
    id: "distributors", name: "Distribution platforms", role: "AfroMobile, MTN TV and other potential distribution partners",
    priority: "MTN TV by AfroMobile has been reported as bringing live TV, radio and other content together to widen access to entertainment and creators.",
    offer: "A potential channel-by-channel music-use report for selected, authorised radio streams, alongside the distributor's existing service—not an audience measurement product.",
    ask: "Discuss channel rights, monitoring permissions, an agreed channel list and technical access; select a small radio pilot with the channel owners.",
    boundary: "Carrying a channel does not give East Sound permission to monitor or prove song-level airplay. TV monitoring and a distributor integration require separate validation and agreement.",
    sources: [{ label: "MTN TV by AfroMobile launch report", url: "https://techafricanews.com/2026/08/07/mtn-uganda-launches-digital-entertainment-platform-with-afromobile/" }],
  },
  {
    id: "venues", name: "Venues and hospitality businesses", role: "Bars, clubs, hotels and other public music users",
    priority: "UPRS describes licensing and guidance for businesses and venues using music in public.",
    offer: "A venue dashboard is available for exploring licence details and set logs. We would welcome design partners to shape a future reporting pilot.",
    ask: "Discuss practical reporting needs, permissions, privacy and the costs and feasibility of any future listening devices with East Sound and the relevant CMO.",
    boundary: "Venue monitoring devices are not established as deployed. A self-entered licence or dashboard status does not certify legal compliance.",
    sources: [{ label: "UPRS: music licensing", url: "https://www.uprs.go.ug/music-users/licence" }],
  },
  {
    id: "creators", name: "Artists, labels, managers and artist bodies", role: "Creators and catalogue representatives",
    priority: "UPRS encourages creators to register works and provide accurate information for usage and royalty administration.",
    offer: "Artists and labels can submit catalogue details and authorised audio, maintain multiple songwriter and featured-artist credits, and review detected airplay in their dashboards. Reports support conversations with stations and CMOs.",
    ask: "Contribute authorised recordings, identifiers and accurate credits; help test matching against independent station records and report errors.",
    boundary: "An upload is not a copyright or CMO registration. A match or ISRC does not prove ownership or splits, and an absent match does not prove a song was not played.",
    sources: [{ label: "UPRS: membership and works", url: "https://www.uprs.go.ug/" }, { label: "URSB: copyright", url: "https://ursb.go.ug/copyrights/" }],
  },
];
