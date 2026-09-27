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

' Celda donde se escribe el mensaje de "estado" mientras corre algo.
' En la portada nueva la etiqueta ESTADO esta en B4, y el mensaje va en C4.
Private Const CELDA_ESTADO As String = "C4"

' Colores de la portada. Son los mismos de index.css, en RGB de VBA.
Private Const COLOR_ESTADO As Long = 15528931     ' brand-soft  #e3f3ec
Private Const COLOR_ESTADO_TXT As Long = 4742154 ' brand-dark  #0a5c48
Private Const COLOR_CARD As Long = 16185332      ' fondo tarjeta #f4f7f6
Private Const COLOR_TEXTO As Long = 2829599      ' text         #1f2d2b

' codigos de salida de publicar.ps1
Private Const COD_OK As Long = 0
Private Const COD_VERIFICACION As Long = 2
Private Const COD_GIT As Long = 3
Private Const COD_PREVIO As Long = 4
Private Const COD_MOTOR As Long = 5
Private Const COD_IMPORTADOR As Long = 6
Private Const COD_PUSH As Long = 7
Private Const COD_DESACTUALIZADO As Long = 9


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
            Aviso "No se pudo completar", _
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


' Estan al dia los Excel de cada socio?
'
' Los Excel de CUENTA POR PERSONA no se teclean: sus numeros vienen por vinculo
' desde INGRESOS Y EGRESOS 20XX. Si se escribio en el anual y no se refrescaron
' los individuales, al publicar se suben numeros viejos.
'
' Esto NO toca ningun Excel: copia los 24 a una carpeta temporal, ahi refresca
' los vinculos, corre el importador sobre esa copia y compara el resultado con
' el data.json publicado. Tarda cerca de un minuto.
'
' Conviene correrlo ANTES de publicar cuando se escribio algo en el anual.
Public Sub VerificarSiEstaAlDia()
    If Not RevisarExcelAbierto() Then Exit Sub

    PonerEstado("Revisando si los Excel estan al dia... tarda un minuto.")
    DoEvents

    Dim cod As Long
    cod = Ejecutar("-VerificarFrescura")

    LimpiarEstado

    Select Case cod
        Case COD_OK
            Aviso "Si estan al dia", _
                  "Refresque los vinculos en una copia y arme el data.json de nuevo:" & vbCrLf & _
                  "sale EXACTAMENTE igual al que esta publicado." & vbCrLf & vbCrLf & _
                  "No hay nada viejo. Ya puedes darle Publicar."
        Case COD_DESACTUALIZADO
            Aviso "Hay datos sin refrescar", _
                  "Al refrescar los vinculos, el data.json sale DISTINTO al publicado." & vbCrLf & vbCrLf & _
                  "O sea que hay numeros en el Excel anual que todavia no llegaron a los Excel de cada socio." & vbCrLf & vbCrLf & _
                  "Abre cada Excel de socio, dejalo actualizar los vinculos, guardalo, y despues dale Publicar." & vbCrLf & vbCrLf & _
                  "El log te dice exactamente que cambio."
        Case Else
            Aviso "No se pudo revisar", _
                  "La revision fallo. No se toco nada." & vbCrLf & vbCrLf & _
                  "Casi siempre es que hay Excel abiertos. Cierralos y vuelve a intentar."
    End Select
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
        Aviso "Restaurado", _
              "El data.json de esta PC volvio al estado anterior y quedo commiteado." & vbCrLf & vbCrLf & _
              "Ojo: todavia NO se subio, asi que el portal sigue mostrando los datos de antes." & vbCrLf & _
              "Si quieres que los socios vean el restaurado, dale a Reintentar push."
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


