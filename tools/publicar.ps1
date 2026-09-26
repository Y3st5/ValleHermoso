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
    [switch]$RevisarVinculos,
    [switch]$VerificarFrescura,
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
Log "modo         : $(if ($VerificarFrescura) { 'REVISAR FRESCURA DE LOS EXCEL' } elseif ($SoloPush) { 'SOLO PUSH' } elseif ($Restaurar) { 'RESTAURAR RESPALDO' } elseif ($RevisarVinculos) { 'PUBLICAR + DIAGNOSTICO DE VINCULOS' } elseif ($Simular) { 'SIMULAR (no toca el repo ni hace push)' } else { 'PUBLICAR' })"
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

        # Si el respaldo resulto ser identico al archivo que ya estaba, git no
        # tiene nada que commitear y "git commit" sale con error. Sin este
        # chequeo el usuario veria un fallo rojo cuando en realidad no hay
        # nada que restaurar.
        $cambioR = Invoke-Git @('status', '--porcelain', '--', 'data.json')
        if ($cambioR.Codigo -ne 0) { Die 3 "git status fallo: $($cambioR.Texto)" }
        if (-not $cambioR.Texto.Trim()) {
            Log ""
            Log "El respaldo es identico al data.json que ya estaba."
            Log "=== RESTAURAR: no habia nada que hacer ==="
            Salir 0
        }

        $msgR = "restaurado data.json desde $(Split-Path $Restaurar -Leaf)"
        $addR = Invoke-Git @('add', 'data.json')
        if ($addR.Codigo -ne 0) { Die 3 "git add fallo: $($addR.Texto)" }
        $comR = Invoke-Git @('commit', '-m', $msgR)
        if ($comR.Codigo -ne 0) { Die 3 "git commit fallo: $($comR.Texto)" }
        $hashR = (Invoke-Git @('rev-parse', '--short', 'HEAD')).Texto
        Log "commit       : $hashR"
        Log ""
        Log "=== RESTAURADO ==="
        Log "Ojo: todavia NO se subiu. El portal sigue mostrando los datos de antes"
        Log "del restore. Si quieres que los socios vean el data.json restaurado,"
        Log "dale a Reintentar push."
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

# ============================================================================
#  VINCULOS DE LOS EXCEL DE SOCIO
#  Los archivos de CUENTA POR PERSONA no se teclean: sus numeros vienen por
#  vinculo desde INGRESOS Y EGRESOS 20XX. Si alguien escribio en el anual y no
#  refresco los individuales, el importador lee los numeros viejos que quedaron
#  guardados en el archivo del socio, y se publicaria informacion desactualizada
#  sin que se note.
#
#  Por eso se compara VALOR contra VALOR y no fecha contra fecha. Un anual que se
#  vuelve a guardar sin cambiar nada tiene fecha nueva pero datos iguales, y
#  comparando solo fechas saldria un falso positivo.
#
#  Nada de esto abre ni guarda ningun Excel. Solo se leen los .xlsm como zip.
# ============================================================================

