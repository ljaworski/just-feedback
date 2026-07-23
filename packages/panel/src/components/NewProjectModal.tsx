import { useState } from 'react';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { useI18n } from '../i18n';
import { api } from '../api';

export function NewProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (project: { id: string; name: string; createdAt: string }) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const { showError } = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const project = await api.createProject(name.trim());
      await onCreated(project);
      onClose();
    } catch {
      showError();
      setBusy(false);
    }
  };

  return (
    <Modal title={t('sidebar.newProject.title')} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="np-name">{t('onboarding.project.nameLabel')}</label>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input id="np-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('feedbacks.confirmDelete.cancel')}
          </button>
          <button type="submit" className="btn-primary" disabled={!name.trim() || busy}>
            {t('sidebar.newProject.create')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
