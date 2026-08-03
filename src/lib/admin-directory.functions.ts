/**
 * Thin server-function wrappers around the admin directory helpers.
 * All real logic lives in `admin-directory.server.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  adminDirectory,
  adminUserRecords,
  assertAdmin,
} from "@/lib/admin-directory.server";

export const listAdminUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ search: z.string().max(200).default("") }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    return adminUserRecords(data.search);
  });

export const getAdminDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    return adminDirectory();
  });
