"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Loading } from '@/components/Loading';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/Badge';
import { supabase } from '@/lib/supabaseClient';
import { formatDateBR, statusLabel, calculateScheduleStatus } from '@/lib/domain';
import { SchedulePeriod } from '@/lib/types';

export default function ReportsPage() {
  const [schedules, setSchedules] = useState<SchedulePeriod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase
      .from('schedule_periods')
      .select('*, locations(*)')
      .order('start_date', { ascending: false });
    setSchedules((data ?? []) as SchedulePeriod[]);
    setLoading(false);
  }

  return (
    <div>
      <PageHeader title="Relatórios" description="Acesse PDF da escala e relatório financeiro por quinzena." />

      <section className="card">
        {loading ? <Loading /> : schedules.length === 0 ? <EmptyState title="Nenhuma escala para relatório" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Escala</th><th>Local</th><th>Período</th><th>Status</th><th>Relatórios</th></tr></thead>
              <tbody>
                {schedules.map((schedule) => (
                  <tr key={schedule.id}>
                    <td><strong>{schedule.title}</strong></td>
                    <td>{schedule.locations?.name ?? '-'}</td>
                    <td>{formatDateBR(schedule.start_date)} até {formatDateBR(schedule.end_date)}</td>
                    <td>
                      {(() => {
                        const calculatedStatus = calculateScheduleStatus(schedule.start_date, schedule.end_date);
                        return (
                          <Badge tone={calculatedStatus === 'closed' ? 'success' : calculatedStatus === 'active' ? 'info' : 'warning'}>
                            {statusLabel(calculatedStatus)}
                          </Badge>
                        );
                      })()}
                    </td>
                    <td>
                      <div className="actions" style={{ margin: 0 }}>
                        <Link className="secondary-button" href={`/schedules/${schedule.id}/pdf`}>PDF da escala</Link>
                        <Link className="ghost-button" href={`/payments/${schedule.id}`}>Pagamento</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
