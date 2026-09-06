// ==========================================================
// VALLE HERMOSO · PORTAL DE SOCIOS
// Página estática (GitHub Pages). Los datos viven en data.json.
// Cada socio tiene un estado de cuenta POR AÑO (obligaciones +
// aportaciones + totales). El admin edita, descarga el data.json
// actualizado y lo publica en el repositorio para los socios.
// ==========================================================

// 1. DATOS DE RESPALDO (si no se puede leer data.json)
const DATOS_INICIALES = {
    admin: { nombre: "Administración", email: "admin@vallehermoso.com", password: "cambia123" },
    socios: []
};

// 2. ESTADO GLOBAL
let DATOS = null;                           // datos cargados (admin, socios)
let rolActivo = 'socio';                    // 'socio' | 'admin'
let socioActual = null;                     // socio con sesión iniciada
let anioSeleccionado = null;                // año seleccionado por el socio
let adminSocioSel = null;                   // socio seleccionado en "Por año"
let adminAnioSel = null;                    // año seleccionado en "Por año"

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

function textoCelda(valor, textoExtra) {
    if (textoExtra) return '<span class="texto-nulo">' + textoExtra + '</span>';
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
    const ultimo = socio.anios[socio.anios.length - 1];
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
        fila.innerHTML = `<span>${t.concepto}</span><strong>${formatearMonto(t.monto)}</strong>`;
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
            <td>${ob.concepto}</td>
            <td class="boleta">${ob.recibo || '—'}</td>
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
            <td class="boleta">${ap.recibo || '—'}</td>
            <td>${ap.concepto || '—'}</td>
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
    const nroRecibo = aportacion.recibo || '—';

    const area = document.getElementById('print-receipt');
    area.innerHTML = `
        <div class="receipt">
            <div class="receipt-brand">Valle Hermoso</div>
            <div class="receipt-sub">Aportaciones · Portal de Socios</div>
            <div class="receipt-title">Boleta de ingreso</div>

            <div class="receipt-row"><span class="receipt-key">N° Recibo</span><span class="receipt-val">${nroRecibo}</span></div>
            <div class="receipt-row"><span class="receipt-key">Año</span><span class="receipt-val">${anio}</span></div>
            <div class="receipt-row"><span class="receipt-key">Socio</span><span class="receipt-val">${socio.nombre}</span></div>
            <div class="receipt-row"><span class="receipt-key">ID Socio</span><span class="receipt-val">${socio.id}</span></div>
            <div class="receipt-row"><span class="receipt-key">Concepto</span><span class="receipt-val">${aportacion.concepto || 'APORTACION'}</span></div>

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

// 13. PANEL DEL ADMINISTRADOR
function renderAdminAll() {
    renderResumenAdmin();
    renderTablaResumenAdmin();
    renderTablaSocios();
    renderFiltrosAnios();
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
            <td class="monto">${s.nombre}</td>
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
            <td class="boleta">${s.id}</td>
            <td>${s.nombre}</td>
            <td>${s.email}</td>
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

function renderDetalleAnioAdmin() {
    const cont = document.getElementById('detalle-anio-admin');
    cont.innerHTML = '';

    const selSocio = document.getElementById('filtro-socio');
    const selAnio = document.getElementById('filtro-anio');

    if (!DATOS.socios.length) {
        cont.innerHTML = '<p class="detalle-vacio">Primero registra un socio.</p>';
        return;
    }
    if (!selAnio.options.length) {
        cont.innerHTML = '<p class="detalle-vacio">Este socio aún no tiene años registrados.</p>';
        return;
    }

    const socio = DATOS.socios.find(s => s.id === selSocio.value);
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
    const s = esNuevo ? { id: '', nombre: '', email: '', password: '123', t_cambio: '' } : socio;

    abrirModal(esNuevo ? 'Nuevo socio' : 'Editar socio', `
        <div class="field">
            <label for="f-nombre">Nombre completo</label>
            <input type="text" id="f-nombre" value="${s.nombre}" required>
        </div>
        <div class="field">
            <label for="f-email">Correo electrónico</label>
            <input type="email" id="f-email" value="${s.email}" required>
        </div>
        <div class="field">
            <label for="f-password">Contraseña</label>
            <input type="text" id="f-password" value="${s.password}" required>
        </div>
        <div class="field">
            <label for="f-tcambio">Tipo de cambio (opcional)</label>
            <input type="text" id="f-tcambio" value="${s.t_cambio || ''}" placeholder="3.321">
        </div>
        <button id="modal-submit" class="btn btn-primary btn-block" type="button">Guardar</button>
    `);

    document.getElementById('modal-submit').addEventListener('click', () => {
        const nombre = document.getElementById('f-nombre').value.trim();
        const email = document.getElementById('f-email').value.trim();
        const password = document.getElementById('f-password').value;
        const tCambioRaw = document.getElementById('f-tcambio').value.trim();

        if (!nombre || !email || !password) {
            alert('Completa los campos obligatorios.');
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
            DATOS.socios.push({
                id: nuevoIdSocio(),
                nombre,
                email,
                password,
                t_cambio: tCambioRaw === '' ? null : Number(tCambioRaw.replace(',', '.')),
                anios: []
            });
        } else {
            s.nombre = nombre;
            s.email = email;
            s.password = password;
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
            <input type="text" id="f-concepto" value="${o.concepto}" placeholder="CUOTA MENSUAL 2026" required>
        </div>
        <div class="field">
            <label for="f-monto">Monto (S/) · vacío = sin monto</label>
            <input type="number" id="f-monto" min="0" step="0.01" value="${o.monto ?? ''}">
        </div>
        <div class="field">
            <label for="f-recibo">N° Recibo (opcional)</label>
            <input type="text" id="f-recibo" value="${o.recibo || ''}">
        </div>
        <div class="field">
            <label for="f-texto">Texto especial (opcional, p. ej. RELACION / DSCTO MENS)</label>
            <input type="text" id="f-texto" value="${o.texto || ''}">
        </div>
        <button id="modal-submit" class="btn btn-primary btn-block" type="button">Guardar</button>
    `);

    document.getElementById('modal-submit').addEventListener('click', () => {
        const concepto = document.getElementById('f-concepto').value.trim();
        const montoRaw = document.getElementById('f-monto').value;
        const monto = montoRaw === '' ? null : Number(montoRaw);
        const recibo = document.getElementById('f-recibo').value.trim();
        const texto = document.getElementById('f-texto').value.trim();

        if (!concepto) {
            alert('Indica el concepto.');
            return;
        }

        if (esNuevo) {
            reg.obligaciones.push({ concepto, monto, recibo: recibo || '', texto: texto || '' });
        } else {
            o.concepto = concepto;
            o.monto = monto;
            o.recibo = recibo;
            o.texto = texto || '';
            if (texto) o.texto = texto;
            else delete o.texto;
        }

        guardarLocal();
        renderDetalleAnioAdmin();
        cerrarModal();
    });
}

