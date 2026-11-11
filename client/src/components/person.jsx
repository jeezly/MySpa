import {useState} from 'react';
export const emptyPerson={primer_nombre:'',segundo_nombre:'',apellido_paterno:'',apellido_materno:'',genero:'PREFIERO_NO_DECIR',fecha_nacimiento:'',domicilio:'',codigo_postal:'',ciudad:'',estado:'',pais:'México',email:'',telefono:'',fotografia:''};
export const personForForm=value=>({...emptyPerson,...value,fecha_nacimiento:value?.fecha_nacimiento?String(value.fecha_nacimiento).slice(0,10):'',fotografia:value?.fotografia||''});
export const personPayload=v=>Object.fromEntries(Object.keys(emptyPerson).map(k=>[k,v[k]||(['genero','pais'].includes(k)?(k==='pais'?'México':'PREFIERO_NO_DECIR'):null)]));
export function PersonFields({value,onChange,disableEmail=false}){
 const set=(key,v)=>onChange({...value,[key]:v});
 const field=(key,label,props={})=><label className="field" key={key}><span>{label}{props.required?' *':''}</span><input value={value[key]??''} onChange={e=>set(key,e.target.value)} {...props}/></label>;
 return <div className="person-fields">
  <div className="form-grid">{field('primer_nombre','Primer nombre',{required:true,minLength:2,maxLength:80})}{field('segundo_nombre','Segundo nombre')}{field('apellido_paterno','Apellido paterno',{required:true,minLength:2})}{field('apellido_materno','Apellido materno')}</div>
  <div className="form-grid"><label className="field"><span>Género</span><select value={value.genero} onChange={e=>set('genero',e.target.value)}><option value="PREFIERO_NO_DECIR">Prefiero no decir</option><option value="MUJER">Mujer</option><option value="HOMBRE">Hombre</option><option value="NO_BINARIO">No binario</option><option value="OTRO">Otro</option></select></label>{field('fecha_nacimiento','Fecha de nacimiento',{type:'date',max:new Date().toISOString().slice(0,10)})}</div>
  <h4 className="form-divider">Ubicación y contacto</h4>
  {field('domicilio','Domicilio',{maxLength:240})}
  <div className="form-grid">{field('codigo_postal','Código postal',{maxLength:12})}{field('ciudad','Ciudad')}{field('estado','Estado')}{field('pais','País',{required:true})}</div>
  <div className="form-grid">{field('email','Correo electrónico',{required:true,type:'email',disabled:disableEmail,maxLength:254})}{field('telefono','Teléfono',{type:'tel',maxLength:25})}</div>
 </div>
}
