"use client";

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { ErrorMessage } from '@/components/ErrorMessage';
import { EmptyState } from '@/components/EmptyState';
import { Loading } from '@/components/Loading';
import { supabase } from '@/lib/supabaseClient';
import { formatDateBRShort, statusLabel, calculateScheduleStatus, parseISODate, toISODate } from '@/lib/domain';
import { Location, SchedulePeriod } from '@/lib/types';

type FormState = {
  title: string;
  location_id: string;
  start_date: string;
  end_date: string;
  notes: string;
};

const emptyForm: FormState = {
  title: '',
  location_id: '',
  start_date: '',
  end_date: '',
  notes: ''
};

type Suggestion = {
  locationId: string;
  locationName: string;
  title: string;
  startDate: string;
  endDate: string;
};

function formatMonthName(date: Date): string {
  return date.toLocaleDateString('pt-BR', { month: 'long' }).replace(/^\w/, c => c.toUpperCase());
}

function buildSuggestions(schedules: SchedulePeriod[], locations: Location[]): Suggestion[] {
  const suggestions: Suggestion[] = [];

  for (const loc of locations) {
    const locSchedules = schedules
      .filter(s => s.location_id === loc.id)
      .sort((a, b) => b.end_date.localeCompare(a.end_date));

    if (locSchedules.length === 0) continue;

    const last = locSchedules[0];
    const lastEnd = parseISODate(last.end_date);
    const lastStart = parseISODate(last.start_date);

    // Calculate duration in days
    const durationMs = lastEnd.getTime() - lastStart.getTime();
    const durationDays = Math.round(durationMs / (1000 * 60 * 60 * 24));

    // Next period starts the day after the last end
    const nextStart = new Date(lastEnd);
    nextStart.setDate(nextStart.getDate() + 1);

    const nextEnd = new Date(nextStart);
    nextEnd.setDate(nextEnd.getDate() + durationDays);

    const startDay = nextStart.getDate();
    const endDay = nextEnd.getDate();
    const startMonth = formatMonthName(nextStart);
    const endMonth = formatMonthName(nextEnd);

    const startMonthAbbr = startMonth.slice(0, 3).toUpperCase();
    const endMonthAbbr = endMonth.slice(0, 3).toUpperCase();

    suggestions.push({
      locationId: loc.id,
      locationName: loc.name,
      title: `${loc.name} - ${startDay}${startMonthAbbr} a ${endDay}${endMonthAbbr}`,
      startDate: toISODate(nextStart),
      endDate: toISODate(nextEnd),
    });
  }

  return suggestions;
}