# Valores numericos de un libro, como tabla "nombreHoja|direccion" -> numero.
# Las celdas de texto se ignoran: al importador solo le interesan los montos.
# Devuelve $null si el archivo no se puede leer (por ejemplo, si esta abierto).
function Get-NumerosLibro {
    param([string]$Ruta)
    $res = @{}
    $tmp = $null
    $zip = $null
    try {
        # Se copia primero porque Excel abre los archivos en modo compartido de
        # lectura pero bloquea la escritura, y ZipFile pide escritura.
        $tmp = Join-Path $env:TEMP ('vh-lee-' + [guid]::NewGuid().ToString('N') + '.zip')
        Copy-Item -LiteralPath $Ruta -Destination $tmp -Force
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [System.IO.Compression.ZipFile]::OpenRead($tmp)

        $e = $zip.Entries | Where-Object { $_.FullName -eq 'xl/workbook.xml' }
        if (-not $e) { return $null }
        $sr = [System.IO.StreamReader]::new($e.Open())
        $xml = $sr.ReadToEnd(); $sr.Close()
        $nombres = @([regex]::Matches($xml, '<sheet name="([^"]+)"') | ForEach-Object { $_.Groups[1].Value })

        $e = $zip.Entries | Where-Object { $_.FullName -eq 'xl/_rels/workbook.xml.rels' }
        if (-not $e) { return $null }
        $sr = [System.IO.StreamReader]::new($e.Open())
        $rels = $sr.ReadToEnd(); $sr.Close()
        $destinos = @([regex]::Matches($rels, 'Target="(worksheets/[^"]+)"') | ForEach-Object { $_.Groups[1].Value })

        for ($i = 0; $i -lt $nombres.Count -and $i -lt $destinos.Count; $i++) {
            $hoja = $nombres[$i]
            $e = $zip.Entries | Where-Object { $_.FullName -eq "xl/$($destinos[$i])" }
            if (-not $e) { continue }
            $sr = [System.IO.StreamReader]::new($e.Open())
            $sx = $sr.ReadToEnd(); $sr.Close()

            foreach ($m in [regex]::Matches($sx, '<c r="([A-Z]+[0-9]+)"([^>]*?)(?:/>|>(.*?)</c>)', 'Singleline')) {
                $attrs = $m.Groups[2].Value
                # t="s" es indice de texto compartido, t="str" texto de formula,
                # t="e" error, t="b" booleano. Ninguno es un monto.
                if ($attrs -match 't="(s|str|e|b|inlineStr)"') { continue }
                $v = [regex]::Match($m.Groups[3].Value, '<v>([^<]*)</v>')
                if (-not $v.Success) { continue }
                $d = 0.0
                if ([double]::TryParse($v.Groups[1].Value, [ref]$d)) { $res["$hoja|$($m.Groups[1].Value)"] = $d }
            }
        }
    } catch {
        return $null
    } finally {
        if ($zip) { try { $zip.Dispose() } catch { } }
        if ($tmp -and (Test-Path -LiteralPath $tmp)) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    }
    return $res
}

# Para un archivo de socio: que libro trae cada vinculo, y que valores tiene
# guardados de ese vinculo.
function Get-CacheVinculos {
    param([string]$Ruta)
    $tmp = $null
    $zip = $null
    try {
        $tmp = Join-Path $env:TEMP ('vh-lee-' + [guid]::NewGuid().ToString('N') + '.zip')
        Copy-Item -LiteralPath $Ruta -Destination $tmp -Force
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [System.IO.Compression.ZipFile]::OpenRead($tmp)

        $sources = @{}
        $cache = @{}
        $n = 1
        while ($true) {
            $e = $zip.Entries | Where-Object { $_.FullName -eq "xl/externalLinks/externalLink$n.xml" }
            if (-not $e) { break }
            $sr = [System.IO.StreamReader]::new($e.Open())
            $xml = $sr.ReadToEnd(); $sr.Close()

            # ruta del libro de origen
            $er = $zip.Entries | Where-Object { $_.FullName -eq "xl/externalLinks/_rels/externalLink$n.xml.rels" }
            $origen = $null
            if ($er) {
                $sr2 = [System.IO.StreamReader]::new($er.Open())
                $xr = $sr2.ReadToEnd(); $sr2.Close()
                $t = [regex]::Match($xr, 'Target="(file:[^"]+)"')
                if ($t.Success) {
                    $ruta = [System.Uri]::UnescapeDataString($t.Groups[1].Value) -replace '^file:///', ''
                    $origen = $ruta -replace '/', '\'
                }
            }

            # nombres de hoja: el sheetId del cache es el indice en esta lista
            $nombres = @([regex]::Matches($xml, '<sheetName val="([^"]*)"') | ForEach-Object { $_.Groups[1].Value })

            $celdas = @{}
            foreach ($sd in [regex]::Matches($xml, '<sheetData sheetId="(\d+)">(.*?)</sheetData>', 'Singleline')) {
                $hoja = [int]$sd.Groups[1].Value
                if ($hoja -ge $nombres.Count) { continue }
                $prefijo = "$($nombres[$hoja])|"
                foreach ($m in [regex]::Matches($sd.Groups[2].Value, '<cell r="([A-Z]+[0-9]+)"([^>]*?)(?:/>|>(.*?)</cell>)', 'Singleline')) {
                    if ($m.Groups[2].Value -match 't="(s|str|e|b)"') { continue }
                    $v = [regex]::Match($m.Groups[3].Value, '<v>([^<]*)</v>')
                    if (-not $v.Success) { continue }
                    $d = 0.0
                    if ([double]::TryParse($v.Groups[1].Value, [ref]$d)) {
                        $celdas["$prefijo$($m.Groups[1].Value)"] = $d
                    }
                }
            }

            if ($origen) { $sources[$n] = $origen }
            $cache[$n] = $celdas
            $n++
        }
    } catch {
        return $null
    } finally {
        if ($zip) { try { $zip.Dispose() } catch { } }
        if ($tmp -and (Test-Path -LiteralPath $tmp)) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    }
    return [pscustomobject]@{ Sources = $sources; Cache = $cache }
}

