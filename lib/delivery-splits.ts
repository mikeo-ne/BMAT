/** Master ownership and composition rights are separate 100% pools. */
export const RIGHTS = ["master", "performance", "mechanical"] as const;
export type DeliveryRight = (typeof RIGHTS)[number];
export const RIGHT_LABELS: Record<DeliveryRight, string> = {
  master: "Master ownership",
  performance: "Performance rights",
  mechanical: "Mechanical splits",
};
export const DELIVERY_ROLES = [
  "Primary artist",
  "Co-writer",
  "Producer",
  "Publisher",
] as const;
export type DeliveryRole = (typeof DELIVERY_ROLES)[number];

export interface DeliveryParty {
  id: string;
  name: string;
  role: DeliveryRole;
  shares: Record<DeliveryRight, number>;
  /** A local, typed acknowledgement; identity has NOT been authenticated. */
  signature: { typedName: string; signedAt: string } | null;
}

export interface DeliveryOwnership {
  version: 1;
  approvalMethod: "local-acknowledgement";
  parties: DeliveryParty[];
}

export function createDeliveryParties(primaryArtist: string): DeliveryParty[] {
  return [
    {
      id: "primary",
      name: primaryArtist,
      role: "Primary artist",
      shares: { master: 100, performance: 100, mechanical: 100 },
      signature: null,
    },
  ];
}

export function clearApprovals(parties: DeliveryParty[]): DeliveryParty[] {
  return parties.map((party) => ({ ...party, signature: null }));
}

export function rightsTotals(
  parties: DeliveryParty[],
): Record<DeliveryRight, number> {
  return Object.fromEntries(
    RIGHTS.map((right) => [
      right,
      Math.round(
        parties.reduce((sum, party) => sum + party.shares[right], 0) * 100,
      ) / 100,
    ]),
  ) as Record<DeliveryRight, number>;
}

export function validateDeliveryParties(
  value: unknown,
  requireSignatures = true,
  now = new Date(),
): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30)
    return ["Declare between 1 and 30 collaborators."];
  const issues: string[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const party of value) {
    if (
      !party ||
      typeof party !== "object" ||
      typeof party.id !== "string" ||
      !party.id ||
      ids.has(party.id)
    )
      return ["Each collaborator needs a unique identifier."];
    ids.add(party.id);
    if (
      typeof party.name !== "string" ||
      !party.name.trim() ||
      party.name.trim().length > 120
    )
      issues.push(
        "Enter a name for every collaborator (up to 120 characters).",
      );
    else {
      const name = party.name.trim().toLowerCase();
      if (names.has(name))
        issues.push(
          "List each collaborator once; combine their roles in one allocation.",
        );
      names.add(name);
    }
    if (!DELIVERY_ROLES.includes(party.role))
      issues.push("Choose a valid collaborator role.");
    if (
      !party.shares ||
      RIGHTS.some(
        (right) =>
          typeof party.shares[right] !== "number" ||
          !Number.isFinite(party.shares[right]) ||
          party.shares[right] < 0 ||
          party.shares[right] > 100,
      )
    )
      return ["Each ownership percentage must be a number between 0 and 100."];
    if (requireSignatures) {
      const signature = party.signature;
      if (
        !signature ||
        typeof signature.typedName !== "string" ||
        typeof party.name !== "string" ||
        signature.typedName.trim().toLowerCase() !==
          party.name.trim().toLowerCase() ||
        typeof signature.signedAt !== "string" ||
        !Number.isFinite(Date.parse(signature.signedAt)) ||
        Date.parse(signature.signedAt) > now.getTime() + 60_000
      ) {
        issues.push(
          "Record a matching typed-name approval for every collaborator.",
        );
      }
    }
  }
  const totals = rightsTotals(value as DeliveryParty[]);
  for (const right of RIGHTS)
    if (Math.abs(totals[right] - 100) > 0.001)
      issues.push(
        `${RIGHT_LABELS[right]} must total exactly 100% (currently ${totals[right]}%).`,
      );
  if (!value.some((party) => party.role === "Primary artist"))
    issues.push("Declare a primary artist.");
  return [...new Set(issues)];
}

export function parseDeliveryOwnership(raw: unknown): {
  ownership: DeliveryOwnership | null;
  issues: string[];
} {
  if (!raw || typeof raw !== "object")
    return {
      ownership: null,
      issues: [
        "An approved ownership split sheet is required before delivery.",
      ],
    };
  const data = raw as Partial<DeliveryOwnership>;
  if (data.version !== 1 || data.approvalMethod !== "local-acknowledgement")
    return { ownership: null, issues: ["Unsupported split-sheet format."] };
  const issues = validateDeliveryParties(data.parties);
  return {
    ownership:
      issues.length === 0
        ? {
            version: 1,
            approvalMethod: "local-acknowledgement",
            parties: data.parties!,
          }
        : null,
    issues,
  };
}
