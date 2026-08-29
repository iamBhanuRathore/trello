import { z } from 'zod';
import {
  OrgMemberRole,
  SprintType,
  SprintStatus,
  PhaseStatus,
  StageCategory,
} from '../enums/index';

// ─── Shared primitives ────────────────────────────────────────────────────────
export const UuidSchema = z.string().uuid();
export const EmailSchema = z.string().email().toLowerCase().trim();
export const SlugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens');
export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color');
export const PositiveIntSchema = z.number().int().positive();
export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const SignUpSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: EmailSchema,
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  orgName: z.string().min(2).max(100).trim(),
  orgSlug: SlugSchema,
});

export const SignInSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

// ─── Organization ─────────────────────────────────────────────────────────────
export const CreateOrgSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  slug: SlugSchema,
});

export const UpdateOrgSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: HexColorSchema.optional().nullable(),
});

export const InviteMemberSchema = z.object({
  email: EmailSchema,
  role: z.nativeEnum(OrgMemberRole),
  name: z.string().optional(),
  workspaceIds: z.array(UuidSchema).optional(),
});

export const BulkInviteMemberSchema = z.object({
  invites: z.array(
    z.object({
      email: EmailSchema,
      name: z.string().optional(),
      role: z.string().default('member'),
      workspaceIds: z.array(z.string()).optional(),
    })
  ),
});

export const DeactivateMemberSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ─── Workspace ────────────────────────────────────────────────────────────────
export const CreateWorkspaceSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  description: z.string().max(500).optional(),
  visibility: z.enum(['private', 'org']).default('org'),
});

export const UpdateWorkspaceSchema = CreateWorkspaceSchema.partial();

// ─── Project ──────────────────────────────────────────────────────────────────
export const CreateProjectSchema = z.object({
  workspaceId: UuidSchema,
  name: z.string().min(2).max(200).trim(),
  key: z.string().min(1).max(10).trim().optional(),
  description: z.string().max(1000).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

export const UpdateProjectSchema = CreateProjectSchema.omit({ workspaceId: true }).partial();

// ─── Board ────────────────────────────────────────────────────────────────────
export const CreateBoardSchema = z.object({
  projectId: UuidSchema,
  name: z.string().min(2).max(200).trim(),
  background: z.string().max(500).optional(), // hex or image URL
});

export const UpdateBoardSchema = CreateBoardSchema.omit({ projectId: true }).partial();

// ─── List ─────────────────────────────────────────────────────────────────────
export const CreateListSchema = z.object({
  boardId: UuidSchema,
  name: z.string().min(1).max(200).trim(),
  position: z.number(),
});

export const UpdateListSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  position: z.number().optional(),
});

// ─── Card ─────────────────────────────────────────────────────────────────────
export const CreateCardSchema = z.object({
  listId: UuidSchema,
  title: z.string().min(1).max(500).trim(),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional().nullable(),
  parentCardId: UuidSchema.optional().nullable(),
  position: z.number().optional(),
});

export const UpdateCardSchema = z.object({
  title: z.string().min(1).max(500).trim().optional(),
  description: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  stageId: UuidSchema.optional().nullable(),
  coverImage: z.string().url().optional().nullable(),
  storyPoints: z.number().int().min(0).optional().nullable(),
  estimateMinutes: z.number().int().min(0).optional().nullable(),
});

export const MoveCardSchema = z.object({
  listId: UuidSchema,
  position: z.number(),
});

// ─── Comment ─────────────────────────────────────────────────────────────────
export const CreateCommentSchema = z.object({
  body: z.string().min(1).max(10000).trim(),
});

export const UpdateCommentSchema = CreateCommentSchema;

// ─── Attachments ──────────────────────────────────────────────────────────────
export const CreateAttachmentSchema = z.object({
  fileName: z.string().min(1).max(500),
  fileType: z.string().max(100).optional(),
  sizeBytes: z.number().int().min(0).optional(),
});

// ─── Labels ───────────────────────────────────────────────────────────────────
export const CreateLabelSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  color: HexColorSchema,
});

export const AttachLabelSchema = z.object({
  labelId: UuidSchema,
});

