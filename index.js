// ==========================================================
// VALLE HERMOSO · PORTAL DE SOCIOS
// Página estática (GitHub Pages). Los datos viven en data.json.
// Cada socio tiene un estado de cuenta POR AÑO (obligaciones +
// aportaciones + totales). El admin edita, descarga el data.json
// actualizado y lo publica en el repositorio para los socios.
// ==========================================================

// 1. DATOS DE RESPALDO (si no se puede leer data.json)
const DATOS_INICIALES = {
    admin: { nombre: "Administración", email: "Williams@vallehermoso.com", password: "261201" },
    socios: []
};

// 2. ESTADO GLOBAL
let DATOS = null;                           // datos cargados (admin, socios)
let rolActivo = 'socio';                    // 'socio' | 'admin'
let socioActual = null;                     // socio con sesión iniciada
let anioSeleccionado = null;                // año seleccionado por el socio
let adminSocioSel = null;                   // socio seleccionado en "Por año"
let adminAnioSel = null;                    // año seleccionado en "Por año"
let datosSincronizados = true;              // true = todo lo local ya se descargó/publicó

// 3. CAPA DE DATOS
async function cargarDatos() {
    try {
        const res = await fetch('data.json', { cache: 'no-store' });
        if (res.ok) {
            DATOS = await res.json();
            return;
        }
    } catch (e) {
        // Abrir el archivo localmente (file://) puede bloquear fetch: usamos respaldo
    }

    const local = localStorage.getItem('vh_datos');
    DATOS = local ? JSON.parse(local) : JSON.parse(JSON.stringify(DATOS_INICIALES));
}

function guardarLocal() {
    datosSincronizados = false;
    localStorage.setItem('vh_datos', JSON.stringify(DATOS));
}

// 4. OBTENER LOS ELEMENTOS DEL HTML
const btnLogin = document.getElementById('login-btn');
const btnLogout = document.getElementById('logout-btn');
const btnLogoutAdmin = document.getElementById('admin-logout-btn');
const sectionLogin = document.getElementById('login-section');
const sectionDashboard = document.getElementById('dashboard-section');
const sectionAdmin = document.getElementById('admin-section');
const msgError = document.getElementById('error-message');
const tabCliente = document.getElementById('tab-cliente');
const tabAdmin = document.getElementById('tab-admin');
const loginTitle = document.getElementById('login-title');
const loginSubtitle = document.getElementById('login-subtitle');

// 5. PESTAÑAS DE ROL EN EL LOGIN
function activarRol(rol) {
    rolActivo = rol;
    tabCliente.classList.toggle('active', rol === 'socio');
    tabAdmin.classList.toggle('active', rol === 'admin');
    if (rol === 'admin') {
        loginTitle.textContent = 'Acceso administrativo';
        loginSubtitle.textContent = 'Ingresa con tu cuenta de administración para gestionar socios y estados de cuenta.';
    } else {
        loginTitle.textContent = 'Bienvenido';
        loginSubtitle.textContent = 'Ingresa con tu correo y contraseña para consultar tu estado de cuenta.';
    }
    msgError.style.display = 'none';
}

tabCliente.addEventListener('click', () => activarRol('socio'));
tabAdmin.addEventListener('click', () => activarRol('admin'));

// 6. LÓGICA DE INICIO DE SESIÓN
btnLogin.addEventListener('click', () => {
    const emailIngresado = document.getElementById('email-input').value.trim();
    const passwordIngresada = document.getElementById('password-input').value;

    if (rolActivo === 'admin') {
        if (DATOS.admin.email === emailIngresado && DATOS.admin.password === passwordIngresada) {
            entrarAdmin(DATOS.admin);
        } else {
            msgError.style.display = 'block';
        }
        return;
    }

    const socioEncontrado = DATOS.socios.find(s =>
        s.email === emailIngresado && s.password === passwordIngresada
    );

    if (socioEncontrado) {
        msgError.style.display = 'none';
        sectionLogin.style.display = 'none';
        sectionAdmin.style.display = 'none';
        sectionDashboard.style.display = 'block';
        socioActual = socioEncontrado;
        renderSocio(socioEncontrado);
    } else {
        msgError.style.display = 'block';
    }
});

// 7. ENTRAR AL PANEL DE ADMINISTRADOR
function entrarAdmin(admin) {
    msgError.style.display = 'none';
    sectionLogin.style.display = 'none';
    sectionDashboard.style.display = 'none';
    sectionAdmin.style.display = 'block';
    document.getElementById('admin-email').textContent = admin.email;
    renderAdminAll();

    if (!admin.password || admin.password.length < 8) {
        setTimeout(() => alert('ADVERTENCIA DE SEGURIDAD: la contraseña del administrador es demasiado corta. Se recomienda cambiarla en data.json (mínimo 8 caracteres).'), 0);
    }
}

// 8. LÓGICA DE CERRAR SESIÓN
function cerrarSesion() {
    document.getElementById('email-input').value = '';
    document.getElementById('password-input').value = '';
    socioActual = null;
    sectionDashboard.style.display = 'none';
    sectionAdmin.style.display = 'none';
    sectionLogin.style.display = 'block';
    activarRol('socio');
}

btnLogout.addEventListener('click', cerrarSesion);
btnLogoutAdmin.addEventListener('click', cerrarSesion);

