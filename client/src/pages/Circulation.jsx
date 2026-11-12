import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bookmark,
  BookOpen,
  Plus,
  CheckCircle2,
  RotateCcw,
  Search,
  Clock3,
  ArrowRight,
  PackageCheck,
  ClipboardList,
  AlertTriangle,
  CalendarDays,
  Filter,
  RefreshCcw
} from 'lucide-react';
import { useAuth, useRemote, useDebounce } from '../hooks/useAuth.jsx';
import { useToast, notify, Spinner, Empty, ErrorState, Modal, SectionTitle, Status, DateText, CountDown, FormActions } from '../components/ui.jsx';
function LoanForm({ onSaved, onClose }) {
  const { request } = useAuth(),
    toast = useToast(),
    [affiliateId, setAffiliateId] = useState(''),
    [bookQuery, setBookQuery] = useState(''),
    [bookId, setBookId] = useState(''),
    [copyId, setCopyId] = useState(''),
    [busy, setBusy] = useState(false);
  const { data: members } = useRemote(() => request('/people/affiliates'), [request]);
  const debounce = useDebounce(bookQuery);
  const { data: books } = useRemote(() => request(`/catalog/books?q=${encodeURIComponent(debounce)}&disponibles=1`), [debounce, request]);
  const { data: book } = useRemote(() => bookId ? request(`/catalog/books/${bookId}`) : Promise.resolve(null), [bookId, request]);
  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      await request('/circulation/loans', { method: 'POST', body: { afiliado_id: Number(affiliateId), ejemplar_id: Number(copyId) } });
      notify(toast, 'Préstamo registrado: devolución en 7 días.');
      onSaved();
      onClose()
    } catch (e) {
      notify(toast, e.message, 'error')
    } finally {
      setBusy(false)
    }
  };
  const eligible = members?.filter(m => m.estatus === 'ACTIVO' && m.verificacion === 'VERIFICADO') || [];
  return <form onSubmit={submit} className="stack-form">
    <div className="alert alert-info">Un préstamo corresponde a un ejemplar. Máximo 5 préstamos activos por afiliado, durante 7 días.</div>
    <label className="field">
      <span>Afiliado verificado *</span>
      <select required value={affiliateId} onChange={e => setAffiliateId(e.target.value)}>
        <option value="">Selecciona un afiliado</option>
        {eligible.map(a => <option key={a.cuenta_id} value={a.cuenta_id}>{a.nombre} · {a.email} ({a.prestamos_activos}/5)</option>)}
      </select>
    </label>
    <label className="field">
      <span>Buscar libro</span>
      <input value={bookQuery} onChange={e => {
        setBookQuery(e.target.value);
        setBookId('');
        setCopyId('')
      }} placeholder="Escribe un título..." />
    </label>
    <label className="field">
      <span>Título con ejemplares disponibles *</span>
      <select required value={bookId} onChange={e => {
        setBookId(e.target.value);
        setCopyId('')
      }}>
        <option value="">Selecciona un libro</option>
        {books?.books?.map(b => <option key={b.id} value={b.id}>{b.titulo} ({b.disponibles} disponibles)</option>)}
      </select>
    </label>
    <label className="field">
      <span>Ejemplar a entregar *</span>
      <select required value={copyId} onChange={e => setCopyId(e.target.value)} disabled={!bookId}>
        <option value="">Selecciona un código</option>
        {book?.copies?.filter(c => c.estatus === 'DISPONIBLE').map(c => <option key={c.id} value={c.id}>
          {c.codigo}
        </option>)}
      </select>
    </label>
    <FormActions pending={busy} submitText="Registrar préstamo" cancel={onClose} />
  </form>;
}
export function Circulation() {
  const { request } = useAuth(),
    toast = useToast(),
    [tab, setTab] = useState('reservas'),
    [tick, setTick] = useState(0),
    [newLoan, setNewLoan] = useState(false),
    [search, setSearch] = useState(''),
    [loanFilter, setLoanFilter] = useState('ACTIVO');
  const { data: reservations, loading: loadRes, error: resErr } = useRemote(() => request('/circulation/reservations'), [request, tick]);
  const { data: loans, loading: loadLoan, error: loanErr } = useRemote(() => request('/circulation/loans'), [request, tick]);
  const refresh = () => setTick(x => x + 1);
  const run = async (path, msg) => {
    try {
      await request(path, { method: 'POST' });
      notify(toast, msg);
      refresh()
    } catch (e) {
      notify(toast, e.message, 'error')
    }
  };
  const confirm = (text, path, msg) => {
    if (window.confirm(text)) run(path, msg)
  };
  const activeRes = (reservations || []).filter(r => r.estatus === 'ACTIVA');
  const filteredRes = (reservations || []).filter(r => (r.afiliado + r.titulo + r.codigo).toLowerCase().includes(search.toLowerCase()));
  const filteredLoans = (loans || []).filter(l => (loanFilter === 'TODOS' || l.estatus === loanFilter) && (l.afiliado + l.titulo + l.codigo).toLowerCase().includes(search.toLowerCase()));
  return <>
    <SectionTitle eyebrow="OPERACIONES DE BIBLIOTECA"
      title="Circulación de libros"
      description="Confirma reservaciones, entrega ejemplares y registra devoluciones."
      action={<button className="btn btn-primary" onClick={() => setNewLoan(true)}><Plus size={18} /> Nuevo préstamo</button>} />
    <div className="circulation-summary">
      <div>
        <span className="circ-icon">
          <Bookmark size={21} />
        </span>
        <span>
          <strong>
            {activeRes.length}
          </strong>
          <small>Reservaciones activas</small>
        </span>
      </div>
      <div>
        <span className="circ-icon">
          <BookOpen size={21} />
        </span>
        <span>
          <strong>
            {loans?.filter(l => l.estatus === 'ACTIVO').length ?? 0}
          </strong>
          <small>Préstamos en curso</small>
        </span>
      </div>
      <div>
        <span className="circ-icon circ-orange">
          <AlertTriangle size={21} />
        </span>
        <span>
          <strong>
            {loans?.filter(l => l.estatus === 'VENCIDO').length ?? 0}
          </strong>
          <small>Préstamos vencidos</small>
        </span>
      </div>
    </div>
    <div className="card-panel">
      <div className="circ-tabs">
        <button className={tab === 'reservas' ? 'active' : ''} onClick={() => setTab('reservas')}><Bookmark size={18} /> Reservaciones <span>
          {activeRes.length}
        </span></button>
        <button className={tab === 'prestamos' ? 'active' : ''} onClick={() => setTab('prestamos')}><BookOpen size={18} /> Préstamos</button>
        <button className="icon-btn refresh-btn" onClick={refresh} title="Actualizar">
          <RefreshCcw size={18} />
        </button>
      </div>
      <div className="table-toolbar">
        <label className="search-control">
          <Search size={18} />
          <input placeholder="Buscar por afiliado, título o ejemplar..." value={search} onChange={e => setSearch(e.target.value)} />
        </label>
        {tab === 'prestamos' && <select className="small-select" value={loanFilter} onChange={e => setLoanFilter(e.target.value)}>
          <option value="ACTIVO">Activos</option>
          <option value="VENCIDO">Vencidos</option>
          <option value="DEVUELTO">Devueltos</option>
          <option value="TODOS">Todos</option>
        </select>}
      </div>
      {(resErr || loanErr) && <ErrorState message={resErr || loanErr} />}
      {tab === 'reservas' ?
        (loadRes ?
          <Spinner /> :
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Afiliado</th>
                  <th>Libro / ejemplar</th>
                  <th>Fecha</th>
                  <th>Vence en</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRes.map(r => <tr key={r.id}>
                  <td>
                    <strong>
                      {r.afiliado}
                    </strong>
                  </td>
                  <td>
                    <div>
                      <strong>
                        {r.titulo}
                      </strong>
                      <small>
                        {r.codigo}
                      </small>
                    </div>
                  </td>
                  <td>
                    <DateText value={r.creada_en} />
                  </td>
                  <td>
                    {r.estatus === 'ACTIVA' ? <CountDown date={r.vence_en} /> : <DateText value={r.vence_en} />}
                  </td>
                  <td>
                    <Status value={r.estatus} />
                  </td>
                  <td>
                    {r.estatus === 'ACTIVA' && <div className="row-actions">
                      <button className="btn btn-primary btn-tiny"
                        onClick={() => confirm(`¿El afiliado ${r.afiliado} está presente para recoger "${r.titulo}"?`, `/circulation/reservations/${r.id}/fulfill`, 'Reservación convertida en préstamo de 7 días')}><PackageCheck size={15} /> Entregar</button>
                      <button className="icon-btn danger" title="Cancelar reservación" onClick={() => confirm('¿Cancelar esta reservación?', `/circulation/reservations/${r.id}/cancel`, 'Reservación cancelada')}>
                        <RotateCcw size={16} />
                      </button>
                    </div>}
                  </td>
                </tr>)}
              </tbody>
            </table>
            {!filteredRes.length && <Empty title="No hay reservaciones" message="Las nuevas solicitudes aparecerán aquí." />}
          </div>) :
        (loadLoan ?
          <Spinner /> :
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Afiliado</th>
                  <th>Libro / ejemplar</th>
                  <th>Fecha préstamo</th>
                  <th>Fecha límite</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredLoans.map(l => <tr key={l.id}>
                  <td>
                    <strong>
                      {l.afiliado}
                    </strong>
                  </td>
                  <td>
                    <div>
                      <strong>
                        {l.titulo}
                      </strong>
                      <small>
                        {l.codigo}
                      </small>
                    </div>
                  </td>
                  <td>
                    <DateText value={l.inicio_en} />
                  </td>
                  <td>
                    <DateText value={l.vence_en} />
                  </td>
                  <td>
                    <Status value={l.estatus} />
                  </td>
                  <td>
                    {l.estatus !== 'DEVUELTO' && <button className="btn btn-outline btn-tiny" onClick={() => confirm(`¿Confirmas la devolución física de ${l.codigo}?`, `/circulation/loans/${l.id}/return`, 'Devolución registrada correctamente')}><CheckCircle2 size={16} /> Devolver</button>}
                  </td>
                </tr>)}
              </tbody>
            </table>
            {!filteredLoans.length && <Empty title="Sin préstamos en este filtro" />}
          </div>)}
    </div>
    {newLoan && <Modal title="Registrar préstamo directo" subtitle="Entrega un ejemplar sin reservación previa" onClose={() => setNewLoan(false)}>
      <LoanForm onClose={() => setNewLoan(false)} onSaved={refresh} />
    </Modal>}
  </>;
}
export function MyReservations() {
  const { request } = useAuth(), toast = useToast(), [tick, setTick] = useState(0);
  const { data, loading, error } = useRemote(() => request('/circulation/reservations'), [request, tick]);
  const cancel = async r => {
    if (!window.confirm(`¿Cancelar la reservación de "${r.titulo}"?`)) return;
    try {
      await request(`/circulation/reservations/${r.id}/cancel`, { method: 'POST' });
      notify(toast, 'Reservación cancelada');
      setTick(x => x + 1)
    } catch (e) {
      notify(toast, e.message, 'error')
    }
  };
  return <>
    <SectionTitle eyebrow="MI BIBLIOTECA"
      title="Mis reservaciones"
      description="Tu ejemplar estará apartado por 24 horas desde su reservación."
      action={<Link to="/catalogo" className="btn btn-primary"><Plus size={17} /> Reservar libro</Link>} />
    {error && <ErrorState message={error} />}
    {loading ?
      <Spinner /> :
      data?.length ?
        <div className="reader-list">
          {data.map(r => <article className="reader-item" key={r.id}>
            <span className="reader-icon">
              <Bookmark size={24} />
            </span>
            <div className="reader-item-content">
              <div className="reader-item-head">
                <h3>
                  {r.titulo}
                </h3>
                <Status value={r.estatus} />
              </div>
              <p>Ejemplar: <strong>
                {r.codigo}
              </strong></p>
              <div className="reader-meta">
                <span>Registrada: <DateText value={r.creada_en} /></span>
                <span>Vence: <DateText value={r.vence_en} /></span>
              </div>
              {r.estatus === 'ACTIVA' && <div className="reader-actions">
                <span className="reader-timer"><Clock3 size={16} /> Tiempo restante: <CountDown date={r.vence_en} /></span>
                <button className="btn btn-outline btn-small" onClick={() => cancel(r)}>Cancelar reservación</button>
              </div>}
            </div>
          </article>)}
        </div> :
        <div className="card-panel">
          <Empty title="Aún no has reservado libros" message="Busca una historia que te guste y resérvala desde el catálogo." icon={Bookmark} />
          <div className="empty-action">
            <Link to="/catalogo" className="btn btn-primary">Explorar catálogo <ArrowRight size={17} /></Link>
          </div>
        </div>}
  </>;
}
export function MyLoans() {
  const { request } = useAuth(), [tick, setTick] = useState(0);
  const { data, loading, error } = useRemote(() => request('/circulation/loans'), [request, tick]);
  return <>
    <SectionTitle eyebrow="MI BIBLIOTECA" title="Mis préstamos" description="Consulta tus ejemplares, fechas límite y devoluciones. Cada préstamo dura 7 días." />
    {error && <ErrorState message={error} />}
    {loading ?
      <Spinner /> :
      data?.length ?
        <div className="reader-list">
          {data.map(l => <article className="reader-item" key={l.id}>
            <span className="reader-icon">
              <BookOpen size={24} />
            </span>
            <div className="reader-item-content">
              <div className="reader-item-head">
                <h3>
                  {l.titulo}
                </h3>
                <Status value={l.estatus} />
              </div>
              <p>Ejemplar: <strong>
                {l.codigo}
              </strong></p>
              <div className="reader-meta">
                <span>Inicio: <DateText value={l.inicio_en} /></span>
                <span>Fecha límite: <DateText value={l.vence_en} /></span>
                {l.devuelto_en && <span>Devuelto: <DateText value={l.devuelto_en} /></span>}
              </div>
              {l.estatus === 'VENCIDO' && <div className="alert alert-warn"><AlertTriangle size={17} /> Este préstamo está vencido. Acude a la biblioteca para devolverlo.</div>}
            </div>
          </article>)}
        </div> :
        <div className="card-panel">
          <Empty title="Aún no tienes préstamos" message="Cuando un bibliotecario te entregue un libro, aparecerá aquí." icon={BookOpen} />
        </div>}
  </>;
}
