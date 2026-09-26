# CORRER CON pwsh 7, NO con powershell.exe 5.1.
# 5.1 serializa los double como "50" y pwsh 7 como "50.0". El data.json publicado
# esta en formato pwsh 7, asi que correrlo en 5.1 no cambia ni un centavo pero
# reescribe todos los numeros del archivo: el diff de git pasa a marcar las
# ~15000 lineas y es imposible de revisar.
#   pwsh -NoProfile -File tools\importar-excel.ps1
param(
    [string]$OrigenExcel = "D:\OneDrive_Juan\OneDrive\Escritorio\VALLHERMOSOPORPERSONA",
    [string]$DataJsonActual = "D:\OneDrive_Juan\GitHub\ValleHermoso\data.json",
    [string]$Salida = "D:\OneDrive_Juan\GitHub\ValleHermoso\data.nuevo.json",
    [string]$Reporte = "C:\Users\vales\AppData\Local\Temp\opencode\reporte.txt",
    [int]$AniosMax = 2026,
    [string[]]$Excluir = @("CAMARENA LOPEZ Wilder M", "CAMARENA LOPEZ Wilder M. 2017 AL 2026", "GUERRERO PORTILLA RUBEN", "LOPEZ QUICAÑO Gaby Elisa")
)

$ErrorActionPreference = 'Stop'
$lineas = New-Object System.Collections.Generic.List[string]
function Log([string]$t) { $lineas.Add($t); Write-Host $t }

$ConceptsIgnorar = @('DEUDA TOTAL', 'TOTAL INGRESOS', 'SALDO FINAL', 'DEUDA FINAL', 'ABONOS REALIZADOS', 'TOTAL GENERAL', 'POR COBRAR')
$avisos = New-Object System.Collections.Generic.List[string]

# --- errores de Excel (#N/A = 0x800A07FA, #REF!, #DIV/0!, etc.) llegan como enteros negativos ---
$celdasError = New-Object System.Collections.Generic.List[string]
function EsError($v) {
    if ($null -eq $v) { return $false }
    if ($v -is [int] -or $v -is [double] -or $v -is [decimal]) { return ([double]$v -lt -1000000000) }
    return $false
}
function EsNumero($v) {
    if ($null -eq $v) { return $false }
    return ($v -is [int] -or $v -is [double] -or $v -is [decimal])
}

# Clasifica las filas de TOTALES tolerando espacios y typos del Excel
# (hay celdas con " TOTAL INGRESOS " y tambien "OTAL INGRESOS" sin la T).
function ClasificarTotal([string]$txt) {
    if ($null -eq $txt) { return $null }
    $n = ($txt.ToUpper() -replace '[^A-Z]', '')
    if ($n -eq '') { return $null }
    # coincidencia por subcadena a proposito: tolera el typo "OTAL INGRESOS" (sin la T)
    if ($n.Contains('OTALINGRESOS')) { return 'TOTAL_INGRESOS' }
    if ($n.Contains('DEUDAFINAL')) { return 'DEUDA_FINAL' }
    if ($n.Contains('DEUDATOTAL')) { return 'DEUDA_TOTAL' }
    if ($n.Contains('SALDOFINAL')) { return 'SALDO_FINAL' }
    if ($n.Contains('ABONOSREALIZADOS')) { return 'ABONOS' }
    return $null
}

# --- montos: el formato contable de Excel muestra 0 como "-"; se traduce a null ---
function ComoMonto($v, $txt) {
    if ($null -eq $v) { return $null }
    if (EsError $v) { return $null }
    if ($v -is [double] -or $v -is [int] -or $v -is [decimal]) {
        $d = [double]$v
        if ($d -eq 0 -and $txt -and $txt.Trim() -eq '-') { return $null }
        return [math]::Round($d, 2)
    }
    return $null
}
function ComoMontoExacto($v) {
    if ($null -eq $v) { return $null }
    if (EsError $v) { return $null }
    if ($v -is [double] -or $v -is [int] -or $v -is [decimal]) { return [double]$v }
    return $null
}
function ComoTexto($v) { if ($null -eq $v) { return '' } if (EsError $v) { return '' } return (([string]$v).Trim()) }
function ComoTextoT($t) { if ($null -eq $t) { return '' } return ([string]$t).Trim() }
function ComoRecibo($v) {
    if ($null -eq $v) { return '' }
    if (EsError $v) { return '' }
    if ($v -is [double]) { if ([math]::Floor([double]$v) -eq [double]$v) { return ([string][int]$v) } return ([string]$v) }
    return (([string]$v).Trim())
}

