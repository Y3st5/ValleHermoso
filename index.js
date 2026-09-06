// ==========================================================
// VALLE HERMOSO · PORTAL DE PAGOS
// Página estática (GitHub Pages). Los datos viven en data.json.
// El administrador edita, descarga el data.json actualizado y
// lo publica en el repositorio para que los clientes lo vean.
// ==========================================================

// 1. DATOS DE RESPALDO (si no se puede leer data.json)
const DATOS_INICIALES = {
    admin: { nombre: "Administración", email: "Williams@vallehermoso.com", password: "261201" },
    usuarios: [
        { id: "USR-1001", nombre: "Carlos Mendoza", email: "carlos.m@email.com", password: "123" },
        { id: "USR-1002", nombre: "Ana Rojas", email: "ana.r@email.com", password: "123" },
        { id: "USR-1003", nombre: "Luis Fernández", email: "luis.f@email.com", password: "123" }
    ],
    pagos: [
        { id_pago: "P-001", id_usuario: "USR-1001", fecha: "2026-08-01", concepto: "Mensualidad Agosto", monto: 150.00, estado: "Pagado" },
        { id_pago: "P-002", id_usuario: "USR-1001", fecha: "2026-08-15", concepto: "Materiales Adicionales", monto: 45.50, estado: "Pagado" },
        { id_pago: "P-003", id_usuario: "USR-1001", fecha: "2026-09-01", concepto: "Mensualidad Septiembre", monto: 150.00, estado: "Pendiente" },
        { id_pago: "P-004", id_usuario: "USR-1002", fecha: "2026-08-10", concepto: "Mensualidad Agosto", monto: 150.00, estado: "Pagado" },
        { id_pago: "P-005", id_usuario: "USR-1002", fecha: "2026-09-05", concepto: "Mensualidad Septiembre", monto: 150.00, estado: "Pendiente" }
    ]
};

// 2. ESTADO GLOBAL
let DATOS = null;                          // datos cargados (admin, usuarios, pagos)
let rolActivo = 'cliente';                 // 'cliente' | 'admin'
let usuarioActual = null;                  // cliente con sesión iniciada

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
    tabCliente.classList.toggle('active', rol === 'cliente');
    tabAdmin.classList.toggle('active', rol === 'admin');
    if (rol === 'admin') {
        loginTitle.textContent = 'Acceso administrativo';
        loginSubtitle.textContent = 'Ingresa con tu cuenta de administración para gestionar clientes y pagos.';
    } else {
        loginTitle.textContent = 'Bienvenido';
        loginSubtitle.textContent = 'Ingresa con tu correo y contraseña para consultar tus pagos.';
    }
    msgError.style.display = 'none';
}

tabCliente.addEventListener('click', () => activarRol('cliente'));
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

    // Login de cliente
    const usuarioEncontrado = DATOS.usuarios.find(user =>
        user.email === emailIngresado && user.password === passwordIngresada
    );

    if (usuarioEncontrado) {
        msgError.style.display = 'none';
        sectionLogin.style.display = 'none';
        sectionAdmin.style.display = 'none';
        sectionDashboard.style.display = 'block';
        usuarioActual = usuarioEncontrado;
        cargarDashboard(usuarioEncontrado);
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
    usuarioActual = null;
    sectionDashboard.style.display = 'none';
    sectionAdmin.style.display = 'none';
    sectionLogin.style.display = 'block';
    activarRol('cliente');
}

btnLogout.addEventListener('click', cerrarSesion);
btnLogoutAdmin.addEventListener('click', cerrarSesion);

