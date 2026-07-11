"use client";

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/ErrorMessage';
import { Loading } from '@/components/Loading';
import { supabase } from '@/lib/supabaseClient';
import { dateRange, formatDateShort, formatTimeRange, monthName, shortWeekday } from '@/lib/domain';
import { ScheduleAssignment, SchedulePeriod, ShiftTemplate } from '@/lib/types';

function assignmentKey(date: string, shiftId: string) {
  return `${date}__${shiftId}`;
}

export default function SchedulePdfPage() {
  const params = useParams<{ id: string }>();
  const [schedule, setSchedule] = useState<SchedulePeriod | null>(null);
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [assignments, setAssignments] = useState<Record<string, ScheduleAssignment>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dates = useMemo(() => schedule ? dateRange(schedule.start_date, schedule.end_date) : [], [schedule]);

  useEffect(() => {
    loadData();
  }, [params.id]);

  async function loadData() {
    setLoading(true);
    const [scheduleResult, shiftResult, assignmentResult] = await Promise.all([
      supabase.from('schedule_periods').select('*, locations(*)').eq('id', params.id).single(),
      supabase.from('shift_templates').select('*').eq('schedule_period_id', params.id).order('position'),
      supabase.from('schedule_assignments').select('*, guards(*), shift_templates(*)').eq('schedule_period_id', params.id)
    ]);
    if (scheduleResult.error) setError(scheduleResult.error.message);
    setSchedule(scheduleResult.data as SchedulePeriod | null);
    setShifts((shiftResult.data ?? []) as ShiftTemplate[]);

    const map: Record<string, ScheduleAssignment> = {};
    ((assignmentResult.data ?? []) as ScheduleAssignment[]).forEach((item) => {
      map[assignmentKey(item.service_date, item.shift_template_id)] = item;
    });
    setAssignments(map);
    setLoading(false);
  }

  function getName(date: string, shift: ShiftTemplate): string {
    const assignment = assignments[assignmentKey(date, shift.id)];
    if (!assignment || !assignment.guards) return '—';
    
    let text = assignment.guards.short_name;
    const hasCustomHours = assignment.planned_start && shift.start_time && (
      assignment.planned_start.slice(0, 5) !== shift.start_time.slice(0, 5) || 
      assignment.planned_end.slice(0, 5) !== shift.end_time.slice(0, 5)
    );
    
    if (hasCustomHours) {
      const start = assignment.planned_start.slice(0, 5);
      const end = assignment.planned_end.slice(0, 5);
      text += ` (${start} às ${end})`;
    }
    
    if (assignment.notes) {
      text += ` [${assignment.notes}]`;
    }
    
    return text;
  }

  if (loading) return <Loading />;
  if (!schedule) return <ErrorMessage message={error ?? 'Escala não encontrada.'} />;

  return (
    <main className="pdf-page">
      <div className="pdf-actions no-print">
        <Link className="ghost-button" href={`/schedules/${params.id}`}>Voltar</Link>
        <button className="primary-button" onClick={() => window.print()}>Imprimir / Salvar PDF</button>
      </div>

      <section className="pdf-sheet">
        <div className="pdf-title">
          <h1>ESCALA {schedule.locations?.name?.toUpperCase() ?? ''}</h1>
          <p>{formatDateShort(schedule.start_date)} a {formatDateShort(schedule.end_date)} de {monthName(schedule.start_date)}</p>
        </div>

        <div className="pdf-turnos">
          <strong>Turnos:</strong>
          {shifts.map((shift) => (
            <div key={shift.id}>{shift.name}: {formatTimeRange(shift.start_time, shift.end_time)}</div>
          ))}
        </div>

        <div>
          {dates.map((date) => (
            <div className="pdf-scale-row" key={date}>
              <div><strong>{formatDateShort(date).slice(0, 2)}</strong> ({shortWeekday(date)})</div>
              <div className="pdf-names">
                {shifts.map((shift) => <span key={shift.id} className="pdf-name">{getName(date, shift)}</span>)}
              </div>
            </div>
          ))}
        </div>

        <div className="pdf-turnos">
          <strong>Observações:</strong>
          {schedule.notes && (
            <div style={{ whiteSpace: 'pre-wrap', marginBottom: 12, borderLeft: '3px solid var(--primary)', paddingLeft: 10, color: '#334155' }}>
              {schedule.notes}
            </div>
          )}
          <div>- Escala sujeita a alterações.</div>
          <div>- Confirmar qualquer dúvida com o escalante.</div>
          <div>- Quando o mesmo nome aparecer em mais de um turno, significa que o segurança puxará mais de um período.</div>
        </div>
      </section>
    </main>
  );
}
