# GUARDIA DE LA IMPORTACION.
# Compara el data.nuevo.json que genero el importador contra el data.json que
# esta publicado, y se niega a dejar pasar una importacion que borre o altere
# algo que ya existia.
#
# BLOQUEA (no deja continuar) si:
#   - cambia el bloque admin
#   - desaparece un socio
#   - cambia id, email, password o telefono de un socio que ya existia
#   - desaparece un anio que ya existia
#
# REPORTA sin bloquear si cambian los montos, porque eso si es legitimo: el
# Excel se esta actualizando. Cada ano que cambia se lista con su diferencia.
#
#   pwsh -NoProfile -File tools\verificar.ps1 -Nuevo data.nuevo.json -Actual data.json

param(
    [Parameter(Mandatory = $true)][string]$Nuevo,
    [Parameter(Mandatory = $true)][string]$Actual,
    [string]$Reporte
)

$ErrorActionPreference = 'Stop'

$lineas = New-Object System.Collections.Generic.List[string]
function Log([string]$t) { $lineas.Add($t); Write-Host $t }

# --- comparacion estructural -------------------------------------------------
# Normaliza objetos ordenando las claves para que el comparar no dependa del
# orden en que PowerShell las escribio. Los arrays NO se ordenan: el orden de
# las filas es informacion.
function Normalizar($o) {
    if ($null -eq $o) { return $null }
    if ($o -is [System.Collections.IDictionary]) {
        $h = [ordered]@{}
        foreach ($k in ($o.Keys | Sort-Object)) { $h[$k] = (Normalizar $o[$k]) }
        return $h
    }
    if ($o -is [string]) { return $o }
    if ($o -is [System.Collections.IEnumerable]) {
        $arr = @()
        foreach ($x in $o) { $arr += , (Normalizar $x) }
        return , $arr
    }
    return $o
}

function AJson($o) {
    return ((Normalizar $o) | ConvertTo-Json -Depth 30 -Compress)
}

function SoloMontos($a, $b) {
    # Misma cantidad de filas pero distinto texto: probablemente solo cambian
    # los importes o un rotulo. No es dano, es actualizacion.
    return ((@($a).Count) -eq (@($b).Count))
}

# --- carga -------------------------------------------------------------------
if (-not (Test-Path -LiteralPath $Nuevo)) { throw "No existe el archivo nuevo: $Nuevo" }
if (-not (Test-Path -LiteralPath $Actual)) { throw "No existe el data.json actual: $Actual" }

$nuevoObj = Get-Content -LiteralPath $Nuevo -Raw -Encoding UTF8 | ConvertFrom-Json
$actualObj = Get-Content -LiteralPath $Actual -Raw -Encoding UTF8 | ConvertFrom-Json

$bloqueos = New-Object System.Collections.Generic.List[string]
$cambios = New-Object System.Collections.Generic.List[string]
$nuevosS = New-Object System.Collections.Generic.List[string]

Log "================ VERIFICACION ================"
Log "actual : $Actual"
Log "nuevo  : $Nuevo"
Log "socios : actual=$($actualObj.socios.Count)  nuevo=$($nuevoObj.socios.Count)"
Log ""

# --- admin: nunca se toca ----------------------------------------------------
$aJson = AJson $actualObj.admin
$nJson = AJson $nuevoObj.admin
if ($aJson -ne $nJson) {
    $bloqueos.Add("El bloque admin cambio. Actual: $aJson  ->  Nuevo: $nJson")
    Log "  [BLOQUEO] admin modificado"
} else {
    Log "  [OK] admin identico"
}
Log ""

# --- mapa de socios actuales por id -----------------------------------------
$porId = @{}
foreach ($s in $actualObj.socios) { $porId[$s.id] = $s }

$vistos = @{}

