import {useState} from 'react';
import {NavLink,Link,useNavigate,Outlet} from 'react-router-dom';
import {BookOpen,LayoutDashboard,BookCopy,PenLine,Users,ClipboardList,Bookmark,History,UserRound,LogOut,Menu,X,ArrowUpRight,Library,ShieldCheck,ChevronDown,BookHeart} from 'lucide-react';
import {useAuth} from '../hooks/useAuth.jsx';
import {useInstallApp} from '../hooks/useInstallApp.jsx';
import {Download} from 'lucide-react';
import {useToast,notify} from './ui.jsx';
export function Brand({light=false}){return <Link to="/" className={`brand ${light?'brand-light':''}`}><span className="brand-icon"><BookOpen size={23} strokeWidth={2.2}/></span><span className="brand-text">myspa<small>BIBLIOTECA DIGITAL</small></span></Link>}
export function PublicHeader(){const {user}=useAuth(),[open,setOpen]=useState(false),{canInstall,install}=useInstallApp();return <header className="public-header"><div className="container nav-container">
 <Brand/><nav className={`public-nav ${open?'nav-open':''}`}><NavLink to="/" end onClick={()=>setOpen(false)}>Inicio</NavLink><NavLink to="/catalogo" onClick={()=>setOpen(false)}>Catálogo</NavLink><NavLink to="/autores" onClick={()=>setOpen(false)}>Autores</NavLink></nav>
 <div className="nav-actions">{canInstall&&<button className="btn btn-outline btn-small install-btn" onClick={install}><Download size={15}/> Instalar app</button>}{user?<Link className="btn btn-primary btn-small" to="/panel">Ir al panel <ArrowUpRight size={15}/></Link>:<><Link className="nav-login" to="/iniciar-sesion">Iniciar sesión</Link><Link className="btn btn-primary btn-small nav-register" to="/registro">Crear cuenta <ArrowUpRight size={15}/></Link></>}
 <button className="icon-btn mobile-menu" aria-label="Menú" onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button></div></div></header>}
export function PublicLayout(){return <><PublicHeader/><Outlet/><footer className="public-footer"><div className="container"><Brand light/><p>Una biblioteca para descubrir, aprender y volver a empezar.</p><span>© {new Date().getFullYear()} MySpa · Proyecto integrador</span></div></footer></>}
const roleLabel={ADMIN:'Administrador',BIBLIOTECARIO:'Bibliotecario',AFILIADO:'Afiliado'};
export function Workspace(){const {user,logout}=useAuth(),nav=useNavigate(),toast=useToast(),[mobile,setMobile]=useState(false),{canInstall,install}=useInstallApp();
 const links=[{label:'Vista general',to:'/panel',icon:LayoutDashboard},
  {label:'Explorar libros',to:'/catalogo',icon:BookOpen},
  ...(user?.rol==='ADMIN'?[{label:'Gestión de libros',to:'/gestion/libros',icon:BookCopy},{label:'Autores',to:'/gestion/autores',icon:PenLine},{label:'Personal',to:'/gestion/personal',icon:Users}]:[]),
  ...(user?.rol!=='AFILIADO'?[{label:'Afiliados',to:'/gestion/afiliados',icon:Users},{label:'Circulación',to:'/circulacion',icon:ClipboardList}]:[]),
  ...(user?.rol==='AFILIADO'?[{label:'Mis reservaciones',to:'/mis-reservas',icon:Bookmark},{label:'Mis préstamos',to:'/mis-prestamos',icon:History}]:[]),
  {label:'Mi perfil',to:'/perfil',icon:UserRound}];
 const signOut=async()=>{try{await logout();nav('/');notify(toast,'Sesión cerrada correctamente')}catch(e){notify(toast,e.message,'error')}};
 return <div className="workspace"><aside className={`sidebar ${mobile?'sidebar-open':''}`}>
  <div className="sidebar-top"><Brand light/><button className="icon-btn mobile-menu" onClick={()=>setMobile(false)}><X/></button></div>
  <div className="sidebar-label">MENÚ PRINCIPAL</div><nav className="sidebar-nav">{links.map(({label,to,icon:Icon})=><NavLink key={to} to={to} end={to==='/panel'} onClick={()=>setMobile(false)} className={({isActive})=>`sidebar-link ${isActive?'sidebar-link-active':''}`}><Icon size={19}/><span>{label}</span></NavLink>)}</nav>
  <div className="sidebar-bottom"><div className="sidebar-info"><span className="info-glyph"><BookHeart size={24}/></span><strong>Las mejores historias te esperan.</strong><p>Encuentra tu próxima lectura favorita.</p><Link to="/catalogo">Explorar colección <ArrowUpRight size={13}/></Link></div>
   <button className="sidebar-logout" onClick={signOut}><LogOut size={19}/> Cerrar sesión</button></div>
 </aside>{mobile&&<div className="mobile-overlay" onClick={()=>setMobile(false)}/>}
 <div className="workspace-main"><header className="work-header"><div className="work-head-left"><button className="icon-btn mobile-menu" onClick={()=>setMobile(true)}><Menu/></button><span className="work-breadcrumb">MySpa <span>/</span> Panel de control</span></div><div className="work-user">{canInstall&&<button className="btn btn-outline btn-small install-btn" onClick={install}><Download size={15}/> Instalar</button>}<span className="role-badge"><ShieldCheck size={14}/>{roleLabel[user?.rol]}</span><Link to="/perfil" className="user-avatar">{user?.fotografia?<img src={user.fotografia}/>:user?.nombre?.charAt(0).toUpperCase()}</Link><div className="work-username"><strong>{user?.nombre} {user?.apellido}</strong><span>{user?.email}</span></div></div></header>
 <main className="work-content"><Outlet/></main></div></div>;
}
