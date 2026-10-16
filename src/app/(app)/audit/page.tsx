import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { can } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { getDb } from "@/server/db/connection";

const PAGE_SIZE = 50;

interface AuditRow {
  id: number;
  user_id: number | null;
  username: string | null;
  action_key: string;
  entity_type: string | null;
  entity_id: string | null;
  before_json: string | null;
  after_json: string | null;
  reason: string | null;
  app_version: string;
  created_at: string;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, PERMISSIONS.auditView)) redirect("/");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const actionFilter = params.action?.trim() || null;
  const db = getDb();

  const where = actionFilter ? "WHERE a.action_key = ?" : "";
  const args: (string | number)[] = actionFilter ? [actionFilter] : [];
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM audit_logs a ${where}`)
      .get(...args) as { c: number }
  ).c;
  const offset = (page - 1) * PAGE_SIZE;
  const rows = db
    .prepare(
      `SELECT a.*, u.username
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...args, PAGE_SIZE, offset) as AuditRow[];

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page">
      <h1>Audit log</h1>
      <p className="muted">
        Append-only record of sensitive actions. Showing {rows.length} of {total}.
      </p>
      <form method="get" className="form form-inline filter-bar">
        <label>
          Action key{" "}
          <input name="action" defaultValue={actionFilter ?? ""} placeholder="user.login" />
        </label>
        <button type="submit" className="btn-secondary">
          Filter
        </button>
      </form>
      <div className="card card-left card-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Time (UTC)</th>
              <th scope="col">User</th>
              <th scope="col">Action</th>
              <th scope="col">Entity</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No audit entries yet.
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.created_at.slice(0, 19).replace("T", " ")}</td>
                <td>{r.username ?? `#${r.user_id ?? "?"}`}</td>
                <td>{r.action_key}</td>
                <td>
                  {r.entity_type ? `${r.entity_type}#${r.entity_id ?? ""}` : "—"}
                </td>
                <td>
                  <details>
                    <summary>View</summary>
                    <pre className="audit-detail">
                      {[
                        r.before_json ? `before: ${r.before_json}` : null,
                        r.after_json ? `after: ${r.after_json}` : null,
                        r.reason ? `reason: ${r.reason}` : null,
                        `version: ${r.app_version}`,
                      ]
                        .filter(Boolean)
                        .join("\n")}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="pagination" aria-label="Audit pages">
        {page > 1 ? (
          <a href={`/audit?page=${page - 1}${actionFilter ? `&action=${encodeURIComponent(actionFilter)}` : ""}`}>
            Previous
          </a>
        ) : null}
        <span className="muted">
          Page {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <a href={`/audit?page=${page + 1}${actionFilter ? `&action=${encodeURIComponent(actionFilter)}` : ""}`}>
            Next
          </a>
        ) : null}
      </nav>
    </div>
  );
}
