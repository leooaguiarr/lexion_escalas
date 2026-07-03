"use client";

import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { ErrorMessage } from '@/components/ErrorMessage';
import { EmptyState } from '@/components/EmptyState';
import { Loading } from '@/components/Loading';
import { supabase } from '@/lib/supabaseClient';
import { formatMoney, statusLabel, toNumber } from '@/lib/domain';
import { Guard, Status } from '@/lib/types';

type FormState = {
  id?: string;
  full_name: string;
  short_name: string;
  phone: string;
  hourly_rate: string;
  status: Status;
  notes: string;
};

const emptyForm: FormState = {
  full_name: '',
  short_name: '',
  phone: '',
  hourly_rate: '0',
  status: 'active',
  notes: ''
};

export default function GuardsPage() {
  const [guards, setGuards] = useState<Guard[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGuards();
  }, []);

  async function loadGuards() {
    setLoading(true);
    const { data, error: loadError } = await supabase.from('guards').select('*').order('short_name');
    if (loadError) setError(loadError.message);
    setGuards((data ?? []) as Guard[]);
    setLoading(false);
  }

  function editGuard(guard: Guard) {
    setForm({
      id: guard.id,
      full_name: guard.full_name,
      short_name: guard.short_name,
      phone: guard.phone,
      hourly_rate: String(guard.hourly_rate ?? 0),
      status: guard.status,
      notes: guard.notes ?? ''
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      full_name: form.full_name,
      short_name: form.short_name,
      phone: form.phone,
      hourly_rate: toNumber(form.hourly_rate),
      status: form.status,
      notes: form.notes || null
    };

    const result = form.id
      ? await supabase.from('guards').update(payload).eq('id', form.id)
      : await supabase.from('guards').insert(payload);

    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }

    setForm(emptyForm);
    await loadGuards();
  }

  async function toggleStatus(guard: Guard) {
    const status: Status = guard.status === 'active' ? 'inactive' : 'active';
    await supabase.from('guards').update({ status }).eq('id', guard.id);
    await loadGuards();
  }

  return (
    <div>
      <PageHeader title="Seguranças" description="Cadastro simples: nome, telefone, valor por hora e status." />

      <section className="card">
        <h2>{form.id ? 'Editar segurança' : 'Novo segurança'}</h2>
        <form onSubmit={submit} className="form-grid">
          <div className="form-row">
            <label>Nome completo</label>
            <input required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
          </div>
          <div className="form-row">
            <label>Nome curto/apelido</label>
            <input required value={form.short_name} onChange={(event) => setForm({ ...form, short_name: event.target.value })} />
          </div>
          <div className="form-row">
            <label>Telefone</label>
            <input required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </div>
          <div className="form-row">
            <label>Valor por hora</label>
            <input required type="number" step="0.01" value={form.hourly_rate} onChange={(event) => setForm({ ...form, hourly_rate: event.target.value })} />
          </div>
          <div className="form-row">
            <label>Status</label>
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Status })}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
          <div className="form-row full">
            <label>Observação</label>
            <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </div>
          <div className="actions full">
            <button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
            {form.id ? <button type="button" className="ghost-button" onClick={() => setForm(emptyForm)}>Cancelar edição</button> : null}
          </div>
        </form>
        <ErrorMessage message={error} />
      </section>

      <section className="card">
        <h2>Lista de seguranças</h2>
        {loading ? <Loading /> : guards.length === 0 ? <EmptyState title="Nenhum segurança cadastrado" /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>Valor/hora</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {guards.map((guard) => (
                  <tr key={guard.id}>
                    <td><strong>{guard.short_name}</strong><br /><span className="muted small">{guard.full_name}</span></td>
                    <td>{guard.phone}</td>
                    <td>{formatMoney(guard.hourly_rate)}</td>
                    <td><Badge tone={guard.status === 'active' ? 'success' : 'neutral'}>{statusLabel(guard.status)}</Badge></td>
                    <td>
                      <div className="actions" style={{ margin: 0 }}>
                        <button className="secondary-button" onClick={() => editGuard(guard)}>Editar</button>
                        <button className="ghost-button" onClick={() => toggleStatus(guard)}>{guard.status === 'active' ? 'Inativar' : 'Ativar'}</button>
                      </div>
                    </td>
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
