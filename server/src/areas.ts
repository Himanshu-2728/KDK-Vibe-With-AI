/**
 * Demo-city geography (real Nagpur streets), shared by the seed and the API.
 *
 * `issues.area_name` stores SHORT neighborhood names ("Nandanvan") — these are
 * what area filters match against. The front-end map pickers use FULL preset
 * labels ("Great Nag Rd, Nandanvan"). These maps bridge the two so the admin
 * heatmap can group by short name yet render/click through with stable labels.
 */
export const AREA_SHORT_BY_LABEL: Record<string, string> = {
  "Great Nag Rd, Nandanvan": "Nandanvan",
  "Katol Rd, Dharampeth": "Dharampeth",
  "Ramdaspeth": "Ramdaspeth",
  "Sitabuldi": "Sitabuldi",
  "Gandhi Sagar Bridge": "Sitabuldi",
  "Civil Lines Rd": "Civil Lines",
  "Manewada Rd, Hanuman Nagar": "Manewada",
  "Hanuman Nagar": "Manewada",
  "Amravati Rd, Bajaj Nagar": "Ambazari",
  "Ambazari Lake": "Ambazari",
  "Subhash Nagar": "Ambazari",
};

/** Short area names actually used in the seed, in display order. */
export const SEED_AREAS: string[] = [
  "Nandanvan",
  "Dharampeth",
  "Ramdaspeth",
  "Sitabuldi",
  "Civil Lines",
  "Manewada",
  "Ambazari",
];

export function shortToLabel(short: string): string {
  return (
    Object.entries(AREA_SHORT_BY_LABEL).find(([, v]) => v === short)?.[0] ?? short
  );
}
