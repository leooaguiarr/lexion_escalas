import { Guard, ScheduleAssignment } from './types';
import { toNumber } from './domain';

export type PaymentSummary = {
  guard_id: string;
  total_hours: number;
  hourly_rate: number;
  total_amount: number;
};

export function buildPaymentSummaries(assignments: ScheduleAssignment[], guards: Guard[]): PaymentSummary[] {
  const guardMap = new Map(guards.map((guard) => [guard.id, guard]));
  const totals = new Map<string, PaymentSummary>();

  assignments.forEach((assignment) => {
    if (!assignment.guard_id) return;
    const guard = guardMap.get(assignment.guard_id);
    const hourlyRate = toNumber(assignment.hourly_rate || guard?.hourly_rate || 0);
    const hours = assignment.completed === false
      ? 0
      : toNumber(assignment.worked_hours ?? assignment.planned_hours ?? 0);

    const current = totals.get(assignment.guard_id) ?? {
      guard_id: assignment.guard_id,
      total_hours: 0,
      hourly_rate: hourlyRate,
      total_amount: 0
    };

    current.total_hours = Number((current.total_hours + hours).toFixed(2));
    current.total_amount = Number((current.total_amount + hours * hourlyRate).toFixed(2));
    current.hourly_rate = hourlyRate;
    totals.set(assignment.guard_id, current);
  });

  return Array.from(totals.values()).sort((a, b) => b.total_amount - a.total_amount);
}
