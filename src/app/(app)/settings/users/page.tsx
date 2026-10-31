import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { can } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { getDb } from "@/server/db/connection";
import { listUsers } from "@/server/users/service";
import { setUserActiveAction } from "./actions";
import { CreateUserForm, ResetPasswordForm, RolesForm } from "./user-forms";

export default async function UsersPage() {
  const user = await requireUser();
  if (!can(user, PERMISSIONS.settingsUsersManage)) redirect("/");
  const users = listUsers(getDb());
  return (
    <div className="page-wide">
      <div className="page-header">
        <div>
          <h1>Staff &amp; User Accounts</h1>
          <p className="muted" style={{ margin: 0 }}>
            Manage staff login accounts, role-based access permissions, and account passwords.
          </p>
        </div>
      </div>
      <div className="section" style={{ maxWidth: "800px" }}>
        <CreateUserForm />
      </div>
      <div className="section">
        <h2>Existing Staff Accounts</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Username</th>
                <th scope="col">Full Name</th>
                <th scope="col">Assigned Roles</th>
                <th scope="col">Status</th>
                <th scope="col">Last Login</th>
                <th scope="col" style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.username}</strong>
                  </td>
                  <td>{u.fullName}</td>
                  <td>
                    <RolesForm userId={u.id} currentRoles={u.roles} />
                  </td>
                  <td>
                    <span className={u.isActive ? "chip chip-ok" : "chip chip-bad"}>
                      {u.isActive ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td>{u.lastLoginAt ? u.lastLoginAt.slice(0, 19).replace("T", " ") : "Never"}</td>
                  <td>
                    {u.id === user.id ? (
                      <span className="muted" style={{ display: "block", textAlign: "right" }}>
                        Current Account
                      </span>
                    ) : (
                      <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                        <form action={setUserActiveAction}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="active" value={u.isActive ? "0" : "1"} />
                          <button
                            type="submit"
                            className="btn-secondary"
                            style={{ padding: "4px 8px", fontSize: "0.82rem" }}
                          >
                            {u.isActive ? "Deactivate" : "Reactivate"}
                          </button>
                        </form>
                        <ResetPasswordForm userId={u.id} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