export default function SchedulesPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [schedules, setSchedules] = useState<SchedulePeriod[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const suggestions = useMemo(() => buildSuggestions(schedules, locations), [schedules, locations]);

  async function loadData() {
    setLoading(true);
    const [{ data: locationsData }, { data: schedulesData, error: schedulesError }] = await Promise.all([
      supabase.from('locations').select('*').eq('status', 'active').order('name'),
      supabase.from('schedule_periods').select('*, locations(*)').order('start_date', { ascending: false })
    ]);
    if (schedulesError) setError(schedulesError.message);
    setLocations((locationsData ?? []) as Location[]);
    setSchedules((schedulesData ?? []) as SchedulePeriod[]);
    setLoading(false);
  }

  function applySuggestion(suggestion: Suggestion) {
    setForm({
      title: suggestion.title,
      location_id: suggestion.locationId,
      start_date: suggestion.startDate,
      end_date: suggestion.endDate,
      notes: ''
    });
  }

  async function createSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from('schedule_periods').insert({
      title: form.title,
      location_id: form.location_id,
      start_date: form.start_date,
      end_date: form.end_date,
      notes: form.notes || null,
      created_by: userData.user?.id ?? null
    });

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setForm(emptyForm);
    setShowCreateForm(false);
    await loadData();
  }

  async function deleteSchedule(id: string, title: string) {
    const cleanTitle = title.replace(/^escala\s+/i, '');
    const confirmed = window.confirm(`Tem certeza que deseja excluir a escala "${cleanTitle}"? Todos os turnos e pagamentos associados serão perdidos.`);
    if (!confirmed) return;

    const { error: deleteError } = await supabase.from('schedule_periods').delete().eq('id', id);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      await loadData();
    }
  }

  return (
    <div>
      <PageHeader 
        title="Escalas" 
        description="Crie escalas por quinzena e configure os turnos manualmente." 
        action={
          <button className="primary-button" onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? 'Cancelar' : 'Nova escala'}
          </button>
        }
      />

      {showCreateForm && (
        <section className="card">
          <h2>Nova escala</h2>

          {/* Sugestões automáticas */}
          {suggestions.length > 0 && form.title === '' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
                ⚡ Sugestão de próxima escala (clique para preencher):
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {suggestions.map((s) => (
                  <button
                    key={s.locationId}
                    type="button"
                    onClick={() => applySuggestion(s)}
                    style={{
                      padding: '10px 16px',
                      background: 'linear-gradient(135deg, #f0f4ff, #e8f0fe)',
                      border: '1.5px solid var(--primary)',
                      borderRadius: 10,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                      flex: '1 1 240px',
                      maxWidth: 400,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 12px rgba(99,102,241,0.2)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', marginBottom: 2 }}>
                      📋 {s.locationName}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {formatDateBRShort(s.startDate)} até {formatDateBRShort(s.endDate)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={createSchedule} className="form-grid">
            <div className="form-row full">
              <label>Nome da escala</label>
              <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Escala Condomínio — 16 a 30 de Junho" />
            </div>
            <div className="form-row">
              <label>Local</label>
              <select required value={form.location_id} onChange={(event) => setForm({ ...form, location_id: event.target.value })}>
                <option value="">Selecione</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Data inicial</label>
              <input required type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} />
            </div>
            <div className="form-row">
              <label>Data final</label>
              <input required type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} />
            </div>
            <div className="form-row full">
              <label>Observação</label>
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </div>
            <div className="actions full">
              <button className="primary-button" disabled={saving || locations.length === 0}>{saving ? 'Criando...' : 'Criar escala'}</button>
            </div>
          </form>
          {locations.length === 0 ? <p className="muted">Cadastre pelo menos um local ativo antes de criar uma escala.</p> : null}
          <ErrorMessage message={error} />
        </section>
      )}

      <section className="card">
        <h2>Escalas cadastradas</h2>
        {loading ? <Loading /> : schedules.length === 0 ? <EmptyState title="Nenhuma escala criada" /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Escala</th>
                  <th>Local</th>
                  <th>Período</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((schedule) => {
                  const cleanTitle = schedule.title.replace(/^escala\s+/i, '');
                  const yearAbbr = schedule.start_date ? schedule.start_date.split('-')[0].slice(-2) : '';
                  const displayTitle = yearAbbr ? `${cleanTitle}/${yearAbbr}` : cleanTitle;
                  const calculatedStatus = calculateScheduleStatus(schedule.start_date, schedule.end_date);

                  return (
                    <tr key={schedule.id}>
                      <td><strong>{displayTitle}</strong><br /><span className="muted small">{schedule.notes}</span></td>
                      <td>{schedule.locations?.name ?? '-'}</td>
                      <td>{formatDateBRShort(schedule.start_date)} até {formatDateBRShort(schedule.end_date)}</td>
                      <td><Badge tone={calculatedStatus === 'closed' ? 'success' : calculatedStatus === 'active' ? 'info' : 'warning'}>{statusLabel(calculatedStatus)}</Badge></td>
                      <td>
                        <div className="actions" style={{ margin: 0, flexWrap: 'nowrap' }}>
                          <Link className="secondary-button" href={`/schedules/${schedule.id}`}>Editar</Link>
                          <Link className="ghost-button" href={`/schedules/${schedule.id}/pdf`}>PDF</Link>
                          <button className="ghost-button" style={{ color: 'var(--danger)' }} onClick={() => deleteSchedule(schedule.id, schedule.title)}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
