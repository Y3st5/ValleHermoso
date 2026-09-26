# PUBLICA LOS DATOS: regenera el data.json desde los Excel y lo sube a GitHub.
# Es lo que invoca la macro del libro maestro (tools\modPublicar.bas).
#
#   1. revisa que el repo este limpio y al dia
#   2. baja lo que haya en GitHub
#   3. corre el importador (tools\importar-excel.ps1, sin tocarlo)
#   4. verifica que no se haya roto nada (tools\verificar.ps1)
#   5. respalda el data.json actual
#   6. reemplaza, hace commit y hace push
#
# CORRER CON pwsh 7, NUNCA con powershell.exe 5.1. Ver la nota de
# tools\importar-excel.ps1: 5.1 serializa los double como 50 y pwsh 7 como 50.0,
# lo que no cambia ni un centavo pero reescribe los ~15000 numeros del archivo.
#
#   pwsh -NoProfile -File tools\publicar.ps1
#   pwsh -NoProfile -File tools\publicar.ps1 -Simular

param(
    [string]$Repo = 'C:\Users\sis\Documents\GitHub\ValleHermoso',
    [string]$OrigenExcel = 'D:\VALLE HERMOSO\CUENTA POR PERSONA',
    [int]$AniosMax = 2026,
    [string]$Mensaje = '',
    [switch]$Simular,
    [switch]$SoloPush,
    [string]$Restaurar = ''
)

$ErrorActionPreference = 'Stop'

$rutaLog = Join-Path $Repo 'tools\publicar-ultimo.log'
$rutaCodigo = Join-Path $Repo 'tools\publicar-ultimo.codigo'
$lineas = New-Object System.Collections.Generic.List[string]
function Log([string]$t) {
    $lineas.Add($t)
    Write-Host $t
}
function Finalizar {
    if ($lineas.Count -gt 0) {
        try {
            [System.IO.File]::WriteAllLines($rutaLog, $lineas, (New-Object System.Text.UTF8Encoding($false)))
        } catch { }
    }
}
# El codigo de salida va en un archivo aparte porque VBA no puede leer el de
# un proceso launched con Shell(). Es lo unico que la macro usa para saber
# que paso.
function Salir([int]$codigo) {
    Log ''
    Log "CODIGO DE SALIDA: $codigo"
    Finalizar
    try {
        [System.IO.File]::WriteAllText($rutaCodigo, [string]$codigo, (New-Object System.Text.UTF8Encoding($false)))
    } catch { }
    exit $codigo
}
function Die([int]$codigo, [string]$t) {
    Log ''
    Log "!!! $t"
    Salir $codigo
}

# --- archivos que hay que dejar excluidos ------------------------------------
# El importador trae 4 nombres por defecto, pero la carpeta de esta PC tiene
# dos archivos mas que se cuelan y hay que quitar:
#   - "CAMARENA LOPEZ Wilder M." (con punto final): el default trae el nombre
#     SIN punto, asi que no matchea y se cuela como socio nuevo.
#   - "CTA X PERSONA CONSOLIDADA": es el consolidado, no una persona, pero su
#     celda A1 dice "VALLEJOS RIVEROS Eugenia" y trae 2025-2026, asi que se
#     fusiona con el socio real y lo deja duplicado.
# Se pasan por parametro, no editando el importador, para no tocar un archivo
# que ya esta verificado. Ademas asi el "n" de LOPEZ QUICANO viaja en UTF-8,
# cosa que no se puede conseguir desde la linea de comandos de VBA (ANSI).
$Excluir = @(
    'CAMARENA LOPEZ Wilder M',
    'CAMARENA LOPEZ Wilder M. 2017 AL 2026',
    'CAMARENA LOPEZ Wilder M.',
    'GUERRERO PORTILLA RUBEN',
    'LOPEZ QUICAÑO Gaby Elisa',
    'CTA X PERSONA CONSOLIDADA'
)

