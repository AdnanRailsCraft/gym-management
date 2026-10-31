"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/connection";
import { authorize, PolicyError } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { parseMajorToMinor } from "@/lib/money";
import { gymCurrency } from "@/server/members/context";
import {
  cancelMembership,
  extendMembership,
  freezeMembership,
  reactivateMembership,
  renewMembership,
  sellMembership,
  suspendMembership,
  unfreezeMembership,
} from "@/server/members/memberships";
import {
  extendMembershipSchema,
  freezeMembershipSchema,
  membershipReasonSchema,
  renewMembershipSchema,
  sellMembershipSchema,
} from "@/server/members/schemas";

export interface MembershipActionResult {
  ok: boolean;
  error?: string;
}

function fail(error: unknown): MembershipActionResult {
  if (error instanceof PolicyError) return { ok: false, error: error.message };
  return {
    ok: false,
    error: error instanceof Error ? error.message : "The request failed",
  };
}

/** Parse a major-unit money input field into integer minor units. */
function moneyField(
  formData: FormData,
  field: string,
  minorUnits: number,
): { value?: number; error?: string } {
  const raw = formData.get(field);
  if (raw === null || String(raw).trim() === "") return {};
  const minor = parseMajorToMinor(String(raw), minorUnits);
  if (minor === null) return { error: `${field} is not a valid amount` };
  return { value: minor };
}

function revalidateMember(memberId: number): void {
  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
  revalidatePath("/");
}

export async function sellMembershipAction(
  formData: FormData,
): Promise<MembershipActionResult> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.membershipsSell);
    const db = getDb();
    const minor = gymCurrency(db).minorUnits;
    const price = moneyField(formData, "price", minor);
    const joining = moneyField(formData, "joiningFee", minor);
    const discount = moneyField(formData, "discount", minor);
    const moneyError = price.error ?? joining.error ?? discount.error;
    if (moneyError) return { ok: false, error: moneyError };

    const parsed = sellMembershipSchema.safeParse({
      memberId: formData.get("memberId"),
      planId: formData.get("planId"),
      startOn: formData.get("startOn") ?? "",
      priceMinor: price.value,
      joiningFeeMinor: joining.value,
      discountMinor: discount.value,
      discountReason: formData.get("discountReason") ?? "",
      notes: formData.get("notes") ?? "",
      idempotencyKey: formData.get("idempotencyKey") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const membership = sellMembership(db, user, {
      memberId: parsed.data.memberId,
      planId: parsed.data.planId,
      startOn: parsed.data.startOn,
      priceMinor: parsed.data.priceMinor,
      joiningFeeMinor: parsed.data.joiningFeeMinor,
      discountMinor: parsed.data.discountMinor,
      discountReason: parsed.data.discountReason,
      notes: parsed.data.notes,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidateMember(membership.member_id);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function renewMembershipAction(
  formData: FormData,
): Promise<MembershipActionResult> {
  const user = await requireUser();
  try {
    const db = getDb();
    const minor = gymCurrency(db).minorUnits;
    const price = moneyField(formData, "price", minor);
    const discount = moneyField(formData, "discount", minor);
    const moneyError = price.error ?? discount.error;
    if (moneyError) return { ok: false, error: moneyError };

    const parsed = renewMembershipSchema.safeParse({
      membershipId: formData.get("membershipId"),
      planId: formData.get("planId") ?? "",
      startOn: formData.get("startOn") ?? "",
      priceMinor: price.value,
      discountMinor: discount.value,
      discountReason: formData.get("discountReason") ?? "",
      notes: formData.get("notes") ?? "",
      idempotencyKey: formData.get("idempotencyKey") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    // Choosing a start date other than the automatic rule needs extend rights.
    const current = db
      .prepare("SELECT member_id FROM memberships WHERE id = ?")
      .get(parsed.data.membershipId) as { member_id: number } | undefined;
    if (!current) return { ok: false, error: "Membership not found" };
    authorize(
      user,
      parsed.data.startOn
        ? PERMISSIONS.membershipsExtend
        : PERMISSIONS.membershipsRenew,
    );

    const membership = renewMembership(db, user, {
      membershipId: parsed.data.membershipId,
      planId: parsed.data.planId,
      startOn: parsed.data.startOn,
      priceMinor: parsed.data.priceMinor,
      discountMinor: parsed.data.discountMinor,
      discountReason: parsed.data.discountReason,
      notes: parsed.data.notes,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidateMember(membership.member_id);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function freezeMembershipAction(
  formData: FormData,
): Promise<MembershipActionResult> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.membershipsFreeze);
    const parsed = freezeMembershipSchema.safeParse({
      membershipId: formData.get("membershipId"),
      fromOn: formData.get("fromOn"),
      toOn: formData.get("toOn"),
      reason: formData.get("reason") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const db = getDb();
    const membership = freezeMembership(db, user, parsed.data);
    revalidateMember(membership.member_id);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function unfreezeMembershipAction(
  formData: FormData,
): Promise<MembershipActionResult> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.membershipsFreeze);
    const parsed = membershipReasonSchema.safeParse({
      membershipId: formData.get("membershipId"),
      reason: formData.get("reason") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const db = getDb();
    const membership = unfreezeMembership(
      db,
      user,
      parsed.data.membershipId,
      parsed.data.reason,
    );
    revalidateMember(membership.member_id);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function extendMembershipAction(
  formData: FormData,
): Promise<MembershipActionResult> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.membershipsExtend);
    const parsed = extendMembershipSchema.safeParse({
      membershipId: formData.get("membershipId"),
      days: formData.get("days") ?? "",
      months: formData.get("months") ?? "",
      reason: formData.get("reason") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const db = getDb();
    const membership = extendMembership(db, user, {
      membershipId: parsed.data.membershipId,
      days: parsed.data.days,
      months: parsed.data.months,
      reason: parsed.data.reason,
    });
    revalidateMember(membership.member_id);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function suspendMembershipAction(
  formData: FormData,
): Promise<MembershipActionResult> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.membershipsSuspend);
    const parsed = membershipReasonSchema.safeParse({
      membershipId: formData.get("membershipId"),
      reason: formData.get("reason") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const db = getDb();
    const membership = suspendMembership(
      db,
      user,
      parsed.data.membershipId,
      parsed.data.reason,
    );
    revalidateMember(membership.member_id);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function reactivateMembershipAction(
  formData: FormData,
): Promise<MembershipActionResult> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.membershipsSuspend);
    const membershipId = Number(formData.get("membershipId"));
    if (!Number.isInteger(membershipId) || membershipId < 1) {
      return { ok: false, error: "Invalid membership" };
    }
    const db = getDb();
    const membership = reactivateMembership(db, user, membershipId);
    revalidateMember(membership.member_id);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function cancelMembershipAction(
  formData: FormData,
): Promise<MembershipActionResult> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.membershipsCancel);
    const parsed = membershipReasonSchema.safeParse({
      membershipId: formData.get("membershipId"),
      reason: formData.get("reason") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const db = getDb();
    const membership = cancelMembership(
      db,
      user,
      parsed.data.membershipId,
      parsed.data.reason,
    );
    revalidateMember(membership.member_id);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
