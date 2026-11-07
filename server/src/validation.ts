import { z } from 'zod';

export class ApiError extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message); }
}

export function ensure(condition: unknown, status: number, code: string, message: string): asserts condition {
  if (!condition) throw new ApiError(status, code, message);
}

export const id = z.uuid();
export const version = z.number().int().positive();
export const credentials = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/),
  password: z.string().min(8).max(128)
}).strict();
export const registration = credentials.extend({ name: z.string().trim().min(1).max(30) });
export const listInput = z.object({ name: z.string().trim().min(1).max(30) }).strict();
export const expected = z.object({ version }).strict();
export const taskInput = z.object({
  title: z.string().trim().min(1).max(100), note: z.string().trim().max(2000).default(''),
  assignee: z.union([id, z.literal('')]).default(''),
  due: z.union([z.iso.datetime({ offset: true }), z.literal('')]).default('')
}).strict();
export const taskUpdate = taskInput.extend({ done: z.boolean(), version });
export const libraryInput = z.object({
  name: z.string().trim().min(1).max(30), mode: z.enum(['full', 'combine']),
  slots: z.array(z.array(z.string().trim().min(1).max(100)).min(1).max(2000)).min(1).max(3)
}).strict().refine(value => value.mode === 'full' ? value.slots.length === 1 : value.slots.length >= 2,
  { message: '完整名称需要一个候选组，组合模式需要 2–3 个词组' });
export const libraryUpdate = z.object({ data: libraryInput, version }).strict();
export const recordInput = z.object({
  name: z.string().trim().min(1).max(900), mode: z.enum(['full', 'combine']),
  source: z.string().trim().min(1).max(30), date: z.iso.date()
}).strict();
export const sharing = z.object({ listIds: z.array(id).max(100), version }).strict();
export const invitation = z.object({ code: z.string().trim().toUpperCase().regex(/^SHIRI-[A-F0-9]{24}$/) }).strict();