// 9. UTILIDADES COMUNES
function formatearMonto(valor) {
    if (valor === null || valor === undefined || valor === '') return '—';
    const n = Number(valor);
    if (isNaN(n)) return String(valor);
    return 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMonto(raw) {
    const s = String(raw ?? '').trim().replace(/[Ss$]/g, '').replace(/\s/g, '');
    if (s === '') return null;
    let t = s;
    if (s.includes(',') && s.includes('.')) {
        const c = s.lastIndexOf(',');
        const p = s.lastIndexOf('.');
        t = c > p ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (s.includes(',')) {
        const partesComa = s.split(',');
        if (partesComa.length === 2 && partesComa[1].length === 3) {
            t = s.replace(/,/g, '');
        } else {
            t = s.replace(/,/g, '.');
        }
    } else if (s.includes('.')) {
        const partes = s.split('.');
        if (partes.length === 2 && partes[1].length === 3) {
            t = s.replace('.', '');
        }
    }
    const n = Number(t);
    return isNaN(n) ? null : n;
}

function textoCelda(valor, textoExtra) {
    if (textoExtra) return '<span class="texto-nulo">' + esc(textoExtra) + '</span>';
    return valor === null || valor === undefined || valor === '' ? '<span class="texto-nulo">—</span>' : formatearMonto(valor);
}

function badgeEstado(deuda, etiquetaAlDia) {
    const alDia = !deuda || deuda <= 0;
    return alDia
        ? '<span class="badge badge-pagado">' + (etiquetaAlDia || 'AL DÍA') + '</span>'
        : '<span class="badge badge-pendiente">PENDIENTE</span>';
}

function getAnio(socio, anio) {
    let reg = socio.anios.find(a => a.anio === anio);
    if (!reg) {
        reg = { anio, obligaciones: [], aportaciones: [], totales: [] };
        socio.anios.push(reg);
        socio.anios.sort((a, b) => a.anio - b.anio);
    }
    return reg;
}

function saldoFinalDe(anioReg) {
    if (!anioReg) return 0;
    const t = anioReg.totales.find(x => x.concepto.toUpperCase().includes('SALDO FINAL'));
    return t && t.monto !== null && t.monto !== undefined ? Number(t.monto) : 0;
}

function deudaVigenteDe(socio) {
    if (!socio.anios || !socio.anios.length) return 0;
    const ultimo = socio.anios.reduce((max, a) => (a.anio > max.anio ? a : max), socio.anios[0]);
    return saldoFinalDe(ultimo);
}

function totalAportadoDe(socio) {
    let total = 0;
    (socio.anios || []).forEach(a => {
        (a.aportaciones || []).forEach(ap => {
            if (ap.monto !== null && ap.monto !== undefined && ap.monto !== '') total += Number(ap.monto);
        });
    });
    return total;
}

function nuevoIdSocio() {
    let max = 0;
    DATOS.socios.forEach(s => {
        const n = parseInt(s.id.replace(/\D/g, ''), 10);
        if (n > max) max = n;
    });
    return 'SOC-' + String(max + 1).padStart(4, '0');
}

// 10. VISTA DEL SOCIO
function renderSocio(socio) {
    anioSeleccionado = null;

    document.getElementById('user-name').textContent = socio.nombre;
    document.getElementById('user-id').textContent = socio.id;

    const tc = document.getElementById('socio-tcambio');
    if (socio.t_cambio) {
        tc.hidden = false;
        tc.textContent = 'T.CAMBIO S/ ' + String(socio.t_cambio).replace('.', ',');
    } else {
        tc.hidden = true;
    }

    document.getElementById('total-aportado').textContent = formatearMonto(totalAportadoDe(socio));
    document.getElementById('deuda-vigente').textContent = formatearMonto(deudaVigenteDe(socio));
    document.getElementById('anios-registrados').textContent = socio.anios.length;

    renderPills(socio);
    renderDetalleSocio(socio);
}

function renderPills(socio) {
    const cont = document.getElementById('year-pills');
    cont.innerHTML = '';

    const anios = socio.anios.slice().sort((a, b) => a.anio - b.anio).map(a => a.anio);

    const hacerPill = (texto, anio, activo) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'year-pill' + (activo ? ' active' : '');
        b.textContent = texto;
        b.addEventListener('click', () => {
            anioSeleccionado = anio;
            cont.querySelectorAll('.year-pill').forEach(p => p.classList.remove('active'));
            b.classList.add('active');
            renderDetalleSocio(socio, anio);
        });
        return b;
    };

    const pillGeneral = hacerPill('General', null, anioSeleccionado === null);
    pillGeneral.classList.add('all');
    cont.appendChild(pillGeneral);

    anios.forEach(a => cont.appendChild(hacerPill(String(a), a, anioSeleccionado === a)));
}

function renderDetalleSocio(socio, anio) {
    const cont = document.getElementById('year-detail');
    cont.innerHTML = '';

    if (!socio.anios.length) {
        cont.innerHTML = '<p class="detalle-vacio">Todavía no hay registros en tu estado de cuenta.</p>';
        return;
    }

    if (!anio) {
        cont.appendChild(renderResumenAniosTabla(socio, false));
        return;
    }

    const reg = getAnio(socio, anio);
    cont.appendChild(renderEstadoAnio(reg, { pdf: true, gestion: false }));
}

function renderResumenAniosTabla(socio, gestion) {
    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrap';

    const tabla = document.createElement('table');
    tabla.className = 'tabla-anios';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Año</th><th>Aportado</th><th>Deuda total</th><th>Saldo final</th><th>Estado</th></tr>';
    tabla.appendChild(thead);
    const tbody = document.createElement('tbody');
    tabla.appendChild(tbody);

    socio.anios.slice().sort((a, b) => a.anio - b.anio).forEach(reg => {
        const aportado = (reg.aportaciones || []).reduce((acc, ap) => {
            if (ap.monto !== null && ap.monto !== undefined && ap.monto !== '') return acc + Number(ap.monto);
            return acc;
        }, 0);
        const deudaTotal = (reg.totales.find(t => t.concepto.toUpperCase().includes('DEUDA TOTAL')) || {}).monto;
        const saldo = saldoFinalDe(reg);
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td class="monto">${reg.anio}</td>
            <td>${formatearMonto(aportado)}</td>
            <td>${formatearMonto(deudaTotal)}</td>
            <td>${formatearMonto(saldo)}</td>
            <td>${badgeEstado(saldo)}</td>
        `;
        tbody.appendChild(fila);
    });

    wrapper.appendChild(tabla);
    return wrapper;
}

// 11. RENDERIZAR EL ESTADO DE UN AÑO (obligaciones + aportaciones + totales)
function renderEstadoAnio(reg, opciones) {
    const cont = document.createElement('div');
    cont.className = 'ledger';

    // ---- Obligaciones ----
    const secObl = document.createElement('section');
    secObl.className = 'ledger-sec';
    const headObl = document.createElement('div');
    headObl.className = 'ledger-head';
    headObl.innerHTML = '<h4>Obligaciones ' + reg.anio + '</h4>';
    secObl.appendChild(headObl);
    if (opciones.gestion) {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'btn btn-primary btn-sm';
        boton.textContent = '+ Obligación';
        boton.addEventListener('click', () => abrirFormObligacion(reg, null));
        headObl.appendChild(boton);
    }
    secObl.appendChild(armarTablaObligaciones(reg, opciones));
    cont.appendChild(secObl);

    // ---- Aportaciones ----
    const secApo = document.createElement('section');
    secApo.className = 'ledger-sec';
    const headApo = document.createElement('div');
    headApo.className = 'ledger-head';
    headApo.innerHTML = '<h4>Aportaciones ' + reg.anio + '</h4>';
    secApo.appendChild(headApo);
    if (opciones.gestion) {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'btn btn-primary btn-sm';
        boton.textContent = '+ Aportación';
        boton.addEventListener('click', () => abrirFormAportacion(reg, null));
        headApo.appendChild(boton);
    }
    secApo.appendChild(armarTablaAportaciones(reg, opciones));
    cont.appendChild(secApo);

    // ---- Totales ----
    const bloqueTotales = document.createElement('div');
    bloqueTotales.className = 'totales';
    reg.totales.forEach(t => {
        const fila = document.createElement('div');
        fila.className = 'total-row';
        fila.innerHTML = `<span>${esc(t.concepto)}</span><strong>${formatearMonto(t.monto)}</strong>`;
        bloqueTotales.appendChild(fila);
    });
    if (opciones.gestion) {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'btn btn-ghost btn-sm btn-totales';
        boton.textContent = 'Editar totales';
        boton.addEventListener('click', () => abrirFormTotales(reg));
        bloqueTotales.appendChild(boton);
    }
    cont.appendChild(bloqueTotales);

    return cont;
}

function armarTablaObligaciones(reg, opciones) {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const tabla = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Conceptos</th><th>Recibo</th><th>Monto</th>' + (opciones.gestion ? '<th>Acción</th>' : '') + '</tr>';
    tabla.appendChild(thead);
    const tbody = document.createElement('tbody');
    tabla.appendChild(tbody);

    reg.obligaciones.forEach((ob, i) => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${esc(ob.concepto)}</td>
            <td class="boleta">${esc(ob.recibo || '—')}</td>
            <td>${textoCelda(ob.monto, ob.texto)}</td>
            ${opciones.gestion ? '<td class="accion-cell"><div class="action-group">' +
                '<button class="btn-icon btn-editar" title="Editar" aria-label="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>' +
                '<button class="btn-icon btn-danger btn-eliminar" title="Eliminar" aria-label="Eliminar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
                '</div></td>' : ''}
        `;
        if (opciones.gestion) {
            fila.querySelector('.btn-editar').addEventListener('click', () => abrirFormObligacion(reg, ob, i));
            fila.querySelector('.btn-eliminar').addEventListener('click', () => eliminarObligacion(reg, i));
        }
        tbody.appendChild(fila);
    });

    wrap.appendChild(tabla);
    return wrap;
}

function armarTablaAportaciones(reg, opciones) {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const tabla = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>N° Recibo</th><th>Concepto</th><th>Monto</th>' + (opciones.pdf || opciones.gestion ? '<th>' + (opciones.gestion ? 'Acción' : 'Boleta') + '</th>' : '') + '</tr>';
    tabla.appendChild(thead);
    const tbody = document.createElement('tbody');
    tabla.appendChild(tbody);

    reg.aportaciones.forEach((ap, i) => {
        const fila = document.createElement('tr');
        let extras = '';
        if (opciones.gestion) {
            extras = '<td class="accion-cell"><div class="action-group">' +
                '<button class="btn-icon btn-editar" title="Editar" aria-label="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>' +
                '<button class="btn-icon btn-danger btn-eliminar" title="Eliminar" aria-label="Eliminar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
                '</div></td>';
        } else if (opciones.pdf) {
            extras = '<td class="accion-cell"><button class="btn-icon btn-download" title="Boleta PDF" aria-label="Boleta PDF"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button></td>';
        }
        fila.innerHTML = `
            <td class="boleta">${esc(ap.recibo || '—')}</td>
            <td>${esc(ap.concepto || '—')}</td>
            <td>${textoCelda(ap.monto)}</td>
            ${extras}
        `;
        if (opciones.gestion) {
            fila.querySelector('.btn-editar').addEventListener('click', () => abrirFormAportacion(reg, ap, i));
            fila.querySelector('.btn-eliminar').addEventListener('click', () => eliminarAportacion(reg, i));
        } else if (opciones.pdf) {
            fila.querySelector('.btn-download').addEventListener('click', () => imprimirBoleta(ap, socioActual, reg.anio));
        }
        tbody.appendChild(fila);
    });

    wrap.appendChild(tabla);
    return wrap;
}

// 12. BOLETA EN PDF (aportación / recibo)
function imprimirBoleta(aportacion, socio, anio) {
    const nroRecibo = esc(aportacion.recibo || '—');

    const area = document.getElementById('print-receipt');
    area.innerHTML = `
        <div class="receipt">
            <div class="receipt-brand">Valle Hermoso</div>
            <div class="receipt-sub">Aportaciones · Portal de Socios</div>
            <div class="receipt-title">Boleta de ingreso</div>

            <div class="receipt-row"><span class="receipt-key">N° Recibo</span><span class="receipt-val">${nroRecibo}</span></div>
            <div class="receipt-row"><span class="receipt-key">Año</span><span class="receipt-val">${anio}</span></div>
            <div class="receipt-row"><span class="receipt-key">Socio</span><span class="receipt-val">${esc(socio.nombre)}</span></div>
            <div class="receipt-row"><span class="receipt-key">ID Socio</span><span class="receipt-val">${esc(socio.id)}</span></div>
            <div class="receipt-row"><span class="receipt-key">Concepto</span><span class="receipt-val">${esc(aportacion.concepto || 'APORTACION')}</span></div>

            <div class="receipt-hr"></div>

            <div class="receipt-total">
                <span>Monto</span>
                <span class="receipt-amount">${formatearMonto(aportacion.monto)}</span>
            </div>

            <div class="receipt-hr"></div>
            <div class="receipt-state estado-pagado">ABONADO</div>

            <div class="receipt-foot">Este comprobante se generó desde el Portal de Socios.<br>Asociación Valle Hermoso · Gracias por tu aportación.</div>
        </div>
    `;

    window.print();
}

window.addEventListener('afterprint', () => {
    const area = document.getElementById('print-receipt');
    if (area) area.innerHTML = '';
});

// 12b. REPORTE PDF DEL ESTADO DE CUENTA (un año o todos los años)
function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function htmlCabeceraReporte(socio, titulo) {
    const tc = socio.t_cambio
        ? '<div class="report-meta-row"><span>TC</span>S/ ' + String(socio.t_cambio).replace('.', ',') + '</div>'
        : '';
    return `
        <div class="report-head">
            <div class="report-brand">Valle Hermoso</div>
            <div class="report-title">${titulo}</div>
            <div class="report-meta">
                <div class="report-meta-row"><span>Socio</span>${esc(socio.nombre)}</div>
                <div class="report-meta-row"><span>ID</span>${socio.id}</div>
                <div class="report-meta-row"><span>Emitido</span>${new Date().toLocaleDateString('es-PE')}</div>
                ${tc}
            </div>
        </div>
    `;
}

function htmlObligacionesReporte(reg) {
    let filas = '';
    reg.obligaciones.forEach(ob => {
        const monto = (ob.monto === null || ob.monto === undefined || ob.monto === '')
            ? '<span class="texto-nulo">' + (esc(ob.texto) || '—') + '</span>'
            : formatearMonto(ob.monto);
        filas += '<tr><td>' + esc(ob.concepto) + '</td><td>' + esc(ob.recibo || '—') + '</td><td>' + monto + '</td></tr>';
    });
    if (!filas) filas = '<tr><td colspan="3" class="texto-nulo">Sin obligaciones registradas.</td></tr>';
    return `
        <h3 class="sec-title">Obligaciones ${reg.anio}</h3>
        <table>
            <thead><tr><th>Conceptos</th><th>Recibo</th><th>Monto</th></tr></thead>
            <tbody>${filas}</tbody>
        </table>
    `;
}

function htmlAportacionesReporte(reg) {
    let filas = '';
    reg.aportaciones.forEach(ap => {
        const monto = (ap.monto === null || ap.monto === undefined || ap.monto === '')
            ? '<span class="texto-nulo">—</span>'
            : formatearMonto(ap.monto);
        filas += '<tr><td>' + esc(ap.recibo || '—') + '</td><td>' + esc(ap.concepto || '—') + '</td><td>' + monto + '</td></tr>';
    });
    if (!filas) filas = '<tr><td colspan="3" class="texto-nulo">Sin aportaciones registradas.</td></tr>';
    return `
        <h3 class="sec-title">Aportaciones ${reg.anio}</h3>
        <table>
            <thead><tr><th>N° Recibo</th><th>Concepto</th><th>Monto</th></tr></thead>
            <tbody>${filas}</tbody>
        </table>
    `;
}

function htmlTotalesReporte(reg) {
    let filas = '';
    reg.totales.forEach(t => {
        filas += '<div class="report-total-row"><span>' + esc(t.concepto) + '</span><strong>' + formatearMonto(t.monto) + '</strong></div>';
    });
    if (!filas) return '';
    return '<div class="report-totales">' + filas + '</div>';
}

function htmlEstadoAnioReporte(reg) {
    return `
        <div class="report-year">
            ${htmlObligacionesReporte(reg)}
            ${htmlAportacionesReporte(reg)}
            ${htmlTotalesReporte(reg)}
        </div>
    `;
}

function htmlResumenReporte(socio) {
    let filas = '';
    socio.anios.slice().sort((a, b) => a.anio - b.anio).forEach(reg => {
        const aportado = (reg.aportaciones || []).reduce((acc, ap) => {
            if (ap.monto !== null && ap.monto !== undefined && ap.monto !== '') return acc + Number(ap.monto);
            return acc;
        }, 0);
        const deudaTotal = (reg.totales.find(t => t.concepto.toUpperCase().includes('DEUDA TOTAL')) || {}).monto;
        filas += '<tr><td>' + reg.anio + '</td><td>' + formatearMonto(aportado) + '</td><td>' + formatearMonto(deudaTotal) + '</td><td>' + formatearMonto(saldoFinalDe(reg)) + '</td></tr>';
    });
    return `
        <h3 class="sec-title">Resumen por año</h3>
        <table>
            <thead><tr><th>Año</th><th>Aportado</th><th>Deuda total</th><th>Saldo final</th></tr></thead>
            <tbody>${filas}</tbody>
        </table>
    `;
}

function imprimirReporte(socio, anio) {
    const cuerpo = anio
        ? htmlEstadoAnioReporte(getAnio(socio, anio))
        : htmlResumenReporte(socio) + socio.anios.slice().sort((a, b) => a.anio - b.anio).map(htmlEstadoAnioReporte).join('');

    const area = document.getElementById('print-receipt');
    area.innerHTML = '<div class="print-report">' + htmlCabeceraReporte(socio, anio ? 'Estado de cuenta ' + anio : 'Estado de cuenta completo') + cuerpo + '</div>';
    window.print();
}

document.getElementById('btn-pdf-anio').addEventListener('click', () => {
    if (!socioActual) return;
    if (!anioSeleccionado) {
        alert('Selecciona un año en las pestañas para descargar su PDF.');
        return;
    }
    imprimirReporte(socioActual, anioSeleccionado);
});

document.getElementById('btn-pdf-todos').addEventListener('click', () => {
    if (!socioActual) return;
    if (!socioActual.anios.length) {
        alert('Todavía no hay años registrados en tu estado de cuenta.');
        return;
    }
    imprimirReporte(socioActual, null);
});
function renderAdminAll() {
    renderResumenAdmin();
    renderTablaResumenAdmin();
    renderTablaSocios();
    renderFiltrosAnios();
    renderWhatsappTab();
}

function renderResumenAdmin() {
    let cobrado = 0, deuda = 0;
    const aniosSet = new Set();

    DATOS.socios.forEach(s => {
        (s.anios || []).forEach(a => aniosSet.add(a.anio));
        cobrado += totalAportadoDe(s);
        deuda += deudaVigenteDe(s);
    });

    document.getElementById('res-socios').textContent = DATOS.socios.length;
    document.getElementById('res-anios').textContent = aniosSet.size;
    document.getElementById('res-cobrado').textContent = formatearMonto(cobrado);
    document.getElementById('res-deuda').textContent = formatearMonto(deuda);
}

function renderTablaResumenAdmin() {
    const tbody = document.getElementById('tabla-resumen');
    tbody.innerHTML = '';

    DATOS.socios.forEach(s => {
        const deuda = deudaVigenteDe(s);
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td class="monto">${esc(s.nombre)}</td>
            <td>${s.anios.length} ${s.anios.length === 1 ? 'año' : 'años'}</td>
            <td>${formatearMonto(totalAportadoDe(s))}</td>
            <td>${formatearMonto(deuda)}</td>
            <td>${badgeEstado(deuda)}</td>
        `;
        tbody.appendChild(fila);
    });
}

function renderTablaSocios() {
    const tbody = document.getElementById('tabla-socios');
    tbody.innerHTML = '';

    DATOS.socios.forEach(s => {
        const deuda = deudaVigenteDe(s);
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td class="boleta">${esc(s.id)}</td>
            <td>${esc(s.nombre)}</td>
            <td>${esc(s.email)}</td>
            <td>${s.t_cambio ? 'S/ ' + String(s.t_cambio).replace('.', ',') : '—'}</td>
            <td>${s.anios.length}</td>
            <td>${formatearMonto(deuda)}</td>
            <td class="accion-cell">
                <div class="action-group">
                    <button class="btn-icon btn-editar" title="Editar socio" aria-label="Editar socio">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    </button>
                    <button class="btn-icon btn-danger btn-eliminar" title="Eliminar socio" aria-label="Eliminar socio">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </td>
        `;
        fila.querySelector('.btn-editar').addEventListener('click', () => abrirFormSocio(s));
        fila.querySelector('.btn-eliminar').addEventListener('click', () => eliminarSocio(s));
        tbody.appendChild(fila);
    });
}

// 13b. FILTROS POR SOCIO Y AÑO (admin)
function renderFiltrosAnios() {
    const selSocio = document.getElementById('filtro-socio');
    const selAnio = document.getElementById('filtro-anio');

    selSocio.innerHTML = '';
    DATOS.socios.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.nombre;
        selSocio.appendChild(opt);
    });
    if (DATOS.socios.length) selSocio.value = adminSocioSel ? adminSocioSel : DATOS.socios[0].id;

    selAnio.innerHTML = '';
    const socio = DATOS.socios.find(s => s.id === selSocio.value);
    if (!socio) {
        selAnio.hidden = true;
        renderDetalleAnioAdmin();
        return;
    }
    (socio.anios || []).slice().sort((a, b) => a.anio - b.anio).forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.anio;
        opt.textContent = 'Año ' + a.anio;
        selAnio.appendChild(opt);
    });

    if (selAnio.options.length) {
        selAnio.value = (adminAnioSel && [...selAnio.options].some(o => Number(o.value) === adminAnioSel))
            ? String(adminAnioSel) : selAnio.options[selAnio.options.length - 1].value;
        selAnio.hidden = false;
    } else {
        selAnio.hidden = true;
    }

    renderDetalleAnioAdmin();
}

