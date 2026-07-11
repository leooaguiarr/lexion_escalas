"use client";

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { ErrorMessage } from '@/components/ErrorMessage';
import { Loading } from '@/components/Loading';
import { supabase } from '@/lib/supabaseClient';
import { calculateHours, formatHours, formatMoney } from '@/lib/domain';
import { SchedulePeriod, ShiftTemplate } from '@/lib/types';

type FormState = {
  id?: string;
  name: string;
  start_time: string;
  end_time: string;
  position: string;
  hourly_rate: string;
};

const emptyForm: FormState = { name: '', start_time: '16:00', end_time: '23:00', position: '1', hourly_rate: '0' };

export default function ShiftsPage() {
  const params = useParams<{ id: string }>();
  const [schedule, setSchedule] = useState<SchedulePeriod | null>(null);
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [params.id]);

  async function loadData() {
    setLoading(true);
    const [{ data: scheduleData }, { data: shiftsData, error: shiftError }] = await Promise.all([
      supabase.from('schedule_periods').select('*, locations(*)').eq('id', params.id).single(),
      supabase.from('shift_templates').select('*').eq('schedule_period_id', params.id).order('position')
    ]);
    if (shiftError) setError(shiftError.message);
    setSchedule(scheduleData as SchedulePeriod | null);
    setShifts((shiftsData ?? []) as ShiftTemplate[]);
    setLoading(false);
  }

  function editShift(shift: ShiftTemplate) {
    setForm({
      id: shift.id,
      name: shift.name,
      start_time: shift.start_time.slice(0, 5),
      end_time: shift.end_time.slice(0, 5),
      position: String(shift.position),
      hourly_rate: String(shift.hourly_rate ?? 0)
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      schedule_period_id: params.id,
      name: form.name,
      start_time: form.start_time,
      end_time: form.end_time,
      position: Number(form.position),
      hourly_rate: Number(form.hourly_rate.replace(',', '.')) || 0
    };

    const result = form.id
      ? await supabase.from('shift_templates').update(payload).eq('id', form.id)
      : await supabase.from('shift_templates').insert(payload);

    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }

    setForm({ ...emptyForm, position: String(shifts.length + 1) });
    await loadData();
  }

  async function removeShift(id: string) {
    const confirmed = window.confirm('Remover este turno? Isso também remove as atribuições vinculadas a ele.');
    if (!confirmed) return;
    await supabase.from('shift_templates').delete().eq('id', id);
    await loadData();
  }

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Configurar turnos"
        description={schedule?.title ?? 'Defina os horários usados nesta escala.'}
        action={<Link className="ghost-button" href={`/schedules/${params.id}`}>Voltar</Link>}
      />

      <section className="card">
        <h2>{form.id ? 'Editar turno' : 'Novo turno'}</h2>
        <form onSubmit={submit} className="form-grid">
          <div className="form-row">
            <label>Nome</label>
            <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="1º turno" />
          </div>
          <div className="form-row">
            <label>Posição</label>
            <input required type="number" min="1" value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} />
          </div>
          <div className="form-row">
            <label>Início</label>
            <input required type="time" value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} />
          </div>
          <div className="form-row">
            <label>Fim</label>
            <input required type="time" value={form.end_time} onChange={(event) => setForm({ ...form, end_time: event.target.value })} />
          </div>
          <div className="form-row">
            <label>Valor da hora (R$)</label>
            <input required type="number" step="0.01" min="0" value={form.hourly_rate} onChange={(event) => setForm({ ...form, hourly_rate: event.target.value })} placeholder="12.50" />
          </div>
          <div className="form-row">
            <span className="muted">Horas calculadas: <strong>{formatHours(calculateHours(form.start_time, form.end_time))}</strong></span>
          </div>
          <div className="actions full">
            <button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar turno'}</button>
            {form.id ? <button className="ghost-button" type="button" onClick={() => setForm(emptyForm)}>Cancelar edição</button> : null}
          </div>
        </form>
        <ErrorMessage message={error} />
      </section>

      <section className="card">
        <h2>Turnos da escala</h2>
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="secondary-button" onClick={() => setForm({ name: '1º turno', start_time: '16:00', end_time: '23:00', position: '1', hourly_rate: '0' })}>Modelo 2 turnos: 1º</button>
          <button className="secondary-button" onClick={() => setForm({ name: '2º turno', start_time: '23:00', end_time: '06:00', position: '2', hourly_rate: '0' })}>Modelo 2 turnos: 2º</button>
          <button className="ghost-button" onClick={() => setForm({ name: '1º turno', start_time: '06:00', end_time: '14:00', position: '1', hourly_rate: '0' })}>Modelo 3 turnos</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Posição</th><th>Nome</th><th>Início</th><th>Fim</th><th>Horas</th><th>Valor/h</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {shifts.map((shift) => (
                <tr key={shift.id}>
                  <td>{shift.position}</td>
                  <td>{shift.name}</td>
                  <td>{shift.start_time.slice(0, 5)}</td>
                  <td>{shift.end_time.slice(0, 5)}</td>
                  <td>{formatHours(calculateHours(shift.start_time, shift.end_time))}</td>
                  <td>{formatMoney(shift.hourly_rate)}</td>
                  <td>
                    <div className="actions" style={{ margin: 0 }}>
                      <button className="secondary-button" onClick={() => editShift(shift)}>Editar</button>
                      <button className="danger-button" onClick={() => removeShift(shift.id)}>Remover</button>
                    </div>
                  </td>
                </tr>
              ))}
              {shifts.length === 0 ? <tr><td colSpan={7} className="muted">Nenhum turno cadastrado.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