# --- resolvers ---------------------------------------------------------------
function Resolver-Git {
    $c = New-Object System.Collections.Generic.List[string]
    $enPath = Get-Command git -ErrorAction SilentlyContinue
    if ($enPath) { $c.Add($enPath.Source) }
    $gh = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'GitHubDesktop') -Filter 'git.exe' -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -like '*\git\cmd\git.exe' } | Select-Object -First 1
    if ($gh) { $c.Add($gh.FullName) }
    $c.Add((Join-Path $env:ProgramFiles 'Git\cmd\git.exe'))
    $c.Add((Join-Path ${env:ProgramFiles(x86)} 'Git\cmd\git.exe'))
    foreach ($x in $c) { if ($x -and (Test-Path -LiteralPath $x)) { return $x } }
    return $null
}

$GitPath = Resolver-Git

# --- helpers de git ----------------------------------------------------------
# -C va siempre antes del subcomando, asi que las opciones globales (--version)
# no pueden pasar por aqui.
function Invoke-Git {
    param([string[]]$Argumentos)
    $out = & $GitPath -C $Repo @Argumentos 2>&1
    $code = $LASTEXITCODE
    $txt = (@($out) | ForEach-Object { [string]$_ }) -join "`n"
    return [pscustomobject]@{ Codigo = $code; Texto = $txt.Trim() }
}

# ============================================================================
Log "================ PUBLICAR ================"
Log "repo         : $Repo"
Log "origen excel : $OrigenExcel"
Log "anios max    : $AniosMax"
Log "modo         : $(if ($SoloPush) { 'SOLO PUSH' } elseif ($Restaurar) { 'RESTAURAR RESPALDO' } elseif ($Simular) { 'SIMULAR (no toca el repo ni hace push)' } else { 'PUBLICAR' })"
Log "motor        : PowerShell $($PSVersionTable.PSVersion)"
Log ""

# --- modos que no necesitan los Excel -----------------------------------------
# -Restaurar y -SoloPush no importan nada: solo mueven el data.json o lo suben.
# Se atienden antes del preflight para que no dependan de que los Excel esten
# donde deben.

if ($Restaurar -or $SoloPush) {

    if ($PSVersionTable.PSVersion.Major -lt 7) { Die 5 "Hay que correr esto con pwsh 7." }
    if (-not $GitPath) { Die 3 "No se encontro git." }
    if (-not (Test-Path -LiteralPath (Join-Path $Repo '.git'))) { Die 4 "No es un repositorio git: $Repo" }
    $rama = (Invoke-Git @('rev-parse', '--abbrev-ref', 'HEAD')).Texto
    Log "rama         : $rama"
    Log ""

    if ($Restaurar) {
        Log "--- restaurando respaldo ---"
        if (-not (Test-Path -LiteralPath $Restaurar)) { Die 4 "No existe el respaldo: $Restaurar" }
        $dataJsonR = Join-Path $Repo 'data.json'
        Copy-Item -LiteralPath $Restaurar -Destination $dataJsonR -Force
        Log "data.json    : restaurado desde $Restaurar"
        $msgR = "restaurado data.json desde $(Split-Path $Restaurar -Leaf)"
        $addR = Invoke-Git @('add', 'data.json')
        if ($addR.Codigo -ne 0) { Die 3 "git add fallo: $($addR.Texto)" }
        $comR = Invoke-Git @('commit', '-m', $msgR)
        if ($comR.Codigo -ne 0) { Die 3 "git commit fallo: $($comR.Texto)" }
        $hashR = (Invoke-Git @('rev-parse', '--short', 'HEAD')).Texto
        Log "commit       : $hashR"
        Log ""
        Log "=== RESTAURADO. El commit esta solo en esta PC; usa Reintentar push si lo quieres subir ==="
        Salir 0
    }

    # SoloPush
    Log "--- subiendo lo pendiente ---"
    $fetch = Invoke-Git @('fetch', 'origin', $rama)
    if ($fetch.Codigo -ne 0) { Die 3 "git fetch fallo: $($fetch.Texto). Revisa la conexion a internet." }
    $adelantadoP = (Invoke-Git @('rev-list', '--count', "origin/$rama..HEAD")).Texto
    if ($adelantadoP -and [int]$adelantadoP -eq 0) {
        Log "No hay nada pendiente de subir."
        Log "=== PUSH: nada que hacer ==="
        Salir 0
    }
    Log "commits pendientes: $adelantadoP"
    $pushP = Invoke-Git @('push', 'origin', $rama)
    if ($pushP.Codigo -ne 0) {
        Die 7 "El push fallo otra vez. Revisa la conexion a internet. Dice: $($pushP.Texto)"
    }
    Log ""
    Log "=== PUSH OK ==="
    Salir 0
}