document.getElementById('filtro-socio').addEventListener('change', (e) => {
    adminSocioSel = e.target.value;
    renderFiltrosAnios();
});

document.getElementById('filtro-anio').addEventListener('change', (e) => {
    adminAnioSel = Number(e.target.value);
    renderDetalleAnioAdmin();
});

// 13c. PDF DEL ESTADO DE CUENTA (panel admin, pestaña "Por año")
document.getElementById('btn-admin-pdf-anio').addEventListener('click', () => {
    const selSocio = document.getElementById('filtro-socio');
    const selAnio = document.getElementById('filtro-anio');
    if (!selSocio.options.length || !selAnio.options.length) {
        alert('Selecciona un socio y un año para descargar su PDF.');
        return;
    }
    const socio = DATOS.socios.find(s => s.id === selSocio.value);
    if (!socio) return;
    imprimirReporte(socio, Number(selAnio.value));
});

document.getElementById('btn-admin-pdf-todos').addEventListener('click', () => {
    const selSocio = document.getElementById('filtro-socio');
    if (!selSocio.options.length) {
        alert('Primero registra un socio.');
        return;
    }
    const socio = DATOS.socios.find(s => s.id === selSocio.value);
    if (!socio) return;
    if (!socio.anios.length) {
        alert('Este socio aún no tiene años registrados.');
        return;
    }
    imprimirReporte(socio, null);
});

