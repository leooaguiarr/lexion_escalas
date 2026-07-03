"use client";

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { Loading } from '@/components/Loading';
import { ErrorMessage } from '@/components/ErrorMessage';
import { supabase } from '@/lib/supabaseClient';
import { formatDateBR, statusLabel } from '@/lib/domain';
import { SchedulePeriod, ShiftTemplate } from '@/lib/types';

export default function ScheduleDetailPage() {
  const params = useParams<{ id: string }>();
  const [schedule, setSchedule] = useState<SchedulePeriod | null>(null);
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [params.id]);

  async function loadData() {
    setLoading(true);
    const [{ data: scheduleData, error: scheduleError }, { data: shiftData }] = await Promise.all([
      supabase.from('schedule_periods').select('*, locations(*)').eq('id', params.id).single(),
      supabase.from('shift_templates').select('*').eq('schedule_period_id', params.id).order('position')
    ]);
    if (scheduleError) setError(scheduleError.message);
    setSchedule(scheduleData as SchedulePeriod | null);
    setShifts((shiftData ?? []) as ShiftTemplate[]);
    setLoading(false);
  }

  async function updateStatus(status: 'draft' | 'active' | 'closed') {
    await supabase.from('schedule_periods').update({ status }).eq('id', params.id);
    await loadData();
  }

  if (loading) return <Loading />;
  if (!schedule) return <ErrorMessage message={error ?? 'Escala não encontrada.'} />;

  return (
    <div>
      <PageHeader
        title={schedule.title}
        description={`${schedule.locations?.name ?? 'Local'} · ${formatDateBR(schedule.start_date)} até ${formatDateBR(schedule.end_date)}`}
        action={<Badge tone={schedule.status === 'closed' ? 'success' : schedule.status === 'active' ? 'info' : 'warning'}>{statusLabel(schedule.status)}</Badge>}
      />

      <section className="card">
        <h2>Próximos passos</h2>
        <div className="grid grid-3">
          <Link className="secondary-button" href={`/schedules/${schedule.id}/shifts`}>1. Configurar turnos</Link>
          <Link className="secondary-button" href={`/schedules/${schedule.id}/availability`}>2. Disponibilidade</Link>
          <Link className="primary-button" href={`/schedules/${schedule.id}/builder`}>3. Montar escala</Link>
          <Link className="secondary-button" href={`/schedules/${schedule.id}/pdf`}>Gerar PDF</Link>
          <Link className="secondary-button" href={`/schedules/${schedule.id}/close`}>Fechar quinzena</Link>
          <Link className="secondary-button" href={`/payments/${schedule.id}`}>Pagamentos</Link>
        </div>
      </section>

      <section className="card">
        <h2>Turnos configurados</h2>
        {shifts.length === 0 ? <p className="muted">Nenhum turno configurado.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Posição</th><th>Nome</th><th>Horário</th></tr></thead>
              <tbody>
                {shifts.map((shift) => (
                  <tr key={shift.id}>
                    <td>{shift.position}</td>
                    <td>{shift.name}</td>
                    <td>{shift.start_time.slice(0, 5)} às {shift.end_time.slice(0, 5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Status da escala</h2>
        <div className="actions">
          <button className="ghost-button" onClick={() => updateStatus('draft')}>Marcar como rascunho</button>
          <button className="secondary-button" onClick={() => updateStatus('active')}>Marcar como ativa</button>
          <button className="primary-button" onClick={() => updateStatus('closed')}>Marcar como fechada</button>
        </div>
      </section>
    </div>
  );
}
