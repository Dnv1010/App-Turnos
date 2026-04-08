const fs = require('fs');
const f = 'src/app/(dashboard)/tecnico/page.tsx';
let c = fs.readFileSync(f, 'utf8');

c = c.replace('const [turnos, setTurnos]', 'const [modalTurno, setModalTurno] = useState(null);\n  const [turnos, setTurnos]');
c = c.replace('onFichaje={cargarDatos}', 'onFichaje={() => { const h=new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",hour12:true}); const n=session?.user?.nombre||session?.user?.name||"Operador"; if(!turnoActivo){setModalTurno({hora:h,nombre:n,tipo:"inicio"});} cargarDatos(); }}');
c = c.replace('onTurnoFinalizado={cargarDatos}', 'onTurnoFinalizado={() => { const h=new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",hour12:true}); const n=session?.user?.nombre||session?.user?.name||"Operador"; setModalTurno({hora:h,nombre:n,tipo:"cierre"}); cargarDatos(); }}');

const modal = `
      {modalTurno && (
        <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",background:"rgba(0,0,0,0.75)"}}>
          <div style={{background:"#001035",border:"1px solid rgba(8,221,188,0.3)",borderRadius:"16px",padding:"32px",maxWidth:"360px",width:"100%",textAlign:"center"}}>
            <div style={{fontSize:"48px",marginBottom:"16px"}}>{modalTurno.tipo==="inicio" ? "⚡" : "✅"}</div>
            <h2 style={{color:"white",fontWeight:"bold",fontSize:"20px",marginBottom:"8px"}}>{modalTurno.tipo==="inicio" ? "Bienvenido, " : "Buen trabajo, "}{modalTurno.nombre.split(" ")[0]}!</h2>
            <p style={{color:"#08DDBC",fontSize:"16px",fontWeight:"600",marginBottom:"12px"}}>{modalTurno.tipo==="inicio" ? "Turno iniciado a las " : "Turno cerrado a las "}{modalTurno.hora}</p>
            <p style={{color:"#8892A4",fontSize:"13px",marginBottom:"20px"}}>{modalTurno.tipo==="inicio" ? "El equipo cuenta contigo hoy!" : "Descansa bien!"}</p>
            <button onClick={()=>setModalTurno(null)} style={{width:"100%",background:"#08DDBC",color:"#001035",fontWeight:"bold",padding:"12px",borderRadius:"12px",border:"none",cursor:"pointer",fontSize:"15px"}}>{modalTurno.tipo==="inicio" ? "Vamos! 🚀" : "Entendido ✅"}</button>
          </div>
        </div>
      )}`;

const lastDiv = c.lastIndexOf('</div>');
c = c.substring(0, lastDiv) + modal + '\n    </div>' + c.substring(lastDiv + 6);
fs.writeFileSync(f, c, 'utf8');
console.log('Listo');