# --- credenciales previas ---
$previos = @{}
if (Test-Path -LiteralPath $DataJsonActual) {
    $prev = Get-Content -LiteralPath $DataJsonActual -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($s in $prev.socios) { $previos[$s.nombre] = $s }
    Log "Credenciales previas cargadas: $($prev.socios.Count)"
}

function ClaveNombre([string]$n) {
    $k = $n.ToLower() -replace '[,\.]', ' '
    return ($k -replace '\s+', ' ').Trim()
}

$usados = New-Object System.Collections.Generic.HashSet[string]
function GenerarEmail([string]$nombre) {
    $partes = @($nombre -split '\s+' | Where-Object { $_ })
    if ($partes.Count -lt 2) { return ($partes[0].ToLower() + '@email.com') }
    $apellido = ($partes[0] -replace '[^\w]', '')
    $nombreP = ($partes[$partes.Count - 1] -replace '[^\w]', '')
    $base = "$nombreP.$apellido".ToLower()
    $cand = "$base@email.com"; $i = 2
    while ($usados.Contains($cand)) { $cand = "$base$i@email.com"; $i++ }
    return $cand
}

$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.AutomationSecurity = 3

$socios = New-Object System.Collections.Generic.List[object]
$omitidos = [ordered]@{}
$descuadres = New-Object System.Collections.Generic.List[object]
$rotulos = New-Object System.Collections.Generic.List[object]
$archivos = Get-ChildItem -LiteralPath $OrigenExcel -Filter *.xlsm | Sort-Object Name

