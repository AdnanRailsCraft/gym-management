"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/connection";
import { authorize, PolicyError } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { parseMajorToMinor } from "@/lib/money";
import { gymCurrency } from "@/server/members/context";
import { createPlan, setPlanActive, updatePlan } from "@/server/members/plans";
import type { MembershipPlanInput } from "@/server/members/plans";
import { planSchema } from "@/server/members/schemas";

export interface PlanActionResult {
  ok: boolean;
  error?: string;
}

function fail(error: unknown): PlanActionResult {
  if (error instanceof PolicyError) return { ok: false, error: error.message };
  return {
    ok: false,
    error: error instanceof Error ? error.message : "The request failed",
  };
}

function toPlanInput(
  data: ReturnType<typeof planSchema.parse>,
): MembershipPlanInput {
  return {
    name: data.name,
    description: data.description ?? null,
    durationValue: data.durationValue,
    durationUnit: data.durationUnit,
    priceMinor: data.priceMinor,
    joiningFeeMinor: data.joiningFeeMinor,
    graceDays: data.graceDays,
    freezeAllowed: data.freezeAllowed,
    maxFreezeDays: data.maxFreezeDays ?? null,
    visitLimit: data.visitLimit ?? null,
    sellableToNewMembers: data.sellableToNewMembers,
  };
}

function moneyField(
  formData: FormData,
  field: string,
  minorUnits: number,
): { value: number; error?: string } {
  const raw = formData.get(field);
  if (raw === null || String(raw).trim() === "") return { value: 0 };
  const minor = parseMajorToMinor(String(raw), minorUnits);
  if (minor === null) return { value: 0, error: `${field} is not a valid amount` };
  return { value: minor };
}

function planFieldsFrom(dbMinorUnits: number, formData: FormData) {  const price = moneyField(formData, "price", dbMinorUnits);
  const joining = moneyField(formData, "joiningFee", dbMinorUnits);
  return {
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    durationValue: formData.get("durationValue"),
    durationUnit: formData.get("durationUnit"),
    priceMinor: price.value,
    joiningFeeMinor: joining.value,
    graceDays: formData.get("graceDays") ?? 0,
    freezeAllowed: formData.get("freezeAllowed"),
    maxFreezeDays: formData.get("maxFreezeDays") ?? "",
    visitLimit: formData.get("visitLimit") ?? "",
    sellableToNewMembers: formData.get("sellableToNewMembers"),
    moneyError: price.error ?? joining.error,
  };
}

export async function createPlanAction(
  formData: FormData,
): Promise<PlanActionResult> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.plansManage);
    const db = getDb();
    const fields = planFieldsFrom(gymCurrency(db).minorUnits, formData);
    if (fields.moneyError) return { ok: false, error: fields.moneyError };
    const parsed = planSchema.safeParse(fields);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    createPlan(db, user, toPlanInput(parsed.data));
    revalidatePath("/plans");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function updatePlanAction(
  formData: FormData,
): Promise<PlanActionResult> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.plansManage);
    const id = Number(formData.get("id"));
    if (!Number.isInteger(id) || id < 1) {
      return { ok: false, error: "Invalid plan" };
    }
    const db = getDb();
    const fields = planFieldsFrom(gymCurrency(db).minorUnits, formData);
    if (fields.moneyError) return { ok: false, error: fields.moneyError };
    const parsed = planSchema.safeParse(fields);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    updatePlan(db, user, id, toPlanInput(parsed.data));
    revalidatePath("/plans");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setPlanActiveAction(
  formData: FormData,
): Promise<PlanActionResult> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.plansManage);
    const id = Number(formData.get("id"));
    const active = formData.get("active") === "1";
    if (!Number.isInteger(id) || id < 1) {
      return { ok: false, error: "Invalid plan" };
    }
    const db = getDb();
    setPlanActive(db, user, id, active);
    revalidatePath("/plans");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