// ─── Checklists ───────────────────────────────────────────────────────────────
export const CreateChecklistSchema = z.object({
  title: z.string().min(1).max(255).trim(),
  position: z.number(),
});

export const UpdateChecklistSchema = z.object({
  title: z.string().min(1).max(255).trim().optional(),
  position: z.number().optional(),
});

export const CreateChecklistItemSchema = z.object({
  text: z.string().min(1).max(1000).trim(),
  position: z.number(),
  assignedTo: UuidSchema.optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
});

export const UpdateChecklistItemSchema = z.object({
  text: z.string().min(1).max(1000).trim().optional(),
  isDone: z.boolean().optional(),
  position: z.number().optional(),
  assignedTo: UuidSchema.optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
});

// ─── Sprint ───────────────────────────────────────────────────────────────────
export const CreateSprintSchema = z.object({
  projectId: UuidSchema,
  name: z.string().min(2).max(200).trim(),
  type: z.nativeEnum(SprintType),
  startDate: z.string().date(),
  endDate: z.string().date(),
  goal: z.string().max(1000).optional(),
});

export const UpdateSprintSchema = CreateSprintSchema.omit({ projectId: true })
  .partial()
  .extend({
    status: z.nativeEnum(SprintStatus).optional(),
  });

// ─── Phase ────────────────────────────────────────────────────────────────────
export const CreatePhaseSchema = z.object({
  projectId: UuidSchema,
  name: z.string().min(2).max(200).trim(),
  position: z.number(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

export const UpdatePhaseSchema = CreatePhaseSchema.omit({ projectId: true })
  .partial()
  .extend({
    status: z.nativeEnum(PhaseStatus).optional(),
  });

// ─── Stage Template ───────────────────────────────────────────────────────────
export const CreateStageTemplateSchema = z.object({
  name: z.string().min(2).max(200).trim(),
  projectId: UuidSchema.optional().nullable(),
  isDefault: z.boolean().optional(),
});

export const CreateStageSchema = z.object({
  templateId: UuidSchema,
  name: z.string().min(1).max(100).trim(),
  color: HexColorSchema,
  position: z.number(),
  category: z.nativeEnum(StageCategory),
});

// ─── Time Log ─────────────────────────────────────────────────────────────────
export const CreateTimeLogSchema = z.object({
  cardId: UuidSchema,
  minutes: z.number().int().min(1),
  description: z.string().max(500).optional(),
  loggedDate: z.string().date(),
  isBillable: z.boolean().optional().default(false),
});

// Export inferred types
export type SignUpInput = z.infer<typeof SignUpSchema>;
export type SignInInput = z.infer<typeof SignInSchema>;
export type CreateOrgInput = z.infer<typeof CreateOrgSchema>;
export type UpdateOrgInput = z.infer<typeof UpdateOrgSchema>;
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type CreateBoardInput = z.infer<typeof CreateBoardSchema>;
export type CreateListInput = z.infer<typeof CreateListSchema>;
export type CreateCardInput = z.infer<typeof CreateCardSchema>;
export type UpdateCardInput = z.infer<typeof UpdateCardSchema>;
export type MoveCardInput = z.infer<typeof MoveCardSchema>;
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;
export type CreateSprintInput = z.infer<typeof CreateSprintSchema>;
export type CreatePhaseInput = z.infer<typeof CreatePhaseSchema>;
export type CreateTimeLogInput = z.infer<typeof CreateTimeLogSchema>;
export type CreateAttachmentInput = z.infer<typeof CreateAttachmentSchema>;
export type CreateLabelInput = z.infer<typeof CreateLabelSchema>;
export type AttachLabelInput = z.infer<typeof AttachLabelSchema>;
export type CreateChecklistInput = z.infer<typeof CreateChecklistSchema>;
export type UpdateChecklistInput = z.infer<typeof UpdateChecklistSchema>;
export type CreateChecklistItemInput = z.infer<typeof CreateChecklistItemSchema>;
export type UpdateChecklistItemInput = z.infer<typeof UpdateChecklistItemSchema>;
