import { z } from "zod";

export const humanOutputValueSchema = z.enum(["human"]);

export const reportOutputValueSchema = z.enum(["human", "json"]);

export const humanOutputSchema = humanOutputValueSchema.default("human");

export const reportOutputSchema = reportOutputValueSchema.default("human");

export type ReportOutput = z.infer<typeof reportOutputSchema>;
