const fs = require('fs');
const f = 'src/app/(dashboard)/tecnico/page.tsx';
let c = fs.readFileSync(f, 'utf8');

// Cambiar la condicion - usar flag antes de cargarDatos
c = c.replace(
  'onFichaje={() => { const h=new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",hour12:true}); const n=session?.user?.nombre||session?.user?.name||"Operador"; if(!turnoActivo){setModalTurno({hora:h,nombre:n,tipo:"inicio"});} cargarDatos(); }}',
  'onFichaje={() => { const h=new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",hour12:true}); const n=session?.user?.nombre||session?.user?.name||"Operador"; const eraInicio=!turnoActivo; if(eraInicio){setModalTurno({hora:h,nombre:n,tipo:"inicio"});} else{setModalTurno({hora:h,nombre:n,tipo:"cierre"});} cargarDatos(); }}'
);

// Eliminar onTurnoFinalizado modal para evitar doble disparo
c = c.replace(
  'onTurnoFinalizado={() => { const h=new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",hour12:true}); const n=session?.user?.nombre||session?.user?.name||"Operador"; setModalTurno({hora:h,nombre:n,tipo:"cierre"}); cargarDatos(); }}',
  'onTurnoFinalizado={cargarDatos}'
);

fs.writeFileSync(f, c, 'utf8');
console.log('Listo');
