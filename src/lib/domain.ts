export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value.replace(',', '.')) || 0;
  return 0;
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
}

export function calculateHours(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const minutes = end > start ? end - start : 24 * 60 - start + end;
  return Number((minutes / 60).toFixed(2));
}

export function formatTime(time: string): string {
  return time.slice(0, 5).replace(':', 'h');
}

export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)} às ${formatTime(end)}`;
}

export function formatMoney(value: number | string | null | undefined): string {
  const number = toNumber(value);
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatHours(value: number | string | null | undefined): string {
  const number = toNumber(value);
  return `${number.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h`;
}

export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseISODate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function dateRange(startDate: string, endDate: string): string[] {
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(toISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function formatDateBR(value: string): string {
  return parseISODate(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function formatDateBRShort(value: string): string {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year.slice(-2)}`;
}

export function formatDateShort(value: string): string {
  const date = parseISODate(value);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function shortWeekday(value: string): string {
  const date = parseISODate(value);
  const map = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  return map[date.getDay()];
}

export function fullWeekday(value: string): string {
  return parseISODate(value).toLocaleDateString('pt-BR', { weekday: 'long' });
}

export function monthName(value: string): string {
  return parseISODate(value).toLocaleDateString('pt-BR', { month: 'long' }).toUpperCase();
}

export function availabilityLabel(status: string, preference?: string): string {
  if (status === 'unavailable') return 'Não pode';
  if (status === 'not_informed') return 'Não informado';
  if (preference === 'day') return 'Disponível · Dia';
  if (preference === 'night') return 'Disponível · Noite';
  return 'Disponível · Qualquer';
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    active: 'Ativo',
    inactive: 'Inativo',
    draft: 'Rascunho',
    closed: 'Fechada',
    pending_pickup: 'Pendente de retirar',
    picked_up: 'Retirado'
  };
  return map[status] ?? status;
}

export function calculateScheduleStatus(startDate: string, endDate: string): 'draft' | 'active' | 'closed' {
  if (!startDate || !endDate) return 'draft';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const start = parseISODate(startDate);
  start.setHours(0, 0, 0, 0);
  
  const end = parseISODate(endDate);
  end.setHours(0, 0, 0, 0);
  
  if (today < start) {
    return 'draft';
  }
  if (today >= start && today <= end) {
    return 'active';
  }
  return 'closed';
}
