"use client";

import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { ErrorMessage } from '@/components/ErrorMessage';
import { Loading } from '@/components/Loading';
import { EmptyState } from '@/components/EmptyState';
import { supabase } from '@/lib/supabaseClient';
import { statusLabel } from '@/lib/domain';
import { Location, Status } from '@/lib/types';

type FormState = {
  id?: string;
  name: string;
  address: string;
  notes: string;
  status: Status;
};

const emptyForm: FormState = { name: '', address: '', notes: '', status: 'active' };

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    loadLocations();
  }, []);

  async function loadLocations() {
    setLoading(true);
    const { data, error: loadError } = await supabase.from('locations').select('*').order('name');
    if (loadError) setError(loadError.message);
    setLocations((data ?? []) as Location[]);
    setLoading(false);
  }

  function editLocation(location: Location) {
    setForm({
      id: location.id,
      name: location.name,
      address: location.address ?? '',
      notes: location.notes ?? '',
      status: location.status
    });
    setShowCreateForm(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      name: form.name,
      address: form.address || null,
      notes: form.notes || null,
      status: form.status
    };

    const result = form.id
      ? await supabase.from('locations').update(payload).eq('id', form.id)
      : await supabase.from('locations').insert(payload);

    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }

    setForm(emptyForm);
    setShowCreateForm(false);
    await loadLocations();
  }

  async function toggleStatus(location: Location) {
    const status: Status = location.status === 'active' ? 'inactive' : 'active';
    await supabase.from('locations').update({ status }).eq('id', location.id);
    await loadLocations();
  }

  const shouldShowForm = showCreateForm || !!form.id;

  return (
    <div>
      <PageHeader 
        title="Locais" 
        description="Cadastro dos locais onde a escala será montada." 
        action={
          <button className="primary-button" onClick={() => {
            if (shouldShowForm) {
              setForm(emptyForm);
              setShowCreateForm(false);
            } else {
              setShowCreateForm(true);
            }
          }}>
            {shouldShowForm ? 'Cancelar' : 'Novo local'}
          </button>
        }
      />

      {shouldShowForm && (
        <section className="card">
          <h2>{form.id ? 'Editar local' : 'Novo local'}</h2>
          <form onSubmit={submit} className="form-grid">
            <div className="form-row">
              <label>Nome do local</label>
              <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </div>
            <div className="form-row">
              <label>Status</label>
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Status })}>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>
            <div className="form-row full">
              <label>Endereço</label>
              <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            </div>
            <div className="form-row full">
              <label>Observação</label>
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </div>
            <div className="actions full">
              <button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
              {form.id ? <button type="button" className="ghost-button" onClick={() => { setForm(emptyForm); setShowCreateForm(false); }}>Cancelar edição</button> : null}
            </div>
          </form>
          <ErrorMessage message={error} />
        </section>
      )}

      <section className="card">
        <h2>Lista de locais</h2>
        {loading ? <Loading /> : locations.length === 0 ? <EmptyState title="Nenhum local cadastrado" /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Endereço</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((location) => (
                  <tr key={location.id}>
                    <td><strong>{location.name}</strong><br /><span className="muted small">{location.notes}</span></td>
                    <td>{location.address ?? '-'}</td>
                    <td><Badge tone={location.status === 'active' ? 'success' : 'neutral'}>{statusLabel(location.status)}</Badge></td>
                    <td>
                      <div className="actions" style={{ margin: 0 }}>
                        <button className="secondary-button" onClick={() => editLocation(location)}>Editar</button>
                        <button className="ghost-button" onClick={() => toggleStatus(location)}>{location.status === 'active' ? 'Inativar' : 'Ativar'}</button>
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