' Al abrir el libro, avisa SOLO si quedo algo pendiente de la ultima corrida.
' Si todo fue bien no dice nada: un mensaje de "todo ok" cada vez que se abre
' el archivo solo molesta.
Public Sub Auto_Open()
    On Error Resume Next
    If Len(Dir$(RutaCodigo())) = 0 Then Exit Sub
    If Len(Dir$(RutaLog())) = 0 Then Exit Sub

    ' La ruta va en una variable: la sentencia Open de VBA no acepta llamadas
    ' a funcion entre parentesis.
    Dim rutaCod As String
    Dim f As Integer
    Dim cod As Long
    rutaCod = RutaCodigo()
    f = FreeFile
    Open rutaCod For Input As #f
    cod = Val(Trim$(Input$(LOF(f), f)))
    Close #f

    Select Case cod
        Case COD_PUSH
            Aviso "Pendiente un push", _
                  "La ultima vez los datos se generaron y se commitearon, pero el push fallo." & vbCrLf & vbCrLf & _
                  "Los socios todavia NO ven esos cambios. Clic en Reintentar push."
        Case COD_GIT, COD_PREVIO
            Aviso "La ultima vez quedo a medias", _
                  "La corrida anterior se detuvo antes de publicar, asi que el data.json del portal" & vbCrLf & _
                  "sigue como estaba. No se perdio nada. Clic en Ver el log para ver que paso."
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

    ' Borra el codigo de la corrida anterior. Si esta abierto en el Bloc de
    ' notas el borrado falla, y eso no puede parar la publicacion: el script
    ' lo sobreescribe igual y solo se perderia el codigo viejo.
    On Error Resume Next
    If Len(Dir$(RutaCodigo())) > 0 Then Kill RutaCodigo()
    On Error GoTo 0

    Dim cmd As String
    cmd = """" & pwsh & """ -NoProfile -ExecutionPolicy Bypass -File """ & RutaScript() & """" & _
          " -Repo """ & RutaRepo() & """" & _
          " -OrigenExcel """ & RutaOrigen() & """" & _
          " -AniosMax " & CStr(AniosMax()) & _
          " " & argumentos

    On Error GoTo fallo
    ' No se usa Shell() para esto. En esta instalacion de Excel la sentencia
    ' Shell() solo acepta 2 argumentos y no tiene forma de esperar: con 3
    ' argumentos el compilador tira "El numero de argumentos es incorrecto".
    '(probado: con 3 y con 2+estilo numerico falla igual; con 2 compila pero no
    ' espera, y entonces la macro leeria el codigo de la corrida anterior.)
    ' WScript.Shell.Run si tiene parametro de espera, asi que se usa ese.
    ' El 1 es la ventana normal: se ve la consola con el log, para que se sepa
    ' que esta pasando y no parezca que Excel se colgo.
    Dim sh As Object
    Set sh = CreateObject("WScript.Shell")
    sh.Run cmd, 1, True
    On Error GoTo 0

    ' La ruta va en una variable. La sentencia Open de VBA es antigua y no
    ' acepta una llamada a funcion entre parentesis: hay que darle una variable.
    Dim rutaCod As String
    rutaCod = RutaCodigo()

    If Len(Dir$(rutaCod)) = 0 Then
        Ejecutar = -1
        Exit Function
    End If

    Dim f As Integer
    f = FreeFile
    Open rutaCod For Input As #f
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
    Dim ws As Worksheet
    Dim celda As Range
    Cfg = defecto

    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(HOJA_CONFIG)
    On Error GoTo 0
    If ws Is Nothing Then Exit Function

    On Error Resume Next
    Set celda = ws.Range("B" & Application.Match(clave, ws.Range("A:A"), 0))
    On Error GoTo 0
    ' Si la clave no existe en la hoja CONFIG, Match falla y celda queda vacio.
    ' Sin este chequeo la funcion devolveria "" en vez del valor por defecto, y
    ' las rutas se quedarian en blanco sin avisar nada.
    If celda Is Nothing Then Exit Function

    Dim texto As String
    On Error Resume Next
    texto = Trim$(CStr(celda.Value))
    On Error GoTo 0

    If Len(texto) > 0 Then Cfg = texto
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
    Dim localApp As String
    localApp = Environ$("LOCALAPPDATA")

    Dim candidatos As Variant
    candidatos = Array( _
        Cfg("PWSH", ""), _
        "C:\Program Files\PowerShell\7\pwsh.exe", _
        "C:\Program Files (x86)\PowerShell\7\pwsh.exe", _
        localApp & "\Programs\PowerShell\7\pwsh.exe", _
        localApp & "\Microsoft\WindowsApps\pwsh.exe")

    Dim i As Long
    For i = LBound(candidatos) To UBound(candidatos)
        If Len(candidatos(i)) > 0 Then
            On Error Resume Next
            Dim existe As Boolean
            existe = (Dir$(candidatos(i)) <> "")
            On Error GoTo 0
            If existe Then
                RutaPwsh = candidatos(i)
                Exit Function
            End If
        End If
    Next i

    ' Ultimo recurso: devolver el nombre pelado. Shell() lo busca en el PATH, y
    ' ahi si esta el de Windows. Se devuelve "pwsh" y no "" porque ""eria
    ' disparar el aviso de "Falta PowerShell 7" cuando en realidad si esta.
    RutaPwsh = "pwsh"
End Function


Private Function UltimoRespaldo() As String
    ' El respaldo ya NO vive en el repo, porque el usuario quiere ver ahi
    ' solamente data.json. Queda en una carpeta fija del usuario y con nombre
    ' fijo, asi que no hay que buscar el mas nuevo como antes.
    Dim f As String
    f = Environ$("LOCALAPPDATA") & "\ValleHermoso\data.json.anterior"
    If Len(Dir$(f, vbNormal)) > 0 Then
        UltimoRespaldo = f
    Else
        UltimoRespaldo = ""
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
    With ThisWorkbook.Worksheets(HOJA_PORTADA).Range(CELDA_ESTADO)
        .Value = texto
        .Font.Bold = True
    End With
    With ThisWorkbook.Worksheets(HOJA_PORTADA).Range(CELDA_ESTADO)
        .Interior.Color = COLOR_ESTADO
        .Font.Color = COLOR_ESTADO_TXT
    End With
    On Error GoTo 0
End Sub

Private Sub LimpiarEstado()
    On Error Resume Next
    With ThisWorkbook.Worksheets(HOJA_PORTADA).Range(CELDA_ESTADO)
        .Value = ""
        .Font.Bold = False
        ' No se pone "sin relleno": esa celda vive dentro de la tarjeta
        ' blanca y si queda sin relleno se ve del color de la hoja.
        .Interior.Color = COLOR_CARD
        .Font.Color = COLOR_TEXTO
    End With
    On Error GoTo 0
End Sub