foreach ($f in $archivos) {
    $base = $f.BaseName
    if ($Excluir -contains $base) { $omitidos[$base] = 'excluido por decision del usuario'; continue }

    $wb = $xl.Workbooks.Open($f.FullName, $null, $true)
    $ws = $wb.Worksheets.Item(1)
    $ur = $ws.UsedRange
    $maxR = $ur.Rows.Count
    $maxC = [Math]::Max($ur.Columns.Count, 6)
    $rng = $ws.Range($ws.Cells.Item(1, 1), $ws.Cells.Item($maxR, $maxC))
    $G = $rng.Value2
    $T = $rng.Text

    $nombre = ComoTexto $G[1, 1]
    $tCambio = ComoMontoExacto $G[1, 3]

    for ($rr = 1; $rr -le $maxR; $rr++) {
        for ($cc = 1; $cc -le $maxC; $cc++) {
            if (EsError $G[$rr, $cc]) { $celdasError.Add("$base R${rr}C${cc}") }
        }
    }

    $filasAnio = @()
    for ($r = 4; $r -le $maxR; $r++) {
        $v = $G[$r, 1]
        if ($v -is [double] -or $v -is [int]) {
            $y = [int][math]::Round([double]$v, 0)
            if ($y -ge 1900 -and $y -le 2100) { $filasAnio += , @($y, $r) }
        }
    }

    $anios = New-Object System.Collections.Generic.List[object]

    for ($i = 0; $i -lt $filasAnio.Count; $i++) {
        $anio = $filasAnio[$i][0]
        $rIni = $filasAnio[$i][1] + 1
        $rFin = if ($i -lt $filasAnio.Count - 1) { $filasAnio[$i + 1][1] - 1 } else { $maxR }

        $obl = New-Object System.Collections.Generic.List[object]
        $apo = New-Object System.Collections.Generic.List[object]
        $extras = New-Object System.Collections.Generic.List[object]
        $sheetDeuda = $null; $sheetSaldo = $null

        for ($r = $rIni; $r -le $rFin; $r++) {
            $cA = ComoTexto $G[$r, 1]
            $cB = $G[$r, 2]; $cBt = $T[$r, 2]
            $cC = $G[$r, 3]
            $cD = $G[$r, 4]
            $cEraw = $G[$r, 5]
            $cF = $G[$r, 6]; $cFt = $T[$r, 6]

            # aportes (D/E/F). En las filas de obligacion la columna E trae un 0 numerico
            # (no un concepto) y en las filas de totales trae un espacio: solo cuenta
            # como aportacion si E es texto real o D trae numero de recibo.
            $recAp = ComoRecibo $cD
            $eEsTexto = ($null -ne $cEraw) -and -not (EsError $cEraw) -and -not (EsNumero $cEraw)
            $cE = if ($eEsTexto) { ([string]$cEraw).Trim() } else { '' }
            $clase = ClasificarTotal $cE

            if ($clase) {
                if ($clase -eq 'SALDO_FINAL') { $sheetSaldo = ComoMonto $cF $cFt }
                if ($clase -eq 'ABONOS') { $extras.Add([ordered]@{ concepto = $cE; monto = (ComoMonto $cF $cFt) }) }
            } elseif ($cE -ne '' -or $recAp -ne '') {
                $apo.Add([ordered]@{ recibo = $recAp; concepto = $cE; monto = (ComoMonto $cF $cFt) })
            } else {
                # abono sin concepto ni recibo en D/E: el numero va en C y el monto en F
                $montoF = ComoMonto $cF $cFt
                if ($null -ne $montoF -and $montoF -ne 0) {
                    $apo.Add([ordered]@{ recibo = (ComoRecibo $cC); concepto = ''; monto = $montoF })
                }
            }

            # obligaciones (A/B/C)
            if ($cA -eq '') { continue }
            $up = $cA.ToUpper()
            if ((ClasificarTotal $cA) -eq 'DEUDA_TOTAL') { $sheetDeuda = ComoMonto $cB $cBt; continue }
            if ($ConceptsIgnorar -contains $up) { continue }
            if ($up -like '20*' -and $null -eq $cB -and $null -eq $cC) { continue }

            $monto = ComoMonto $cB $cBt
            $texto = ''
            if ($null -eq $monto) {
                $tb = ComoTextoT $cBt
                if ($tb -ne '' -and $tb -ne '-') { $texto = $tb }
            }
            $recibo = ComoRecibo $cC
            $concepto = $cA
            # El Excel rotula el saldo arrastrado a mano y se equivoca seguido: en el bloque
            # 2021 dice "AL CIERRE 2021", en 2024 dice "AL CIERRE 2022", y en 2017 dice
            # "AL CIERRE 20176". El monto si es el cierre del anio anterior, asi que se
            # corrige solo el rotulo. El monto nunca se toca.
            if ($cA -match '^\s*SALDO\s+DEUDA\s+AL\s+CIERRE\s+\d+\s*$') {
                $prevAnio = $anio - 1
                $concepto = "SALDO DEUDA AL CIERRE $prevAnio"
                $rotulos.Add([pscustomobject]@{ Socio = $nombre; Anio = $anio; Excel = $cA.Trim(); Corregido = $concepto })
            }
            $o = [ordered]@{ concepto = $concepto; monto = $monto }
            if ($recibo -ne '') { $o['recibo'] = $recibo }
            if ($texto -ne '') { $o['texto'] = $texto }
            $obl.Add($o)
        }

        $tIng = 0.0; foreach ($x in $apo) { if ($null -ne $x.monto) { $tIng += [double]$x.monto } }
        $tDeb = 0.0; foreach ($x in $obl) { if ($null -ne $x.monto) { $tDeb += [double]$x.monto } }
        $tIng = [math]::Round($tIng, 2); $tDeb = [math]::Round($tDeb, 2)
        $tSal = [math]::Round($tDeb - $tIng, 2)

        if ($null -ne $sheetDeuda -and [math]::Abs($sheetDeuda - $tDeb) -gt 0.005) {
            $descuadres.Add([pscustomobject]@{ Socio = $nombre; Anio = $anio; Tipo = 'DEUDA TOTAL'; Hoja = $sheetDeuda; Calculado = $tDeb; Dif = [math]::Round($sheetDeuda - $tDeb, 2) })
        }
        if ($null -ne $sheetSaldo -and [math]::Abs($sheetSaldo - $tSal) -gt 0.005) {
            $descuadres.Add([pscustomobject]@{ Socio = $nombre; Anio = $anio; Tipo = 'SALDO FINAL'; Hoja = $sheetSaldo; Calculado = $tSal; Dif = [math]::Round($sheetSaldo - $tSal, 2) })
        }

        $norm = New-Object System.Collections.Generic.List[object]
        $norm.Add([ordered]@{ concepto = 'TOTAL INGRESOS'; monto = $tIng })
        $norm.Add([ordered]@{ concepto = 'DEUDA TOTAL'; monto = $tDeb })
        $norm.Add([ordered]@{ concepto = 'SALDO FINAL'; monto = $tSal })
        foreach ($e in $extras) { $norm.Add($e) }

        $anios.Add([ordered]@{ anio = $anio; obligaciones = $obl.ToArray(); aportaciones = $apo.ToArray(); totales = $norm.ToArray() })
    }

    $wb.Close($false)

    $utiles = @($anios.ToArray() | Where-Object { $_.anio -le $AniosMax })
    if ($utiles.Count -eq 0) { $omitidos[$base] = "sin anios hasta $AniosMax"; continue }

    $prev = $null
    foreach ($k in $previos.Keys) { if ((ClaveNombre $k) -eq (ClaveNombre $nombre)) { $prev = $previos[$k]; break } }
    if ($prev) { $email = $prev.email; $tel = $prev.telefono; $pass = $prev.password; $id = $prev.id }
    else { $email = GenerarEmail $nombre; $tel = ''; $pass = '123'; $id = '' }
    if ($email) { [void]$usados.Add($email) }

    $socios.Add([pscustomobject]@{
        _idPrev = $id; _existed = [bool]$prev; _file = $f.Name
        socio   = [ordered]@{ id = $id; nombre = $nombre; email = $email; password = $pass; telefono = $tel; t_cambio = $tCambio; anios = $utiles }
    })
}