function renderDetalleAnioAdmin() {
    const cont = document.getElementById('detalle-anio-admin');
    cont.innerHTML = '';

    const selSocio = document.getElementById('filtro-socio');
    const selAnio = document.getElementById('filtro-anio');

    if (!DATOS.socios.length) {
        cont.innerHTML = '<p class="detalle-vacio">Primero registra un socio.</p>';
        return;
    }

    const socio = DATOS.socios.find(s => s.id === selSocio.value);

    if (!selAnio.options.length) {
        const aviso = document.createElement('p');
        aviso.className = 'detalle-vacio';
        aviso.textContent = 'Este socio aún no tiene años registrados.';
        cont.appendChild(aviso);

        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'btn btn-primary btn-sm';
        boton.textContent = '+ Agregar primer año';
        boton.addEventListener('click', () => abrirFormNuevoAnio(socio));
        cont.appendChild(boton);
        return;
    }

    const anio = Number(selAnio.value);
    const reg = getAnio(socio, anio);

    cont.appendChild(renderEstadoAnio(reg, { pdf: false, gestion: true }));

    // Botón para agregar un año nuevo
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn btn-ghost btn-sm';
    boton.textContent = '+ Agregar otro año';
    boton.addEventListener('click', () => abrirFormNuevoAnio(socio));
    boton.style.marginTop = '1rem';
    cont.appendChild(boton);
    cont.appendChild(document.createElement('br'));
}