// 9. LÓGICA PARA RENDERIZAR EL DASHBOARD DEL CLIENTE
function cargarDashboard(usuario) {
    document.getElementById('user-name').textContent = usuario.nombre;
    document.getElementById('user-id').textContent = usuario.id;

    const misPagos = DATOS.pagos.filter(pago => pago.id_usuario === usuario.id);

    let totalPagado = 0;
    let totalDeuda = 0;
    const tablaBodega = document.getElementById('tabla-pagos');
    const tablaVacia = document.getElementById('table-empty');

    tablaBodega.innerHTML = '';

    misPagos.forEach(pago => {
        if (pago.estado === "Pagado") {
            totalPagado += pago.monto;
        } else if (pago.estado === "Pendiente") {
            totalDeuda += pago.monto;
        }

        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${pago.fecha}</td>
            <td class="boleta">${pago.id_pago}</td>
            <td>${pago.concepto}</td>
            <td class="monto">S/ ${pago.monto.toFixed(2)}</td>
            <td><span class="badge ${pago.estado === 'Pagado' ? 'badge-pagado' : 'badge-pendiente'}">${pago.estado}</span></td>
            <td>
                <button class="btn-icon btn-download" title="Descargar boleta en PDF" aria-label="Descargar boleta en PDF">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
            </td>
        `;
        fila.querySelector('.btn-download').addEventListener('click', () => imprimirBoleta(pago, usuario));
        tablaBodega.appendChild(fila);
    });

    tablaVacia.hidden = misPagos.length > 0;

    document.getElementById('total-pagado').textContent = `S/ ${totalPagado.toFixed(2)}`;
    document.getElementById('total-deuda').textContent = `S/ ${totalDeuda.toFixed(2)}`;
}

// 10. BOLETA EN PDF
function imprimirBoleta(pago, usuario) {
    const fechaLegible = pago.fecha.split('-').reverse().join('/');

    const area = document.getElementById('print-receipt');
    area.innerHTML = `
        <div class="receipt">
            <div class="receipt-brand">Valle Hermoso</div>
            <div class="receipt-sub">Portal de Pagos</div>
            <div class="receipt-title">Boleta de pago</div>

            <div class="receipt-row"><span class="receipt-key">N° Boleta</span><span class="receipt-val">${pago.id_pago}</span></div>
            <div class="receipt-row"><span class="receipt-key">Fecha</span><span class="receipt-val">${fechaLegible}</span></div>
            <div class="receipt-row"><span class="receipt-key">Cliente</span><span class="receipt-val">${usuario.nombre}</span></div>
            <div class="receipt-row"><span class="receipt-key">ID Cliente</span><span class="receipt-val">${usuario.id}</span></div>
            <div class="receipt-row"><span class="receipt-key">Concepto</span><span class="receipt-val">${pago.concepto}</span></div>

            <div class="receipt-hr"></div>

            <div class="receipt-total">
                <span>Total</span>
                <span class="receipt-amount">S/ ${pago.monto.toFixed(2)}</span>
            </div>

            <div class="receipt-hr"></div>
            <div class="receipt-state ${pago.estado === 'Pagado' ? 'estado-pagado' : 'estado-pendiente'}">${pago.estado.toUpperCase()}</div>

            <div class="receipt-foot">Este comprobante se generó desde el Portal de Pagos.<br>Valle Hermoso · Gracias por tu puntualidad.</div>
        </div>
    `;

    window.print();
}

// 11. UTILIDADES DEL ADMINISTRADOR
function formatearSoles(valor) {
    return 'S/ ' + Number(valor).toFixed(2);
}

function badgeEstado(estado) {
    const clase = estado === 'Pagado' ? 'badge-pagado' : 'badge-pendiente';
    return `<span class="badge ${clase}">${estado}</span>`;
}

function nombreCliente(idUsuario) {
    const u = DATOS.usuarios.find(us => us.id === idUsuario);
    return u ? u.nombre : idUsuario;
}

function totalesDeCliente(idUsuario) {
    let pagado = 0, deuda = 0;
    DATOS.pagos.filter(p => p.id_usuario === idUsuario).forEach(p => {
        if (p.estado === 'Pagado') pagado += p.monto;
        else deuda += p.monto;
    });
    return { pagado, deuda };
}

function nuevoIdUsuario() {
    let max = 1000;
    DATOS.usuarios.forEach(u => {
        const n = parseInt(u.id.replace(/\D/g, ''), 10);
        if (n > max) max = n;
    });
    return 'USR-' + (max + 1);
}

function nuevoIdPago() {
    let max = 0;
    DATOS.pagos.forEach(p => {
        const n = parseInt(p.id_pago.replace(/\D/g, ''), 10);
        if (n > max) max = n;
    });
    return 'P-' + String(max + 1).padStart(3, '0');
}

// 12. RENDERIZADO GENERAL DEL PANEL ADMIN
function renderAdminAll() {
    renderResumen();
    renderTablaResumen();
    renderTablaClientes();
    renderTablaPagos();
}

function renderResumen() {
    let cobrado = 0, deuda = 0;
    DATOS.pagos.forEach(p => {
        if (p.estado === 'Pagado') cobrado += p.monto;
        else deuda += p.monto;
    });
    document.getElementById('res-clientes').textContent = DATOS.usuarios.length;
    document.getElementById('res-pagos').textContent = DATOS.pagos.length;
    document.getElementById('res-cobrado').textContent = formatearSoles(cobrado);
    document.getElementById('res-deuda').textContent = formatearSoles(deuda);
}

function renderTablaResumen() {
    const tbody = document.getElementById('tabla-resumen');
    tbody.innerHTML = '';

    DATOS.usuarios.forEach(usuario => {
        const { pagado, deuda } = totalesDeCliente(usuario.id);
        const estado = deuda === 0 ? badgeEstado('Pagado') : badgeEstado('Pendiente');
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td class="monto">${usuario.nombre}</td>
            <td>${DATOS.pagos.filter(p => p.id_usuario === usuario.id).length} pagos</td>
            <td class="monto">${formatearSoles(pagado)}</td>
            <td class="monto">${formatearSoles(deuda)}</td>
            <td>${estado}</td>
        `;
        tbody.appendChild(fila);
    });
}

