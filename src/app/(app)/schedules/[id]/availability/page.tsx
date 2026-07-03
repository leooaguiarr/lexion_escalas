"use client";

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ErrorMessage } from '@/components/ErrorMessage';
import { Loading } from '@/components/Loading';
import { supabase } from '@/lib/supabaseClient';
import { dateRange, formatDateShort, fullWeekday } from '@/lib/domain';
import { AvailabilityStatus, Guard, GuardAvailability, Preference, SchedulePeriod } from '@/lib/types';
import { Badge } from '@/components/Badge';

type CellValue = {
  availability_status: AvailabilityStatus;
  preference: Preference;
  notes: string;
};

function keyFor(guardId: string, date: string) {
  return `${guardId}__${date}`;
}

export default function AvailabilityPage() {
  const params = useParams<{ id: string }>();
  const [schedule, setSchedule] = useState<SchedulePeriod | null>(null);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [cells, setCells] = useState<Record<string, CellValue>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedGuardId, setSelectedGuardId] = useState<string | null>(null);

  const dates = useMemo(() => schedule ? dateRange(schedule.start_date, schedule.end_date) : [], [schedule]);

  useEffect(() => {
    loadData();
  }, [params.id]);

  async function loadData() {
    setLoading(true);
    setError(null);
    const [{ data: scheduleData }, { data: guardsData }, { data: availabilityData, error: availabilityError }] = await Promise.all([
      supabase.from('schedule_periods').select('*, locations(*)').eq('id', params.id).single(),
      supabase.from('guards').select('*').eq('status', 'active').order('short_name'),
      supabase.from('guard_availability').select('*').eq('schedule_period_id', params.id)
    ]);
    if (availabilityError) setError(availabilityError.message);

    const currentCells: Record<string, CellValue> = {};
    ((availabilityData ?? []) as GuardAvailability[]).forEach((item) => {
      currentCells[keyFor(item.guard_id, item.availability_date)] = {
        availability_status: item.availability_status,
        preference: item.preference,
        notes: item.notes ?? ''
      };
    });

    setSchedule(scheduleData as SchedulePeriod | null);

    const loadedGuards = (guardsData ?? []) as Guard[];
    setGuards(loadedGuards);
    setCells(currentCells);
    setLoading(false);

    if (loadedGuards.length > 0 && !selectedGuardId) {
      setSelectedGuardId(loadedGuards[0].id);
    }
  }

  function getCell(guardId: string, date: string): CellValue {
    return cells[keyFor(guardId, date)] ?? { availability_status: 'not_informed', preference: 'any', notes: '' };
  }

  function updateCell(guardId: string, date: string, value: Partial<CellValue>) {
    const key = keyFor(guardId, date);
    setCells((previous) => ({
      ...previous,
      [key]: {
        ...getCell(guardId, date),
        ...value
      }
    }));
  }

  async function saveSelectedGuard() {
    if (!selectedGuardId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    const rows = dates.map((date) => {
      const cell = getCell(selectedGuardId, date);
      return {
        schedule_period_id: params.id,
        guard_id: selectedGuardId,
        availability_date: date,
        availability_status: cell.availability_status,
        preference: cell.preference,
        notes: cell.notes || null
      };
    });

    const { error: upsertError } = await supabase
      .from('guard_availability')
      .upsert(rows, { onConflict: 'schedule_period_id,guard_id,availability_date' });

    setSaving(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setSuccess('Disponibilidade salva com sucesso!');
    setTimeout(() => setSuccess(null), 3000);
  }

  function nextGuard() {
    if (!selectedGuardId) return;
    const currentIndex = guards.findIndex(g => g.id === selectedGuardId);
    if (currentIndex < guards.length - 1) {
      setSelectedGuardId(guards[currentIndex + 1].id);
      setSuccess(null);
      setError(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function previousGuard() {
    if (!selectedGuardId) return;
    const currentIndex = guards.findIndex(g => g.id === selectedGuardId);
    if (currentIndex > 0) {
      setSelectedGuardId(guards[currentIndex - 1].id);
      setSuccess(null);
      setError(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  if (loading) return <Loading />;
  if (!schedule) return <ErrorMessage message="Escala não encontrada." />;

  const selectedGuard = guards.find(g => g.id === selectedGuardId);
  const currentIndex = guards.findIndex(g => g.id === selectedGuardId);
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === guards.length - 1;

  function hasFilledAvailability(guardId: string) {
    return dates.some(date => getCell(guardId, date).availability_status !== 'not_informed');
  }

  return (
    <div>
      <style>{`
        .availability-layout {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 24px;
          align-items: start;
        }
        .guard-list {
          position: sticky;
          top: 24px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .day-row {
          display: grid;
          grid-template-columns: 100px 1fr 1fr 2fr;
          gap: 16px;
          align-items: start;
          padding: 16px;
          background: var(--bg);
          border-radius: 8px;
          border: 1px solid var(--border);
          transition: background 0.15s;
        }
        .day-row:hover {
          background: var(--panel);
        }
        @media (max-width: 900px) {
          .availability-layout {
            grid-template-columns: 1fr;
          }
          .guard-list {
            position: static;
            max-height: 250px;
          }
          .day-row {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .day-row > div:first-child {
            padding-top: 0;
            flex-direction: row;
            align-items: center;
            gap: 8px;
            border-bottom: 1px solid var(--border);
            padding-bottom: 8px;
            margin-bottom: 4px;
          }
        }
      `}</style>
      <PageHeader
        title="Disponibilidade"
        description={`${schedule.title} · selecione o segurança para preencher a disponibilidade`}
        action={<Link className="ghost-button" href={`/schedules/${params.id}/builder`}>Ir para montagem</Link>}
      />

      <div className="availability-layout">

        {/* Barra Lateral: Lista de Seguranças */}
        <div className="card guard-list">
          <h2 style={{ fontSize: 16, margin: 0 }}>Seguranças</h2>

          {guards.length === 0 ? (
            <p className="muted">Cadastre seguranças ativos antes de preencher disponibilidade.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
              {guards.map((guard) => {
                const isSelected = guard.id === selectedGuardId;
                const isFilled = hasFilledAvailability(guard.id);
                return (
                  <button
                    key={guard.id}
                    onClick={() => {
                      setSelectedGuardId(guard.id);
                      setSuccess(null);
                      setError(null);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: isSelected ? '1px solid var(--primary)' : '1px solid transparent',
                      background: isSelected ? 'var(--primary-soft)' : 'transparent',
                      color: isSelected ? 'var(--primary-dark)' : 'var(--text)',
                      fontWeight: isSelected ? 600 : 400,
                      textAlign: 'left',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'rgba(0,0,0,0.03)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span>{guard.short_name}</span>
                    {isFilled && <Badge tone="success">OK</Badge>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Painel Principal: Formulário do Segurança Selecionado */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ErrorMessage message={error} />
          {success && <div className="success-message" style={{ margin: 0 }}>{success}</div>}

          {selectedGuard ? (
            <div className="card" style={{ padding: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 20, marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22 }}>{selectedGuard.short_name}</h2>
                  <p className="muted" style={{ margin: '4px 0 0' }}>Preencha a disponibilidade para a quinzena</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="ghost-button" onClick={previousGuard} disabled={isFirst}>&larr; Anterior</button>
                  <button className="ghost-button" onClick={nextGuard} disabled={isLast}>Próximo &rarr;</button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {dates.map((date) => {
                  const cell = getCell(selectedGuard.id, date);
                  return (
                    <div key={date} className="day-row">
                      <div style={{ display: 'flex', flexDirection: 'column', paddingTop: 8 }}>
                        <strong style={{ fontSize: 14 }}>{formatDateShort(date)}</strong>
                        <span className="muted small" style={{ textTransform: 'capitalize' }}>{fullWeekday(date)}</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label>Disponibilidade</label>
                        <select
                          value={cell.availability_status}
                          onChange={(event) => updateCell(selectedGuard.id, date, { availability_status: event.target.value as AvailabilityStatus })}
                        >
                          <option value="not_informed">Não informado</option>
                          <option value="available">Disponível</option>
                          <option value="unavailable">Não pode</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label>Preferência</label>
                        <select
                          value={cell.preference}
                          onChange={(event) => updateCell(selectedGuard.id, date, { preference: event.target.value as Preference })}
                        >
                          <option value="any">Qualquer</option>
                          <option value="day">Dia</option>
                          <option value="night">Noite</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label>Observações</label>
                        <input
                          placeholder="Obs (opcional)..."
                          value={cell.notes}
                          onChange={(event) => updateCell(selectedGuard.id, date, { notes: event.target.value })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
                <button
                  className="primary-button"
                  style={{ padding: '12px 24px', fontSize: 16 }}
                  onClick={saveSelectedGuard}
                  disabled={saving}
                >
                  {saving ? 'Salvando...' : 'Salvar Disponibilidade'}
                </button>
              </div>

            </div>
          ) : (
            <div className="card empty-state">
              <strong>Nenhum segurança selecionado</strong>
              <p>Selecione um segurança na lista ao lado para editar sua disponibilidade.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
