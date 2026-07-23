import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useI18n } from '../i18n';
import { LangSwitch } from '../components/LangSwitch';

export function Login() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await api.login(password);
      navigate('/', { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) navigate('/onboarding', { replace: true });
      else setError(true);
      setBusy(false);
    }
  };

  return (
    <div className="centered">
      <div className="card card-narrow">
        <h1 className="brand">{t('app.name')}</h1>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="password">{t('login.passwordLabel')}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              /* eslint-disable-next-line jsx-a11y/no-autofocus */
              autoFocus
            />
            {error && <div className="error">{t('login.error')}</div>}
          </div>
          <button type="submit" className="btn-primary btn-block" disabled={busy || !password}>
            {t('login.submit')}
          </button>
        </form>
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
          <LangSwitch />
        </div>
      </div>
    </div>
  );
}