function abrirFormNuevoAnio(socio) {
    abrirModal('Nuevo año para ' + socio.nombre, `
        <div class="field">
            <label for="f-anio">Año</label>
            <input type="number" id="f-anio" min="2000" max="2100" value="${new Date().getFullYear()}" required>
        </div>
        <button id="modal-submit" class="btn btn-primary btn-block" type="button">Crear año</button>
    `);
    document.getElementById('modal-submit').addEventListener('click', () => {
        const anio = Number(document.getElementById('f-anio').value);
        if (!anio) return alert('Indica un año válido.');
        if (socio.anios.some(a => a.anio === anio)) return alert('Ese año ya existe para este socio.');

        socio.anios.push({ anio, obligaciones: [], aportaciones: [], totales: [] });
        socio.anios.sort((a, b) => a.anio - b.anio);
        guardarLocal();
        adminAnioSel = anio;
        adminSocioSel = socio.id;
        renderAdminAll();
        cerrarModal();
    });
}

// 14. VENTANA MODAL
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');

function abrirModal(titulo, contenido) {
    modalTitle.textContent = titulo;
    modalBody.innerHTML = contenido;
    modal.hidden = false;
}

function cerrarModal() {
    modal.hidden = true;
    modalBody.innerHTML = '';
}

document.getElementById('modal-close').addEventListener('click', cerrarModal);
modal.addEventListener('click', (e) => {
    if (e.target === modal) cerrarModal();
});

