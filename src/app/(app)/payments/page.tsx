"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { Loading } from '@/components/Loading';
import { EmptyState } from '@/components/EmptyState';
import { supabase } from '@/lib/supabaseClient';
import { formatDateBR, statusLabel } from '@/lib/domain';
import { SchedulePeriod } from '@/lib/types';

export default function PaymentsPage() {
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
      <PageHeader title="Pagamentos" description="Selecione uma escala para controlar retirada do dinheiro por segurança." />
      <section className="card">
        {loading ? <Loading /> : schedules.length === 0 ? <EmptyState title="Nenhuma escala encontrada" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Escala</th><th>Local</th><th>Período</th><th>Status</th><th>Ação</th></tr></thead>
              <tbody>
                {schedules.map((schedule) => (
                  <tr key={schedule.id}>
                    <td><strong>{schedule.title}</strong></td>
                    <td>{schedule.locations?.name ?? '-'}</td>
                    <td>{formatDateBR(schedule.start_date)} até {formatDateBR(schedule.end_date)}</td>
                    <td><Badge tone={schedule.status === 'closed' ? 'success' : schedule.status === 'active' ? 'info' : 'warning'}>{statusLabel(schedule.status)}</Badge></td>
                    <td><Link className="secondary-button" href={`/payments/${schedule.id}`}>Abrir pagamentos</Link></td>
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
