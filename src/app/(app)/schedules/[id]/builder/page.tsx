"use client";

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { ErrorMessage } from '@/components/ErrorMessage';
import { Loading } from '@/components/Loading';
import { supabase } from '@/lib/supabaseClient';
import {
  availabilityLabel,
  calculateHours,
  dateRange,
  formatDateShort,
  formatHours,
  formatMoney,
  formatTimeRange,
  fullWeekday,
  parseISODate,
  shortWeekday,
  statusLabel,
} from '@/lib/domain';
import { Guard, GuardAvailability, ScheduleAssignment, SchedulePeriod, ShiftTemplate } from '@/lib/types';

/* ─── Helpers ─── */

function assignmentKey(date: string, shiftId: string) {
  return `${date}__${shiftId}`;
}

function availabilityKey(guardId: string, date: string) {
  return `${guardId}__${date}`;
}

const WEEKDAY_HEADERS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/* ─── Component ─── */

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

  // Active cell for popover
  const [activeCell, setActiveCell] = useState<{ date: string; shiftId: string; x: number; y: number } | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  const dates = useMemo(() => schedule ? dateRange(schedule.start_date, schedule.end_date) : [], [schedule]);

  // Build calendar grid with padding
  const calendarWeeks = useMemo(() => {
    if (dates.length === 0) return [];
    const weeks: (string | null)[][] = [];
    let currentWeek: (string | null)[] = [];

    const firstDay = parseISODate(dates[0]).getDay();
    for (let i = 0; i < firstDay; i++) currentWeek.push(null);

    dates.forEach((date) => {
      currentWeek.push(date);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }

    return weeks;
  }, [dates]);

  useEffect(() => { loadData(); }, [params.id]);

  // Close popover on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setActiveCell(null);
        setSearchFilter('');
      }
    }
    if (activeCell) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeCell]);

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

  function getCellAlerts(date: string, assignment: ScheduleAssignment, counts: Record<string, number>) {
    if (!assignment.guard_id) return [];
    const alerts: { text: string; tone: 'warning' | 'danger' }[] = [];
    const av = getAvailability(assignment.guard_id, date);
    if (av?.availability_status === 'unavailable') alerts.push({ text: 'Indisponível', tone: 'danger' });
    if (!av) alerts.push({ text: 'Sem disp.', tone: 'danger' });
    if ((counts[assignment.guard_id] ?? 0) > 1) alerts.push({ text: 'Dobra', tone: 'warning' });
    return alerts;
  }

  function getGuardForAssignment(date: string, shift: ShiftTemplate): Guard | null {
    const assignment = getAssignment(date, shift);
    if (!assignment.guard_id) return null;
    return guards.find(g => g.id === assignment.guard_id) ?? null;
  }

  // Quick-fill: for each day, assign guards in round-robin to each shift
  function autoFillAvailable() {
    const updates: Record<string, ScheduleAssignment> = {};

    dates.forEach((date) => {
      const sorted = sortedGuardsForDate(date).filter(g => {
        const av = getAvailability(g.id, date);
        return av?.availability_status === 'available';
      });
      const used = new Set<string>();

      shifts.forEach((shift) => {
        const existing = getAssignment(date, shift);
        if (existing.guard_id) {
          used.add(existing.guard_id);
          return; // already assigned
        }
        const candidate = sorted.find(g => !used.has(g.id));
        if (candidate) {
          used.add(candidate.id);
          const hours = calculateHours(shift.start_time, shift.end_time);
          const hourlyRate = Number(candidate.hourly_rate);
          updates[assignmentKey(date, shift.id)] = {
            ...existing,
            guard_id: candidate.id,
            hourly_rate: hourlyRate,
            total_amount: Number((hours * hourlyRate).toFixed(2))
          };
        }
      });
    });

    if (Object.keys(updates).length > 0) {
      setAssignments(prev => ({ ...prev, ...updates }));
    }
  }

  function clearAll() {
    const updates: Record<string, ScheduleAssignment> = {};
    dates.forEach((date) => {
      shifts.forEach((shift) => {
        const key = assignmentKey(date, shift.id);
        updates[key] = {
          ...getAssignment(date, shift),
          guard_id: null,
          hourly_rate: 0,
          total_amount: 0
        };
      });
    });
    setAssignments(prev => ({ ...prev, ...updates }));
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
      <style>{`
        /* ─── Builder Calendar Layout ─── */
        .builder-cal-weekdays {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 6px;
          margin-bottom: 6px;
        }
        .builder-cal-wd {
          text-align: center;
          font-size: 11px;
          font-weight: 600;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 8px 0;
        }
        .builder-cal-wd.weekend { color: #dc2626; opacity: 0.6; }

        .builder-cal-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 6px;
        }

        .builder-day-cell {
          border-radius: 12px;
          border: 1px solid var(--border);
          background: white;
          min-height: 100px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: all 0.15s;
        }
        .builder-day-cell:hover {
          box-shadow: 0 2px 12px rgba(0,0,0,0.06);
          border-color: #cbd5e1;
        }
        .builder-day-cell.empty {
          background: transparent;
          border-color: transparent;
          box-shadow: none;
          pointer-events: none;
        }
        .builder-day-cell.all-filled {
          border-color: #a7f3d0;
        }
        .builder-day-cell.weekend { background: #fafbff; }

        .builder-day-header {
          padding: 8px 10px 6px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--border);
          background: var(--bg);
        }
        .builder-day-num {
          font-size: 15px;
          font-weight: 700;
          color: var(--text);
          line-height: 1;
        }
        .builder-day-wd {
          font-size: 10px;
          font-weight: 500;
          color: var(--muted);
          text-transform: capitalize;
        }

        .builder-shifts-area {
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }

        /* Shift slot (clickable) */
        .shift-slot {
          position: relative;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 8px;
          border-radius: 8px;
          border: 1.5px solid var(--border);
          background: white;
          cursor: pointer;
          transition: all 0.15s;
          min-height: 34px;
        }
        .shift-slot:hover {
          border-color: var(--primary);
          background: rgba(79,70,229,0.03);
        }
        .shift-slot.active-slot {
          border-color: var(--primary);
          box-shadow: 0 0 0 2px rgba(79,70,229,0.15);
          z-index: 3;
        }
        .shift-slot.filled {
          background: #f0fdf4;
          border-color: #86efac;
        }
        .shift-slot.filled:hover {
          border-color: #4ade80;
        }
        .shift-slot.has-alert {
          border-color: #fbbf24;
          background: #fffbeb;
        }
        .shift-slot.has-danger-alert {
          border-color: #f87171;
          background: #fef2f2;
        }

        .shift-slot-label {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: var(--muted);
          white-space: nowrap;
          min-width: 0;
        }
        .shift-slot-guard {
          font-size: 12px;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }
        .shift-slot-guard.empty {
          font-weight: 400;
          color: #94a3b8;
          font-style: italic;
          font-size: 11px;
        }
        .shift-alert-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        /* Guard Picker Popover — fixed overlay */
        .guard-picker-backdrop {
          position: fixed;
          inset: 0;
          z-index: 199;
          background: rgba(0,0,0,0.08);
          animation: gpBdIn 0.15s ease;
        }
        @keyframes gpBdIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .guard-picker {
          position: fixed;
          z-index: 200;
          width: 300px;
          max-height: 420px;
          display: flex;
          flex-direction: column;
          background: white;
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.08);
          animation: gpIn 0.15s ease;
          overflow: hidden;
        }
        @keyframes gpIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .guard-picker-header {
          padding: 12px;
          border-bottom: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .guard-picker-title {
          font-size: 12px;
          font-weight: 700;
          color: var(--text);
        }
        .guard-picker-subtitle {
          font-size: 11px;
          color: var(--muted);
        }
        .guard-picker-search {
          width: 100%;
          padding: 8px 10px;
          font-size: 13px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          outline: none;
          background: var(--bg);
        }
        .guard-picker-search:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 2px rgba(79,70,229,0.1);
        }
        .guard-picker-list {
          max-height: 260px;
          overflow-y: auto;
          padding: 4px;
        }
        .guard-option {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 8px;
          border: none;
          background: transparent;
          cursor: pointer;
          transition: all 0.12s;
          width: 100%;
          text-align: left;
        }
        .guard-option:hover { background: var(--bg); }
        .guard-option.selected { background: var(--primary-soft); }
        .guard-option.unavailable { opacity: 0.5; }
        .guard-option-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
        }
        .guard-option-status {
          font-size: 10px;
          font-weight: 500;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .guard-option-status.available { background: #ecfdf5; color: #059669; }
        .guard-option-status.unavailable { background: #fef2f2; color: #dc2626; }
        .guard-option-status.not_informed { background: #f8fafc; color: #94a3b8; }
        .guard-option-status.assigned-elsewhere { background: #fffbeb; color: #d97706; }

        .guard-picker-footer {
          padding: 8px 12px;
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .guard-picker-clear {
          font-size: 12px;
          font-weight: 500;
          color: #dc2626;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 6px;
        }
        .guard-picker-clear:hover { background: #fef2f2; }
        .guard-picker-close {
          font-size: 12px;
          font-weight: 500;
          color: var(--muted);
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 6px;
        }
        .guard-picker-close:hover { background: var(--bg); }

        /* Quick actions strip */
        .builder-actions-strip {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          padding: 16px 0;
        }
        .builder-action-btn {
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 600;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: white;
          cursor: pointer;
          transition: all 0.15s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .builder-action-btn:hover { background: var(--bg); border-color: #cbd5e1; }
        .builder-action-btn.accent {
          border-color: var(--primary);
          color: var(--primary-dark);
          background: rgba(79,70,229,0.04);
        }
        .builder-action-btn.accent:hover { background: rgba(79,70,229,0.08); }
        .builder-action-btn.danger-ghost { border-color: #fecaca; color: #dc2626; }
        .builder-action-btn.danger-ghost:hover { background: #fef2f2; }

        /* Shift legend */
        .shift-legend {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          padding: 12px 16px;
          background: var(--bg);
          border-radius: 8px;
          margin-bottom: 20px;
        }
        .shift-legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 500;
          color: var(--text);
        }
        .shift-legend-dot {
          width: 10px;
          height: 10px;
          border-radius: 3px;
        }

        /* Progress bar */
        .fill-progress {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
        }
        .fill-bar-track {
          flex: 1;
          height: 8px;
          background: var(--bg);
          border-radius: 4px;
          overflow: hidden;
          border: 1px solid var(--border);
        }
        .fill-bar-fill {
          height: 100%;
          border-radius: 4px;
          background: linear-gradient(90deg, var(--primary), #818cf8);
          transition: width 0.4s ease;
        }
        .fill-bar-fill.complete {
          background: linear-gradient(90deg, #059669, #34d399);
        }
        .fill-bar-label {
          font-size: 13px;
          font-weight: 700;
          color: var(--text);
          white-space: nowrap;
        }

        @media (max-width: 1100px) {
          .builder-cal-grid,
          .builder-cal-weekdays {
            grid-template-columns: repeat(4, 1fr);
          }
          .builder-cal-wd { display: none; }
        }
        @media (max-width: 700px) {
          .builder-cal-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .guard-picker {
            top: auto !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0;
            width: 100% !important;
            border-radius: 16px 16px 0 0;
            max-height: 70vh;
          }
        }
      `}</style>

      <PageHeader
        title="Montar escala"
        description={`${schedule.title} · ${schedule.locations?.name ?? ''}`}
        action={<Link className="ghost-button" href={`/schedules/${params.id}`}>Voltar</Link>}
      />

      {/* Stats */}
      <section className="stat-grid">
        <div className="stat-card"><span>Status</span><strong>{statusLabel(schedule.status)}</strong></div>
        <div className="stat-card"><span>Preenchidos</span><strong>{filledSlots}/{totalSlots}</strong></div>
        <div className="stat-card"><span>Dias</span><strong>{dates.length}</strong></div>
        <div className="stat-card"><span>Total estimado</span><strong>{formatMoney(estimatedTotal)}</strong></div>
      </section>

      {/* Actions and messages */}
      <section className="card">
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="primary-button" onClick={() => saveAssignments(false)} disabled={saving || shifts.length === 0}>
            {saving ? 'Salvando...' : 'Salvar escala'}
          </button>
          <button className="secondary-button" onClick={() => saveAssignments(true)} disabled={saving || shifts.length === 0}>
            Salvar e marcar ativa
          </button>
          <Link className="ghost-button" href={`/schedules/${params.id}/pdf`}>Pré-visualizar PDF</Link>
          <Link className="ghost-button" href={`/schedules/${params.id}/availability`}>Editar disponibilidade</Link>
        </div>
        <ErrorMessage message={error} />
        {success ? <div className="success-message">{success}</div> : null}
        {shifts.length === 0 ? <p className="muted">Configure pelo menos um turno antes de montar a escala.</p> : null}
      </section>

      {shifts.length > 0 && (
        <section className="card" style={{ padding: '24px 28px 28px' }}>

          {/* Progress bar */}
          <div className="fill-progress">
            <span className="fill-bar-label">{filledSlots}/{totalSlots}</span>
            <div className="fill-bar-track">
              <div
                className={`fill-bar-fill${filledSlots === totalSlots ? ' complete' : ''}`}
                style={{ width: `${totalSlots === 0 ? 0 : (filledSlots / totalSlots) * 100}%` }}
              />
            </div>
            <span className="fill-bar-label" style={{ color: filledSlots === totalSlots ? 'var(--success)' : 'var(--muted)', fontWeight: 500, fontSize: 12 }}>
              {filledSlots === totalSlots ? '✓ Completa' : `${Math.round((filledSlots / totalSlots) * 100)}%`}
            </span>
          </div>

          {/* Shift legend */}
          <div className="shift-legend">
            {shifts.map((shift, i) => {
              const colors = ['#6366f1', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0284c7'];
              return (
                <div key={shift.id} className="shift-legend-item">
                  <div className="shift-legend-dot" style={{ background: colors[i % colors.length] }} />
                  {shift.name} ({formatTimeRange(shift.start_time, shift.end_time)})
                </div>
              );
            })}
          </div>

          {/* Quick fill actions */}
          <div className="builder-actions-strip">
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Ações rápidas:</span>
            <button className="builder-action-btn accent" onClick={autoFillAvailable}>
              ⚡ Preencher com disponíveis
            </button>
            <button className="builder-action-btn danger-ghost" onClick={clearAll}>
              🗑 Limpar tudo
            </button>
          </div>

          {/* Weekday headers (desktop) */}
          <div className="builder-cal-weekdays">
            {WEEKDAY_HEADERS.map((wd, i) => (
              <div key={wd} className={`builder-cal-wd${i === 0 || i === 6 ? ' weekend' : ''}`}>{wd}</div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="builder-cal-grid">
            {calendarWeeks.flat().map((date, idx) => {
              if (!date) {
                return <div key={`empty-${idx}`} className="builder-day-cell empty" />;
              }

              const parsed = parseISODate(date);
              const dayNum = parsed.getDate();
              const dayOfWeek = parsed.getDay();
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const counts = guardsAssignedOnDate(date);
              const allFilled = shifts.every(shift => getAssignment(date, shift).guard_id);

              return (
                <div
                  key={date}
                  className={`builder-day-cell${isWeekend ? ' weekend' : ''}${allFilled ? ' all-filled' : ''}`}
                >
                  <div className="builder-day-header">
                    <div>
                      <span className="builder-day-num">{dayNum}</span>
                      <span className="builder-day-wd" style={{ marginLeft: 6 }}>{shortWeekday(date)}</span>
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{formatDateShort(date)}</span>
                  </div>

                  <div className="builder-shifts-area">
                    {shifts.map((shift, shiftIdx) => {
                      const assignment = getAssignment(date, shift);
                      const guard = assignment.guard_id ? guards.find(g => g.id === assignment.guard_id) : null;
                      const alerts = getCellAlerts(date, assignment, counts);
                      const hasDanger = alerts.some(a => a.tone === 'danger');
                      const hasWarning = alerts.some(a => a.tone === 'warning');
                      const isActive = activeCell?.date === date && activeCell?.shiftId === shift.id;
                      const colors = ['#6366f1', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0284c7'];
                      const shiftColor = colors[shiftIdx % colors.length];

                      return (
                        <div key={shift.id}>
                          <div
                            className={`shift-slot${guard ? ' filled' : ''}${hasDanger ? ' has-danger-alert' : hasWarning ? ' has-alert' : ''}${isActive ? ' active-slot' : ''}`}
                            onClick={(e) => {
                              if (isActive) {
                                setActiveCell(null);
                                setSearchFilter('');
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActiveCell({ date, shiftId: shift.id, x: rect.left, y: rect.bottom + 4 });
                                setSearchFilter('');
                              }
                            }}
                          >
                            <div style={{ width: 3, height: '100%', minHeight: 18, borderRadius: 2, background: shiftColor, flexShrink: 0 }} />
                            <span className="shift-slot-label" style={{ color: shiftColor }}>{shift.name.slice(0, 3)}</span>
                            <span className={`shift-slot-guard${!guard ? ' empty' : ''}`}>
                              {guard ? guard.short_name : '—'}
                            </span>
                            {alerts.map((a, ai) => (
                              <div key={ai} className="shift-alert-dot" style={{ background: a.tone === 'danger' ? '#dc2626' : '#d97706' }} title={a.text} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Calendar legend */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
              <div style={{ width: 14, height: 14, borderRadius: 4, background: '#f0fdf4', border: '2px solid #86efac' }} />
              Preenchido
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
              <div style={{ width: 14, height: 14, borderRadius: 4, background: 'white', border: '2px solid var(--border)' }} />
              Vazio
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706' }} />
              Dobra
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }} />
              Indisponível
            </div>
          </div>
        </section>
      )}

      {/* ═══ Guard Picker Popover (rendered as fixed overlay) ═══ */}
      {activeCell && (() => {
        const shift = shifts.find(s => s.id === activeCell.shiftId);
        if (!shift) return null;
        const assignment = getAssignment(activeCell.date, shift);
        const counts = guardsAssignedOnDate(activeCell.date);

        // Smart positioning: ensure popover stays on screen
        const popW = 300;
        const popH = 420;
        let popLeft = activeCell.x;
        let popTop = activeCell.y;
        if (typeof window !== 'undefined') {
          if (popLeft + popW > window.innerWidth - 16) popLeft = window.innerWidth - popW - 16;
          if (popLeft < 16) popLeft = 16;
          if (popTop + popH > window.innerHeight - 16) popTop = activeCell.y - popH - 44;
          if (popTop < 16) popTop = 16;
        }

        return (
          <>
            <div className="guard-picker-backdrop" onClick={() => { setActiveCell(null); setSearchFilter(''); }} />
            <div
              className="guard-picker"
              ref={popoverRef}
              style={{ top: popTop, left: popLeft }}
            >
              <div className="guard-picker-header">
                <div>
                  <div className="guard-picker-title">
                    {formatDateShort(activeCell.date)} · {fullWeekday(activeCell.date)}
                  </div>
                  <div className="guard-picker-subtitle">
                    {shift.name} · {formatTimeRange(shift.start_time, shift.end_time)} · {formatHours(calculateHours(shift.start_time, shift.end_time))}
                  </div>
                </div>
                <input
                  className="guard-picker-search"
                  placeholder="Buscar segurança..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="guard-picker-list" style={{ flex: 1, overflowY: 'auto' }}>
                {sortedGuardsForDate(activeCell.date)
                  .filter(g => !searchFilter || g.short_name.toLowerCase().includes(searchFilter.toLowerCase()) || g.full_name.toLowerCase().includes(searchFilter.toLowerCase()))
                  .map((g) => {
                    const av = getAvailability(g.id, activeCell.date);
                    const isAssigned = assignment.guard_id === g.id;
                    const isAssignedElsewhere = !isAssigned && (counts[g.id] ?? 0) > 0;
                    const isUnavailable = av?.availability_status === 'unavailable';
                    const statusClass = isAssignedElsewhere ? 'assigned-elsewhere' :
                      av?.availability_status === 'available' ? 'available' :
                      av?.availability_status === 'unavailable' ? 'unavailable' : 'not_informed';
                    const statusText = isAssignedElsewhere ? 'Já escalado' :
                      av ? availabilityLabel(av.availability_status, av.preference) : 'Sem disp.';

                    return (
                      <button
                        key={g.id}
                        className={`guard-option${isAssigned ? ' selected' : ''}${isUnavailable ? ' unavailable' : ''}`}
                        onClick={() => {
                          updateGuard(activeCell.date, shift, isAssigned ? '' : g.id);
                          setActiveCell(null);
                          setSearchFilter('');
                        }}
                      >
                        <span className="guard-option-name">
                          {isAssigned && '✓ '}{g.short_name}
                        </span>
                        <span className={`guard-option-status ${statusClass}`}>{statusText}</span>
                      </button>
                    );
                  })}
              </div>

              <div className="guard-picker-footer">
                <button
                  className="guard-picker-clear"
                  onClick={() => {
                    updateGuard(activeCell.date, shift, '');
                    setActiveCell(null);
                    setSearchFilter('');
                  }}
                >
                  Remover segurança
                </button>
                <button
                  className="guard-picker-close"
                  onClick={() => { setActiveCell(null); setSearchFilter(''); }}
                >
                  Fechar
                </button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
