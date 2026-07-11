"use client";

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ErrorMessage } from '@/components/ErrorMessage';
import { Loading } from '@/components/Loading';
import { supabase } from '@/lib/supabaseClient';
import { dateRange, formatDateShort, fullWeekday, parseISODate } from '@/lib/domain';
import { AvailabilityStatus, Guard, GuardAvailability, Preference, SchedulePeriod } from '@/lib/types';
import { Badge } from '@/components/Badge';

/* ─── Types ─── */

type CellValue = {
  availability_status: AvailabilityStatus;
  preference: Preference;
  notes: string;
};

function keyFor(guardId: string, date: string) {
  return `${guardId}__${date}`;
}

/* ─── Config ─── */

const STATUS_CONFIG = {
  available: { label: 'Disponível', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', icon: '✓' },
  unavailable: { label: 'Não pode', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: '✗' },
  not_informed: { label: 'Não informado', color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0', icon: '?' },
} as const;

const PREFERENCE_LABELS: Record<Preference, string> = {
  any: 'Qualquer',
  day: '☀ Dia',
  night: '🌙 Noite',
};

const WEEKDAY_HEADERS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/* ─── Preset System ─── */

type DayFilter = (dayOfWeek: number) => boolean;

type PresetDefinition = {
  id: string;
  label: string;
  description: string;
  icon: string;
  category: 'common' | 'weekday' | 'weekend' | 'custom';
  dayFilter: DayFilter;
  preference: Preference;
  /** If true, days NOT matched by filter are marked unavailable. Otherwise left untouched. */
  markOthersUnavailable: boolean;
};

const PRESETS: PresetDefinition[] = [
  // ── Comuns ──
  {
    id: 'all-any',
    label: 'Disponível sempre',
    description: 'Todos os dias, qualquer turno',
    icon: '📅',
    category: 'common',
    dayFilter: () => true,
    preference: 'any',
    markOthersUnavailable: false,
  },
  {
    id: 'all-night',
    label: 'Noturno fixo',
    description: 'Todos os dias, somente à noite',
    icon: '🌙',
    category: 'common',
    dayFilter: () => true,
    preference: 'night',
    markOthersUnavailable: false,
  },
  {
    id: 'all-day',
    label: 'Diurno fixo',
    description: 'Todos os dias, somente de dia',
    icon: '☀️',
    category: 'common',
    dayFilter: () => true,
    preference: 'day',
    markOthersUnavailable: false,
  },
  // ── Dias úteis ──
  {
    id: 'weekdays-any',
    label: 'Seg a Sex',
    description: 'Dias úteis, qualquer turno',
    icon: '💼',
    category: 'weekday',
    dayFilter: (d) => d >= 1 && d <= 5,
    preference: 'any',
    markOthersUnavailable: true,
  },
  {
    id: 'weekdays-day',
    label: 'Seg a Sex — Dia',
    description: 'Dias úteis, somente de dia',
    icon: '🏢',
    category: 'weekday',
    dayFilter: (d) => d >= 1 && d <= 5,
    preference: 'day',
    markOthersUnavailable: true,
  },
  {
    id: 'weekdays-night',
    label: 'Seg a Sex — Noite',
    description: 'Dias úteis, somente à noite',
    icon: '🏙️',
    category: 'weekday',
    dayFilter: (d) => d >= 1 && d <= 5,
    preference: 'night',
    markOthersUnavailable: true,
  },
  {
    id: 'mon-thu-any',
    label: 'Seg a Qui',
    description: 'Segunda a quinta, qualquer turno',
    icon: '📋',
    category: 'weekday',
    dayFilter: (d) => d >= 1 && d <= 4,
    preference: 'any',
    markOthersUnavailable: true,
  },
  // ── Final de semana ──
  {
    id: 'weekend-any',
    label: 'Final de semana',
    description: 'Sáb e Dom, qualquer turno',
    icon: '🎉',
    category: 'weekend',
    dayFilter: (d) => d === 0 || d === 6,
    preference: 'any',
    markOthersUnavailable: true,
  },
  {
    id: 'weekend-day',
    label: 'Fim de semana — Dia',
    description: 'Sáb e Dom, somente de dia',
    icon: '🌤️',
    category: 'weekend',
    dayFilter: (d) => d === 0 || d === 6,
    preference: 'day',
    markOthersUnavailable: true,
  },
  {
    id: 'weekend-night',
    label: 'Fim de semana — Noite',
    description: 'Sáb e Dom, somente à noite',
    icon: '🌃',
    category: 'weekend',
    dayFilter: (d) => d === 0 || d === 6,
    preference: 'night',
    markOthersUnavailable: true,
  },
  {
    id: 'fri-sun-any',
    label: 'Sex a Dom',
    description: 'Sexta a domingo, qualquer turno',
    icon: '🗓️',
    category: 'weekend',
    dayFilter: (d) => d === 0 || d === 5 || d === 6,
    preference: 'any',
    markOthersUnavailable: true,
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  common: 'Geral',
  weekday: 'Dias Úteis',
  weekend: 'Final de Semana',
  custom: 'Personalizado',
};

/* ─── Custom Builder weekday config ─── */
const BUILDER_DAYS = [
  { key: 1, label: 'Seg' },
  { key: 2, label: 'Ter' },
  { key: 3, label: 'Qua' },
  { key: 4, label: 'Qui' },
  { key: 5, label: 'Sex' },
  { key: 6, label: 'Sáb' },
  { key: 0, label: 'Dom' },
];

/* ─── Component ─── */

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
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [presetApplied, setPresetApplied] = useState<string | null>(null);
  // Custom builder state
  const [customDays, setCustomDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [customPref, setCustomPref] = useState<Preference>('any');
  const [customMarkOthers, setCustomMarkOthers] = useState(true);

  const popoverRef = useRef<HTMLDivElement>(null);

  const dates = useMemo(() => schedule ? dateRange(schedule.start_date, schedule.end_date) : [], [schedule]);

  // Build calendar grid with padding for alignment
  const calendarWeeks = useMemo(() => {
    if (dates.length === 0) return [];
    const weeks: (string | null)[][] = [];
    let currentWeek: (string | null)[] = [];

    const firstDay = parseISODate(dates[0]).getDay();
    for (let i = 0; i < firstDay; i++) {
      currentWeek.push(null);
    }

    dates.forEach((date) => {
      currentWeek.push(date);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }, [dates]);

  useEffect(() => {
    loadData();
  }, [params.id]);

  // Close popover on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setActiveDay(null);
      }
    }
    if (activeDay) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeDay]);

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

  // Quick toggle: cycles not_informed → available → unavailable
  const quickToggle = useCallback((guardId: string, date: string) => {
    const cell = getCell(guardId, date);
    const cycle: AvailabilityStatus[] = ['not_informed', 'available', 'unavailable'];
    const idx = cycle.indexOf(cell.availability_status);
    const next = cycle[(idx + 1) % cycle.length];
    updateCell(guardId, date, { availability_status: next });
  }, [cells]);

  /* ─── Preset Application ─── */

  function applyPreset(preset: PresetDefinition) {
    if (!selectedGuardId) return;
    const updates: Record<string, CellValue> = {};

    dates.forEach((date) => {
      const dayOfWeek = parseISODate(date).getDay();
      const key = keyFor(selectedGuardId, date);
      const existing = getCell(selectedGuardId, date);

      if (preset.dayFilter(dayOfWeek)) {
        updates[key] = {
          ...existing,
          availability_status: 'available',
          preference: preset.preference,
        };
      } else if (preset.markOthersUnavailable) {
        updates[key] = {
          ...existing,
          availability_status: 'unavailable',
          preference: 'any',
        };
      }
    });

    setCells((prev) => ({ ...prev, ...updates }));
    setPresetApplied(preset.label);
    setTimeout(() => setPresetApplied(null), 2500);
  }

  function applyCustomPreset() {
    if (!selectedGuardId || customDays.size === 0) return;

    const updates: Record<string, CellValue> = {};
    dates.forEach((date) => {
      const dayOfWeek = parseISODate(date).getDay();
      const key = keyFor(selectedGuardId, date);
      const existing = getCell(selectedGuardId, date);

      if (customDays.has(dayOfWeek)) {
        updates[key] = {
          ...existing,
          availability_status: 'available',
          preference: customPref,
        };
      } else if (customMarkOthers) {
        updates[key] = {
          ...existing,
          availability_status: 'unavailable',
          preference: 'any',
        };
      }
    });

    setCells((prev) => ({ ...prev, ...updates }));
    setPresetApplied('Personalizado');
    setTimeout(() => setPresetApplied(null), 2500);
  }

  function toggleCustomDay(day: number) {
    setCustomDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  // Mark all days at once
  function markAll(status: AvailabilityStatus) {
    if (!selectedGuardId) return;
    const updates: Record<string, CellValue> = {};
    dates.forEach((date) => {
      const key = keyFor(selectedGuardId, date);
      const existing = getCell(selectedGuardId, date);
      updates[key] = { ...existing, availability_status: status };
    });
    setCells((prev) => ({ ...prev, ...updates }));
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
      setActiveDay(null);
    }
  }

  function previousGuard() {
    if (!selectedGuardId) return;
    const currentIndex = guards.findIndex(g => g.id === selectedGuardId);
    if (currentIndex > 0) {
      setSelectedGuardId(guards[currentIndex - 1].id);
      setSuccess(null);
      setError(null);
      setActiveDay(null);
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

  function getGuardStats(guardId: string) {
    let available = 0, unavailable = 0, notInformed = 0;
    dates.forEach(date => {
      const s = getCell(guardId, date).availability_status;
      if (s === 'available') available++;
      else if (s === 'unavailable') unavailable++;
      else notInformed++;
    });
    return { available, unavailable, notInformed };
  }

  const stats = selectedGuardId ? getGuardStats(selectedGuardId) : null;

  // Group presets by category
  const presetsByCategory = PRESETS.reduce<Record<string, PresetDefinition[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div>
      <style>{`
        .avail-layout {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 24px;
          align-items: start;
        }
        .guard-sidebar {
          position: sticky;
          top: 24px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        /* Calendar Grid */
        .cal-container {
          padding: 28px 32px 32px;
        }
        .cal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 20px;
          margin-bottom: 20px;
          border-bottom: 1px solid var(--border);
          flex-wrap: wrap;
          gap: 16px;
        }
        .cal-quick-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .cal-quick-btn {
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 500;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: white;
          cursor: pointer;
          transition: all 0.15s;
        }
        .cal-quick-btn:hover { background: var(--bg); }
        .cal-quick-btn.green { border-color: #a7f3d0; color: #059669; }
        .cal-quick-btn.green:hover { background: #ecfdf5; }
        .cal-quick-btn.red { border-color: #fecaca; color: #dc2626; }
        .cal-quick-btn.red:hover { background: #fef2f2; }

        .cal-weekdays {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
          margin-bottom: 4px;
        }
        .cal-weekday-label {
          text-align: center;
          font-size: 11px;
          font-weight: 600;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 8px 0;
        }
        .cal-weekday-label.weekend { color: #dc2626; opacity: 0.6; }
        .cal-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
        }
        .cal-cell {
          position: relative;
          aspect-ratio: 1;
          min-height: 68px;
          border-radius: 10px;
          border: 2px solid var(--border);
          background: white;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          transition: all 0.15s ease;
          user-select: none;
        }
        .cal-cell:hover {
          transform: scale(1.04);
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          z-index: 2;
        }
        .cal-cell:active { transform: scale(0.97); }
        .cal-cell.empty {
          background: transparent;
          border-color: transparent;
          cursor: default;
          pointer-events: none;
        }
        .cal-cell.available { background: #ecfdf5; border-color: #6ee7b7; }
        .cal-cell.available:hover { border-color: #34d399; background: #d1fae5; }
        .cal-cell.unavailable { background: #fef2f2; border-color: #fca5a5; }
        .cal-cell.unavailable:hover { border-color: #f87171; background: #fee2e2; }
        .cal-cell.not_informed { background: #f8fafc; border-color: #e2e8f0; }
        .cal-cell.active-cell {
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.25);
          border-color: var(--primary);
          z-index: 5;
        }
        .cal-cell.weekend-cell { opacity: 0.85; }
        .cal-day-number { font-size: 16px; font-weight: 700; line-height: 1; }
        .cal-day-weekday { font-size: 10px; font-weight: 500; text-transform: capitalize; opacity: 0.7; }
        .cal-status-icon { font-size: 12px; font-weight: 700; line-height: 1; margin-top: 1px; }
        .cal-pref-indicator { font-size: 9px; line-height: 1; }

        /* Popover */
        .cal-popover-anchor { position: relative; }
        .cal-popover {
          position: absolute;
          z-index: 100;
          top: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
          width: 260px;
          background: white;
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          animation: popIn 0.15s ease;
        }
        .cal-popover::before {
          content: '';
          position: absolute;
          top: -6px;
          left: 50%;
          transform: translateX(-50%) rotate(45deg);
          width: 12px;
          height: 12px;
          background: white;
          border-left: 1px solid var(--border);
          border-top: 1px solid var(--border);
        }
        @keyframes popIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .pop-title {
          font-weight: 700;
          font-size: 14px;
          color: var(--text);
          text-align: center;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border);
        }
        .pop-status-group { display: flex; gap: 6px; }
        .pop-status-btn {
          flex: 1;
          padding: 8px 6px;
          font-size: 11px;
          font-weight: 600;
          border-radius: 8px;
          border: 2px solid var(--border);
          background: white;
          cursor: pointer;
          transition: all 0.15s;
          text-align: center;
        }
        .pop-status-btn:hover { background: var(--bg); }
        .pop-status-btn.sel-available { background: #ecfdf5; border-color: #34d399; color: #059669; }
        .pop-status-btn.sel-unavailable { background: #fef2f2; border-color: #f87171; color: #dc2626; }
        .pop-status-btn.sel-not_informed { background: #f8fafc; border-color: #94a3b8; color: #64748b; }
        .pop-pref-group { display: flex; gap: 4px; }
        .pop-pref-btn {
          flex: 1;
          padding: 6px 4px;
          font-size: 11px;
          font-weight: 500;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: white;
          cursor: pointer;
          transition: all 0.12s;
          text-align: center;
        }
        .pop-pref-btn:hover { background: var(--bg); }
        .pop-pref-btn.sel {
          background: var(--primary-soft);
          border-color: var(--primary);
          color: var(--primary-dark);
          font-weight: 600;
        }
        .pop-notes {
          padding: 8px 10px;
          font-size: 13px;
          border-radius: 6px;
          border: 1px solid #cbd5e1;
          outline: none;
          resize: none;
          min-height: 48px;
        }
        .pop-notes:focus { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(79,70,229,0.1); }

        /* Stats mini bar */
        .stats-bar {
          display: flex;
          gap: 12px;
          padding: 12px 16px;
          background: var(--bg);
          border-radius: 8px;
          margin-top: 8px;
        }
        .stat-item { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; }
        .stat-dot { width: 8px; height: 8px; border-radius: 50%; }

        /* Legend */
        .cal-legend {
          display: flex;
          gap: 16px;
          justify-content: center;
          margin-top: 20px;
          flex-wrap: wrap;
        }
        .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
        .legend-swatch { width: 14px; height: 14px; border-radius: 4px; border: 2px solid; }

        /* ─── Presets Panel ─── */
        .presets-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: 10px;
          border: 1px dashed var(--primary);
          background: linear-gradient(135deg, rgba(79,70,229,0.04), rgba(79,70,229,0.08));
          cursor: pointer;
          transition: all 0.2s;
          font-size: 13px;
          font-weight: 600;
          color: var(--primary-dark);
          width: 100%;
          justify-content: center;
        }
        .presets-toggle:hover {
          background: linear-gradient(135deg, rgba(79,70,229,0.08), rgba(79,70,229,0.14));
          border-style: solid;
        }
        .presets-toggle .toggle-icon {
          transition: transform 0.25s ease;
          display: inline-block;
        }
        .presets-toggle .toggle-icon.open {
          transform: rotate(180deg);
        }

        .presets-panel {
          overflow: hidden;
          transition: max-height 0.35s ease, opacity 0.25s ease;
          max-height: 0;
          opacity: 0;
        }
        .presets-panel.open {
          max-height: 800px;
          opacity: 1;
        }
        .presets-inner {
          padding: 20px 0 0;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .preset-category-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--muted);
          margin-bottom: 8px;
          padding-left: 2px;
        }
        .preset-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
          gap: 8px;
        }
        .preset-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: white;
          cursor: pointer;
          transition: all 0.18s ease;
          text-align: left;
        }
        .preset-card:hover {
          border-color: var(--primary);
          background: rgba(79,70,229,0.03);
          box-shadow: 0 2px 8px rgba(79,70,229,0.08);
          transform: translateY(-1px);
        }
        .preset-card:active {
          transform: translateY(0) scale(0.98);
        }
        .preset-icon {
          font-size: 22px;
          line-height: 1;
          flex-shrink: 0;
        }
        .preset-info {
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
        }
        .preset-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .preset-desc {
          font-size: 11px;
          color: var(--muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Custom Builder */
        .custom-builder {
          padding: 16px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--bg);
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .custom-builder-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 700;
          color: var(--text);
        }
        .builder-day-group {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }
        .builder-day-btn {
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          border-radius: 8px;
          border: 2px solid var(--border);
          background: white;
          cursor: pointer;
          transition: all 0.15s;
          min-width: 44px;
          text-align: center;
        }
        .builder-day-btn:hover { border-color: var(--primary); background: rgba(79,70,229,0.04); }
        .builder-day-btn.active {
          background: var(--primary);
          border-color: var(--primary);
          color: white;
        }
        .builder-pref-group {
          display: flex;
          gap: 4px;
        }
        .builder-pref-btn {
          flex: 1;
          padding: 8px 10px;
          font-size: 12px;
          font-weight: 500;
          border-radius: 8px;
          border: 2px solid var(--border);
          background: white;
          cursor: pointer;
          transition: all 0.15s;
          text-align: center;
        }
        .builder-pref-btn:hover { border-color: var(--primary); }
        .builder-pref-btn.active {
          background: var(--primary-soft);
          border-color: var(--primary);
          color: var(--primary-dark);
          font-weight: 600;
        }
        .builder-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .builder-apply-btn {
          padding: 10px 20px;
          font-size: 13px;
          font-weight: 600;
          border-radius: 8px;
          border: 0;
          background: var(--primary);
          color: white;
          cursor: pointer;
          transition: all 0.15s;
        }
        .builder-apply-btn:hover { background: var(--primary-dark); }
        .builder-apply-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .builder-checkbox-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--muted);
          cursor: pointer;
        }
        .builder-checkbox-label input[type="checkbox"] {
          width: auto;
          margin: 0;
        }

        /* Preset applied toast */
        .preset-toast {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
          border: 1px solid #a5b4fc;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--primary-dark);
          animation: toastIn 0.3s ease;
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 900px) {
          .avail-layout { grid-template-columns: minmax(0, 1fr); }
          .guard-sidebar { 
            position: static; 
            padding: 12px;
          }
          /* Scroll horizontal para lista de seguranças no celular */
          .guard-sidebar > div {
            flex-direction: row !important;
            overflow-x: auto;
            padding-bottom: 8px;
          }
          .guard-sidebar button {
            white-space: nowrap;
            flex-shrink: 0;
          }
          
          .cal-container { 
            padding: 16px 12px; 
            width: 100%;
            min-width: 0;
            overflow: hidden;
          }
          .cal-grid { gap: 2px; }
          .cal-weekdays { gap: 2px; }
          .cal-weekday-label { font-size: 9px; padding: 4px 0; }
          .cal-cell { 
            min-height: 48px; 
            aspect-ratio: auto; 
            border-width: 1px;
            border-radius: 6px;
          }
          .cal-day-number { font-size: 12px; }
          .cal-status-icon { font-size: 10px; }
          .cal-day-weekday { display: none; }
          
          .cal-popover {
            position: fixed;
            top: auto;
            bottom: 0;
            left: 0;
            right: 0;
            width: 100%;
            transform: none;
            border-radius: 16px 16px 0 0;
            padding: 20px;
            padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px));
            max-height: 85vh;
            overflow-y: auto;
          }
          .cal-popover::before { display: none; }
          .preset-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
          .cal-quick-actions { flex-direction: column; align-items: stretch; }
          .cal-quick-btn { width: 100%; }
        }
      `}</style>

      <PageHeader
        title="Disponibilidade"
        description={`${schedule.title} · selecione o segurança para preencher a disponibilidade`}
        action={<Link className="ghost-button" href={`/schedules/${params.id}/builder`}>Ir para montagem</Link>}
      />

      <div className="avail-layout">

        {/* Sidebar: Guard List */}
        <div className="card guard-sidebar">
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
                      setActiveDay(null);
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

        {/* Main Panel: Calendar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <ErrorMessage message={error} />
          {success && <div className="success-message" style={{ margin: 0 }}>{success}</div>}

          {selectedGuard ? (
            <div className="card cal-container">
              {/* Header */}
              <div className="cal-header">
                <div>
                  <h2 style={{ margin: 0, fontSize: 22 }}>{selectedGuard.short_name}</h2>
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                    Clique nos dias para alternar · clique com botão direito para detalhes
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="ghost-button" onClick={previousGuard} disabled={isFirst}>&larr; Anterior</button>
                  <button className="ghost-button" onClick={nextGuard} disabled={isLast}>Próximo &rarr;</button>
                </div>
              </div>

              {/* ═══════════ PRESETS SECTION ═══════════ */}
              <button
                className="presets-toggle"
                onClick={() => setPresetsOpen(!presetsOpen)}
              >
                <span>⚡</span>
                Atalhos de preenchimento rápido
                <span className={`toggle-icon${presetsOpen ? ' open' : ''}`}>▼</span>
              </button>

              <div className={`presets-panel${presetsOpen ? ' open' : ''}`}>
                <div className="presets-inner">

                  {/* Preset applied toast */}
                  {presetApplied && (
                    <div className="preset-toast">
                      <span>✨</span>
                      Atalho &ldquo;{presetApplied}&rdquo; aplicado ao calendário
                    </div>
                  )}

                  {/* Preset cards by category */}
                  {Object.entries(presetsByCategory).map(([cat, presets]) => (
                    <div key={cat}>
                      <div className="preset-category-title">{CATEGORY_LABELS[cat] ?? cat}</div>
                      <div className="preset-grid">
                        {presets.map((preset) => (
                          <button
                            key={preset.id}
                            className="preset-card"
                            onClick={() => applyPreset(preset)}
                            title={preset.description}
                          >
                            <span className="preset-icon">{preset.icon}</span>
                            <div className="preset-info">
                              <span className="preset-label">{preset.label}</span>
                              <span className="preset-desc">{preset.description}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Custom Builder */}
                  <div className="custom-builder">
                    <div className="custom-builder-title">
                      <span>🛠️</span>
                      Montar combinação personalizada
                    </div>

                    <div>
                      <label style={{ fontSize: 11, marginBottom: 6, display: 'block' }}>Dias da semana</label>
                      <div className="builder-day-group">
                        {BUILDER_DAYS.map(({ key, label }) => (
                          <button
                            key={key}
                            className={`builder-day-btn${customDays.has(key) ? ' active' : ''}`}
                            onClick={() => toggleCustomDay(key)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: 11, marginBottom: 6, display: 'block' }}>Preferência de turno</label>
                      <div className="builder-pref-group">
                        {(['any', 'day', 'night'] as Preference[]).map((pref) => (
                          <button
                            key={pref}
                            className={`builder-pref-btn${customPref === pref ? ' active' : ''}`}
                            onClick={() => setCustomPref(pref)}
                          >
                            {PREFERENCE_LABELS[pref]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="builder-row">
                      <label className="builder-checkbox-label">
                        <input
                          type="checkbox"
                          checked={customMarkOthers}
                          onChange={(e) => setCustomMarkOthers(e.target.checked)}
                        />
                        Marcar demais dias como indisponível
                      </label>
                      <button
                        className="builder-apply-btn"
                        onClick={applyCustomPreset}
                        disabled={customDays.size === 0}
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>

                </div>
              </div>
              {/* ═══════════ END PRESETS ═══════════ */}

              {/* Quick actions + Stats */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 0', flexWrap: 'wrap', gap: 10 }}>
                <div className="cal-quick-actions">
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginRight: 4, alignSelf: 'center' }}>Marcar todos:</span>
                  <button className="cal-quick-btn green" onClick={() => markAll('available')}>✓ Disponíveis</button>
                  <button className="cal-quick-btn red" onClick={() => markAll('unavailable')}>✗ Indisponíveis</button>
                  <button className="cal-quick-btn" onClick={() => markAll('not_informed')}>Limpar</button>
                </div>
                {stats && (
                  <div className="stats-bar">
                    <div className="stat-item">
                      <div className="stat-dot" style={{ background: '#059669' }} />
                      <span>{stats.available}</span>
                    </div>
                    <div className="stat-item">
                      <div className="stat-dot" style={{ background: '#dc2626' }} />
                      <span>{stats.unavailable}</span>
                    </div>
                    <div className="stat-item">
                      <div className="stat-dot" style={{ background: '#cbd5e1' }} />
                      <span>{stats.notInformed}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Weekday headers */}
              <div className="cal-weekdays">
                {WEEKDAY_HEADERS.map((wd, i) => (
                  <div key={wd} className={`cal-weekday-label${i === 0 || i === 6 ? ' weekend' : ''}`}>{wd}</div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="cal-grid">
                {calendarWeeks.flat().map((date, idx) => {
                  if (!date) {
                    return <div key={`empty-${idx}`} className="cal-cell empty" />;
                  }

                  const parsed = parseISODate(date);
                  const dayNum = parsed.getDate();
                  const dayOfWeek = parsed.getDay();
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  const cell = getCell(selectedGuard.id, date);
                  const cfg = STATUS_CONFIG[cell.availability_status];
                  const isActive = activeDay === date;

                  return (
                    <div key={date} className="cal-popover-anchor">
                      <div
                        className={`cal-cell ${cell.availability_status}${isActive ? ' active-cell' : ''}${isWeekend ? ' weekend-cell' : ''}`}
                        onClick={() => quickToggle(selectedGuard.id, date)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setActiveDay(isActive ? null : date);
                        }}
                        title={`${formatDateShort(date)} - ${fullWeekday(date)}\n${cfg.label}${cell.preference !== 'any' ? ` · ${PREFERENCE_LABELS[cell.preference]}` : ''}${cell.notes ? `\n${cell.notes}` : ''}`}
                      >
                        <span className="cal-day-number" style={{ color: cfg.color }}>
                          {dayNum}
                        </span>
                        <span className="cal-status-icon" style={{ color: cfg.color }}>
                          {cfg.icon}
                        </span>
                        {cell.availability_status === 'available' && cell.preference !== 'any' && (
                          <span className="cal-pref-indicator">{cell.preference === 'day' ? '☀' : '🌙'}</span>
                        )}
                        {cell.notes && (
                          <span style={{ position: 'absolute', top: 4, right: 5, fontSize: 8, color: 'var(--primary)' }}>📝</span>
                        )}
                      </div>

                      {/* Popover for details */}
                      {isActive && (
                        <div className="cal-popover" ref={popoverRef}>
                          <div className="pop-title">
                            {formatDateShort(date)} · {fullWeekday(date)}
                          </div>
                          <div>
                            <label style={{ fontSize: 11, marginBottom: 4, display: 'block' }}>Status</label>
                            <div className="pop-status-group">
                              {(['available', 'unavailable', 'not_informed'] as AvailabilityStatus[]).map((st) => (
                                <button
                                  key={st}
                                  className={`pop-status-btn${cell.availability_status === st ? ` sel-${st}` : ''}`}
                                  onClick={() => updateCell(selectedGuard.id, date, { availability_status: st })}
                                >
                                  {STATUS_CONFIG[st].icon} {STATUS_CONFIG[st].label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label style={{ fontSize: 11, marginBottom: 4, display: 'block' }}>Preferência de turno</label>
                            <div className="pop-pref-group">
                              {(['any', 'day', 'night'] as Preference[]).map((pref) => (
                                <button
                                  key={pref}
                                  className={`pop-pref-btn${cell.preference === pref ? ' sel' : ''}`}
                                  onClick={() => updateCell(selectedGuard.id, date, { preference: pref })}
                                >
                                  {PREFERENCE_LABELS[pref]}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label style={{ fontSize: 11, marginBottom: 4, display: 'block' }}>Observação</label>
                            <textarea
                              className="pop-notes"
                              placeholder="Obs (opcional)..."
                              value={cell.notes}
                              onChange={(e) => updateCell(selectedGuard.id, date, { notes: e.target.value })}
                            />
                          </div>
                          <button
                            style={{
                              padding: '6px 12px',
                              fontSize: 12,
                              fontWeight: 500,
                              borderRadius: 6,
                              border: '1px solid var(--border)',
                              background: 'var(--bg)',
                              cursor: 'pointer',
                              alignSelf: 'flex-end',
                            }}
                            onClick={() => setActiveDay(null)}
                          >
                            Fechar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="cal-legend">
                <div className="legend-item">
                  <div className="legend-swatch" style={{ background: '#ecfdf5', borderColor: '#6ee7b7' }} />
                  Disponível
                </div>
                <div className="legend-item">
                  <div className="legend-swatch" style={{ background: '#fef2f2', borderColor: '#fca5a5' }} />
                  Não pode
                </div>
                <div className="legend-item">
                  <div className="legend-swatch" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }} />
                  Não informado
                </div>
                <div className="legend-item">
                  <span style={{ fontSize: 10 }}>📝</span>
                  Com observação
                </div>
              </div>

              {/* Save button */}
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
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