# --- 1. preflight -----------------------------------------------------------
if ($PSVersionTable.PSVersion.Major -lt 7) {
    Die 5 "Hay que correr esto con pwsh 7. Esto es PowerShell $($PSVersionTable.PSVersion). Con 5.1 se reescriben todos los numeros del data.json."
}
if (-not $GitPath) { Die 3 "No se encontro git. Instala Git o abre GitHub Desktop una vez." }
Log "git          : $GitPath"
Log "git version  : $((& $GitPath --version 2>&1) -join '')"
if (-not (Test-Path -LiteralPath $OrigenExcel)) { Die 4 "No existe la carpeta de Excel: $OrigenExcel" }
$cuantos = @(Get-ChildItem -LiteralPath $OrigenExcel -Filter *.xlsm).Count
Log "excels       : $cuantos .xlsm"
if ($cuantos -lt 20) { Die 4 "Solo hay $cuantos .xlsm en $OrigenExcel. No parece la carpeta correcta." }
if (-not (Test-Path -LiteralPath (Join-Path $Repo '.git'))) { Die 4 "No es un repositorio git: $Repo" }
Log ""

# --- 2. estado del repo -----------------------------------------------------
$st = Invoke-Git @('status', '--porcelain')
if ($st.Codigo -ne 0) { Die 3 "git status fallo: $($st.Texto)" }
if ($st.Texto.Trim()) {
    Log "HAY CAMBIOS SIN COMMITear en el repo:"
    $st.Texto -split "`n" | ForEach-Object { Log "   $_" }
    Die 4 "El repo tiene cambios sin commitear. Confirmalos o descartalos antes de publicar."
}
Log "repo         : limpio"

$rama = (Invoke-Git @('rev-parse', '--abbrev-ref', 'HEAD')).Texto
Log "rama         : $rama"

$adelantado = (Invoke-Git @('rev-list', '--count', "origin/$rama..HEAD")).Texto
if ($adelantado -and [int]$adelantado -gt 0) {
    Die 4 "Hay $adelantado commit(s) sin subir. Haz push antes de publicar, o el proximo push los mezcla."
}
Log ""

# --- 3. bajar lo que haya en GitHub -----------------------------------------
Log "--- bajando cambios de origin ---"
$pull = Invoke-Git @('pull', '--ff-only', 'origin', $rama)
if ($pull.Codigo -ne 0) {
    Die 3 "git pull fallo. Puede que alguien mas haya subido cambios y diverge. Resuelvelo a mano. Dice: $($pull.Texto)"
}
$pull.Texto -split "`n" | Where-Object { $_.Trim() } | ForEach-Object { Log "   $_" }
Log ""