# Compara, para cada Excel de socio, los valores que tiene guardados del anual
# contra los valores que el anual tiene ahora.
#
# ATENCION: este chequeo DIAGNOSTICA, NO DECIDE. Se probo el 2026-09-26 y marco
# los 24 Excel como "vencidos" (entre 44 y 177 celdas distintas por socio), pero
# al refrescar de verdad los vinculos sobre copias, el data.json salio IDENTICO
# byte a byte al publicado. O sea que las diferencias estan en celdas de
# 'CUADRO DE DEUDA 2026' y 'DETALLE DE FACTURAS' que el importador no lee.
#
# Por eso NO bloquea la publicacion: si lo hiciera, cada publicacion pararia y
# nadie haria caso al aviso. Queda disponible con -RevisarVinculos para cuando
# haya que averiguar de donde salio una diferencia.
function Test-VinculosAlDia {
    $base = Split-Path -Parent $OrigenExcel
    $anuales = @{}
    foreach ($d in @(Get-ChildItem -LiteralPath $base -Directory -ErrorAction SilentlyContinue)) {
        if ($d.Name -notlike 'INGRESOS EGRESOS 20*') { continue }
        $f = @(Get-ChildItem -LiteralPath $d.FullName -File -ErrorAction SilentlyContinue |
               Where-Object { $_.Name -like 'INGRESOS*.xlsm' })
        if ($f.Count -gt 0) { $anuales[$f[0].FullName.ToLower()] = $f[0] }
    }
    if ($anuales.Count -eq 0) {
        Log "   no encontre las carpetas 'INGRESOS EGRESOS 20xx' al lado de $OrigenExcel."
        Log "   me salto la revision de vinculos (no la puedo hacer, no la hago pasar)."
        return
    }
    Log "   anuales a comparar: $($anuales.Count)"

    $vencidos = New-Object System.Collections.Generic.List[string]
    $nopudo = 0
    $revisados = 0
    $cacheAnuales = @{}

    foreach ($f in @(Get-ChildItem -LiteralPath $OrigenExcel -Filter *.xlsm | Sort-Object Name)) {
        $excluido = $false
        foreach ($e in $Excluir) { if ($f.BaseName -eq $e) { $excluido = $true; break } }
        if ($excluido) { continue }
        $revisados++

        $info = Get-CacheVinculos $f.FullName
        if (-not $info) { $nopudo++; continue }

        $diffs = 0
        $contra = ''
        foreach ($n in $info.Sources.Keys) {
            $clave = $info.Sources[$n].ToLower()
            if (-not $anuales.ContainsKey($clave)) { continue }
            if (-not $cacheAnuales.ContainsKey($clave)) {
                $cacheAnuales[$clave] = Get-NumerosLibro $anuales[$clave].FullName
            }
            $libro = $cacheAnuales[$clave]
            if ($null -eq $libro) { continue }
            foreach ($k in $info.Cache[$n].Keys) {
                if (-not $libro.ContainsKey($k)) { continue }
                $a = [double]$libro[$k]
                $b = [double]$info.Cache[$n][$k]
                if ([math]::Abs($a - $b) -gt 0.0000001) {
                    $diffs++
                    if (-not $contra) { $contra = Split-Path $anuales[$clave].Name -Leaf }
                }
            }
        }
        if ($diffs -gt 0) { $vencidos.Add("$($f.Name)  ($diffs valores distintos, contra $contra)") }
    }

    Log "   revisados: $revisados   con diferencias: $($vencidos.Count)   ilegibles: $nopudo"

    if ($vencidos.Count -gt 0) {
        Log ""
        Log "   (diagnostico) Estos Excel tienen celdas del vinculo que ya no coinciden"
        Log "   con el annual. No es motivo para frenar: la prueba del 2026-09-26 dio que"
        Log "   al refrescar de verdad el data.json sale igual. Se deja como dato."
        $vencidos | ForEach-Object { Log "   $_" }
    }
}