$xl.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl)

$orden = New-Object System.Collections.Generic.List[object]
foreach ($s in $socios) { if ($s._idPrev) { $orden.Add($s) } }
foreach ($s in $socios) { if (-not $s._idPrev) { $orden.Add($s) } }
$maxId = 0
foreach ($s in $orden) { if ($s._idPrev) { $n2 = [int]($s._idPrev -replace '\D', ''); if ($n2 -gt $maxId) { $maxId = $n2 } } }
foreach ($s in $orden) { if (-not $s._idPrev) { $maxId++; $s.socio['id'] = 'SOC-{0:D4}' -f $maxId } }

$out = [ordered]@{ admin = $null; socios = @($orden.ToArray() | ForEach-Object { $_.socio } | Sort-Object { [int]($_.id -replace '\D', '') }) }
if (Test-Path -LiteralPath $DataJsonActual) {
    $prevRaw = Get-Content -LiteralPath $DataJsonActual -Raw -Encoding UTF8 | ConvertFrom-Json
    $out['admin'] = $prevRaw.admin
}
[System.IO.File]::WriteAllText($Salida, ($out | ConvertTo-Json -Depth 20), (New-Object System.Text.UTF8Encoding($false)))

Log ""
Log "================ REPORTE ================"
Log "Socios generados : $($out.socios.Count)"
Log "  con credencial previa : $(@($orden.ToArray() | Where-Object { $_._existed }).Count)"
Log "  credenciales nuevas   : $(@($orden.ToArray() | Where-Object { -not $_._existed }).Count)"
Log ""
Log "OMITIDOS:"
foreach ($k in $omitidos.Keys) { Log "  - $k  ($($omitidos[$k]))" }
Log ""
Log "DESCUADRES Excel vs calculado (total: $($descuadres.Count)):"
if ($descuadres.Count -eq 0) { Log "  ninguno" }
else { $descuadres | ForEach-Object { Log ("  {0,-38} {1}  {2,-12} hoja={3,10} calc={4,10} dif={5}" -f $_.Socio, $_.Anio, $_.Tipo, $_.Hoja, $_.Calculado, $_.Dif) } }
Log ""
Log "ROTULOS 'SALDO DEUDA AL CIERRE' CORREGIDOS (solo el texto, el monto no se toco): $($rotulos.Count)"
if ($rotulos.Count -gt 0) { $rotulos | ForEach-Object { Log ("  {0,-38} {1}  '{2}' -> '{3}'" -f $_.Socio, $_.Anio, $_.Excel, $_.Corregido) } }
Log ""
Log "Celdas con error de Excel tratadas como null: $($celdasError.Count)"
if ($celdasError.Count -gt 0) { $celdasError | ForEach-Object { Log "  $_" } }
Log ""
Log "--- Socio / anios / t_cambio ---"
foreach ($s in $orden) {
    $rango = (($s.socio.anios | ForEach-Object { $_.anio }) -join ',')
    Log ("{0,-10} {1,-40} n={2,-2} tc={3,-7} [{4}]" -f $s.socio.id, $s.socio.nombre, $s.socio.anios.Count, $s.socio.t_cambio, $rango)
}
[System.IO.File]::WriteAllLines($Reporte, $lineas, (New-Object System.Text.UTF8Encoding($false)))
Log ""
Log "Salida : $Salida"
