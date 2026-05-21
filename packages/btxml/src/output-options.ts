export const outputChoices = ["human", "json"] as const;
export type OutputFormat = (typeof outputChoices)[number];
