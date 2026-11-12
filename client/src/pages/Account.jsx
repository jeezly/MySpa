import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, LockKeyhole, Mail, ShieldCheck, UserPlus, Eye, EyeOff, CheckCircle2, UserRound, KeyRound, Camera } from 'lucide-react';
import { useAuth, useRemote } from '../hooks/useAuth.jsx';
import { useToast, notify, SectionTitle, Spinner, FormActions, PhotoUpload, ErrorState } from '../components/ui.jsx';
import { PersonFields, emptyPerson, personForForm, personPayload } from '../components/person.jsx';
function AuthAside() {
  return <aside className="auth-aside">
    <div className="auth-aside-bg" />
    <div className="auth-aside-content">
      <span className="eyebrow">TU ESPACIO PARA LEER</span>
      <h2>Cada gran historia empieza con una <em>primera página.</em></h2>
      <p>Descubre mundos nuevos, reserva tus títulos favoritos y mantén tus lecturas organizadas.</p>
      <div className="auth-aside-book">
        <BookOpen size={56} strokeWidth={1.15} />
        <span>myspa<br /><small>LIBRERÍA DE IDEAS</small></span>
      </div>
    </div>
    <span className="auth-aside-bottom">MYSPA · UN MUNDO DE HISTORIAS</span>
  </aside>
}
export function Login() {
  const { login } = useAuth(),
    toast = useToast(),
    nav = useNavigate(),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      const user = await login(email, password);
      notify(toast, `Bienvenido a MySpa, ${user.nombre}`);
      nav('/panel', { replace: true });
    } catch (e) {
      notify(toast, e.message, 'error')
    } finally {
      setBusy(false)
    }
  };
  return <div className="auth-grid">
    <AuthAside />
    <div className="auth-right">
      <div className="auth-form-wrap">
        <span className="eyebrow">NOS ALEGRA VERTE DE NUEVO</span>
        <h1>Inicia sesión</h1>
        <p className="muted">Accede a tu biblioteca, reservaciones y lecturas.</p>
        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>Correo electrónico</span>
            <div className="input-icon">
              <Mail size={18} />
              <input type="email"
                autoComplete="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required />
            </div>
          </label>
          <label className="field">
            <span>Contraseña</span>
            <div className="input-icon">
              <LockKeyhole size={18} />
              <input type={show ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Tu contraseña"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required />
              <button className="input-action"
                type="button"
                aria-label="Mostrar contraseña"
                onClick={() => setShow(!show)}>
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          <button className="btn btn-primary btn-full" disabled={busy} type="submit">
            {busy ? 'Accediendo...' : 'Entrar a MySpa'}
            <ArrowRight size={17} />
          </button>
        </form>
        <div className="auth-divider">
          <span>¿Aún no tienes cuenta?</span>
        </div>
        <Link to="/registro" className="btn btn-outline btn-full">Regístrate como afiliado <UserPlus size={17} /></Link>
        <div className="auth-notice">
          <ShieldCheck size={19} />
          <span>Para reservar libros, tu identidad debe verificarse presencialmente en la biblioteca.</span>
        </div>
      </div>
    </div>
  </div>
}
export function Register() {
  const { request } = useAuth(),
    toast = useToast(),
    nav = useNavigate(),
    [person, setPerson] = useState({ ...emptyPerson }),
    [password, setPassword] = useState(''),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState(false);
  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      await request('/auth/register', { method: 'POST', body: { ...personPayload(person), password } });
      setSuccess(true);
      notify(toast, '¡Cuenta creada! Presenta tu identificación en la biblioteca.')
    } catch (e) {
      notify(toast, e.message, 'error')
    } finally {
      setBusy(false)
    }
  };
  if (success) return <div className="register-success">
    <span className="success-icon">
      <CheckCircle2 size={45} />
    </span>
    <h1>¡Bienvenido a MySpa!</h1>
    <p>Tu cuenta fue creada. Puedes explorar nuestro catálogo. Para realizar reservaciones, acude con una identificación a la biblioteca para verificar tu identidad.</p>
    <Link className="btn btn-primary" to="/iniciar-sesion">Iniciar sesión <ArrowRight size={17} /></Link>
  </div>;
  return <div className="container register-page">
    <div className="register-header">
      <span className="eyebrow">ÚNETE A LA COMUNIDAD</span>
      <h1>Comienza tu próxima <em>aventura literaria.</em></h1>
      <p>Completa tu registro y forma parte de nuestra biblioteca.</p>
    </div>
    <form className="register-card" onSubmit={submit}>
      <div className="form-card-head">
        <span className="step-number">01</span>
        <div>
          <h2>Datos personales</h2>
          <p>Tu información nos ayuda a gestionar tus préstamos de manera segura.</p>
        </div>
      </div>
      <PersonFields value={person} onChange={setPerson} />
      <div className="form-card-head card-subsection">
        <span className="step-number">02</span>
        <div>
          <h2>Crea tu contraseña</h2>
          <p>Tu nombre de usuario será tu correo electrónico.</p>
        </div>
      </div>
      <label className="field">
        <span>Contraseña * (mín. 10 caracteres, mayúscula, minúscula y número)</span>
        <div className="input-icon">
          <LockKeyhole size={18} />
          <input type={show ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={10}
            required
            placeholder="Crea una contraseña segura" />
          <button className="input-action" type="button" onClick={() => setShow(!show)}>
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </label>
      <div className="register-footer">
        <span><ShieldCheck size={19} /> Tus datos se gestionan mediante controles de acceso.</span>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Registrando...' : 'Crear mi cuenta'}
          <ArrowRight size={17} />
        </button>
      </div>
      <div className="register-login">¿Ya tienes cuenta? <Link to="/iniciar-sesion">Iniciar sesión</Link></div>
    </form>
  </div>
}
export function Profile() {
  const { request, user, refresh } = useAuth(),
    toast = useToast(),
    [tick, setTick] = useState(0),
    [person, setPerson] = useState(null),
    [saving, setSaving] = useState(false),
    [oldPw, setOldPw] = useState(''),
    [newPw, setNewPw] = useState(''),
    [savingPw, setSavingPw] = useState(false);
  const { data, loading, error } = useRemote(() => request('/auth/profile').then(result => {
    setPerson(personForForm(result));
    return result
  }), [request, tick]);
  const save = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      const changed = { ...personPayload(person) };
      delete changed.email;
      await request('/auth/profile', { method: 'PATCH', body: changed });
      await refresh();
      notify(toast, 'Perfil actualizado');
      setTick(x => x + 1)
    } catch (e) {
      notify(toast, e.message, 'error')
    } finally {
      setSaving(false)
    }
  };
  const changePw = async e => {
    e.preventDefault();
    setSavingPw(true);
    try {
      await request('/auth/password', { method: 'PATCH', body: { actual: oldPw, nueva: newPw } });
      setOldPw('');
      setNewPw('');
      notify(toast, 'Contraseña actualizada; las demás sesiones se cerraron.')
    } catch (e) {
      notify(toast, e.message, 'error')
    } finally {
      setSavingPw(false)
    }
  };
  return <div className="profile-page">
    <SectionTitle eyebrow="CONFIGURACIÓN PERSONAL" title="Mi perfil" description="Mantén tus datos de contacto actualizados." />
    {error && <ErrorState message={error} />}
    {loading || !person ?
      <Spinner /> :
      <div className="profile-columns">
        <section className="card-panel">
          <div className="profile-intro">
            <div className="profile-image">
              {data?.fotografia ? <img src={data.fotografia} alt="Mi fotografía" /> : <UserRound size={39} />}
            </div>
            <div>
              <h2>
                {data?.primer_nombre}
                {data?.apellido_paterno}
              </h2>
              <p>
                {data?.email}
              </p>
              <span className="small-note">
                {user?.rol === 'AFILIADO' ? 'Afiliado de MySpa' : user?.rol === 'ADMIN' ? 'Administrador' : 'Bibliotecario'}
              </span>
              <div className="spacer-8" />
              <PhotoUpload tipo="PERFIL" id={user.id} onUpload={() => {
                refresh();
                setTick(x => x + 1)
              }} />
            </div>
          </div>
          <form onSubmit={save}>
            <PersonFields value={person} onChange={setPerson} disableEmail />
            <FormActions pending={saving} submitText="Guardar perfil" />
          </form>
        </section>
        <aside className="profile-aside">
          <section className="card-panel">
            <div className="small-card-title">
              <KeyRound size={20} />
              <h3>Seguridad de la cuenta</h3>
            </div>
            <p>Cambia tu contraseña periódicamente para proteger tus datos.</p>
            <form onSubmit={changePw} className="stack-form">
              <label className="field">
                <span>Contraseña actual</span>
                <input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} required />
              </label>
              <label className="field">
                <span>Nueva contraseña</span>
                <input type="password"
                  minLength={10}
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  required
                  placeholder="Mayúscula, minúscula, número" />
              </label>
              <button className="btn btn-primary" disabled={savingPw}>
                {savingPw ? 'Actualizando...' : 'Actualizar contraseña'}
              </button>
            </form>
          </section>
          {user.rol === 'AFILIADO' && <section className="card-panel verify-panel">
            <ShieldCheck size={23} />
            <h3>Estado de verificación</h3>
            <p>Tu identidad debe validarse presencialmente antes de solicitar reservaciones.</p>
            <span className={`verify-badge ${user.verificacion === 'VERIFICADO' ? 'success' : ''}`}>
              {user.verificacion === 'VERIFICADO' ? 'Identidad verificada' : user.verificacion === 'RECHAZADO' ? 'Verificación rechazada' : 'Verificación pendiente'}
            </span>
          </section>}
        </aside>
      </div>}
  </div>;
}
