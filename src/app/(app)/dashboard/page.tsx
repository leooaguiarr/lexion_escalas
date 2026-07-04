"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Badge } from '@/components/Badge';
import { Loading } from '@/components/Loading';
import { supabase } from '@/lib/supabaseClient';
import { formatMoney, statusLabel, formatDateBRShort } from '@/lib/domain';
import { SchedulePeriod } from '@/lib/types';

type DashboardData = {
  schedules: SchedulePeriod[];
  activeCount: number;
  draftCount: number;
  closedCount: number;
  assignmentsCount: number;
  emptyAssignmentsCount: number;
  pendingAmount: number;
  pickedAmount: number;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [{ data: schedules }, { data: assignments }, { data: payments }] = await Promise.all([
      supabase.from('schedule_periods').select('*, locations(*)').order('start_date', { ascending: false }).limit(8),
      supabase.from('schedule_assignments').select('id, guard_id'),
      supabase.from('payment_records').select('status, total_amount')
    ]);

    const scheduleRows = (schedules ?? []) as SchedulePeriod[];
    const assignmentRows = assignments ?? [];
    const paymentRows = payments ?? [];

    setData({
      schedules: scheduleRows,
      activeCount: scheduleRows.filter((item) => item.status === 'active').length,
      draftCount: scheduleRows.filter((item) => item.status === 'draft').length,
      closedCount: scheduleRows.filter((item) => item.status === 'closed').length,
      assignmentsCount: assignmentRows.length,
      emptyAssignmentsCount: assignmentRows.filter((item) => !item.guard_id).length,
      pendingAmount: paymentRows.filter((item) => item.status === 'pending_pickup').reduce((sum, item) => sum + Number(item.total_amount ?? 0), 0),
      pickedAmount: paymentRows.filter((item) => item.status === 'picked_up').reduce((sum, item) => sum + Number(item.total_amount ?? 0), 0)
    });
    setLoading(false);
  }

  async function deleteSchedule(id: string, title: string) {
    const cleanTitle = title.replace(/^escala\s+/i, '');
    const confirmed = window.confirm(`Tem certeza que deseja excluir a escala "${cleanTitle}"? Todos os turnos e pagamentos associados serão perdidos.`);
    if (!confirmed) return;

    const { error: deleteError } = await supabase.from('schedule_periods').delete().eq('id', id);
    if (deleteError) {
      alert(`Erro ao excluir: ${deleteError.message}`);
    } else {
      await loadData();
    }
  }

  if (loading || !data) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Resumo geral das escalas, turnos e pagamentos."
        action={<Link className="primary-button" href="/schedules">Nova escala</Link>}
      />

      <section className="stat-grid">
        <StatCard label="Escalas ativas" value={data.activeCount} hint={`${data.draftCount} em rascunho`} />
        <StatCard label="Escalas fechadas" value={data.closedCount} hint="Prontas para pagamento" />
        <StatCard label="Turnos cadastrados" value={data.assignmentsCount} hint={`${data.emptyAssignmentsCount} vazios`} />
        <StatCard label="Pendente de retirar" value={formatMoney(data.pendingAmount)} hint={`${formatMoney(data.pickedAmount)} já retirado`} />
      </section>

      <section className="card">
        <h2>Últimas escalas</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Escala</th>
                <th>Local</th>
                <th>Período</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.schedules.map((schedule) => {
                const cleanTitle = schedule.title.replace(/^escala\s+/i, '');
                const yearAbbr = schedule.start_date ? schedule.start_date.split('-')[0].slice(-2) : '';
                const displayTitle = yearAbbr ? `${cleanTitle}/${yearAbbr}` : cleanTitle;

                return (
                  <tr key={schedule.id}>
                    <td><strong>{displayTitle}</strong></td>
                    <td>{schedule.locations?.name ?? '-'}</td>
                    <td>{formatDateBRShort(schedule.start_date)} até {formatDateBRShort(schedule.end_date)}</td>
                    <td>
                      <Badge tone={schedule.status === 'closed' ? 'success' : schedule.status === 'active' ? 'info' : 'warning'}>
                        {statusLabel(schedule.status)}
                      </Badge>
                    </td>
                    <td>
                      <div className="actions" style={{ margin: 0, flexWrap: 'nowrap' }}>
                        <Link className="secondary-button" href={`/schedules/${schedule.id}`}>Abrir</Link>
                        <Link className="ghost-button" href={`/schedules/${schedule.id}/builder`}>Montar</Link>
                        <button className="ghost-button" style={{ color: 'var(--danger)' }} onClick={() => deleteSchedule(schedule.id, schedule.title)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