function renderTablaClientes() {
    const tbody = document.getElementById('tabla-clientes');
    tbody.innerHTML = '';

    DATOS.usuarios.forEach(usuario => {
        const { pagado, deuda } = totalesDeCliente(usuario.id);
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td class="boleta">${usuario.id}</td>
            <td>${usuario.nombre}</td>
            <td>${usuario.email}</td>
            <td class="monto">${formatearSoles(pagado)}</td>
            <td class="monto">${formatearSoles(deuda)}</td>
            <td class="accion-cell">
                <div class="action-group">
                    <button class="btn-icon btn-editar" title="Editar cliente" aria-label="Editar cliente">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    </button>
                    <button class="btn-icon btn-danger btn-eliminar" title="Eliminar cliente" aria-label="Eliminar cliente">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </td>
        `;
        fila.querySelector('.btn-editar').addEventListener('click', () => abrirFormCliente(usuario));
        fila.querySelector('.btn-eliminar').addEventListener('click', () => eliminarCliente(usuario));
        tbody.appendChild(fila);
    });
}

function renderTablaPagos() {
    const tbody = document.getElementById('tabla-pagos-admin');
    tbody.innerHTML = '';

    DATOS.pagos.forEach(pago => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td class="boleta">${pago.id_pago}</td>
            <td>${nombreCliente(pago.id_usuario)}</td>
            <td>${pago.fecha}</td>
            <td>${pago.concepto}</td>
            <td class="monto">${formatearSoles(pago.monto)}</td>
            <td>${badgeEstado(pago.estado)}</td>
            <td class="accion-cell">
                <div class="action-group">
                    <button class="btn-icon btn-editar" title="Editar pago" aria-label="Editar pago">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    </button>
                    <button class="btn-icon btn-danger btn-eliminar" title="Eliminar pago" aria-label="Eliminar pago">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </td>
        `;
        fila.querySelector('.btn-editar').addEventListener('click', () => abrirFormPago(pago));
        fila.querySelector('.btn-eliminar').addEventListener('click', () => eliminarPago(pago));
        tbody.appendChild(fila);
    });
}

// 13. PESTAÑAS DEL PANEL ADMIN
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.tab-panel').forEach(p => {
            p.hidden = p.id !== 'tab-' + btn.dataset.tab;
        });
    });
});

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

// 15. FORMULARIO DE CLIENTE (nuevo/editar)
function abrirFormCliente(cliente) {
    const esNuevo = !cliente;
    const c = esNuevo ? { nombre: '', email: '', password: '123' } : cliente;

    abrirModal(esNuevo ? 'Nuevo cliente' : 'Editar cliente', `
        <div class="field">
            <label for="f-nombre">Nombre completo</label>
            <input type="text" id="f-nombre" value="${c.nombre}" required>
        </div>
        <div class="field">
            <label for="f-email">Correo electrónico</label>
            <input type="email" id="f-email" value="${c.email}" required>
        </div>
        <div class="field">
            <label for="f-password">Contraseña</label>
            <input type="text" id="f-password" value="${c.password}" required>
        </div>
        <button id="modal-submit" class="btn btn-primary btn-block" type="button">Guardar</button>
    `);

    document.getElementById('modal-submit').addEventListener('click', () => {
        const nombre = document.getElementById('f-nombre').value.trim();
        const email = document.getElementById('f-email').value.trim();
        const password = document.getElementById('f-password').value;

        if (!nombre || !email || !password) {
            alert('Completa todos los campos.');
            return;
        }
        const emailDuplicado = DATOS.usuarios.some(u =>
            u.email === email && (esNuevo || u.id !== c.id)
        );
        if (emailDuplicado) {
            alert('Ya existe un cliente con ese correo.');
            return;
        }

        if (esNuevo) {
            DATOS.usuarios.push({ id: nuevoIdUsuario(), nombre, email, password });
        } else {
            c.nombre = nombre;
            c.email = email;
            c.password = password;
        }

        guardarLocal();
        renderAdminAll();
        cerrarModal();
    });
}