# --- 4. importar ------------------------------------------------------------
$scriptImportador = Join-Path $Repo 'tools\importar-excel.ps1'
$scriptVerificar = Join-Path $Repo 'tools\verificar.ps1'
$dataJson = Join-Path $Repo 'data.json'
$dataNuevo = Join-Path $Repo 'data.nuevo.json'
$tmp = Join-Path $env:TEMP ('vallehermoso-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$reporteImp = Join-Path $tmp 'reporte-importador.txt'
$reporteVer = Join-Path $tmp 'reporte-verificacion.txt'

Log "--- importando (puede tardar un par de minutos) ---"
$sw = [Diagnostics.Stopwatch]::StartNew()
& $scriptImportador `
    -OrigenExcel $OrigenExcel `
    -DataJsonActual $dataJson `
    -Salida $dataNuevo `
    -Reporte $reporteImp `
    -AniosMax $AniosMax `
    -Excluir $Excluir *>&1 |
    ForEach-Object { $t = [string]$_; if ($t.Trim()) { Log $t } }
$sw.Stop()
Log "--- importacion terminada en $([math]::Round($sw.Elapsed.TotalSeconds,1)) s ---"
Log ""

if (-not (Test-Path -LiteralPath $dataNuevo)) { Die 6 "El importador no genero $dataNuevo. Revisa $reporteImp" }

$nuevoObj = Get-Content -LiteralPath $dataNuevo -Raw -Encoding UTF8 | ConvertFrom-Json
$nregs = ($nuevoObj.socios | ForEach-Object { $_.anios.Count } | Measure-Object -Sum).Sum
Log "generado     : $($nuevoObj.socios.Count) socios / $nregs registros anuales"
Log "reporte      : $reporteImp"
Log ""

# --- 5. verificar -----------------------------------------------------------
Log "--- verificando que no se rompio nada ---"
& $scriptVerificar -Nuevo $dataNuevo -Actual $dataJson -Reporte $reporteVer *>&1 |
    ForEach-Object { $t = [string]$_; if ($t.Trim()) { Log $t } }
$codVer = $LASTEXITCODE
Log ""
Log "reporte      : $reporteVer"
Log ""

if ($codVer -ne 0) {
    Die 2 "La verificacion encontro problemas. El data.json NO se toco. Esta todo igual que antes."
}

if ($Simular) {
    Log "=== SIMULACION TERMINADA. No se toco el repo, no se hizo commit ni push. ==="
    Salir 0
}

# --- 6. respaldar -----------------------------------------------------------
$sello = Get-Date -Format 'yyyyMMdd-HHmmss'
$respaldo = Join-Path $Repo "data.json.bak-$sello"
Copy-Item -LiteralPath $dataJson -Destination $respaldo -Force
Log "respaldo     : $respaldo"
Log ""

# --- 7. reemplazar ----------------------------------------------------------
Copy-Item -LiteralPath $dataNuevo -Destination $dataJson -Force
Log "data.json    : reemplazado"
Log ""

# --- 8. commit --------------------------------------------------------------
$st = Invoke-Git @('status', '--porcelain')
if (-not $st.Texto.Trim()) {
    Log "El data.json quedo igualito. No hay nada que commitear."
    Log "=== PUBLICADO (sin cambios) ==="
    Salir 0
}

if (-not $Mensaje) {
    $anios = ($nuevoObj.socios | ForEach-Object { $_.anios | ForEach-Object { $_.anio } } | Sort-Object -Unique) -join '-'
    $Mensaje = "datos al $((Get-Date).ToString('yyyy-MM-dd')): $($nuevoObj.socios.Count) socios, $nregs registros, $anios"
}
Log "commit       : $Mensaje"
$add = Invoke-Git @('add', 'data.json')
if ($add.Codigo -ne 0) { Die 3 "git add fallo: $($add.Texto)" }
$com = Invoke-Git @('commit', '-m', $Mensaje)
if ($com.Codigo -ne 0) { Die 3 "git commit fallo: $($com.Texto)" }
$hash = (Invoke-Git @('rev-parse', '--short', 'HEAD')).Texto
Log "commit       : $hash"
Log ""

# --- 9. push ----------------------------------------------------------------
$push = Invoke-Git @('push', 'origin', $rama)
if ($push.Codigo -ne 0) {
    Die 7 "COMMIT $hash HECHO en esta PC, pero el PUSH FALLO. Los socios todavia NO ven los cambios. Clic en Reintentar push. Dice: $($push.Texto)"
}
Log "push         : ok"
Log ""
Log "=== PUBLICADO ==="
Log "Los socios ya ven los datos nuevos en la pagina."
Log "respaldo del anterior: $respaldo"
Salir 0
