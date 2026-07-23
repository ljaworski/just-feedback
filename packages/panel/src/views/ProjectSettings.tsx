import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, type ApiKey, type CreatedKey } from '../api';
import { useI18n } from '../i18n';
import { useToast } from '../components/Toast';
import { useProjects } from '../layoutContext';
import { Modal } from '../components/Modal';
import { CopyButton } from '../components/CopyButton';
import { sdkSnippet } from '../snippet';

export function ProjectSettings() {
  const { t, formatRelative } = useI18n();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { projects, reloadProjects } = useProjects();
  const { showError } = useToast();
  const project = projects.find((p) => p.id === id);

  const [name, setName] = useState(project?.name ?? '');
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyOpen, setNewKeyOpen] = useState(false);
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const loadKeys = useCallback(async () => {
    if (id) setKeys(await api.listKeys(id).catch(() => []));
  }, [id]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);
  useEffect(() => {
    if (project) setName(project.name);
  }, [project]);

  if (!project) return <Navigate to="/" replace />;

  const saveName = async () => {
    try {
      await api.renameProject(project.id, name.trim());
      await reloadProjects();
    } catch {
      showError();
    }
  };

  const revoke = async (keyId: string) => {
    if (!window.confirm(t('settings.keys.revokeConfirm'))) return;
    try {
      await api.revokeKey(keyId);
      await loadKeys();
    } catch {
      showError();
    }
  };

  const deleteProject = async () => {
    try {
      await api.deleteProject(project.id);
      await reloadProjects();
      navigate('/', { replace: true });
    } catch {
      showError();
    }
  };

  return (
    <>
      <div className="page-header">
        <Link className="btn-text" to={`/projects/${project.id}`}>
          ← {t('settings.back')}
        </Link>
        <h1>{t('settings.title')}</h1>
      </div>

      {/* 1. Name */}
      <section className="section">
        <h2>{t('settings.name.title')}</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          <button className="btn-primary" disabled={!name.trim() || name.trim() === project.name} onClick={saveName}>
            {t('settings.name.save')}
          </button>
        </div>
      </section>

      {/* 2. API keys */}
      <section className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>{t('settings.keys.title')}</h2>
          <button className="btn-secondary" onClick={() => setNewKeyOpen(true)}>
            {t('settings.keys.new')}
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>{t('settings.keys.col.label')}</th>
              <th>{t('settings.keys.col.prefix')}</th>
              <th>{t('settings.keys.col.created')}</th>
              <th>{t('settings.keys.col.status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.label}</td>
                <td><code>{k.keyPrefix}…</code></td>
                <td>{formatRelative(k.createdAt)}</td>
                <td className={k.revokedAt ? 'status-revoked' : 'status-active'}>
                  {k.revokedAt ? t('settings.keys.status.revoked') : t('settings.keys.status.active')}
                </td>
                <td>
                  {!k.revokedAt && (
                    <button className="btn-text" style={{ color: 'var(--danger)' }} onClick={() => revoke(k.id)}>
                      {t('settings.keys.revoke')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 3. Danger zone */}
      <section className="section danger-zone">
        <h2>{t('settings.danger.title')}</h2>
        <div className="field">
          <label>{t('settings.danger.confirmLabel', { name: project.name })}</label>
          <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} />
        </div>
        <button className="btn-danger" disabled={deleteConfirm !== project.name} onClick={deleteProject}>
          {t('settings.danger.confirmButton')}
        </button>
      </section>

      {newKeyOpen && (
        <NewKeyModal
          projectId={project.id}
          onClose={() => setNewKeyOpen(false)}
          onCreated={async (k) => {
            setCreated(k);
            setNewKeyOpen(false);
            await loadKeys();
          }}
        />
      )}

      {created && (
        <Modal title={t('settings.keys.created.title')} onClose={() => setCreated(null)}>
          <div className="key-reveal">{created.key}</div>
          <div style={{ margin: '10px 0' }}>
            <CopyButton value={created.key} />
          </div>
          <p className="warn">{t('onboarding.key.warning')}</p>
          <label>{t('onboarding.key.snippetTitle')}</label>
          <pre className="snippet">{sdkSnippet(window.location.origin, created.key)}</pre>
        </Modal>
      )}
    </>
  );
}

function NewKeyModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: (k: CreatedKey) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const { showError } = useToast();
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || busy) return;
    setBusy(true);
    try {
      await onCreated(await api.createKey(projectId, label.trim()));
    } catch {
      showError();
      setBusy(false);
    }
  };

  return (
    <Modal title={t('settings.keys.new.title')} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="kl-new">{t('settings.keys.new.labelField')}</label>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input id="kl-new" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} maxLength={100} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('feedbacks.confirmDelete.cancel')}
          </button>
          <button type="submit" className="btn-primary" disabled={!label.trim() || busy}>
            {t('settings.keys.new.create')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
