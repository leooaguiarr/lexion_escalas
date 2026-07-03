"use client";

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { ErrorMessage } from '@/components/ErrorMessage';
import { Loading } from '@/components/Loading';
import { supabase } from '@/lib/supabaseClient';
import { availabilityLabel, calculateHours, dateRange, formatDateShort, formatHours, formatMoney, formatTimeRange, shortWeekday, statusLabel } from '@/lib/domain';
import { Guard, GuardAvailability, ScheduleAssignment, SchedulePeriod, ShiftTemplate } from '@/lib/types';

function assignmentKey(date: string, shiftId: string) {
  return `${date}__${shiftId}`;
}

function availabilityKey(guardId: string, date: string) {
  return `${guardId}__${date}`;
}

export default function ScheduleBuilderPage() {
  const params = useParams<{ id: string }>();
  const [schedule, setSchedule] = useState<SchedulePeriod | null>(null);
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [availability, setAvailability] = useState<Record<string, GuardAvailability>>({});
  const [assignments, setAssignments] = useState<Record<string, ScheduleAssignment>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const dates = useMemo(() => schedule ? dateRange(schedule.start_date, schedule.end_date) : [], [schedule]);

  useEffect(() => {
    loadData();
  }, [params.id]);

  async function loadData() {
    setLoading(true);
    setError(null);
    const [scheduleResult, shiftResult, guardResult, availabilityResult, assignmentResult] = await Promise.all([
      supabase.from('schedule_periods').select('*, locations(*)').eq('id', params.id).single(),
      supabase.from('shift_templates').select('*').eq('schedule_period_id', params.id).order('position'),
      supabase.from('guards').select('*').eq('status', 'active').order('short_name'),
      supabase.from('guard_availability').select('*').eq('schedule_period_id', params.id),
      supabase.from('schedule_assignments').select('*').eq('schedule_period_id', params.id)
    ]);

    if (scheduleResult.error) setError(scheduleResult.error.message);
    setSchedule(scheduleResult.data as SchedulePeriod | null);
    setShifts((shiftResult.data ?? []) as ShiftTemplate[]);
    setGuards((guardResult.data ?? []) as Guard[]);

    const availabilityMap: Record<string, GuardAvailability> = {};
    ((availabilityResult.data ?? []) as GuardAvailability[]).forEach((item) => {
      availabilityMap[availabilityKey(item.guard_id, item.availability_date)] = item;
    });
    setAvailability(availabilityMap);

    const assignmentMap: Record<string, ScheduleAssignment> = {};
    ((assignmentResult.data ?? []) as ScheduleAssignment[]).forEach((item) => {
      assignmentMap[assignmentKey(item.service_date, item.shift_template_id)] = item;
    });
    setAssignments(assignmentMap);
    setLoading(false);
  }

  function getAssignment(date: string, shift: ShiftTemplate): ScheduleAssignment {
    const key = assignmentKey(date, shift.id);
    return assignments[key] ?? {
      schedule_period_id: params.id,
      shift_template_id: shift.id,
      guard_id: null,
      service_date: date,
      planned_start: shift.start_time,
      planned_end: shift.end_time,
      planned_hours: calculateHours(shift.start_time, shift.end_time),
      completed: null,
      worked_hours: null,
      hourly_rate: 0,
      total_amount: 0,
      notes: null
    };
  }

  function getAvailability(guardId: string, date: string): GuardAvailability | null {
    return availability[availabilityKey(guardId, date)] ?? null;
  }

  function sortedGuardsForDate(date: string) {
    return [...guards].sort((a, b) => {
      const avA = getAvailability(a.id, date);
      const avB = getAvailability(b.id, date);
      const score = (av: GuardAvailability | null) => {
        if (!av) return 2;
        if (av.availability_status === 'available') return 0;
        if (av.availability_status === 'not_informed') return 1;
        return 3;
      };
      return score(avA) - score(avB) || a.short_name.localeCompare(b.short_name);
    });
  }

  function updateGuard(date: string, shift: ShiftTemplate, guardId: string) {
    const key = assignmentKey(date, shift.id);
    const guard = guards.find((item) => item.id === guardId);
    const hours = calculateHours(shift.start_time, shift.end_time);
    const hourlyRate = guard ? Number(guard.hourly_rate) : 0;
    setAssignments((previous) => ({
      ...previous,
      [key]: {
        ...getAssignment(date, shift),
        guard_id: guardId || null,
        planned_start: shift.start_time,
        planned_end: shift.end_time,
        planned_hours: hours,
        hourly_rate: hourlyRate,
        total_amount: Number((hours * hourlyRate).toFixed(2))
      }
    }));
  }

  function guardsAssignedOnDate(date: string): Record<string, number> {
    const counts: Record<string, number> = {};
    shifts.forEach((shift) => {
      const guardId = getAssignment(date, shift).guard_id;
      if (guardId) counts[guardId] = (counts[guardId] ?? 0) + 1;
    });
    return counts;
  }

  function cellAlerts(date: string, assignment: ScheduleAssignment, counts: Record<string, number>) {
    if (!assignment.guard_id) return [];
    const alerts: string[] = [];
    const av = getAvailability(assignment.guard_id, date);
    if (av?.availability_status === 'unavailable') alerts.push('Indisponível');
    if (!av) alerts.push('Sem disponibilidade');
    if ((counts[assignment.guard_id] ?? 0) > 1) alerts.push('Dobrou');
    return alerts;
  }

  async function saveAssignments(markActive = false) {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const rows = dates.flatMap((date) => shifts.map((shift) => {
      const assignment = getAssignment(date, shift);
      const guard = guards.find((item) => item.id === assignment.guard_id);
      const hours = calculateHours(shift.start_time, shift.end_time);
      const hourlyRate = guard ? Number(guard.hourly_rate) : 0;
      return {
        schedule_period_id: params.id,
        shift_template_id: shift.id,
        guard_id: assignment.guard_id,
        service_date: date,
        planned_start: shift.start_time,
        planned_end: shift.end_time,
        planned_hours: hours,
        completed: assignment.completed,
        worked_hours: assignment.worked_hours,
        hourly_rate: hourlyRate,
        total_amount: Number((hours * hourlyRate).toFixed(2)),
        notes: assignment.notes
      };
    }));

    const { error: upsertError } = await supabase
      .from('schedule_assignments')
      .upsert(rows, { onConflict: 'schedule_period_id,shift_template_id,service_date' });

    if (upsertError) {
      setSaving(false);
      setError(upsertError.message);
      return;
    }

    if (markActive) {
      await supabase.from('schedule_periods').update({ status: 'active' }).eq('id', params.id);
    }

    setSaving(false);
    setSuccess(markActive ? 'Escala salva e marcada como ativa.' : 'Escala salva.');
    await loadData();
  }

  if (loading) return <Loading />;
  if (!schedule) return <ErrorMessage message="Escala não encontrada." />;

  const totalSlots = dates.length * shifts.length;
  const filledSlots = dates.reduce((sum, date) => sum + shifts.filter((shift) => getAssignment(date, shift).guard_id).length, 0);
  const estimatedTotal = Object.values(assignments).reduce((sum, item) => sum + Number(item.total_amount ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Montar escala"
        description={`${schedule.title} · ${schedule.locations?.name ?? ''}`}
        action={<Link className="ghost-button" href={`/schedules/${params.id}`}>Voltar</Link>}
      />

      <section className="stat-grid">
        <div className="stat-card"><span>Status</span><strong>{statusLabel(schedule.status)}</strong></div>
        <div className="stat-card"><span>Turnos preenchidos</span><strong>{filledSlots}/{totalSlots}</strong></div>
        <div className="stat-card"><span>Dias</span><strong>{dates.length}</strong></div>
        <div className="stat-card"><span>Total estimado</span><strong>{formatMoney(estimatedTotal)}</strong></div>
      </section>

      <section className="card">
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="primary-button" onClick={() => saveAssignments(false)} disabled={saving || shifts.length === 0}>{saving ? 'Salvando...' : 'Salvar escala'}</button>
          <button className="secondary-button" onClick={() => saveAssignments(true)} disabled={saving || shifts.length === 0}>Salvar e marcar ativa</button>
          <Link className="ghost-button" href={`/schedules/${params.id}/pdf`}>Pré-visualizar PDF</Link>
          <Link className="ghost-button" href={`/schedules/${params.id}/availability`}>Editar disponibilidade</Link>
        </div>
        <ErrorMessage message={error} />
        {success ? <div className="success-message">{success}</div> : null}
        {shifts.length === 0 ? <p className="muted">Configure pelo menos um turno antes de montar a escala.</p> : null}
      </section>

      <section className="card">
        <h2>Grade da escala</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                {shifts.map((shift) => <th key={shift.id}>{shift.name}<br /><span className="muted">{formatTimeRange(shift.start_time, shift.end_time)}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => {
                const counts = guardsAssignedOnDate(date);
                return (
                  <tr key={date}>
                    <td><strong>{formatDateShort(date)}</strong><br /><span className="muted">({shortWeekday(date)})</span></td>
                    {shifts.map((shift) => {
                      const assignment = getAssignment(date, shift);
                      const alerts = cellAlerts(date, assignment, counts);
                      return (
                        <td key={shift.id}>
                          <select className="builder-select" value={assignment.guard_id ?? ''} onChange={(event) => updateGuard(date, shift, event.target.value)}>
                            <option value="">Sem segurança</option>
                            {sortedGuardsForDate(date).map((guard) => {
                              const av = getAvailability(guard.id, date);
                              const label = av ? availabilityLabel(av.availability_status, av.preference) : 'Sem disponibilidade';
                              return <option key={guard.id} value={guard.id}>{guard.short_name} — {label}</option>;
                            })}
                          </select>
                          <div className="cell-alerts">
                            {assignment.guard_id ? <span className="muted small">{formatHours(calculateHours(shift.start_time, shift.end_time))}</span> : null}
                            {alerts.map((alert) => <Badge key={alert} tone={alert === 'Dobrou' ? 'warning' : 'danger'}>{alert}</Badge>)}
                          </div>
                        </td>
                      );
                    })}
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
