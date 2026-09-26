Attribute VB_Name = "modPublicar"
Option Explicit

' ===========================================================================
'  PORTADA VALLEHERMOSO
'  Regenera el data.json desde los Excel de cada socio y lo publica en GitHub
'  con un solo click. No hay backend: sigue siendo una pagina estatica en
'  GitHub Pages, lo unico que cambia es que el push lo hace la macro.
'
'  Este modulo NO lee los Excel de los socios. Eso lo hace
'  tools\importar-excel.ps1, que ya esta verificado y ya resuelve los detalles
'  raros de Excel (celdas #N/A, el formato contable que muestra 0 como "-",
'  los rotulos mal escritos de "AL CIERRE", el typo "OTAL INGRESOS").
'  Ac aqui solo se invoca ese script y se publica lo que devuelve.
'
'  Para que el codigo guardado en el repo (tools\modPublicar.bas) y el de
'  este libro no se separen: si cambias algo aqui, exportalo con
'  Alt+F11 > Archivo > Exportar archivo > tools\modPublicar.bas
' ===========================================================================

Private Const HOJA_CONFIG As String = "CONFIG"
Private Const HOJA_PORTADA As String = "Portada"

' codigos de salida de publicar.ps1
Private Const COD_OK As Long = 0
Private Const COD_VERIFICACION As Long = 2
Private Const COD_GIT As Long = 3
Private Const COD_PREVIO As Long = 4
Private Const COD_MOTOR As Long = 5
Private Const COD_IMPORTADOR As Long = 6
Private Const COD_PUSH As Long = 7


' ===========================================================================
'  BOTONES
' ===========================================================================

' Importa, verifica, reemplaza el data.json, hace commit y push.
Public Sub PublicarDatos()
    If Not Confirmar("Se van a abrir los 29 Excel de cada socio, pueden tardar un par de minutos. Excel se vera lento mientras tanto. Continuar?") Then Exit Sub

    If Not RevisarExcelAbierto() Then Exit Sub

    PonerEstado("Importando y publicando... no cierres esta ventana.")
    DoEvents

    Dim cod As Long
    cod = Ejecutar("")

    LimpiarEstado

    Select Case cod
        Case COD_OK
            Aviso "Listo", "Datos publicados." & vbCrLf & vbCrLf & _
                  "Los socios ya ven la informacion nueva en la pagina." & vbCrLf & _
                  "Tarda un minuto o dos en actualizarse."
        Case COD_PUSH
            Aviso "Falto el push", _
                  "Los datos SE GENERARON y el commit quedo hecho en esta PC," & vbCrLf & _
                  "pero no se pudieron subir a GitHub." & vbCrLf & vbCrLf & _
                  "Los socios TODAVIA no ven los cambios." & vbCrLf & _
                  "Revisa tu conexion a internet y dale a Reintentar push." & vbCrLf & vbCrLf & _
                  "No se perdio nada: el data.json viejo esta en el historial de git."
        Case COD_VERIFICACION
            Aviso "No se publico", _
                  "La verificacion encontro algo que no cuadra, asi que el data.json NO se toco." & vbCrLf & vbCrLf & _
                  "Casi siempre es que un Excel de socio cambio de estructura." & vbCrLf & _
                  "Abre el log para ver el detalle."
        Case COD_PREVIO, COD_MOTOR
            Aviso "No se pudo empezar", _
                  "Hay algo que arreglar antes de importar. El data.json NO se toco." & vbCrLf & vbCrLf & _
                  "Abre el log para ver el detalle."
        Case COD_IMPORTADOR, COD_GIT
            Aviso "Falló", _
                  "No se pudo completar. El data.json NO se toco." & vbCrLf & vbCrLf & _
                  "Abre el log para ver el detalle."
        Case Else
            Aviso "Sin respuesta", _
                  "El script no devolvio un codigo de salida (codigo " & cod & ")." & vbCrLf & _
                  "Puede que no este PowerShell 7 instalado. Abre el log."
    End Select