foreach ($s in $nuevoObj.socios) {

    # id repetido: dos libros trayeron al mismo socio. No se puede publicar.
    if ($vistos.ContainsKey($s.id)) {
        $bloqueos.Add("El id $($s.id) aparece dos veces en el nuevo archivo ($($vistos[$s.id]) y $($s.nombre)).")
        continue
    }
    $vistos[$s.id] = $s.nombre

    $prev = $porId[$s.id]
    if (-not $prev) {
        $nuevosS.Add("$($s.id)  $($s.nombre)  ($($s.anios.Count) anios)")
        continue
    }

    # credenciales: el importador las preserva, si cambian algo se metio mano
    foreach ($campo in @('email', 'password', 'telefono')) {
        $a = [string]$prev.$campo
        $b = [string]$s.$campo
        if ($a -ne $b) {
            $bloqueos.Add("Credencial '$campo' cambio en $($s.id) ($($s.nombre)): '$a' -> '$b'")
        }
    }

    # nombre: el Excel manda, pero si se movio hay que avisar porque es la
    # clave con la que entra la gente al portal
    if ($prev.nombre -ne $s.nombre) {
        $cambios.Add("$($s.id)  nombre: '$($prev.nombre)' -> '$($s.nombre)'")
    }

    # anios que ya existian y desaparecieron: eso si es dano
    $prevAnios = @{}
    foreach ($a in $prev.anios) { $prevAnios[[int]$a.anio] = $a }
    $nuevosAnios = @{}
    foreach ($a in $s.anios) { $nuevosAnios[[int]$a.anio] = $a }

    foreach ($y in ($prevAnios.Keys | Sort-Object)) {
        if (-not $nuevosAnios.ContainsKey($y)) {
            $bloqueos.Add("El anio $y de $($s.id) ($($s.nombre)) desaparecio.")
            continue
        }
        $pa = $prevAnios[$y]
        $na = $nuevosAnios[$y]
        if ((AJson $pa) -eq (AJson $na)) { continue }

        $det = "anio $y de $($s.id) ($($s.nombre)): "
        if (-not (SoloMontos $pa.obligaciones $na.obligaciones)) {
            $det += "obligaciones $($pa.obligaciones.Count)->$($na.obligaciones.Count), "
        }
        if (-not (SoloMontos $pa.aportaciones $na.aportaciones)) {
            $det += "aportaciones $($pa.aportaciones.Count)->$($na.aportaciones.Count), "
        }
        if (-not (SoloMontos $pa.totales $na.totales)) {
            $det += "totales $($pa.totales.Count)->$($na.totales.Count)"
        }
        $cambios.Add($det)
    }

    # anios nuevos: es lo normal, solo se listan
    foreach ($y in ($nuevosAnios.Keys | Sort-Object)) {
        if (-not $prevAnios.ContainsKey($y)) {
            $cambios.Add("anio $y NUEVO en $($s.id) ($($s.nombre))")
        }
    }
}

# --- socios que estaban y ya no estan --------------------------------------
foreach ($id in ($porId.Keys | Sort-Object)) {
    if (-not $vistos.ContainsKey($id)) {
        $bloqueos.Add("El socio $id ($($porId[$id].nombre)) desaparecio del archivo nuevo.")
    }
}

# --- reporte -----------------------------------------------------------------
Log "CAMBIOS DETECTADOS ($($cambios.Count)) -- informational, no bloquean:"
if ($cambios.Count -eq 0) { Log "  ninguno" }
else { $cambios | ForEach-Object { Log "  $_" } }
Log ""
Log "SOCIOS NUEVOS ($($nuevosS.Count)) -- informational:"
if ($nuevosS.Count -eq 0) { Log "  ninguno" }
else { $nuevosS | ForEach-Object { Log "  $_" } }
Log ""
Log "BLOQUEOS ($($bloqueos.Count)) -- si hay mas de 0, NO se publica:"
if ($bloqueos.Count -eq 0) { Log "  ninguno" }
else { $bloqueos | ForEach-Object { Log "  ! $_" } }
Log ""

$ok = ($bloqueos.Count -eq 0)
Log "RESULTADO: $(if ($ok) { 'OK' } else { 'ABORTAR' })"

if ($Reporte) {
    [System.IO.File]::WriteAllLines($Reporte, $lineas, (New-Object System.Text.UTF8Encoding($false)))
}

if (-not $ok) { exit 2 }
exit 0
