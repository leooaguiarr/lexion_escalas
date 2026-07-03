"use client";

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { ErrorMessage } from '@/components/ErrorMessage';
import { Loading } from '@/components/Loading';
import { supabase } from '@/lib/supabaseClient';
import { buildPaymentSummaries } from '@/lib/payments';
import { formatDateBR, formatHours, formatMoney, statusLabel } from '@/lib/domain';
import { Guard, PaymentRecord, ScheduleAssignment, SchedulePeriod } from '@/lib/types';

export default function SchedulePaymentsPage() {
  const params = useParams<{ scheduleId: string }>();
  const [schedule, setSchedule] = useState<SchedulePeriod | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [assignments, setAssignments] = useState<ScheduleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [params.scheduleId]);

  async function loadData() {
    setLoading(true);
    const [scheduleResult, paymentResult, guardResult, assignmentResult] = await Promise.all([
      supabase.from('schedule_periods').select('*, locations(*)').eq('id', params.scheduleId).single(),
      supabase.from('payment_records').select('*, guards(*)').eq('schedule_period_id', params.scheduleId).order('total_amount', { ascending: false }),
      supabase.from('guards').select('*').order('short_name'),
      supabase.from('schedule_assignments').select('*').eq('schedule_period_id', params.scheduleId)
    ]);
    if (scheduleResult.error) setError(scheduleResult.error.message);
    setSchedule(scheduleResult.data as SchedulePeriod | null);
    setPayments((paymentResult.data ?? []) as PaymentRecord[]);
    setGuards((guardResult.data ?? []) as Guard[]);
    setAssignments((assignmentResult.data ?? []) as ScheduleAssignment[]);
    setLoading(false);
  }

  async function regeneratePayments() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const summaries = buildPaymentSummaries(assignments, guards);
    if (summaries.length === 0) {
      setSaving(false);
      setError('Nenhum turno com segurança encontrado para gerar pagamentos.');
      return;
    }

    const { error: upsertError } = await supabase.from('payment_records').upsert(
      summaries.map((item) => ({
        schedule_period_id: params.scheduleId,
        guard_id: item.guard_id,
        total_hours: item.total_hours,
        hourly_rate: item.hourly_rate,
        total_amount: item.total_amount,
        status: 'pending_pickup'
      })),
      { onConflict: 'schedule_period_id,guard_id' }
    );

    setSaving(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setSuccess('Pagamentos gerados/atualizados.');
    await loadData();
  }

  async function markPicked(payment: PaymentRecord) {
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from('payment_records').update({ status: 'picked_up', picked_up_at: today }).eq('id', payment.id);
    await loadData();
  }

  async function markPending(payment: PaymentRecord) {
    await supabase.from('payment_records').update({ status: 'pending_pickup', picked_up_at: null }).eq('id', payment.id);
    await loadData();
  }

  async function updatePickedDate(payment: PaymentRecord, date: string) {
    await supabase.from('payment_records').update({ picked_up_at: date || null }).eq('id', payment.id);
    await loadData();
  }

  function exportCsv() {
    const lines = [
      ['Segurança', 'Horas', 'Valor por hora', 'Total', 'Status', 'Data retirada'].join(';'),
      ...payments.map((payment) => [
        payment.guards?.short_name ?? payment.guard_id,
        String(payment.total_hours).replace('.', ','),
        String(payment.hourly_rate).replace('.', ','),
        String(payment.total_amount).replace('.', ','),
        statusLabel(payment.status),
        payment.picked_up_at ? formatDateBR(payment.picked_up_at) : ''
      ].join(';'))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pagamentos-${schedule?.title ?? 'escala'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <Loading />;
  if (!schedule) return <ErrorMessage message="Escala não encontrada." />;

  const pending = payments.filter((item) => item.status === 'pending_pickup').reduce((sum, item) => sum + Number(item.total_amount), 0);
  const picked = payments.filter((item) => item.status === 'picked_up').reduce((sum, item) => sum + Number(item.total_amount), 0);

  return (
    <div>
      <PageHeader
        title="Pagamentos da quinzena"
        description={`${schedule.title} · ${formatDateBR(schedule.start_date)} até ${formatDateBR(schedule.end_date)}`}
        action={<Link className="ghost-button" href="/payments">Voltar</Link>}
      />

      <section className="stat-grid">
        <div className="stat-card"><span>Total de seguranças</span><strong>{payments.length}</strong></div>
        <div className="stat-card"><span>Pendente</span><strong>{formatMoney(pending)}</strong></div>
        <div className="stat-card"><span>Retirado</span><strong>{formatMoney(picked)}</strong></div>
        <div className="stat-card"><span>Total</span><strong>{formatMoney(pending + picked)}</strong></div>
      </section>

      <section className="card">
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="primary-button" onClick={regeneratePayments} disabled={saving}>{saving ? 'Gerando...' : 'Gerar/atualizar pagamentos'}</button>
          <button className="secondary-button" onClick={exportCsv} disabled={payments.length === 0}>Exportar CSV</button>
          <Link className="ghost-button" href={`/schedules/${params.scheduleId}/close`}>Revisar fechamento</Link>
        </div>
        <ErrorMessage message={error} />
        {success ? <div className="success-message">{success}</div> : null}
      </section>

      <section className="card">
        <h2>Controle de retirada em dinheiro</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Segurança</th><th>Horas</th><th>Valor/hora</th><th>Total</th><th>Status</th><th>Data retirada</th><th>Ações</th></tr></thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td><strong>{payment.guards?.short_name ?? '-'}</strong><br /><span className="muted small">{payment.guards?.full_name}</span></td>
                  <td>{formatHours(payment.total_hours)}</td>
                  <td>{formatMoney(payment.hourly_rate)}</td>
                  <td><strong>{formatMoney(payment.total_amount)}</strong></td>
                  <td><Badge tone={payment.status === 'picked_up' ? 'success' : 'warning'}>{statusLabel(payment.status)}</Badge></td>
                  <td><input type="date" value={payment.picked_up_at ?? ''} onChange={(event) => updatePickedDate(payment, event.target.value)} /></td>
                  <td>
                    <div className="actions" style={{ margin: 0 }}>
                      {payment.status === 'pending_pickup'
                        ? <button className="primary-button" onClick={() => markPicked(payment)}>Marcar retirado</button>
                        : <button className="ghost-button" onClick={() => markPending(payment)}>Voltar pendente</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {payments.length === 0 ? <tr><td colSpan={7} className="muted">Nenhum pagamento gerado. Use o botão acima ou feche a quinzena.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