# --- 4. ¿los Excel de socio estan al dia? (prueba real) ---------------------
# Esta es la version que SI sirve, y es la que hay que usar.
#
# El problema: los archivos de CUENTA POR PERSONA no se teclean, sus numeros
# vienen por vinculo desde INGRESOS Y EGRESOS 20XX. Si se escribio en el anual
# y no se refrescaron los individuales, el importador lee lo que quedo guardado
# y se publica informacion vieja.
#
# Comparar fechas NO sirve (el anual se puede volver a guardar sin cambiar nada
# y despues sale con fecha nueva). Comparar el valor cacheado contra el del
# anual TAMPOCO sirve: se probo y marco los 24 Excel como vencidos, pero al
# refrescar de verdad las diferencias eran de celdas que el importador no lee.
#
# Asi que la unica forma exacta es la directa: se copia los Excel de socio a una
# carpeta temporal, se refrescan los vinculos SOLO en las copias, se corre el
# importador sobre esa carpeta y se compara el resultado con el data.json
# publicado.
#   - si sale identico  -> los Excel estan al dia, se puede publicar tranquilo
#   - si sale distinto  -> hay algo sin refrescar, o los Excel cambiaron de verdad
#
# No se toca ni un solo archivo de CUENTA POR PERSONA: todo pasa en la temporal.
function Test-ExcelAlDia {
    $sello = Get-Date -Format 'yyyyMMdd-HHmmss'
    $tmp = Join-Path $env:TEMP ('vh-frescura-' + $sello)
    # La salida va FUERA de $tmp, porque $tmp se borra en el finally de abajo.
    $salidaF = Join-Path $env:TEMP "vh-frescura-$sello.json"
    $copiados = 0
    $sw = [Diagnostics.Stopwatch]::StartNew()

    try {
        New-Item -ItemType Directory -Force -Path $tmp | Out-Null
        Log "   copiando los Excel de socio a una carpeta temporal..."
        foreach ($f in @(Get-ChildItem -LiteralPath $OrigenExcel -Filter *.xlsm | Sort-Object Name)) {
            $excluido = $false
            foreach ($e in $Excluir) { if ($f.BaseName -eq $e) { $excluido = $true; break } }
            if ($excluido) { continue }
            try {
                Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $tmp $f.Name) -Force -ErrorAction Stop
                $copiados++
            } catch {
                Log "   no se pudo copiar $($f.Name): $($_.Exception.Message)"
            }
        }
        Log "   copiados: $copiados"
        if ($copiados -lt 20) { Die 4 "Solo se pudieron copiar $copiados Excel. Cierra Excel y vuelve a intentar." }

        Log "--- refrescando vinculos en las copias (esto no toca tus Excel) ---"
        $xl = $null
        try {
            $xl = New-Object -ComObject Excel.Application
            $xl.Visible = $false
            $xl.DisplayAlerts = $false
            $xl.AskToUpdateLinks = $false
            $xl.AutomationSecurity = 3
            $n = 0
            foreach ($nombre in @(Get-ChildItem -LiteralPath $tmp -Filter *.xlsm | ForEach-Object { $_.Name })) {
                $ruta = Join-Path $tmp $nombre
                $abierto = $null
                try {
                    # UpdateLinks:=3 (xlUpdateLinksAlways), ReadOnly:=False
                    $abierto = $xl.Workbooks.Open($ruta, 3, $false)
                    $xl.CalculateFullRebuild()
                    $abierto.Save()
                    $n++
                } catch {
                    Log "   no se pudo refrescar $nombre : $($_.Exception.Message)"
                } finally {
                    if ($abierto) { try { $abierto.Close($false) } catch { } }
                }
            }
            Log "   refrescados: $n de $copiados"
            if ($n -lt 20) { Die 4 "Solo se refrescaron $n de $copiados Excel. Cierra Excel y vuelve a intentar." }
        } finally {
            if ($xl) { try { $xl.Quit() } catch { }; try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) } catch { } }
        }

        Log "--- importando desde las copias ya refrescadas ---"
        & (Join-Path $Repo 'tools\importar-excel.ps1') `
            -OrigenExcel $tmp `
            -DataJsonActual (Join-Path $Repo 'data.json') `
            -Salida $salidaF `
            -Reporte (Join-Path $tmp 'reporte.txt') `
            -AniosMax $AniosMax `
            -Excluir $Excluir *>&1 |
            ForEach-Object { $t = [string]$_; if ($t.Trim()) { Log $t } }
    } finally {
        $sw.Stop()
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }

    $sw.Stop()
    Log "   (tardo $([int]$sw.Elapsed.TotalSeconds) segundos)"
    Log ""
    return $salidaF
}

