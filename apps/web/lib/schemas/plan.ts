import { z } from "zod";

export const PlanTaskSchema = z.object({
  day: z.number(),
  cardIds: z.array(z.string()).default([]),
  notes: z.string().optional(),
  done: z.boolean().default(false),       // 該 day 任務是否完成
});

export const PlanSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  title: z.string(),
  lang: z.string(),
  goal: z.string().optional(),
  startDate: z.number(),
  endDate: z.number().optional(),
  tasks: z.array(PlanTaskSchema).default([]),
  progress: z.number().min(0).max(100).default(0),
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlanTask = z.infer<typeof PlanTaskSchema>;