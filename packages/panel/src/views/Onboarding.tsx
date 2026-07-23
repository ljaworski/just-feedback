import { useEffect, useState } from 'react';
import { api, ApiError, type SetupResult } from '../api';
import { useI18n } from '../i18n';
import { LangSwitch } from '../components/LangSwitch';
import { CopyButton } from '../components/CopyButton';
import { sdkSnippet } from '../snippet';

function tokenFromHash(): string | null {
  const m = /setup=([0-9a-fA-F]{64})/.exec(window.location.hash);
  return m ? m[1].toLowerCase() : null;
}

export function Onboarding() {
  const { t } = useI18n();

  const [token, setToken] = useState<string | null>(tokenFromHash);
  const [passwordRequired, setPasswordRequired] = useState<boolean | null>(null);
  const [tokenInput, setTokenInput] = useState('');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [projectName, setProjectName] = useState('');
  const [keyLabel, setKeyLabel] = useState('');

  const [fieldErr, setFieldErr] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<SetupResult | null>(null);

  // Load setup status (for passwordRequired) and default key label once mounted.
  useEffect(() => {
    api
      .setupStatus()
      .then((s) => setPasswordRequired(s.passwordRequired))
      .catch(() => setPasswordRequired(true));
  }, []);
  useEffect(() => {
    setKeyLabel(t('onboarding.project.keyLabelDefault'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Re-read the token if the URL fragment arrives late (browser timing) or changes.
  useEffect(() => {
    const sync = () => {
      const tk = tokenFromHash();
      if (tk) setToken(tk);
    };
    window.addEventListener('hashchange', sync);
    sync();
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  // --- no token yet: ask the user to open the setup link or paste the token ---
  if (!token) {
    const tryToken = () => {
      const m = /([0-9a-fA-F]{64})/.exec(tokenInput);
      if (!m) {
        setFieldErr({ form: t('onboarding.error.invalidToken') });
        return;
      }
      const tk = m[1].toLowerCase();
      window.location.hash = `setup=${tk}`; // normalize so a refresh keeps it
      setToken(tk);
      setFieldErr({});
    };
    return (
      <OnboardingShell>
        <p className="muted">{t('onboarding.noToken.instruction')}</p>
        <div className="field">
          <label htmlFor="tk">{t('onboarding.tokenLabel')}</label>
          <input id="tk" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} />
          {fieldErr.form && <div className="error">{fieldErr.form}</div>}
        </div>
        <button className="btn-primary btn-block" onClick={tryToken} disabled={!tokenInput.trim()}>
          {t('onboarding.tokenContinue')}
        </button>
      </OnboardingShell>
    );
  }

  if (passwordRequired === null) {
    return (
      <OnboardingShell>
        <div className="state">{t('common.loading')}</div>
      </OnboardingShell>
    );
  }

  // --- key reveal screen (after a project was created) ---
  if (created?.apiKey && created.project) {
    const key = created.apiKey.key;
    return (
      <OnboardingShell step="key">
        <h2>{t('onboarding.step.key')}</h2>
        <div className="key-reveal">{key}</div>
        <div style={{ margin: '10px 0' }}>
          <CopyButton value={key} />
        </div>
        <p className="warn">{t('onboarding.key.warning')}</p>
        <label>{t('onboarding.key.snippetTitle')}</label>
        <pre className="snippet">{sdkSnippet(window.location.origin, key)}</pre>
        <button
          className="btn-primary btn-block"
          onClick={() => window.location.replace(`/projects/${created.project!.id}`)}
        >
          {t('onboarding.key.goToProject')}
        </button>
      </OnboardingShell>
    );
  }

  // --- main form: password (if required) + first project ---
  const validate = (): boolean => {
    const errs: typeof fieldErr = {};
    if (passwordRequired) {
      if (password.length < 8) errs.password = t('onboarding.password.tooShort');
      else if (password !== confirm) errs.confirm = t('onboarding.password.mismatch');
    }
    setFieldErr(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (skip: boolean) => {
    if (busy) return;
    if (!validate()) return;
    if (skip && !window.confirm(t('onboarding.project.skipConfirm'))) return;
    setBusy(true);
    setFieldErr({});
    try {
      const body = {
        password: passwordRequired ? password : undefined,
        project: skip ? null : { name: projectName.trim(), keyLabel: keyLabel.trim() },
      };
      const res = await api.setup(token, body);
      // Full-page nav so App re-fetches setup/status (now completed) and gates correctly.
      if (res.project && res.apiKey) setCreated(res);
      else window.location.replace('/'); // skipped: land on the existing empty state
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && e.status === 403) {
        setToken(null);
        window.location.hash = '';
        setFieldErr({ form: t('onboarding.error.invalidToken') });
      } else if (e instanceof ApiError && e.status === 409) {
        window.location.replace('/'); // already initialized: App routes to panel or /login
      } else {
        // 400 validation, network or 5xx: keep data + token, show inline error to retry
        setFieldErr({ form: t('toast.error.generic') });
      }
    }
  };

  const createDisabled = busy || !projectName.trim() || !keyLabel.trim();
  return (
    <OnboardingShell step={passwordRequired ? 'password' : 'project'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        {passwordRequired ? (
          <>
            <div className="field">
              <label htmlFor="pw">{t('onboarding.password.label')}</label>
              <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
              {fieldErr.password && <div className="error">{fieldErr.password}</div>}
            </div>
            <div className="field">
              <label htmlFor="pw2">{t('onboarding.password.confirmLabel')}</label>
              <input id="pw2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy} />
              {fieldErr.confirm && <div className="error">{fieldErr.confirm}</div>}
            </div>
          </>
        ) : (
          <p className="muted">{t('onboarding.password.serverConfigured')}</p>
        )}

        <div className="field">
          <label htmlFor="pn">{t('onboarding.project.nameLabel')}</label>
          <input id="pn" value={projectName} onChange={(e) => setProjectName(e.target.value)} maxLength={100} disabled={busy} />
        </div>
        <div className="field">
          <label htmlFor="kl">{t('onboarding.project.keyLabel')}</label>
          <input id="kl" value={keyLabel} onChange={(e) => setKeyLabel(e.target.value)} maxLength={100} disabled={busy} />
        </div>

        {fieldErr.form && <div className="error" style={{ marginBottom: 12 }}>{fieldErr.form}</div>}

        <button type="submit" className="btn-primary btn-block" disabled={createDisabled}>
          {busy ? t('onboarding.configuring') : t('onboarding.project.create')}
        </button>
        <button type="button" className="btn-text btn-block" onClick={() => submit(true)} disabled={busy}>
          {t('onboarding.project.skip')}
        </button>
      </form>
    </OnboardingShell>
  );
}

function OnboardingShell({ children, step }: { children: React.ReactNode; step?: 'password' | 'project' | 'key' }) {
  const { t } = useI18n();
  return (
    <div className="centered">
      <div className="card card-narrow">
        <h1 className="brand">{t('onboarding.title')}</h1>
        {step && (
          <div className="steps">
            <span className={step === 'password' ? 'active' : ''}>{t('onboarding.step.password')}</span>
            <span className={step === 'project' ? 'active' : ''}>{t('onboarding.step.project')}</span>
            <span className={step === 'key' ? 'active' : ''}>{t('onboarding.step.key')}</span>
          </div>
        )}
        {children}
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
          <LangSwitch />
        </div>
      </div>
    </div>
  );
}