// 15. SOCIO: NUEVO / EDITAR / ELIMINAR
function abrirFormSocio(socio) {
    const esNuevo = !socio;
    const s = esNuevo ? { id: '', nombre: '', email: '', password: '123', telefono: '', t_cambio: '' } : socio;

    abrirModal(esNuevo ? 'Nuevo socio' : 'Editar socio', `
        <div class="field">
            <label for="f-nombre">Nombre completo</label>
            <input type="text" id="f-nombre" value="${esc(s.nombre)}" required>
        </div>
        <div class="field">
            <label for="f-email">Correo electrónico</label>
            <input type="email" id="f-email" value="${esc(s.email)}" required>
        </div>
        <div class="field">
            <label for="f-password">Contraseña</label>
            <input type="text" id="f-password" value="${esc(s.password)}" required>
        </div>
        <div class="field">
            <label for="f-telefono">Teléfono / WhatsApp</label>
            <input type="tel" id="f-telefono" value="${esc(s.telefono || '')}" placeholder="519XXXXXXXXX (con código de país)">
        </div>
        <div class="field">
            <label for="f-tcambio">Tipo de cambio (opcional)</label>
            <input type="text" id="f-tcambio" value="${esc(s.t_cambio || '')}" placeholder="3.321">
        </div>
        <button id="modal-submit" class="btn btn-primary btn-block" type="button">Guardar</button>
    `);

    document.getElementById('modal-submit').addEventListener('click', () => {
        const nombre = document.getElementById('f-nombre').value.trim();
        const email = document.getElementById('f-email').value.trim();
        const password = document.getElementById('f-password').value;
        const telefono = document.getElementById('f-telefono').value.trim().replace(/[^\d]/g, '');
        const tCambioRaw = document.getElementById('f-tcambio').value.trim();

        if (!nombre || !email || !password) {
            alert('Completa los campos obligatorios.');
            return;
        }
        if (password.length < 4) {
            alert('La contraseña debe tener al menos 4 caracteres.');
            return;
        }
        if (telefono && telLimpio(telefono).length < 8) {
            alert('Revisa el teléfono: debe incluir el código de país, ej. 519XXXXXXXXX.');
            return;
        }
        const emailDuplicado = DATOS.socios.some(u =>
            u.email === email && (esNuevo || u.id !== s.id)
        );
        if (emailDuplicado) {
            alert('Ya existe un socio con ese correo.');
            return;
        }

        if (esNuevo) {
            const nuevoSocio = {
                id: nuevoIdSocio(),
                nombre,
                email,
                password,
                telefono,
                t_cambio: tCambioRaw === '' ? null : Number(tCambioRaw.replace(',', '.')),
                anios: []
            };
            DATOS.socios.push(nuevoSocio);
            adminSocioSel = nuevoSocio.id;
        } else {
            s.nombre = nombre;
            s.email = email;
            s.password = password;
            s.telefono = telefono;
            s.t_cambio = tCambioRaw === '' ? null : Number(tCambioRaw.replace(',', '.'));
        }

        guardarLocal();
        renderAdminAll();
        cerrarModal();
    });
}

function eliminarSocio(socio) {
    if (!confirm('¿Eliminar al socio ' + socio.nombre + '? También se borrará todo su estado de cuenta.')) return;

    DATOS.socios = DATOS.socios.filter(s => s.id !== socio.id);
    if (adminSocioSel === socio.id) adminSocioSel = null;
    if (socioActual && socioActual.id === socio.id) socioActual = null;
    guardarLocal();
    renderAdminAll();
}

document.getElementById('btn-nuevo-socio').addEventListener('click', () => abrirFormSocio(null));

// 16. OBLIGACIÓN: NUEVO / EDITAR / ELIMINAR
function abrirFormObligacion(reg, ob, idx) {
    const esNuevo = !ob;
    const o = esNuevo ? { concepto: '', monto: '', recibo: '', texto: '' } : ob;

    abrirModal(esNuevo ? 'Nueva obligación ' + reg.anio : 'Editar obligación ' + reg.anio, `
        <div class="field">
            <label for="f-concepto">Concepto</label>
            <input type="text" id="f-concepto" value="${esc(o.concepto)}" placeholder="CUOTA MENSUAL 2026" required>
        </div>
        <div class="field">
            <label for="f-monto">Monto (S/) · vacío = sin monto</label>
            <input type="text" id="f-monto" inputmode="decimal" value="${esc(o.monto ?? '')}" placeholder="120 o 1,222.45">
        </div>
        <div class="field">
            <label for="f-recibo">N° Recibo (opcional)</label>
            <input type="text" id="f-recibo" value="${esc(o.recibo || '')}">
        </div>
        <div class="field">
            <label for="f-texto">Texto especial (opcional, p. ej. RELACION / DSCTO MENS)</label>
            <input type="text" id="f-texto" value="${esc(o.texto || '')}">
        </div>
        <button id="modal-submit" class="btn btn-primary btn-block" type="button">Guardar</button>
    `);

    document.getElementById('modal-submit').addEventListener('click', () => {
        const concepto = document.getElementById('f-concepto').value.trim();
        const montoRaw = document.getElementById('f-monto').value;
        const monto = parseMonto(montoRaw);
        const recibo = document.getElementById('f-recibo').value.trim();
        const texto = document.getElementById('f-texto').value.trim();

        if (!concepto) {
            alert('Indica el concepto.');
            return;
        }
        if (montoRaw.trim() !== '' && monto === null) {
            alert('El monto no es válido. Ejemplos: 120 o 1,222.45');
            return;
        }

        if (esNuevo) {
            reg.obligaciones.push({ concepto, monto, recibo: recibo || '', texto: texto || '' });
        } else {
            o.concepto = concepto;
            o.monto = monto;
            o.recibo = recibo;
            if (texto) o.texto = texto;
            else delete o.texto;
        }

        guardarLocal();
        renderAdminAll();
        cerrarModal();
    });
}