if ($VerificarFrescura) {
    Log "=== REVISANDO SI LOS EXCEL DE SOCIO ESTAN AL DIA ==="
    Log "Se va a leer en una copia temporal. Ningun Excel tuyo se modifica."
    Log ""
    $fresca = Test-ExcelAlDia
    if (-not $fresca -or -not (Test-Path -LiteralPath $fresca)) { Die 4 "No se pudo completar la revision." }

    $h1 = (Get-FileHash (Join-Path $Repo 'data.json') -Algorithm SHA256).Hash
    $h2 = (Get-FileHash $fresca -Algorithm SHA256).Hash

    if ($h1 -eq $h2) {
        Log "=== LOS EXCEL ESTAN AL DIA ==="
        Log "Al refrescar los vinculos, el data.json sale EXACTAMENTE igual al que esta"
        Log "publicado. Se puede publicar sin riesgo."
        Salir 0
    }

    Log "=== HAY DIFERENCIAS ==="
    Log "Al refrescar los vinculos, el data.json sale DISTINTO al publicado."
    Log "O sea que hay algo que todavia no se reflejó en los Excel de cada socio."
    Log ""
    & (Join-Path $Repo 'tools\verificar.ps1') `
        -Nuevo $fresca -Actual (Join-Path $Repo 'data.json') `
        -Reporte (Join-Path $env:TEMP 'vh-frescura-reporte.txt') *>&1 |
        ForEach-Object { $t = [string]$_; if ($t.Trim()) { Log $t } }
    Log ""
    Die 9 "Los Excel de socio no reflejan los numeros actuales. Abri cada uno, dejá que actualice los vinculos, guardá, y volvé a intentar."
}

# --- 5. diagnostico de vinculos (informativo, no frena) ----------------------
# Apagado por defecto. Cuando se activo, el resultado es dato de diagnostico y
# NO frena la publicacion (ver la nota en Test-VinculosAlDia).
if ($RevisarVinculos) {
    Log "--- revisando si los vinculos de los Excel de socio estan al dia (diagnostico) ---"
    Test-VinculosAlDia
    Log ""
}

# --- 5. importar ------------------------------------------------------------
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

# --- 6. verificar -----------------------------------------------------------
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

# --- 7. respaldar -----------------------------------------------------------
$sello = Get-Date -Format 'yyyyMMdd-HHmmss'
$respaldo = Join-Path $Repo "data.json.bak-$sello"
Copy-Item -LiteralPath $dataJson -Destination $respaldo -Force
Log "respaldo     : $respaldo"
Log ""

# --- 8. reemplazar ----------------------------------------------------------
Copy-Item -LiteralPath $dataNuevo -Destination $dataJson -Force
Log "data.json    : reemplazado"
Log ""

# --- 9. commit --------------------------------------------------------------
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

# --- 10. push ----------------------------------------------------------------
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
