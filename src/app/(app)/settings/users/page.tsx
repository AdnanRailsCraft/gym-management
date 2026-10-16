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
    <div className="page">
      <h1>Users</h1>
      <div className="card card-left">
        <CreateUserForm />
      </div>
      <div className="card card-left">
        <h2>Existing users</h2>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Username</th>
              <th scope="col">Name</th>
              <th scope="col">Roles</th>
              <th scope="col">Status</th>
              <th scope="col">Last login</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.fullName}</td>
                <td>
                  <RolesForm userId={u.id} currentRoles={u.roles} />
                </td>
                <td>
                  <span className={u.isActive ? "badge badge-ok" : "badge badge-bad"}>
                    {u.isActive ? "Active" : "Deactivated"}
                  </span>
                </td>
                <td>{u.lastLoginAt ? u.lastLoginAt.slice(0, 19).replace("T", " ") : "—"}</td>
                <td>
                  {u.id === user.id ? (
                    <span className="muted">You</span>
                  ) : (
                    <div className="row-actions">
                      <form action={setUserActiveAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="active" value={u.isActive ? "0" : "1"} />
                        <button type="submit" className="btn-secondary">
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
  );
}