function eliminarObligacion(reg, idx) {
    if (!confirm('¿Eliminar la obligación "' + reg.obligaciones[idx].concepto + '"?')) return;
    reg.obligaciones.splice(idx, 1);
    guardarLocal();
    renderAdminAll();
}

// 17. APORTACIÓN: NUEVO / EDITAR / ELIMINAR
function abrirFormAportacion(reg, ap, idx) {
    const esNuevo = !ap;
    const a = esNuevo ? { recibo: '', concepto: '', monto: '' } : ap;

    abrirModal(esNuevo ? 'Nueva aportación ' + reg.anio : 'Editar aportación ' + reg.anio, `
        <div class="field">
            <label for="f-recibo">N° Recibo</label>
            <input type="text" id="f-recibo" value="${esc(a.recibo || '')}" placeholder="740">
        </div>
        <div class="field">
            <label for="f-concepto">Concepto</label>
            <input type="text" id="f-concepto" value="${esc(a.concepto || '')}" placeholder="INGRESOS VARIOS">
        </div>
        <div class="field">
            <label for="f-monto">Monto (S/)</label>
            <input type="text" id="f-monto" inputmode="decimal" value="${esc(a.monto ?? '')}" placeholder="120 o 1,222.45">
        </div>
        <button id="modal-submit" class="btn btn-primary btn-block" type="button">Guardar</button>
    `);

    document.getElementById('modal-submit').addEventListener('click', () => {
        const recibo = document.getElementById('f-recibo').value.trim();
        const concepto = document.getElementById('f-concepto').value.trim();
        const montoRaw = document.getElementById('f-monto').value;
        const monto = parseMonto(montoRaw);

        if (montoRaw.trim() !== '' && monto === null) {
            alert('El monto no es válido. Ejemplos: 120 o 1,222.45');
            return;
        }
        if (!recibo && !concepto && monto === null) {
            alert('Completa al menos recibo o concepto con un monto.');
            return;
        }

        if (esNuevo) {
            reg.aportaciones.push({ recibo, concepto, monto });
        } else {
            a.recibo = recibo;
            a.concepto = concepto;
            a.monto = monto;
        }

        guardarLocal();
        renderAdminAll();
        cerrarModal();
    });
}

function eliminarAportacion(reg, idx) {
    const ap = reg.aportaciones[idx];
    if (!confirm('¿Eliminar la aportación ' + (ap.recibo || '(sin recibo)') + ' (' + (ap.concepto || '—') + ')?')) return;
    reg.aportaciones.splice(idx, 1);
    guardarLocal();
    renderAdminAll();
}

// 18. TOTALES DE UN AÑO: EDITAR
function abrirFormTotales(reg) {
    const filas = reg.totales
        .map((t, i) => `
            <div class="field">
                <label>Total ${i + 1} · concepto</label>
                <input type="text" class="f-total-concepto" value="${esc(t.concepto)}">
                <label class="label-min">Monto (S/) · vacío = sin monto</label>
                <input type="text" class="f-total-monto" inputmode="decimal" value="${esc(t.monto ?? '')}" placeholder="120 o 1,222.45">
            </div>
        `)
        .join('');

    abrirModal('Totales ' + reg.anio, `
        ${filas}
        <button id="btn-add-total" class="btn btn-ghost btn-sm" type="button">+ Agregar total</button>
        <div class="modal-actions">
            <button id="modal-submit" class="btn btn-primary btn-block" type="button">Guardar</button>
        </div>
    `);

    document.getElementById('btn-add-total').addEventListener('click', () => {
        const campo = document.createElement('div');
        campo.className = 'field';
        campo.innerHTML = `
            <label>Total · concepto</label>
            <input type="text" class="f-total-concepto" placeholder="TOTAL INGRESOS">
            <label class="label-min">Monto (S/)</label>
            <input type="text" class="f-total-monto" inputmode="decimal" placeholder="120 o 1,222.45">
        `;
        document.getElementById('btn-add-total').before(campo);
    });

    document.getElementById('modal-submit').addEventListener('click', () => {
        const conceptos = [...document.querySelectorAll('.f-total-concepto')].map(i => i.value.trim());
        const montos = [...document.querySelectorAll('.f-total-monto')].map(i => parseMonto(i.value));

        for (let i = 0; i < montos.length; i++) {
            const inp = document.querySelectorAll('.f-total-monto')[i];
            if (inp.value.trim() !== '' && montos[i] === null) {
                alert('El monto "' + (conceptos[i] || 'Total ' + (i + 1)) + '" no es válido. Ejemplos: 120 o 1,222.45');
                return;
            }
        }

        const nuevos = conceptos
            .map((c, i) => ({ concepto: c, monto: montos[i] }))
            .filter(t => t.concepto !== '');

        const saldo = nuevos.find(t => t.concepto.toUpperCase().includes('SALDO FINAL'));
        const deudaTotal = nuevos.find(t => t.concepto.toUpperCase().includes('DEUDA TOTAL'));
        const ingresos = nuevos.find(t => t.concepto.toUpperCase().includes('TOTAL INGRESOS'));

        if (saldo && deudaTotal && saldo.monto !== null && deudaTotal.monto !== null) {
            const sumaApartes = (reg.aportaciones || []).reduce((acc, ap) => {
                if (ap.monto !== null && ap.monto !== undefined && ap.monto !== '') return acc + Number(ap.monto);
                return acc;
            }, 0);
            const esperado = deudaTotal.monto - sumaApartes;
            if (Math.abs(saldo.monto - esperado) > 0.01) {
                if (!confirm('El SALDO FINAL (' + formatearMonto(saldo.monto) + ') no cuadra con DEUDA TOTAL - aportaciones (' + formatearMonto(esperado) + '). ¿Guardar de todas formas?')) {
                    return;
                }
            }
        }

        reg.totales = nuevos;

        guardarLocal();
        renderAdminAll();
        cerrarModal();
    });
}

// 19. PESTAÑAS DEL PANEL ADMIN
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.tab-panel').forEach(p => {
            p.hidden = p.id !== 'tab-' + btn.dataset.tab;
        });
    });
});