function eliminarObligacion(reg, idx) {
    if (!confirm('¿Eliminar la obligación "' + reg.obligaciones[idx].concepto + '"?')) return;
    reg.obligaciones.splice(idx, 1);
    guardarLocal();
    renderDetalleAnioAdmin();
}

// 17. APORTACIÓN: NUEVO / EDITAR / ELIMINAR
function abrirFormAportacion(reg, ap, idx) {
    const esNuevo = !ap;
    const a = esNuevo ? { recibo: '', concepto: '', monto: '' } : ap;

    abrirModal(esNuevo ? 'Nueva aportación ' + reg.anio : 'Editar aportación ' + reg.anio, `
        <div class="field">
            <label for="f-recibo">N° Recibo</label>
            <input type="text" id="f-recibo" value="${a.recibo || ''}" placeholder="740">
        </div>
        <div class="field">
            <label for="f-concepto">Concepto</label>
            <input type="text" id="f-concepto" value="${a.concepto || ''}" placeholder="INGRESOS VARIOS">
        </div>
        <div class="field">
            <label for="f-monto">Monto (S/)</label>
            <input type="number" id="f-monto" min="0" step="0.01" value="${a.monto ?? ''}">
        </div>
        <button id="modal-submit" class="btn btn-primary btn-block" type="button">Guardar</button>
    `);

    document.getElementById('modal-submit').addEventListener('click', () => {
        const recibo = document.getElementById('f-recibo').value.trim();
        const concepto = document.getElementById('f-concepto').value.trim();
        const montoRaw = document.getElementById('f-monto').value;
        const monto = montoRaw === '' ? null : Number(montoRaw);

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
        renderDetalleAnioAdmin();
        cerrarModal();
    });
}

function eliminarAportacion(reg, idx) {
    const ap = reg.aportaciones[idx];
    if (!confirm('¿Eliminar la aportación ' + (ap.recibo || '(sin recibo)') + ' (' + (ap.concepto || '—') + ')?')) return;
    reg.aportaciones.splice(idx, 1);
    guardarLocal();
    renderDetalleAnioAdmin();
}

// 18. TOTALES DE UN AÑO: EDITAR
function abrirFormTotales(reg) {
    const filas = reg.totales
        .map((t, i) => `
            <div class="field">
                <label>Total ${i + 1} · concepto</label>
                <input type="text" class="f-total-concepto" value="${t.concepto}">
                <label class="label-min">Monto (S/) · vacío = sin monto</label>
                <input type="number" class="f-total-monto" min="0" step="0.01" value="${t.monto ?? ''}">
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
            <input type="number" class="f-total-monto" min="0" step="0.01">
        `;
        document.getElementById('btn-add-total').before(campo);
    });

    document.getElementById('modal-submit').addEventListener('click', () => {
        const conceptos = [...document.querySelectorAll('.f-total-concepto')].map(i => i.value.trim());
        const montos = [...document.querySelectorAll('.f-total-monto')].map(i => {
            const v = i.value;
            return v === '' ? null : Number(v);
        });

        reg.totales = conceptos
            .map((c, i) => ({ concepto: c, monto: montos[i] }))
            .filter(t => t.concepto !== '');

        guardarLocal();
        renderDetalleAnioAdmin();
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

    const texto = document.getElementById('publish-text');
    texto.innerHTML = 'Archivo descargado. Ahora <strong>reemplázalo</strong> en tu repositorio local (data.json), haz <strong>push</strong> a GitHub y los socios verán los cambios.';
});

// 21. INICIO
cargarDatos();