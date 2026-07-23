import { useCallback, useEffect, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { api, ApiError, type Project } from './api';
import { useI18n } from './i18n';
import { Sidebar } from './components/Sidebar';
import { NewProjectModal } from './components/NewProjectModal';
import { useProjects } from './layoutContext';
import { Onboarding } from './views/Onboarding';
import { Login } from './views/Login';
import { ProjectFeedbacks } from './views/ProjectFeedbacks';
import { ProjectSettings } from './views/ProjectSettings';
import type { LayoutCtx } from './layoutContext';

type Status = { setupRequired: boolean } | 'loading' | 'error';

export function App() {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>('loading');

  const load = useCallback(() => {
    setStatus('loading');
    api
      .setupStatus()
      .then((s) => setStatus({ setupRequired: s.setupRequired }))
      .catch(() => setStatus('error'));
  }, []);

  useEffect(load, [load]);

  if (status === 'loading') return <div className="state">{t('common.loading')}</div>;
  if (status === 'error') {
    return (
      <div className="centered">
        <div className="card card-narrow" style={{ textAlign: 'center' }}>
          <p>{t('error.loadStatus')}</p>
          <button className="btn-primary" onClick={load}>
            {t('action.retry')}
          </button>
        </div>
      </div>
    );
  }

  const setupRequired = status.setupRequired;
  return (
    <Routes>
      <Route
        path="/onboarding"
        element={setupRequired ? <Onboarding /> : <Navigate to="/" replace />}
      />
      <Route
        path="/login"
        element={setupRequired ? <Navigate to="/onboarding" replace /> : <Login />}
      />
      <Route element={setupRequired ? <Navigate to="/onboarding" replace /> : <ProtectedLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/projects/:id" element={<ProjectFeedbacks />} />
        <Route path="/projects/:id/settings" element={<ProjectSettings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/** Loads projects (which also verifies the session) and renders sidebar + outlet. */
function ProtectedLayout() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const reloadProjects = useCallback(async () => {
    try {
      setProjects(await api.listProjects());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) navigate('/login', { replace: true });
      else throw e;
    }
  }, [navigate]);

  useEffect(() => {
    reloadProjects();
  }, [reloadProjects]);

  if (projects === null) return <div className="state">{t('common.loading')}</div>;

  const ctx: LayoutCtx = { projects, reloadProjects };
  return (
    <div className="layout">
      <button className="hamburger" aria-label={t('sidebar.menu')} onClick={() => setMobileOpen((v) => !v)}>
        ☰
      </button>
      <Sidebar
        projects={projects}
        open={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
        reloadProjects={reloadProjects}
      />
      <main className="main">
        <Outlet context={ctx} />
      </main>
    </div>
  );
}

/** "/" — redirect to the first project, or show the empty state. */
function Home() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { projects, reloadProjects } = useProjects();
  const [creating, setCreating] = useState(false);

  if (projects.length > 0) return <Navigate to={`/projects/${projects[0].id}`} replace />;

  return (
    <div className="state">
      <h3>{t('empty.noProjects.text')}</h3>
      <button className="btn-primary" onClick={() => setCreating(true)}>
        {t('empty.noProjects.cta')}
      </button>
      {creating && (
        <NewProjectModal
          onClose={() => setCreating(false)}
          onCreated={async (p) => {
            await reloadProjects();
            navigate(`/projects/${p.id}`);
          }}
        />
      )}
    </div>
  );
}
