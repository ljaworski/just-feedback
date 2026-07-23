import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api, type Project } from '../api';
import { useI18n } from '../i18n';
import { LangSwitch } from './LangSwitch';
import { NewProjectModal } from './NewProjectModal';

export function Sidebar({
  projects,
  open,
  onNavigate,
  reloadProjects,
}: {
  projects: Project[];
  open: boolean;
  onNavigate: () => void;
  reloadProjects: () => Promise<void>;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const logout = async () => {
    await api.logout().catch(() => {});
    navigate('/login', { replace: true });
  };

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <h2>{t('sidebar.projects')}</h2>
      <ul className="project-list">
        {projects.map((p) => (
          <li key={p.id}>
            <NavLink
              to={`/projects/${p.id}`}
              className={({ isActive }) => (isActive ? 'active' : '')}
              onClick={onNavigate}
            >
              <span>{p.name}</span>
              {p.newCount > 0 && <span className="badge">{p.newCount}</span>}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="sidebar-footer">
        <button className="btn-secondary btn-block" onClick={() => setCreating(true)}>
          {t('sidebar.newProject')}
        </button>
        <button className="btn-text" onClick={logout}>
          {t('sidebar.logout')}
        </button>
        <LangSwitch />
      </div>

      {creating && (
        <NewProjectModal
          onClose={() => setCreating(false)}
          onCreated={async (p) => {
            await reloadProjects();
            navigate(`/projects/${p.id}`);
            onNavigate();
          }}
        />
      )}
    </aside>
  );
}
