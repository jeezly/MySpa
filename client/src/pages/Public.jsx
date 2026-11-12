import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Search,
  Bookmark,
  Clock3,
  ShieldCheck,
  BookMarked,
  Star,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  MapPin,
  Mail,
  Phone,
  Library,
  CheckCircle2
} from 'lucide-react';
import { useAuth, useDebounce, useRemote } from '../hooks/useAuth.jsx';
import { BookArt, Status, Spinner, Empty, ErrorState, Modal, SectionTitle, useToast, notify, DateText } from '../components/ui.jsx';
function BookCard({ book, onOpen }) {
  return <button className="book-card" onClick={() => onOpen(book.id)}>
    <div className="book-card-img">
      <BookArt book={book} />
      <span className="book-availability">
        {book.disponibles > 0 ? <><span className="online-dot" /> Disponible</> : 'Sin disponibilidad'}
      </span>
    </div>
    <div className="book-card-meta">
      <span>
        {book.genero}
      </span>
      <span>
        {book.anio_publicacion}
      </span>
    </div>
    <h3>
      {book.titulo}
    </h3>
    <p>
      {book.autores}
    </p>
    <span className="book-card-link">Ver detalles <ArrowUpRight size={15} /></span>
  </button>
}
export function Home() {
  const navigate = useNavigate(), [term, setTerm] = useState('');
  const { request } = useAuth();
  const { data, loading } = useRemote(() => request('/catalog/books?page=1'), [request]);
  return <>
    <div className="container">
      <section className="hero">
        <div className="hero-noise" />
        <div className="hero-copy">
          <div className="hero-label"><span className="hero-sparkle">✦</span> BIENVENIDO A TU BIBLIOTECA DIGITAL</div>
          <h1>Las mejores historias <em>comienzan aquí.</em></h1>
          <p>Un universo de ideas, aventuras y conocimiento, a solo una página de distancia. Explora, encuentra y reserva tu próxima lectura.</p>
          <form className="hero-search" onSubmit={e => {
            e.preventDefault();
            navigate(`/catalogo?q=${encodeURIComponent(term)}`)
          }}>
            <Search size={19} />
            <input placeholder="¿Qué te gustaría leer hoy?" value={term} onChange={e => setTerm(e.target.value)} />
            <button type="submit" aria-label="Buscar libros">
              <ArrowRight size={20} />
            </button>
          </form>
          <div className="hero-links">
            <span><CheckCircle2 size={15} /> Reserva en minutos</span>
            <span><CheckCircle2 size={15} /> Colección en línea</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="hero-blob" />
          <div className="hero-book hero-book-back">
            <span>MYSPA EDITORIAL</span>
            <strong>Historias<br />para<br />imaginar</strong>
            <i>✦</i>
          </div>
          <div className="hero-book hero-book-mid">
            <span>COLECCIÓN SELECTA</span>
            <strong>El placer<br />de leer</strong>
            <i>✳</i>
          </div>
          <div className="hero-book hero-book-front">
            <span>BIBLIOTECA DIGITAL</span>
            <strong>Un nuevo<br />capítulo</strong>
            <i>✦</i>
          </div>
          <div className="hero-float">
            <BookOpen size={19} />
            <span>
              <b>Tu próxima aventura</b>
              <small>está a un clic</small>
            </span>
          </div>
        </div>
      </section>
      <section className="quick-info">
        <div>
          <span className="quick-icon">
            <BookOpen size={21} />
          </span>
          <strong>Explora sin límites</strong>
          <p>Encuentra libros por título, autor o género.</p>
        </div>
        <div>
          <span className="quick-icon">
            <Bookmark size={21} />
          </span>
          <strong>Reserva desde casa</strong>
          <p>Separamos tu ejemplar durante 24 horas.</p>
        </div>
        <div>
          <span className="quick-icon">
            <Clock3 size={21} />
          </span>
          <strong>Disfruta tu lectura</strong>
          <p>Tienes 7 días para devolver tu préstamo.</p>
        </div>
      </section>
      <section className="home-featured">
        <div className="section-heading">
          <div>
            <div className="eyebrow">SELECCIÓN MYSPA</div>
            <h2>Un buen libro te espera</h2>
            <p>Descubre algunos títulos de nuestra colección.</p>
          </div>
          <Link to="/catalogo" className="btn btn-outline">Ver todo el catálogo <ArrowRight size={17} /></Link>
        </div>
        {loading ?
          <Spinner /> :
          <div className="book-grid">
            {data?.books?.slice(0, 4).map(b => <BookCard key={b.id} book={b} onOpen={id => navigate(`/catalogo?libro=${id}`)} />)}
          </div>}
      </section>
      <section className="home-cta">
        <div>
          <span className="eyebrow">TU HISTORIA EMPIEZA HOY</span>
          <h2>Únete a nuestra comunidad de lectores.</h2>
          <p>Crea tu cuenta, acércate a verificar tu identidad y comienza a reservar.</p>
        </div>
        <Link to="/registro" className="btn btn-light">Crear mi cuenta <ArrowRight size={18} /></Link>
      </section>
    </div>
  </>;
}
export function Catalog() {
  const url = new URLSearchParams(window.location.search),
    [q, setQ] = useState(url.get('q') || ''),
    [genre, setGenre] = useState(''),
    [available, setAvailable] = useState(false),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState(url.get('libro') ? Number(url.get('libro')) : null),
    [reload, setReload] = useState(0);
  const { request, user } = useAuth(), toast = useToast(), navigate = useNavigate(), term = useDebounce(q);
  const { data, loading, error } = useRemote(() => request(`/catalog/books?q=${encodeURIComponent(term)}&genero=${genre}&disponibles=${available ? '1' : '0'}&page=${page}`), [term, genre, available, page, reload, request]);
  const { data: ref } = useRemote(() => request('/catalog/reference'), [request]);
  const { data: book, loading: loadingBook } = useRemote(() => selected ? request(`/catalog/books/${selected}`) : Promise.resolve(null), [selected, reload, request]);
  const reserve = async () => {
    try {
      await request('/circulation/reservations', { method: 'POST', body: { libro_id: book.id } });
      notify(toast, '¡Reservación confirmada! Tienes 24 horas para recogerla.');
      setSelected(null);
      setReload(x => x + 1)
    } catch (e) {
      notify(toast, e.message, 'error')
    }
  };
  return <div className="container catalog-page">
    <div className="catalog-intro">
      <span className="eyebrow">EXPLORA NUESTRA COLECCIÓN</span>
      <h1>Encuentra tu próxima <em>gran historia.</em></h1>
      <p>Filtra por género, busca tu autor favorito o descubre algo inesperado.</p>
    </div>
    <div className="catalog-toolbar">
      <label className="search-control">
        <Search size={20} />
        <input value={q} onChange={e => {
          setQ(e.target.value);
          setPage(1)
        }} placeholder="Buscar por título, autor o ISBN..." />
      </label>
      <label className="select-control">
        <SlidersHorizontal size={18} />
        <select value={genre} onChange={e => {
          setGenre(e.target.value);
          setPage(1)
        }}>
          <option value="">Todos los géneros</option>
          {ref?.generos?.map(g => <option key={g.id} value={g.id}>
            {g.nombre}
          </option>)}
        </select>
      </label>
      <label className="switch-control">
        <input type="checkbox" checked={available} onChange={e => {
          setAvailable(e.target.checked);
          setPage(1)
        }} />
        <span>Solo disponibles</span>
      </label>
    </div>
    <div className="genre-shortcuts" aria-label="Accesos rápidos por género">
      <button type="button" className={!genre ? 'active' : ''} onClick={() => {
        setGenre('');
        setPage(1)
      }}>Todos</button>
      {['Cómics', 'Novela gráfica', 'Novela fantástica', 'Ciencia ficción', 'Filosofía', 'Pensamiento político'].map(label => {
        const found = ref?.generos?.find(g => g.nombre === label);
        return found ?
          <button type="button"
            key={found.id}
            className={String(genre) === String(found.id) ? 'active' : ''}
            onClick={() => {
              setGenre(String(found.id));
              setPage(1)
            }}>
            {label}
          </button> :
          null;
      })}
    </div>
    <div className="catalog-count"><b>
      {data?.total ?? '—'}
    </b> títulos encontrados</div>
    {error && <ErrorState message={error} />}
    {loading ?
      <Spinner /> :
      data?.books?.length ?
        <div className="book-grid">
          {data.books.map(b => <BookCard key={b.id} book={b} onOpen={setSelected} />)}
        </div> :
        <Empty title="Ningún libro coincide" message="Prueba otra búsqueda o cambia los filtros." icon={Search} />}
    {data?.pages > 1 && <div className="pagination">
      <button disabled={page === 1} onClick={() => setPage(x => x - 1)}>
        <ChevronLeft size={17} />
      </button>
      <span>Página {page} de {data.pages}</span>
      <button disabled={page === data.pages} onClick={() => setPage(x => x + 1)}>
        <ChevronRight size={17} />
      </button>
    </div>}
    {selected && <Modal title="Detalles del libro"
      subtitle="Consulta sus datos y disponibilidad"
      onClose={() => setSelected(null)}
      wide>
      {loadingBook ?
        <Spinner /> :
        book ?
          <div className="book-detail">
            <BookArt book={book} />
            <div className="book-detail-text">
              <span className="eyebrow">{book.genero} · {book.anio_publicacion}</span>
              <h2>
                {book.titulo}
              </h2>
              <p className="book-by">Por {book.autores}</p>
              <p>
                {book.sinopsis || 'Una historia por descubrir.'}
              </p>
              <div className="book-facts">
                <span>
                  <strong>ISBN</strong>
                  {book.isbn}
                </span>
                <span>
                  <strong>Editorial</strong>
                  {book.editorial}
                </span>
                <span>
                  <strong>Edición</strong>
                  {book.edicion}
                </span>
                <span><strong>Ejemplares</strong>{book.disponibles} disponibles de {book.total}</span>
              </div>
              {book.disponibles ?
                <>
                  {!user ?
                    <Link className="btn btn-primary" to="/iniciar-sesion">Inicia sesión para reservar <ArrowRight size={17} /></Link> :
                    user.rol !== 'AFILIADO' ?
                      <p className="small-note">Las reservaciones son exclusivas para afiliados.</p> :
                      user.estatus !== 'ACTIVO' || user.verificacion !== 'VERIFICADO' ?
                        <div className="alert alert-warn"><ShieldCheck size={17} /> Para reservar necesitas ser afiliado activo con identidad verificada en la biblioteca.</div> :
                        <button className="btn btn-primary" onClick={reserve}><Bookmark size={17} /> Reservar por 24 horas</button>}
                </> :
                <div className="alert alert-warn">Actualmente no hay ejemplares disponibles.</div>}
            </div>
          </div> :
          <Empty />}
    </Modal>}
  </div>
}
export function Authors() {
  const { request } = useAuth(), [search, setSearch] = useState('');
  const { data, loading, error } = useRemote(() => request('/catalog/authors'), [request]);
  const authors = data?.filter(a => a.nombre.toLowerCase().includes(search.toLowerCase())) || [];
  return <div className="container authors-page">
    <div className="catalog-intro">
      <span className="eyebrow">VOCES DETRÁS DE LAS PÁGINAS</span>
      <h1>Conoce a nuestros <em>autores.</em></h1>
      <p>Descubre quiénes están detrás de las historias y cómo contactarles.</p>
    </div>
    <div className="catalog-toolbar">
      <label className="search-control">
        <Search size={19} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar autor..." />
      </label>
    </div>
    {error && <ErrorState message={error} />}
    {loading ?
      <Spinner /> :
      authors.length ?
        <div className="authors-grid">
          {authors.map(a => <article className="author-card" key={a.id}>
            <div className="author-photo">
              {a.fotografia ? <img src={a.fotografia} alt={a.nombre} /> : a.primer_nombre.charAt(0)}
            </div>
            <div>
              <span className="eyebrow">AUTOR · {a.libros} LIBRO{a.libros === 1 ? '' : 'S'}</span>
              <h3>
                {a.nombre}
              </h3>
              <p>
                {a.biografia || 'Una voz para conocer.'}
              </p>
              <div className="author-links">
                {a.email && <a href={`mailto:${a.email}`}>
                  <Mail size={15} />
                  {a.email}
                </a>}
                {a.telefono && <span>
                  <Phone size={15} />
                  {a.telefono}
                </span>}
                {a.ciudad && <span><MapPin size={15} />{a.ciudad}, {a.estado}</span>}
              </div>
            </div>
          </article>)}
        </div> :
        <Empty title="No encontramos autores" />}
  </div>
}
