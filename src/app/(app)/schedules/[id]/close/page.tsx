"use client";

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ErrorMessage } from '@/components/ErrorMessage';
import { Loading } from '@/components/Loading';
import { supabase } from '@/lib/supabaseClient';
import { buildPaymentSummaries } from '@/lib/payments';
import { formatDateShort, formatHours, formatMoney, formatTimeRange, shortWeekday, toNumber } from '@/lib/domain';
import { Guard, ScheduleAssignment, SchedulePeriod } from '@/lib/types';

type EditableAssignment = ScheduleAssignment & {
  local_completed: string;
  local_worked_hours: string;
  local_notes: string;
};

export default function CloseSchedulePage() {
  const params = useParams<{ id: string }>();
  const [schedule, setSchedule] = useState<SchedulePeriod | null>(null);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [assignments, setAssignments] = useState<EditableAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [params.id]);

  async function loadData() {
    setLoading(true);
    const [scheduleResult, guardsResult, assignmentsResult] = await Promise.all([
      supabase.from('schedule_periods').select('*, locations(*)').eq('id', params.id).single(),
      supabase.from('guards').select('*').order('short_name'),
      supabase
        .from('schedule_assignments')
        .select('*, guards(*), shift_templates(*)')
        .eq('schedule_period_id', params.id)
        .order('service_date')
    ]);

    if (scheduleResult.error) setError(scheduleResult.error.message);
    setSchedule(scheduleResult.data as SchedulePeriod | null);
    setGuards((guardsResult.data ?? []) as Guard[]);

    const rows = ((assignmentsResult.data ?? []) as ScheduleAssignment[]).map((item) => ({
      ...item,
      local_completed: item.completed === false ? 'false' : 'true',
      local_worked_hours: String(item.worked_hours ?? item.planned_hours ?? 0),
      local_notes: item.notes ?? ''
    }));
    setAssignments(rows);
    setLoading(false);
  }

  function updateAssignment(id: string | undefined, value: Partial<EditableAssignment>) {
    if (!id) return;
    setAssignments((previous) => previous.map((item) => item.id === id ? { ...item, ...value } : item));
  }

  async function saveAndGeneratePayments() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const updateRows = assignments.map((item) => ({
      id: item.id,
      schedule_period_id: item.schedule_period_id,
      shift_template_id: item.shift_template_id,
      guard_id: item.guard_id,
      service_date: item.service_date,
      planned_start: item.planned_start,
      planned_end: item.planned_end,
      planned_hours: toNumber(item.planned_hours),
      completed: item.local_completed === 'true',
      worked_hours: item.local_completed === 'true' ? toNumber(item.local_worked_hours) : 0,
      hourly_rate: toNumber(item.hourly_rate),
      total_amount: item.local_completed === 'true' ? Number((toNumber(item.local_worked_hours) * toNumber(item.hourly_rate)).toFixed(2)) : 0,
      notes: item.local_notes || null
    }));

    const { data: updatedRows, error: updateError } = await supabase
      .from('schedule_assignments')
      .upsert(updateRows, { onConflict: 'schedule_period_id,shift_template_id,service_date' })
      .select('*');

    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }

    const summaries = buildPaymentSummaries((updatedRows ?? []) as ScheduleAssignment[], guards);
    if (summaries.length > 0) {
      const { error: paymentError } = await supabase.from('payment_records').upsert(
        summaries.map((item) => ({
          schedule_period_id: params.id,
          guard_id: item.guard_id,
          total_hours: item.total_hours,
          hourly_rate: item.hourly_rate,
          total_amount: item.total_amount,
          status: 'pending_pickup'
        })),
        { onConflict: 'schedule_period_id,guard_id' }
      );

      if (paymentError) {
        setSaving(false);
        setError(paymentError.message);
        return;
      }
    }

    await supabase.from('schedule_periods').update({ status: 'closed' }).eq('id', params.id);
    setSaving(false);
    setSuccess('Quinzena fechada e pagamentos gerados.');
    await loadData();
  }

  if (loading) return <Loading />;
  if (!schedule) return <ErrorMessage message="Escala não encontrada." />;

  const summaries = buildPaymentSummaries(assignments.map((item) => ({
    ...item,
    completed: item.local_completed === 'true',
    worked_hours: item.local_completed === 'true' ? toNumber(item.local_worked_hours) : 0,
    notes: item.local_notes || null
  })), guards);

  return (
    <div>
      <PageHeader
        title="Fechar quinzena"
        description={`${schedule.title} · revise o que foi cumprido antes de gerar pagamentos.`}
        action={<Link className="ghost-button" href={`/schedules/${params.id}`}>Voltar</Link>}
      />

      <section className="card">
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="primary-button" onClick={saveAndGeneratePayments} disabled={saving || assignments.length === 0}>{saving ? 'Salvando...' : 'Salvar fechamento e gerar pagamentos'}</button>
          <Link className="secondary-button" href={`/payments/${params.id}`}>Abrir pagamentos</Link>
        </div>
        <ErrorMessage message={error} />
        {success ? <div className="success-message">{success}</div> : null}
      </section>

      <section className="card">
        <h2>Resumo calculado</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Segurança</th><th>Horas</th><th>Valor/hora</th><th>Total</th></tr></thead>
            <tbody>
              {summaries.map((summary) => {
                const guard = guards.find((item) => item.id === summary.guard_id);
                return <tr key={summary.guard_id}><td>{guard?.short_name ?? '-'}</td><td>{formatHours(summary.total_hours)}</td><td>{formatMoney(summary.hourly_rate)}</td><td>{formatMoney(summary.total_amount)}</td></tr>;
              })}
              {summaries.length === 0 ? <tr><td colSpan={4} className="muted">Nenhum pagamento calculado.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Turnos da quinzena</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Turno</th>
                <th>Segurança</th>
                <th>Cumpriu?</th>
                <th>Horas consideradas</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td><strong>{formatDateShort(assignment.service_date)}</strong> ({shortWeekday(assignment.service_date)})</td>
                  <td>{assignment.shift_templates?.name ?? '-'}<br /><span className="muted small">{formatTimeRange(assignment.planned_start, assignment.planned_end)}</span></td>
                  <td>{assignment.guards?.short_name ?? 'Sem segurança'}</td>
                  <td>
                    <select value={assignment.local_completed} onChange={(event) => updateAssignment(assignment.id, { local_completed: event.target.value })}>
                      <option value="true">Sim</option>
                      <option value="false">Não</option>
                    </select>
                  </td>
                  <td>
                    <input type="number" step="0.01" value={assignment.local_worked_hours} onChange={(event) => updateAssignment(assignment.id, { local_worked_hours: event.target.value })} />
                    <span className="muted small">Previsto: {formatHours(assignment.planned_hours)}</span>
                  </td>
                  <td>
                    <input value={assignment.local_notes} onChange={(event) => updateAssignment(assignment.id, { local_notes: event.target.value })} />
                  </td>
                </tr>
              ))}
              {assignments.length === 0 ? <tr><td colSpan={6} className="muted">Monte e salve a escala antes de fechar a quinzena.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