// 16. FORMULARIO DE PAGO (nuevo/editar)
function abrirFormPago(pago) {
    const esNuevo = !pago;
    const opcionesUsuarios = DATOS.usuarios
        .map(u => `<option value="${u.id}" ${pago && pago.id_usuario === u.id ? 'selected' : ''}>${u.id} · ${u.nombre}</option>`)
        .join('');

    abrirModal(esNuevo ? 'Nuevo pago' : 'Editar pago', `
        <div class="field">
            <label for="f-usuario">Cliente</label>
            <select id="f-usuario" required>${opcionesUsuarios}</select>
        </div>
        <div class="field">
            <label for="f-fecha">Fecha</label>
            <input type="date" id="f-fecha" value="${pago ? pago.fecha : new Date().toISOString().slice(0, 10)}" required>
        </div>
        <div class="field">
            <label for="f-concepto">Concepto</label>
            <input type="text" id="f-concepto" value="${pago ? pago.concepto : ''}" placeholder="Mensualidad Agosto" required>
        </div>
        <div class="field">
            <label for="f-monto">Monto (S/)</label>
            <input type="number" id="f-monto" value="${pago ? pago.monto : ''}" min="0" step="0.01" required>
        </div>
        <div class="field">
            <label for="f-estado">Estado</label>
            <select id="f-estado" required>
                <option value="Pagado" ${pago && pago.estado === 'Pagado' ? 'selected' : ''}>Pagado</option>
                <option value="Pendiente" ${pago && pago.estado === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
            </select>
        </div>
        <button id="modal-submit" class="btn btn-primary btn-block" type="button">Guardar</button>
    `);

    document.getElementById('modal-submit').addEventListener('click', () => {
        const idUsuario = document.getElementById('f-usuario').value;
        const fecha = document.getElementById('f-fecha').value;
        const concepto = document.getElementById('f-concepto').value.trim();
        const monto = Number(document.getElementById('f-monto').value);
        const estado = document.getElementById('f-estado').value;

        if (!idUsuario || !fecha || !concepto || !(monto >= 0)) {
            alert('Completa todos los campos correctamente.');
            return;
        }

        if (esNuevo) {
            DATOS.pagos.push({ id_pago: nuevoIdPago(), id_usuario: idUsuario, fecha, concepto, monto, estado });
        } else {
            pago.id_usuario = idUsuario;
            pago.fecha = fecha;
            pago.concepto = concepto;
            pago.monto = monto;
            pago.estado = estado;
        }

        guardarLocal();
        renderAdminAll();
        cerrarModal();
    });
}

document.getElementById('btn-nuevo-cliente').addEventListener('click', () => abrirFormCliente(null));
document.getElementById('btn-nuevo-pago').addEventListener('click', () => abrirFormPago(null));

// 17. ELIMINAR CLIENTES Y PAGOS
function eliminarCliente(cliente) {
    const tienePagos = DATOS.pagos.some(p => p.id_usuario === cliente.id);
    const aviso = tienePagos
        ? 'Este cliente tiene pagos registrados, también se eliminarán.\n\n¿Eliminar a ' + cliente.nombre + '?'
        : '¿Eliminar a ' + cliente.nombre + '?';

    if (!confirm(aviso)) return;

    DATOS.usuarios = DATOS.usuarios.filter(u => u.id !== cliente.id);
    DATOS.pagos = DATOS.pagos.filter(p => p.id_usuario !== cliente.id);
    guardarLocal();
    renderAdminAll();
}

function eliminarPago(pago) {
    if (!confirm('¿Eliminar la boleta ' + pago.id_pago + ' (' + pago.concepto + ')?')) return;

    DATOS.pagos = DATOS.pagos.filter(p => p.id_pago !== pago.id_pago);
    guardarLocal();
    renderAdminAll();
}

// 18. DESCARGAR data.json PARA PUBLICAR EN GITHUB
document.getElementById('btn-descargar').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(DATOS, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    a.click();
    URL.revokeObjectURL(url);

    const texto = document.getElementById('publish-text');
    texto.innerHTML = 'Archivo descargado. Ahora <strong>reemplázalo</strong> en tu repositorio local (data.json), haz <strong>push</strong> a GitHub y los clientes verán los cambios.';
});

// 19. INICIO
cargarDatos();