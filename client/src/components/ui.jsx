import { createContext, useContext, useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, X, BookOpen, Camera, UploadCloud, LoaderCircle, Inbox, ArrowRight, ShieldCheck, Clock3 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';
const ToastContext = createContext(null);
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4300);
    return () => clearTimeout(id)
  }, [toast]);
  return <ToastContext.Provider value={setToast}>
    {children}
    {toast && <div className={`toast ${toast.kind === 'error' ? 'toast-error' : ''}`} role="status">
      {toast.kind === 'error' ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
      <span>
        {toast.message}
      </span>
      <button aria-label="Cerrar" onClick={() => setToast(null)}>
        <X size={16} />
      </button>
    </div>}
  </ToastContext.Provider>
}
export const useToast = () => useContext(ToastContext);
export function notify(toast, message, kind = 'success') {
  toast({ message, kind });
}
export function Spinner({ text = 'Cargando información...' }) {
  return <div className="center-state">
    <LoaderCircle className="spin" size={30} />
    <span>
      {text}
    </span>
  </div>
}
export function Empty({ title = 'Sin resultados', message = 'No hay registros para mostrar.', icon: Icon = Inbox }) {
  return <div className="empty-state">
    <div className="empty-icon">
      <Icon size={25} />
    </div>
    <h3>
      {title}
    </h3>
    <p>
      {message}
    </p>
  </div>
}
export function ErrorState({ message }) {
  return <div className="alert alert-error">
    <AlertCircle size={18} />
    {message}
  </div>
}
export function Status({ value }) {
  const labels = {
    ACTIVO: 'Activo',
    ACTIVA: 'Activa',
    DISPONIBLE: 'Disponible',
    RESERVADO: 'Reservado',
    RESERVADA: 'Reservada',
    PRESTADO: 'Prestado',
    PENALIZADO: 'Penalizado',
    PENDIENTE: 'Pendiente',
    VERIFICADO: 'Verificado',
    RECHAZADO: 'Rechazado',
    BAJA: 'De baja',
    CANCELADA: 'Cancelada',
    EXPIRADA: 'Expirada',
    CUMPLIDA: 'Cumplida',
    VENCIDO: 'Vencido',
    DEVUELTO: 'Devuelto'
  };
  const colors = {
    ACTIVO: 'green',
    ACTIVA: 'green',
    DISPONIBLE: 'green',
    VERIFICADO: 'green',
    DEVUELTO: 'green',
    CUMPLIDA: 'green',
    PENDIENTE: 'amber',
    RESERVADO: 'amber',
    PRESTADO: 'blue',
    PENALIZADO: 'red',
    VENCIDO: 'red',
    RECHAZADO: 'red',
    BAJA: 'muted',
    CANCELADA: 'muted',
    EXPIRADA: 'muted'
  };
  return <span className={`pill pill-${colors[value] || 'muted'}`}>
    <span className="pill-dot" />
    {labels[value] || value || '—'}
  </span>
}
export function Modal({ title, subtitle, children, onClose, wide = false }) {
  useEffect(() => {
    const handler = e => {
      if (e.key === 'Escape') onClose()
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    }
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => {
    if (e.target === e.currentTarget) onClose()
  }}>
    <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-heading">
        <div>
          <h2>
            {title}
          </h2>
          {subtitle && <p>
            {subtitle}
          </p>}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
          <X size={20} />
        </button>
      </div>
      <div className="modal-content">
        {children}
      </div>
    </div>
  </div>;
}
export function SectionTitle({ eyebrow, title, description, action }) {
  return <div className="section-heading">
    <div>
      {eyebrow && <div className="eyebrow">
        {eyebrow}
      </div>}
      <h1>
        {title}
      </h1>
      {description && <p>
        {description}
      </p>}
    </div>
    {action && <div className="section-action">
      {action}
    </div>}
  </div>
}
export function DateText({ value, short = false }) {
  return <>
    {value ? new Date(value).toLocaleString('es-MX', { dateStyle: short ? 'medium' : 'medium', ...(!short ? { timeStyle: 'short' } : {}) }) : '—'}
  </>
}
export function BookArt({ book, small = false }) {
  const [imageError, setImageError] = useState(false);
  useEffect(() => setImageError(false), [book.portada]);
  const palette = [
    ['#203b43', '#5f9997', '#e6c48f'],
    ['#433a56', '#866e9f', '#e7cba5'],
    ['#3d5147', '#8db8a4', '#e0d9aa'],
    ['#6a4a3b', '#ca8c6c', '#f2d3ac'],
    ['#283b60', '#859fc3', '#ecd59a'],
    ['#4b3c4c', '#be8eaa', '#eed4bf']
  ];
  const [dark, light, accent] = palette[(Number(book.id) || 0) % palette.length];
  return <div className={`book-art ${small ? 'book-art-small' : ''}`} style={{
    '--book-dark': dark,
    '--book-light': light,
    '--book-accent': accent
  }}>
    {book.portada && !imageError ? <img src={book.portada}
      alt={`Portada de ${book.titulo}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setImageError(true)} /> : <>
      <div className="book-cover-top">MYSPA · EDICIONES</div>
      <div className="book-ornament">
        <span />
        <i />
        <span />
      </div>
      <div className="book-cover-title">
        {book.titulo}
      </div>
      <div className="book-cover-author">
        {book.autores?.split(',')[0] || 'Biblioteca MySpa'}
      </div>
      <div className="book-cover-footer">✦</div>
    </>}
  </div>;
}
export function FormActions({ pending, submitText = 'Guardar cambios', cancel }) {
  return <div className="form-actions">
    {cancel && <button type="button" className="btn btn-quiet" onClick={cancel}>Cancelar</button>}
    <button className="btn btn-primary" type="submit" disabled={pending}>
      {pending ? <><LoaderCircle className="spin" size={17} /> Guardando...</> : submitText}
    </button>
  </div>
}
export function PhotoUpload({ tipo, id, onUpload }) {
  const { request } = useAuth(), toast = useToast(), [busy, setBusy] = useState(false);
  const change = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      notify(toast, 'La fotografía no puede superar 2 MB', 'error');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('imagen', file);
      form.append('tipo', tipo);
      form.append('entidad_id', String(id));
      const data = await request('/media', { method: 'POST', body: form });
      onUpload?.(data.url);
      notify(toast, 'Fotografía actualizada');
    }
    catch (err) {
      notify(toast, err.message, 'error')
    } finally {
      setBusy(false);
      e.target.value = ''
    }
  };
  return <label className={`upload-btn ${busy ? 'disabled' : ''}`}>
    <UploadCloud size={17} />
    {busy ? 'Subiendo...' : tipo === 'LIBRO' ? 'Subir portada' : 'Subir fotografía'}
    <input type="file"
      hidden
      accept="image/png,image/jpeg,image/webp"
      onChange={change}
      disabled={busy} />
  </label>;
}
export function CountDown({ date }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t)
  }, []);
  const mins = Math.max(0, Math.ceil((new Date(date).getTime() - now) / 60000));
  return <span className={mins <= 120 ? 'text-warning' : ''}>
    <Clock3 size={14} />
    {mins > 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}
  </span>
}