End Sub


' Importa y verifica, pero NO toca el repo ni hace push.
' Sirve para ver que cambiaria sin publicar nada.
Public Sub SimularPublicacion()
    If Not Confirmar("Simulacion: se importan los Excel y se compara contra el data.json publicado, pero NO se reemplaza nada, NO hay commit y NO hay push. Continuar?") Then Exit Sub

    If Not RevisarExcelAbierto() Then Exit Sub

    PonerEstado("Simulando... no cierres esta ventana.")
    DoEvents

    Dim cod As Long
    cod = Ejecutar("-Simular")

    LimpiarEstado

    If cod = COD_OK Then
        Aviso "Simulacion terminada", _
              "No se publico nada." & vbCrLf & vbCrLf & _
              "El log tiene el detalle de que habria cambiado." & vbCrLf & _
              "Si todo esta bien, ya puedes darle Publicar."
    Else
        Aviso "La simulacion fallo", "No se toco nada. Abre el log para ver el detalle."
    End If
End Sub


' Sube el commit que quedo pendiente. No vuelve a importar.
Public Sub ReintentarPush()
    PonerEstado("Subiendo...")
    DoEvents

    Dim cod As Long
    cod = Ejecutar("-SoloPush")

    LimpiarEstado

    If cod = COD_OK Then
        Aviso "Subido", "Los cambios ya estan en GitHub. Los socios los ven en la pagina."
    Else
        Aviso "No se pudo subir", _
              "El push fallo otra vez. Revisa la conexion a internet." & vbCrLf & vbCrLf & _
              "Abre el log para ver el detalle."
    End If
End Sub


