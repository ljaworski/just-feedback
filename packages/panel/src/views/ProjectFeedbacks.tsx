import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api, ApiError, type Feedback } from '../api';
import { useI18n } from '../i18n';
import { useToast } from '../components/Toast';
import { useProjects } from '../layoutContext';

const LIMIT = 50;
type Tab = 'active' | 'archived';

const PLATFORM_LABEL: Record<string, string> = { ios: 'iOS', android: 'Android', web: 'Web' };

function chips(f: Feedback): string[] {
  const out: string[] = [];
  if (f.platform) {
    const p = PLATFORM_LABEL[f.platform] ?? f.platform;
    out.push(f.osVersion ? `${p} ${f.osVersion}` : p);
  }
  if (f.appVersion) out.push(`v${f.appVersion}`);
  if (f.deviceModel) out.push(f.deviceModel);
  if (f.userRef) out.push(f.userRef);
  return out;
}

export function ProjectFeedbacks() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const { projects, reloadProjects } = useProjects();
  const project = projects.find((p) => p.id === id);

  const [tab, setTab] = useState<Tab>('active');
  const [items, setItems] = useState<Feedback[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (offset: number, replace: boolean) => {
      if (!id) return;
      setLoading(true);
      try {
        const res = await api.listFeedbacks(id, { status: tab, limit: LIMIT, offset });
        setTotal(res.total);
        setItems((prev) => (replace ? res.items : [...prev, ...res.items]));
      } finally {
        setLoading(false);
      }
    },
    [id, tab],
  );

  useEffect(() => {
    setItems([]);
    load(0, true);
  }, [load]);

  if (!project) return <Navigate to="/" replace />;

  const markAllRead = async () => {
    setItems((prev) => prev.map((f) => (f.status === 'new' ? { ...f, status: 'read' } : f)));
    try {
      await api.markAllRead(project.id);
      await reloadProjects();
    } catch {
      load(0, true);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>{project.name}</h1>
        {project.newCount > 0 && (
          <button className="btn-secondary" onClick={markAllRead}>
            {t('feedbacks.markAllRead')}
          </button>
        )}
        <Link className="btn-text" to={`/projects/${project.id}/settings`} aria-label={t('feedbacks.settings')} title={t('feedbacks.settings')}>
          ⚙
        </Link>
      </div>

      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={tab === 'active'} className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>
          {t('feedbacks.tab.active')}
        </button>
        <button role="tab" aria-selected={tab === 'archived'} className={tab === 'archived' ? 'active' : ''} onClick={() => setTab('archived')}>
          {t('feedbacks.tab.archived')}
        </button>
      </div>

      {items.length === 0 && !loading ? (
        <div className="state">
          <p>{t('feedbacks.empty')}</p>
          <Link className="link-inline" to={`/projects/${project.id}/settings`}>
            {t('feedbacks.empty.link')}
          </Link>
        </div>
      ) : (
        <div className="feedback-list">
          {items.map((f) => (
            <FeedbackCard
              key={f.id}
              f={f}
              tab={tab}
              onChange={setItems}
              reloadProjects={reloadProjects}
              reload={() => load(0, true)}
            />
          ))}
        </div>
      )}

      {items.length < total && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button className="btn-secondary" disabled={loading} onClick={() => load(items.length, false)}>
            {t('feedbacks.loadMore')}
          </button>
        </div>
      )}
    </>
  );
}

function FeedbackCard({
  f,
  tab,
  onChange,
  reloadProjects,
  reload,
}: {
  f: Feedback;
  tab: Tab;
  onChange: React.Dispatch<React.SetStateAction<Feedback[]>>;
  reloadProjects: () => Promise<void>;
  reload: () => void;
}) {
  const { t, formatRelative } = useI18n();
  const { showError } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const long = f.content.length > 200;
  const shown = long && !expanded ? f.content.slice(0, 200) + '…' : f.content;

  const remove = (id: string) => onChange((prev) => prev.filter((x) => x.id !== id));

  const onCardClick = async () => {
    if (long) setExpanded((v) => !v);
    if (f.status === 'new') {
      onChange((prev) => prev.map((x) => (x.id === f.id ? { ...x, status: 'read' } : x)));
      try {
        await api.patchFeedback(f.id, 'read');
        await reloadProjects();
      } catch {
        showError();
        reload();
      }
    }
  };

  const mutate = async (fn: () => Promise<unknown>) => {
    remove(f.id);
    try {
      await fn();
      await reloadProjects();
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 404) showError();
      reload();
    }
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className={`feedback${f.status === 'new' ? ' is-new' : ''}`} onClick={onCardClick}>
      <p className="feedback-content">
        {shown}
        {long && <span className="link-inline"> {expanded ? t('feedbacks.showLess') : t('feedbacks.showMore')}</span>}
      </p>
      <div className="feedback-row">
        <div className="chips">
          {chips(f).map((c, i) => (
            <span key={i} className="chip">
              {c}
            </span>
          ))}
        </div>
        <span className="feedback-date">{formatRelative(f.createdAt)}</span>
      </div>
      <div className="feedback-actions" onClick={stop}>
        {tab === 'active' ? (
          <button className="btn-text" onClick={() => mutate(() => api.patchFeedback(f.id, 'archived'))}>
            {t('feedbacks.action.archive')}
          </button>
        ) : (
          <button className="btn-text" onClick={() => mutate(() => api.patchFeedback(f.id, 'read'))}>
            {t('feedbacks.action.restore')}
          </button>
        )}
        {confirmDelete ? (
          <span className="mini-confirm">
            {t('feedbacks.confirmDelete')}
            <button className="btn-danger" onClick={() => mutate(() => api.deleteFeedback(f.id))}>
              {t('feedbacks.confirmDelete.yes')}
            </button>
            <button className="btn-text" onClick={() => setConfirmDelete(false)}>
              {t('feedbacks.confirmDelete.cancel')}
            </button>
          </span>
        ) : (
          <button className="btn-text" style={{ color: 'var(--danger)' }} onClick={() => setConfirmDelete(true)}>
            {t('feedbacks.action.delete')}
          </button>
        )}
      </div>
    </div>
  );
}
