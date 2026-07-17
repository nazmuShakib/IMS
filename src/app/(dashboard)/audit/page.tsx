import { Card, EmptyState, PageHeader, TableViewport } from '@/components/ui';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/session';

export const dynamic = 'force-dynamic';

const dhaka = (date: Date) =>
  date.toLocaleString('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default async function AuditPage() {
  await requireRole('ADMIN');
  const logs = await prisma.auditLog.findMany({
    take: 200,
    orderBy: { createdAt: 'desc' },
    include: { actor: { select: { name: true, email: true } } },
  });

  return (
    <>
      <PageHeader title="Audit log" count={`Latest ${logs.length} entries`} />
      <Card>
        {logs.length === 0 ? (
          <EmptyState title="No audited actions yet." />
        ) : (
          <TableViewport>
            <table className="w-full">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-rule">
                <th className="eyebrow px-4 py-2.5 text-left">When</th>
                <th className="eyebrow px-4 py-2.5 text-left">Actor</th>
                <th className="eyebrow px-4 py-2.5 text-left">Action</th>
                <th className="eyebrow px-4 py-2.5 text-left">Entity</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-rule-soft last:border-0">
                  <td className="tnum px-4 py-2.5 text-[11px] text-graphite">{dhaka(log.createdAt)}</td>
                  <td className="px-4 py-2.5 text-[12px]">{log.actor?.name ?? 'System'}</td>
                  <td className="tnum px-4 py-2.5 text-[12px]">{log.action}</td>
                  <td className="px-4 py-2.5 text-[12px] text-graphite">
                    {log.entity}{log.entityId ? ` · ${log.entityId}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </TableViewport>
        )}
      </Card>
    </>
  );
}