' Vuelve a poner el data.json del ultimo respaldo.
Public Sub RestaurarUltimoRespaldo()
    Dim ruta As String
    ruta = UltimoRespaldo()
    If Len(ruta) = 0 Then
        Aviso "No hay respaldos", "Todavia no se genero ningun respaldo."
        Exit Sub
    End If

    If Not Confirmar("Se va a reemplazar el data.json actual por este respaldo:" & vbCrLf & vbCrLf & _
                     ruta & vbCrLf & vbCrLf & _
                     "El commit con los datos nuevos sigue en git, asi que nada se pierde de forma permanente.") Then Exit Sub

    PonerEstado("Restaurando...")
    DoEvents

    Dim cod As Long
    cod = Ejecutar("-Restaurar """ & ruta & """")

    LimpiarEstado

    If cod = COD_OK Then
        Aviso "Restaurado", "El data.json volvio al estado anterior. El commit se puede deshacer con git si quieres."
    Else
        Aviso "No se pudo restaurar", "Abre el log para ver el detalle."
    End If
End Sub


' Abre el log de la ultima corrida en el Bloc de notas.
Public Sub AbrirLog()
    If Len(Dir$(RutaLog())) = 0 Then
        Aviso "Sin log", "Todavia no se corrio ninguna publicacion."
        Exit Sub
    End If
    Shell "notepad.exe """ & RutaLog() & """", vbNormalFocus
End Sub


' Al abrir el libro, avisa como quedo la ultima corrida.
Public Sub Auto_Open()
    On Error Resume Next
    If Len(Dir$(RutaCodigo())) = 0 Then Exit Sub
    If Len(Dir$(RutaLog())) = 0 Then Exit Sub

    Dim f As Integer
    Dim cod As Long
    f = FreeFile
    Open RutaCodigo() For Input As #f
    cod = Val(Trim$(Input$(LOF(f), f)))
    Close #f

    Select Case cod
        Case COD_OK
            Aviso "Ultima publicacion", "Termino bien. Los datos estan publicados."
        Case COD_PUSH
            Aviso "Pendiente un push", _
                  "La ultima vez los datos se generaron y se commitearon, pero el push fallo." & vbCrLf & _
                  "Clic en Reintentar push."
    End Select
End Sub


' ===========================================================================
'  EJECUCION
' ===========================================================================

' Arma la linea de comando, espera a que termine y devuelve el codigo de
' salida. El codigo lo escribe publicar.ps1 en un archivo, porque Shell() no
' lo devuelve.
Private Function Ejecutar(ByVal argumentos As String) As Long
    Dim pwsh As String
    pwsh = RutaPwsh()
    If Len(pwsh) = 0 Then
        Aviso "Falta PowerShell 7", _
              "No se encontro pwsh.exe en esta PC." & vbCrLf & vbCrLf & _
              "El importador tiene que correr con PowerShell 7. Con el 5.1 no cambia ni un centavo" & vbCrLf & _
              "pero se reescriben todos los numeros del data.json y el diff queda imposible de revisar." & vbCrLf & vbCrLf & _
              "Instalalo con:  winget install Microsoft.PowerShell"
        Ejecutar = -1
        Exit Function
    End If

    If Len(Dir$(RutaCodigo())) > 0 Then Kill RutaCodigo()

    Dim cmd As String
    cmd = """" & pwsh & """ -NoProfile -ExecutionPolicy Bypass -File """ & RutaScript() & """" & _
          " -Repo """ & RutaRepo() & """" & _
          " -OrigenExcel """ & RutaOrigen() & """" & _
          " -AniosMax " & CStr(AniosMax()) & _
          " " & argumentos

    On Error GoTo fallo
    ' vbNormalFocus a proposito: se ve la consola con el log, para que se sepa
    ' que esta pasando y no parezca que Excel se colgó.
    Shell cmd, vbNormalFocus, "", True
    On Error GoTo 0

    If Len(Dir$(RutaCodigo())) = 0 Then
        Ejecutar = -1
        Exit Function
    End If

    Dim f As Integer
    f = FreeFile
    Open RutaCodigo() For Input As #f
    Ejecutar = Val(Trim$(Input$(LOF(f), f)))
    Close #f
    Exit Function

fallo:
    Ejecutar = -1
End Function


' ===========================================================================
'  RUTAS Y CONFIGURACION
'  Todo sale de la hoja CONFIG. Asi, si un dia las carpetas se mueven, se
'  corrigen las celdas y no hay que tocar el codigo.
' ===========================================================================

Private Function Cfg(ByVal clave As String, ByVal defecto As String) As String
    On Error Resume Next
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(HOJA_CONFIG)
    If ws Is Nothing Then
        Cfg = defecto
        Exit Function
    End If
    Dim celda As Range
    Set celda = ws.Range("B" & Application.Match(clave, ws.Range("A:A"), 0))
    If Len(Trim$(CStr(celda.Value))) = 0 Then
        Cfg = defecto
    Else
        Cfg = Trim$(CStr(celda.Value))
    End If
    On Error GoTo 0
End Function

Private Function RutaRepo() As String
    RutaRepo = Cfg("REPO", "C:\Users\sis\Documents\GitHub\ValleHermoso")
End Function

Private Function RutaOrigen() As String
    RutaOrigen = Cfg("ORIGEN_EXCEL", "D:\VALLE HERMOSO\CUENTA POR PERSONA")
End Function

Private Function AniosMax() As Long
    AniosMax = Val(Cfg("ANIOS_MAX", "2026"))
    If AniosMax < 2000 Then AniosMax = 2026
End Function

Private Function RutaScript() As String
    RutaScript = RutaRepo() & "\tools\publicar.ps1"
End Function

Private Function RutaLog() As String
    RutaLog = RutaRepo() & "\tools\publicar-ultimo.log"
End Function

Private Function RutaCodigo() As String
    RutaCodigo = RutaRepo() & "\tools\publicar-ultimo.codigo"
End Function


' Busca pwsh. Se prueban varias rutas porque en unas PCs esta en Archivos de
' programa y en otras es el alias de la Tienda de Windows, y ese alias a
' veces no responde cuando se llama desde Shell.
Private Function RutaPwsh() As String
    Dim candidatos As Variant
    candidatos = Array( _
        Cfg("PWSH", ""), _
        "C:\Program Files\PowerShell\7\pwsh.exe", _
        "C:\Program Files (x86)\PowerShell\7\pwsh.exe", _
        Replace(Environ$("LOCALAPPDATA"), "\", "\") & "\Programs\PowerShell\7\pwsh.exe", _
        Replace(Environ$("LOCALAPPDATA"), "\", "\") & "\Microsoft\WindowsApps\pwsh.exe")

    Dim i As Long
    For i = LBound(candidatos) To UBound(candidatos)
        If Len(candidatos(i)) > 0 Then
            If Dir$(candidatos(i)) <> "" Then
                RutaPwsh = candidatos(i)
                Exit Function
            End If
        End If
    Next i

    ' ultimo recurso: el que aparezca en el PATH
    On Error Resume Next
    Dim p As String
    p = Environ$("PATH")
    On Error GoTo 0
    RutaPwsh = ""
End Function


Private Function UltimoRespaldo() As String
    Dim carpeta As String
    carpeta = RutaRepo()
    Dim f As String
    Dim ultimo As String
    f = Dir$(carpeta & "\data.json.bak-*", vbNormal)
    Do While Len(f) > 0
        If f > ultimo Then ultimo = f
        f = Dir$()
    Loop
    If Len(ultimo) = 0 Then
        UltimoRespaldo = ""
    Else
        UltimoRespaldo = carpeta & "\" & ultimo
    End If
End Function


' ===========================================================================
'  AYUDAS DE PANTALLA
' ===========================================================================

' Avisa si hay alguno de los Excel de socio abierto, porque se leerian a
' medias y el dato puede salir mal.
Private Function RevisarExcelAbierto() As Boolean
    RevisarExcelAbierto = True

    Dim origen As String
    origen = RutaOrigen()
    If Right$(origen, 1) <> "\" Then origen = origen & "\"

    Dim wb As Workbook
    Dim rutaWb As String
    For Each wb In Application.Workbooks
        On Error Resume Next
        rutaWb = LCase$(wb.FullName)
        On Error GoTo 0
        If Len(rutaWb) > 0 Then
            If Left$(rutaWb, Len(LCase$(origen))) = LCase$(origen) Then
                If wb.Name <> ThisWorkbook.Name Then
                    Aviso "Hay un Excel abierto", _
                          "Este archivo esta abierto:" & vbCrLf & vbCrLf & _
                          wb.Name & vbCrLf & vbCrLf & _
                          "Cierralo y dale al boton de nuevo. Si esta abierto, se puede leer a medias" & vbCrLf & _
                          "y el dato puede salir mal."
                    Exit Function
                End If
            End If
        End If
    Next wb
End Function


Private Function Confirmar(ByVal texto As String) As Boolean
    Confirmar = (MsgBox(texto, vbQuestion + vbYesNo + vbDefaultButton2, "ValleHermoso") = vbYes)
End Function

Private Sub Aviso(ByVal titulo As String, ByVal texto As String)
    MsgBox texto, vbInformation, "ValleHermoso - " & titulo
End Sub

Private Sub PonerEstado(ByVal texto As String)
    On Error Resume Next
    With ThisWorkbook.Worksheets(HOJA_PORTADA).Range("B4")
        .Value = texto
        .Font.Bold = True
    End With
    ThisWorkbook.Worksheets(HOJA_PORTADA).Range("B4").Interior.Color = RGB(255, 243, 224)
    On Error GoTo 0
End Sub

Private Sub LimpiarEstado()
    On Error Resume Next
    With ThisWorkbook.Worksheets(HOJA_PORTADA).Range("B4")
        .Value = ""
        .Font.Bold = False
        .Interior.Pattern = xlNone
    End With
    On Error GoTo 0
End Sub
