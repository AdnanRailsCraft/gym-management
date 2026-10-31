"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/connection";
import { authorize, PolicyError } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { emptyToNull } from "@/server/gym-form";
import {
  archiveMember,
  createMember,
  findDuplicateMembers,
  setMemberHealth,
  setMemberStatus,
  updateMember,
  type MemberProfileInput,
} from "@/server/members/service";
import {
  archiveMemberSchema,
  memberHealthSchema,
  memberProfileSchema,
  setMemberStatusSchema,
} from "@/server/members/schemas";

export interface DuplicateWarning {
  id: number;
  member_number: string;
  full_name: string;
  phone: string | null;
}

export interface MemberActionResult {
  ok: boolean;
  error?: string;
  duplicates?: DuplicateWarning[];
}

function fieldsFromForm(formData: FormData) {
  return {
    id: formData.get("id") ?? undefined,
    fullName: formData.get("fullName") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    gender: formData.get("gender") ?? "",
    dateOfBirth: formData.get("dateOfBirth") ?? "",
    address: formData.get("address") ?? "",
    emergencyContactName: formData.get("emergencyContactName") ?? "",
    emergencyContactPhone: formData.get("emergencyContactPhone") ?? "",
    notes: formData.get("notes") ?? "",
    referralSource: formData.get("referralSource") ?? "",
    fitnessGoals: formData.get("fitnessGoals") ?? "",
    marketingConsent: formData.get("marketingConsent") ?? "",
  };
}

function toProfile(
  data: ReturnType<typeof memberProfileSchema.parse>,
): MemberProfileInput {
  return {
    fullName: data.fullName,
    phone: emptyToNull(data.phone),
    email: emptyToNull(data.email?.toLowerCase()),
    gender: emptyToNull(data.gender),
    dateOfBirth: emptyToNull(data.dateOfBirth),
    address: emptyToNull(data.address),
    emergencyContactName: emptyToNull(data.emergencyContactName),
    emergencyContactPhone: emptyToNull(data.emergencyContactPhone),
    notes: emptyToNull(data.notes),
    referralSource: emptyToNull(data.referralSource),
    fitnessGoals: emptyToNull(data.fitnessGoals),
    marketingConsent: data.marketingConsent,
  };
}

function fail(error: unknown): MemberActionResult {
  if (error instanceof PolicyError) return { ok: false, error: error.message };
  return {
    ok: false,
    error: error instanceof Error ? error.message : "The request failed",
  };
}

export async function createMemberAction(
  formData: FormData,
): Promise<MemberActionResult> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.membersCreate);
    const parsed = memberProfileSchema.safeParse(fieldsFromForm(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const profile = toProfile(parsed.data);
    const db = getDb();

    const duplicates = findDuplicateMembers(db, {
      phone: profile.phone,
      email: profile.email,
      fullName: profile.fullName,
    });
    const acknowledged =
      formData.get("acknowledgeDuplicates") === "1" ||
      formData.get("acknowledgeDuplicates") === "on";
    if (duplicates.length > 0 && !acknowledged) {
      return {
        ok: false,
        error: "A similar member already exists. Review the matches below, then save again to continue.",
        duplicates: duplicates.map((m) => ({
          id: m.id,
          member_number: m.member_number,
          full_name: m.full_name,
          phone: m.phone,
        })),
      };
    }

    createMember(db, user, profile);
    revalidatePath("/members");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function updateMemberAction(
  formData: FormData,
): Promise<MemberActionResult> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.membersUpdate);
    const parsed = memberProfileSchema.safeParse(fieldsFromForm(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    if (!parsed.data.id) return { ok: false, error: "Missing member id" };
    const db = getDb();
    updateMember(db, user, parsed.data.id, toProfile(parsed.data));
    revalidatePath("/members");
    revalidatePath(`/members/${parsed.data.id}`);
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setMemberStatusAction(
  formData: FormData,
): Promise<MemberActionResult> {
  const user = await requireUser();
  try {
    const parsed = setMemberStatusSchema.safeParse({
      id: formData.get("id"),
      status: formData.get("status"),
      reason: formData.get("reason") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    authorize(
      user,
      parsed.data.status === "archived"
        ? PERMISSIONS.membersArchive
        : PERMISSIONS.membersUpdate,
    );
    const db = getDb();
    setMemberStatus(db, user, parsed.data.id, parsed.data.status, parsed.data.reason);
    revalidatePath("/members");
    revalidatePath(`/members/${parsed.data.id}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setMemberHealthAction(
  formData: FormData,
): Promise<MemberActionResult> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.membersViewHealth);
    const parsed = memberHealthSchema.safeParse({
      id: formData.get("id"),
      notes: formData.get("notes") ?? "",
      consent: formData.get("consent") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const db = getDb();
    setMemberHealth(db, user, parsed.data.id, {
      notes: parsed.data.notes ?? null,
      consent: parsed.data.consent,
    });
    revalidatePath("/members");
    revalidatePath(`/members/${parsed.data.id}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function archiveMemberAction(
  formData: FormData,
): Promise<MemberActionResult> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.membersArchive);
    const parsed = archiveMemberSchema.safeParse({
      id: formData.get("id"),
      reason: formData.get("reason") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const db = getDb();
    archiveMember(db, user, parsed.data.id, parsed.data.reason);
    revalidatePath("/members");
    revalidatePath(`/members/${parsed.data.id}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
