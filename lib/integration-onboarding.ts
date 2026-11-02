export interface IntegrationSetupGuide {
  id: "whatsapp" | "email" | "webhook";
  title: string;
  description: string;
  requirements: string[];
  variables: string[];
  links: { label: string; href: string }[];
}
/** Public operator guidance only. Never add actual credentials, contacts or private project settings here. */
export const INTEGRATION_SETUP_GUIDES: IntegrationSetupGuide[] = [
  {
    id: "whatsapp",
    title: "WhatsApp Business",
    description:
      "Your phone app is not an API sender. Start with Meta's Cloud API onboarding without deleting or migrating your current WhatsApp account.",
    requirements: [
      "Create or connect the business/API setup in Meta; use its test sender for initial provider-side testing.",
      "Choose a production API number/coexistence flow only after confirming eligibility and any costs with Meta.",
      "Approve a template with one body text parameter for the alert, and match its exact language code.",
      "The phone-number ID is Meta’s numeric sender ID, not your +256 phone number. Match the approved template’s exact language code.",
      "Save server credentials securely in Production settings. Recipients must genuinely opt in; the in-app phone simulator never sends a message.",
    ],
    variables: [
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_GRAPH_VERSION",
      "WHATSAPP_TEMPLATE_NAME",
      "WHATSAPP_TEMPLATE_LANGUAGE",
    ],
    links: [
      {
        label: "Meta Cloud API setup",
        href: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
      },
    ],
  },
  {
    id: "email",
    title: "Email with Resend",
    description:
      "Keep Gmail/Outlook as the receiving inbox. Sending alerts requires the application's email API provider, not your mailbox password.",
    requirements: [
      "Create a Resend account and a sending API key; enter the key in secure Production settings, never here or in chat.",
      "For restricted testing, onboarding@resend.dev can send only to the email associated with your Resend account.",
      "For other recipients, verify a domain you control and use a sender on that domain. A shared vercel.app address or Gmail domain is not your sending domain.",
      "Confirm sender/domain verification and recipient consent before live activation. Do not buy a domain or upgrade a plan without reviewing the cost.",
    ],
    variables: ["RESEND_API_KEY", "EAST_SOUND_EMAIL_FROM"],
    links: [
      { label: "Resend signup", href: "https://resend.com/signup" },
      {
        label: "Testing sender restrictions",
        href: "https://resend.com/docs/knowledge-base/403-error-resend-dev-domain",
      },
    ],
  },
  {
    id: "webhook",
    title: "Signed webhook",
    description:
      "A webhook delivers data to another application, not a phone inbox. The private receiver below is an integration inbox, never a verified-airplay source.",
    requirements: [
      "Create an owner-bound receiver below; save its one-time key in your secret manager. Rotation immediately invalidates the previous key.",
      "The sender signs timestamp + dot + exact UTF-8 JSON with HMAC-SHA256. The receiver verifies the signature and time window, and stores a minimized private receipt.",
      "Event IDs in the signed body are deduplicated durably. Changing an unsigned Idempotency-Key header cannot bypass replay checks.",
      "Outgoing East Sound webhook subscriptions still need an exact operator-approved HTTPS allowlist entry and the owner's saved HMAC secret. Creating a receiver does not auto-subscribe or forward anything.",
    ],
    variables: ["EAST_SOUND_WEBHOOK_ALLOWLIST", "EAST_SOUND_SECRET_KEY"],
    links: [],
  },
];
