import { Link } from 'react-router-dom';
import {
  BookCopy,
  Users,
  Bookmark,
  BookOpen,
  Clock3,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  CalendarClock,
  ShieldCheck,
  CheckCircle2,
  Heart,
  Search,
  ChevronRight,
  Library,
  BookMarked
} from 'lucide-react';
import { useAuth, useRemote } from '../hooks/useAuth.jsx';
import { Spinner, ErrorState, SectionTitle, Status, DateText, CountDown } from '../components/ui.jsx';
function StatCard({ label, value, icon: Icon, color = 'green', trend }) {
  return <article className="stat-card">
    <span className={`stat-icon stat-${color}`}>
      <Icon size={23} />
    </span>
    <span className="stat-label">
      {label}
    </span>
    <strong>
      {value ?? '—'}
    </strong>
    {trend && <small>
      {trend}
    </small>}
  </article>
}
export function Dashboard() {
  const { user, request } = useAuth();
  const isAffiliate = user.rol === 'AFILIADO';
  const { data: stats, loading, error } = useRemote(() => request('/circulation/stats'), [request]);
  const { data: loans } = useRemote(() => request('/circulation/loans'), [request]);
  const { data: reservations } = useRemote(() => request('/circulation/reservations'), [request]);
  const date = new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  return <div className="dashboard">
    <SectionTitle eyebrow={date.toUpperCase()}
      title={`¡Hola, ${user.nombre}!`}
      description={isAffiliate ? 'Este es tu espacio de lectura. Aquí están tus próximas aventuras.' : 'Aquí tienes un resumen de lo que está sucediendo en tu biblioteca.'}
      action={<Link to="/catalogo" className="btn btn-primary">Explorar catálogo <ArrowRight size={17} /></Link>} />
    {error && <ErrorState message={error} />}
    {loading ?
      <Spinner /> :
      <>
        {isAffiliate ?
          <>
            <div className="stats-grid stats-three">
              <StatCard label="Préstamos activos" value={stats?.prestamos} icon={BookOpen} color="blue" />
              <StatCard label="Reservaciones" value={stats?.reservaciones} icon={Bookmark} />
              <StatCard label="Préstamos vencidos" value={stats?.vencidos} icon={AlertTriangle} color="orange" />
            </div>
            <div className="dashboard-welcome">
              <div>
                <span className="eyebrow">UN NUEVO CAPÍTULO TE ESPERA</span>
                <h2>Hay historias que todavía no conoces.</h2>
                <p>Encuentra una lectura perfecta para hoy. Reserva en línea y recógela en menos de 24 horas.</p>
                <Link className="btn btn-light" to="/catalogo">Descubrir libros <ArrowRight size={17} /></Link>
              </div>
              <div className="dashboard-welcome-art">
                <BookMarked size={110} strokeWidth={0.7} />
              </div>
            </div>
            {user.verificacion !== 'VERIFICADO' && <div className="alert alert-warn"><ShieldCheck size={19} /> Tu identidad aún no está verificada. Preséntate en la biblioteca con una identificación para poder reservar.</div>}
            <div className="dashboard-bottom-grid">
              <section className="card-panel">
                <div className="panel-heading">
                  <h3>Mis préstamos recientes</h3>
                  <Link to="/mis-prestamos">Ver todos <ChevronRight size={16} /></Link>
                </div>
                {loans?.length ?
                  loans.slice(0, 4).map(l => <div className="activity-row" key={l.id}>
                    <span className="activity-icon">
                      <BookOpen size={19} />
                    </span>
                    <div>
                      <strong>
                        {l.titulo}
                      </strong>
                      <small>Vence: <DateText value={l.vence_en} /></small>
                    </div>
                    <Status value={l.estatus} />
                  </div>) :
                  <p className="muted">Aún no tienes préstamos registrados.</p>}
              </section>
              <section className="card-panel">
                <div className="panel-heading">
                  <h3>Mis reservaciones</h3>
                  <Link to="/mis-reservas">Ver todas <ChevronRight size={16} /></Link>
                </div>
                {reservations?.filter(r => r.estatus === 'ACTIVA').length ?
                  reservations.filter(r => r.estatus === 'ACTIVA').slice(0, 4).map(r => <div className="activity-row" key={r.id}>
                    <span className="activity-icon">
                      <Bookmark size={19} />
                    </span>
                    <div>
                      <strong>
                        {r.titulo}
                      </strong>
                      <small>Tiempo restante: <CountDown date={r.vence_en} /></small>
                    </div>
                    <Status value={r.estatus} />
                  </div>) :
                  <p className="muted">No tienes reservaciones activas.</p>}
              </section>
            </div>
          </> :
          <>
            <div className="stats-grid">
              <StatCard label="Títulos del catálogo" value={stats?.libros} icon={BookCopy} />
              <StatCard label="Ejemplares disponibles" value={stats?.ejemplares} icon={BookOpen} color="blue" />
              <StatCard label="Afiliados activos" value={stats?.afiliados} icon={Users} color="purple" />
              <StatCard label="Préstamos activos" value={stats?.prestamos} icon={Library} color="orange" />
            </div>
            <div className="dashboard-bottom-grid">
              <section className="card-panel">
                <div className="panel-heading">
                  <h3>Actividad de préstamos</h3>
                  <span className="muted mini">Últimos 6 meses</span>
                </div>
                <div className="bar-chart">
                  {stats?.tendencia?.length ?
                    stats.tendencia.map(x => <div className="chart-col" key={x.mes}>
                      <div className="chart-bar" style={{ height: `${Math.max(6, x.total / Math.max(...stats.tendencia.map(t => t.total)) * 100)}%` }} title={`${x.total} préstamos`} />
                      <span>{x.mes.slice(5)}/{x.mes.slice(2, 4)}</span>
                    </div>) :
                    <div className="chart-empty">Los datos aparecerán conforme registres préstamos.</div>}
                </div>
              </section>
              <section className="card-panel">
                <div className="panel-heading">
                  <h3>Distribución por género</h3>
                  <span className="muted mini">Préstamos registrados</span>
                </div>
                {stats?.generos?.length ?
                  stats.generos.map((g, i) => <div key={g.nombre} className="genre-stat">
                    <div>
                      <strong>
                        {g.nombre}
                      </strong>
                      <span>
                        {g.total}
                      </span>
                    </div>
                    <div className="progress-line">
                      <span style={{ width: `${Math.max(3, 100 * g.total / stats.generos[0].total)}%` }} />
                    </div>
                  </div>) :
                  <p className="muted">Sin préstamos suficientes para mostrar estadísticas.</p>}
              </section>
            </div>
            <div className="stats-grid stats-three stats-second">
              <StatCard label="Reservaciones activas" value={stats?.reservaciones} icon={Bookmark} />
              <StatCard label="Préstamos vencidos" value={stats?.vencidos} icon={AlertTriangle} color="orange" />
              <div className="shortcut-card">
                <span className="eyebrow">ACCIONES RÁPIDAS</span>
                <Link to="/circulacion">Gestionar circulación <ArrowRight size={18} /></Link>
                {user.rol === 'ADMIN' && <Link to="/gestion/libros">Administrar catálogo <ArrowRight size={18} /></Link>}
              </div>
            </div>
            {stats?.vencidos > 0 && <div className="alert alert-warn"><AlertTriangle size={20} /> Atención: hay {stats.vencidos} préstamo(s) vencidos. Se aplica la penalización automáticamente.</div>}
          </>}
      </>}
  </div>;
}