// 20. DESCARGAR data.json PARA PUBLICAR EN GITHUB
document.getElementById('btn-descargar').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(DATOS, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    a.click();
    URL.revokeObjectURL(url);
    datosSincronizados = true;

    const texto = document.getElementById('publish-text');
    texto.innerHTML = 'Archivo descargado. Ahora <strong>reemplázalo</strong> en tu repositorio local (data.json), haz <strong>push</strong> a GitHub y los socios verán los cambios.';
});

// 21. ENVIAR ESTADO DE CUENTA POR WHATSAPP (panel admin)
function telLimpio(tel) {
    return String(tel || '').replace(/\D/g, '');
}

function baseURL() {
    if (location.protocol === 'file:') return location.href;
    return location.origin + location.pathname;
}

function renderWhatsappTab() {
    const selAnio = document.getElementById('wa-anio');
    const actual = selAnio.value;
    const anios = new Set();
    DATOS.socios.forEach(s => (s.anios || []).forEach(a => anios.add(a.anio)));

    selAnio.innerHTML = '<option value="">Todos los años</option>';
    [...anios].sort((a, b) => a - b).forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = 'Año ' + y;
        selAnio.appendChild(opt);
    });
    if (actual) selAnio.value = actual;

    const cab = document.getElementById('wa-todos');
    if (cab) cab.checked = false;

    const tbody = document.getElementById('tabla-whatsapp');
    tbody.innerHTML = '';
    DATOS.socios.forEach(s => {
        const tel = telLimpio(s.telefono);
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td><input type="checkbox" class="wa-check" value="${esc(s.id)}" aria-label="Seleccionar a ${esc(s.nombre)}"></td>
            <td>${esc(s.nombre)}</td>
            <td>${tel ? esc(tel) : '<span class="texto-nulo">sin número</span>'}</td>
            <td>${(s.anios || []).length}</td>
        `;
        tbody.appendChild(fila);
    });

    const nota = document.getElementById('wa-note');
    nota.hidden = true;
}

document.getElementById('wa-todos').addEventListener('change', (e) => {
    document.querySelectorAll('.wa-check').forEach(c => c.checked = e.target.checked);
});

document.getElementById('btn-wa-enviar').addEventListener('click', () => {
    const marcados = [...document.querySelectorAll('.wa-check:checked')];
    if (!marcados.length) {
        alert('Marca al menos a una persona para enviar.');
        return;
    }
    const anio = document.getElementById('wa-anio').value;
    const titulo = anio ? 'del año ' + anio : 'de todos los años';

    let sinTel = [];
    let abiertos = 0;
    marcados.forEach(c => {
        const socio = DATOS.socios.find(s => s.id === c.value);
        if (!socio) return;
        const tel = telLimpio(socio.telefono);
        if (!tel) { sinTel.push(socio.nombre); return; }
        const link = baseURL() + '?share=' + encodeURIComponent(socio.id) + (anio ? '&anio=' + anio : '');
        const msg = '👋 Hola, ' + socio.nombre + '. Te compartimos tu estado de cuenta '
            + titulo + ' de la Asociación Valle Hermoso. Puedes consultarlo aquí: ' + link;
        window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(msg), '_blank');
        abiertos++;
    });

    const nota = document.getElementById('wa-note');
    nota.textContent = abiertos
        ? 'Se abrieron ' + abiertos + ' chat(s) de WhatsApp con el enlace al estado de cuenta.'
        : 'No se pudo abrir ningún chat.';
    if (sinTel.length) {
        nota.textContent += ' Sin número registrado (agrégalo con "Editar socio"): ' + sinTel.join(', ');
    }
    nota.hidden = false;
});

// 22. VISTA PÚBLICA: ESTADO DE CUENTA COMPARTIDO POR ENLACE (?share=SOC-XXXX[&anio=YYYY])
function iniciarModoPublico(socio, anioInicial) {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'none';
    document.getElementById('admin-section').style.display = 'none';
    document.getElementById('public-section').style.display = 'block';

    document.getElementById('public-nombre').textContent = socio.nombre + ' · Estado de cuenta';
    document.getElementById('public-cerrar').href = baseURL();

    let anioSel = anioInicial && (socio.anios || []).some(a => a.anio === anioInicial) ? anioInicial : null;

    const contPills = document.getElementById('public-pills');
    const contDet = document.getElementById('public-detail');

    function renderPub() {
        contDet.innerHTML = '';
        if (!(socio.anios || []).length) {
            contDet.innerHTML = '<p class="detalle-vacio">Todavía no hay registros en su estado de cuenta.</p>';
            return;
        }
        if (!anioSel) {
            contDet.appendChild(renderResumenAniosTabla(socio, false));
            socio.anios.slice().sort((a, b) => a.anio - b.anio).forEach(reg => {
                contDet.appendChild(renderEstadoAnio(reg, { pdf: false, gestion: false }));
            });
            return;
        }
        contDet.appendChild(renderEstadoAnio(getAnio(socio, anioSel), { pdf: false, gestion: false }));
    }

    function renderPillsPub() {
        contPills.innerHTML = '';
        const hacerPill = (txt, anioVal, activo) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'year-pill' + (anioVal === null ? ' all' : '') + (activo ? ' active' : '');
            b.textContent = txt;
            b.addEventListener('click', () => {
                anioSel = anioVal;
                renderPillsPub();
                renderPub();
            });
            contPills.appendChild(b);
        };
        hacerPill('General', null, anioSel === null);
        socio.anios.slice().sort((a, b) => a.anio - b.anio).forEach(a => {
            hacerPill(String(a.anio), a.anio, anioSel === a.anio);
        });
    }

    renderPillsPub();
    renderPub();
    window.scrollTo(0, 0);
}

// 23. INICIO
cargarDatos().then(() => {
    const params = new URLSearchParams(location.search);
    const share = params.get('share');
    if (share) {
        const socio = DATOS.socios.find(s => s.id === share);
        if (socio) {
            iniciarModoPublico(socio, Number(params.get('anio')) || null);
            return;
        }
    }
    // Modo normal: se muestra la pantalla de inicio (login/socio admin).
});

// 24. AVISO DE CAMBIOS SIN PUBLICAR (al recargar o cerrar la página)
window.addEventListener('beforeunload', (e) => {
    if (!datosSincronizados) {
        e.preventDefault();
        e.returnValue = '';
    }
});