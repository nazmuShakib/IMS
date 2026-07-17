import { changeUserRole, toggleUserActive } from '@/actions/users';
import { CreateUserForm } from '@/components/auth/CreateUserForm';
import { Badge, Button, Card, PageHeader, Select, TableViewport } from '@/components/ui';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const current = await requireRole('ADMIN');
  const users = await prisma.user.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });

  return (
    <>
      <PageHeader title="Users" count={`${users.length} accounts`} />
      <CreateUserForm />
      <Card>
        <TableViewport>
          <table className="w-full">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-rule">
              <th className="eyebrow px-4 py-2.5 text-left">User</th>
              <th className="eyebrow px-4 py-2.5 text-left">Role</th>
              <th className="eyebrow px-4 py-2.5 text-left">Status</th>
              <th className="eyebrow px-4 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-rule-soft last:border-0">
                <td className="px-4 py-3">
                  <p className="text-[13px] font-medium">{user.name}</p>
                  <p className="tnum text-[11px] text-graphite">{user.email}</p>
                </td>
                <td className="px-4 py-3">
                  {user.id === current.id ? (
                    <Badge tone="signal">{user.role}</Badge>
                  ) : (
                    <form action={changeUserRole} className="flex gap-2">
                      <input type="hidden" name="userId" value={user.id} />
                      <Select
                        key={user.role}
                        name="role"
                        defaultValue={user.role}
                        className="max-w-32"
                      >
                        <option value="STAFF">Staff</option>
                        <option value="MANAGER">Manager</option>
                        <option value="ADMIN">Admin</option>
                      </Select>
                      <Button type="submit" variant="ghost">Save</Button>
                    </form>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={user.isActive ? 'ok' : 'out'}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {user.id !== current.id && (
                    <form action={toggleUserActive}>
                      <input type="hidden" name="userId" value={user.id} />
                      <Button type="submit" variant={user.isActive ? 'danger' : 'ghost'}>
                        {user.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </TableViewport>
      </Card>
    </>
  );
}
