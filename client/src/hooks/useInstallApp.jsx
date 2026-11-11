import {useEffect,useState} from 'react';
export function useInstallApp(){const [event,setEvent]=useState(null);
 useEffect(()=>{const listener=e=>{e.preventDefault();setEvent(e)};const installed=()=>setEvent(null);
 window.addEventListener('beforeinstallprompt',listener);window.addEventListener('appinstalled',installed);
 return()=>{window.removeEventListener('beforeinstallprompt',listener);window.removeEventListener('appinstalled',installed)}},[]);
 async function install(){if(!event)return;await event.prompt();setEvent(null)}
 return {canInstall:!!event,install};
}
