import type { Metadata } from "next";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/connection";
import { can } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { listAttendanceToday } from "@/server/attendance/service";
import { gymSettings } from "@/server/members/context";
import { AttendanceClient } from "./attendance-client";

export const metadata: Metadata = {
  title: "Attendance — Empire Fitness",
};

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const user = await requireUser();
  const canView = can(user, PERMISSIONS.attendanceView);
  const canRecord = can(user, PERMISSIONS.attendanceRecord);
  if (!canView) {
    return (
      <div className="page-wide">
        <div className="section">
          <h2>Access Denied</h2>
          <p className="muted">You do not have permission to view attendance.</p>
        </div>
      </div>
    );
  }
  const db = getDb();
  const items = listAttendanceToday(db);
  const settings = gymSettings(db);
  const window = Number(settings.duplicate_checkin_window_minutes ?? 10) || 10;

  return (
    <div className="page-wide">
      <div className="page-header">
        <div>
          <h1>Attendance &amp; Check-In</h1>
          <p className="muted" style={{ margin: 0 }}>
            Real-time front-desk check-in, barcode scanning, and daily attendance logs.
          </p>
        </div>
      </div>
      <AttendanceClient
        initialItems={items}
        canRecord={canRecord}
        canOverride={can(user, PERMISSIONS.attendanceOverride)}
        duplicateWindowMinutes={window}
      />
    </div>
  );
}
