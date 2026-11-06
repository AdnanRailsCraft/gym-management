import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { can } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { getDb } from "@/server/db/connection";
import { IconSearch } from "@/components/icons";
import { describeAction } from "@/lib/audit-descriptions";

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
    <div className="page-wide">
      <div className="page-header">
        <div>
          <h1>System Audit Trail</h1>
          <p className="muted" style={{ margin: 0 }}>
            Append-only record of administrative actions, logins, payments, and member changes. Showing {rows.length} of {total} events.
          </p>
        </div>
      </div>

      <form method="get" className="toolbar" style={{ marginBottom: "16px" }}>
        <div className="search-input-wrap" style={{ maxWidth: "340px" }}>
          <IconSearch size={16} className="search-icon-inside" />
          <input
            name="action"
            defaultValue={actionFilter ?? ""}
            placeholder="Filter by action (e.g. member.create, invoice.void)..."
          />
        </div>
        <button type="submit" className="btn-secondary">
          Filter
        </button>
        {actionFilter ? (
          <a href="/audit" className="btn-ghost" style={{ fontSize: "0.86rem" }}>
            Clear filter
          </a>
        ) : null}
      </form>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Timestamp (UTC)</th>
              <th scope="col">User</th>
              <th scope="col">Action Key</th>
              <th scope="col">Target Entity</th>
              <th scope="col">Details &amp; Diff</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "32px" }} className="muted">
                  No audit log entries found.
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.created_at.slice(0, 19).replace("T", " ")}</strong>
                </td>
                <td>
                  <span className="chip" style={{ fontWeight: 600 }}>
                    {r.username ?? `#${r.user_id ?? "system"}`}
                  </span>
                </td>
                <td>
                  <strong>{describeAction(r.action_key)}</strong>
                  <div className="muted small" style={{ marginTop: "2px" }}>
                    <code style={{ fontSize: "0.75rem" }}>{r.action_key}</code>
                  </div>
                </td>
                <td>
                  {r.entity_type ? `${r.entity_type}#${r.entity_id ?? ""}` : <span className="muted">—</span>}
                </td>
                <td>
                  <details>
                    <summary style={{ cursor: "pointer", color: "var(--brand-accent)", fontWeight: 600 }}>
                      View Event Data
                    </summary>
                    <pre className="audit-detail">
                      {[
                        r.before_json ? `before: ${r.before_json}` : null,
                        r.after_json ? `after: ${r.after_json}` : null,
                        r.reason ? `reason: ${r.reason}` : null,
                        `app_version: ${r.app_version}`,
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

      <nav className="pagination" aria-label="Audit pages" style={{ marginTop: "16px", display: "flex", gap: "12px", alignItems: "center" }}>
        {page > 1 ? (
          <a
            className="btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.85rem" }}
            href={`/audit?page=${page - 1}${actionFilter ? `&action=${encodeURIComponent(actionFilter)}` : ""}`}
          >
            ← Previous
          </a>
        ) : null}
        <span className="muted" style={{ fontSize: "0.88rem" }}>
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <a
            className="btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.85rem" }}
            href={`/audit?page=${page + 1}${actionFilter ? `&action=${encodeURIComponent(actionFilter)}` : ""}`}
          >
            Next →
          </a>
        ) : null}
      </nav>
    </div>
  );
}
