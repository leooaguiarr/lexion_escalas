"use client";

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState, FormEvent } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { Loading } from '@/components/Loading';
import { ErrorMessage } from '@/components/ErrorMessage';
import { supabase } from '@/lib/supabaseClient';
import { formatDateBR, statusLabel, calculateScheduleStatus, formatMoney } from '@/lib/domain';
import { Location, SchedulePeriod, ShiftTemplate } from '@/lib/types';

export default function ScheduleDetailPage() {
  const params = useParams<{ id: string }>();
  const [schedule, setSchedule] = useState<SchedulePeriod | null>(null);
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '', location_id: '', start_date: '', end_date: '', notes: ''
  });

  useEffect(() => {
    loadData();
  }, [params.id]);

  async function loadData() {
    setLoading(true);
    const [{ data: scheduleData, error: scheduleError }, { data: shiftData }, { data: locationsData }] = await Promise.all([
      supabase.from('schedule_periods').select('*, locations(*)').eq('id', params.id).single(),
      supabase.from('shift_templates').select('*').eq('schedule_period_id', params.id).order('position'),
      supabase.from('locations').select('*').eq('status', 'active').order('name')
    ]);
    if (scheduleError) setError(scheduleError.message);

    const sched = scheduleData as SchedulePeriod | null;
    setSchedule(sched);
    if (sched) {
      setEditForm({
        title: sched.title,
        location_id: sched.location_id,
        start_date: sched.start_date,
        end_date: sched.end_date,
        notes: sched.notes || ''
      });
    }

    setShifts((shiftData ?? []) as ShiftTemplate[]);
    setLocations((locationsData ?? []) as Location[]);
    setLoading(false);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    setSavingEdit(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('schedule_periods')
      .update({
        title: editForm.title,
        location_id: editForm.location_id,
        start_date: editForm.start_date,
        end_date: editForm.end_date,
        notes: editForm.notes || null,
      })
      .eq('id', params.id);

    setSavingEdit(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setIsEditing(false);
    await loadData();
  }

  async function updateStatus(status: 'draft' | 'active' | 'closed') {
    await supabase.from('schedule_periods').update({ status }).eq('id', params.id);
    await loadData();
  }

  if (loading) return <Loading />;
  if (!schedule) return <ErrorMessage message={error ?? 'Escala não encontrada.'} />;

  const calculatedStatus = calculateScheduleStatus(schedule.start_date, schedule.end_date);

  return (
    <div>
      <PageHeader
        title={schedule.title}
        description={`${schedule.locations?.name ?? 'Local'} · ${formatDateBR(schedule.start_date)} até ${formatDateBR(schedule.end_date)}`}
        action={<Badge tone={calculatedStatus === 'closed' ? 'success' : calculatedStatus === 'active' ? 'info' : 'warning'}>{statusLabel(calculatedStatus)}</Badge>}
      />

      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Configurações da Escala</h2>
          {!isEditing && <button className="secondary-button" onClick={() => setIsEditing(true)}>Editar Período/Local</button>}
        </div>

        {isEditing ? (
          <form onSubmit={saveEdit} className="form-grid">
            <div className="form-row full">
              <label>Nome da escala</label>
              <input required value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
            </div>
            <div className="form-row">
              <label>Local</label>
              <select required value={editForm.location_id} onChange={(e) => setEditForm({ ...editForm, location_id: e.target.value })}>
                <option value="">Selecione</option>
                {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Data inicial</label>
              <input required type="date" value={editForm.start_date} onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })} />
            </div>
            <div className="form-row">
              <label>Data final</label>
              <input required type="date" value={editForm.end_date} onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })} />
            </div>
            <div className="form-row full">
              <label>Observação</label>
              <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
            <div className="actions full">
              <button type="button" className="ghost-button" onClick={() => {
                setIsEditing(false);
                if (schedule) {
                  setEditForm({
                    title: schedule.title,
                    location_id: schedule.location_id,
                    start_date: schedule.start_date,
                    end_date: schedule.end_date,
                    notes: schedule.notes || ''
                  });
                }
              }}>Cancelar</button>
              <button type="submit" className="primary-button" disabled={savingEdit}>
                {savingEdit ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-3">
            <Link className="secondary-button" href={`/schedules/${schedule.id}/shifts`}>1. Configurar turnos</Link>
            <Link className="secondary-button" href={`/schedules/${schedule.id}/availability`}>2. Disponibilidade</Link>
            <Link className="primary-button" href={`/schedules/${schedule.id}/builder`}>3. Montar escala</Link>
            <Link className="secondary-button" href={`/schedules/${schedule.id}/pdf`}>Gerar PDF</Link>
            <Link className="secondary-button" href={`/schedules/${schedule.id}/close`}>Fechar quinzena</Link>
            <Link className="secondary-button" href={`/payments/${schedule.id}`}>Pagamentos</Link>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Turnos configurados</h2>
        {shifts.length === 0 ? <p className="muted">Nenhum turno configurado.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Posição</th><th>Nome</th><th>Horário</th><th>Valor/h</th></tr></thead>
              <tbody>
                {shifts.map((shift) => (
                  <tr key={shift.id}>
                    <td>{shift.position}</td>
                    <td>{shift.name}</td>
                    <td>{shift.start_time.slice(0, 5)} às {shift.end_time.slice(0, 5)}</td>
                    <td>{formatMoney(shift.hourly_rate)}</td>
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
