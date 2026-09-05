/**
 * Demo-city geography, shared by the seed and the API.
 *
 * `issues.area_name` stores SHORT neighborhood names ("Riverside") — these are
 * what area filters match against. The front-end map pickers use FULL preset
 * labels ("Oak St, Riverside"). These maps bridge the two so the admin heatmap
 * can group by short name yet render/click through with stable labels.
 */
export const AREA_SHORT_BY_LABEL: Record<string, string> = {
  "Oak St, Riverside": "Riverside",
  "Elm Ave, Riverside": "Riverside",
  "Maple Dr, Westbrook": "Westbrook",
  "Highland Rd, Westbrook": "Westbrook",
  "Riverside Bridge": "Riverside",
  "Riverside Park": "Riverside",
  "Mill Rd, Old Mill": "Old Mill",
  "Foundry St, Old Mill": "Old Mill",
  "Hillcrest Ave": "Hillcrest",
  "Lakeside Dr": "Lakeside",
  "Northgate Crossing": "Northgate",
};

/** Short area names actually used in the seed, in display order. */
export const SEED_AREAS: string[] = [
  "Riverside",
  "Westbrook",
  "Old Mill",
  "Hillcrest",
  "Lakeside",
  "Northgate",
];

export function shortToLabel(short: string): string {
  return (
    Object.entries(AREA_SHORT_BY_LABEL).find(([, v]) => v === short)?.[0] ?? short
  );
}
