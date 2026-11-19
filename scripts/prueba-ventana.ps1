# Abre Red Level de verdad en la máquina Windows de GitHub, con una biblioteca de prueba,
# y comprueba lo que una prueba sin ventana no puede: que la interfaz carga, que ocupa toda
# la pantalla, que la barra de tareas se oculta y que la salida de emergencia lo devuelve todo.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win {
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
    public static void Clic(int x, int y) {
        SetCursorPos(x, y);
        System.Threading.Thread.Sleep(150);
        mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
        System.Threading.Thread.Sleep(60);
        mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
    }
    public static void Pulsar(params byte[] teclas) {
        foreach (byte t in teclas) { keybd_event(t, 0, 0, UIntPtr.Zero); System.Threading.Thread.Sleep(40); }
        System.Threading.Thread.Sleep(80);
        for (int i = teclas.Length - 1; i >= 0; i--) { keybd_event(teclas[i], 0, 2, UIntPtr.Zero); System.Threading.Thread.Sleep(40); }
    }
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

New-Item -ItemType Directory -Force prueba | Out-Null
try { Set-DisplayResolution -Width 1920 -Height 1080 -Force | Out-Null } catch { Write-Host "No se pudo cambiar la resolución: $_" }

function Capturar($nombre) {
    $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
    $bmp.Save("$PWD\prueba\$nombre.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $g.Dispose(); $bmp.Dispose()
}

function BarraVisible { [Win]::IsWindowVisible([Win]::FindWindow("Shell_TrayWnd", $null)) }

$demo = "$env:RUNNER_TEMP\demo"
$env:REDLEVEL_STEAM_ROOT = "$demo\steam"
$env:REDLEVEL_EPIC_MANIFESTS = "$demo\epic\Manifests"
$env:REDLEVEL_DATA_DIR = "$demo\data"
$env:REDLEVEL_PRUEBA_SALIDA = "25"

$pantalla = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$barraAntes = BarraVisible
$app = Start-Process "$PWD\target\release\red-level.exe" -PassThru
Start-Sleep -Milliseconds 3500
Capturar "1-entrada"
Start-Sleep -Milliseconds 1500
Capturar "1b-entrada"
Start-Sleep -Seconds 9
Capturar "2-biblioteca"

$vivo = -not $app.HasExited
$frente = [Win]::GetForegroundWindow()
[uint32]$pidFrente = 0
[void][Win]::GetWindowThreadProcessId($frente, [ref]$pidFrente)
$rect = New-Object Win+RECT
[void][Win]::GetWindowRect($frente, [ref]$rect)
$barraDurante = BarraVisible

# Salida de emergencia: Ctrl+Alt+Mayús+Q. La atiende el mismo gancho que bloquea las teclas.
# Se pulsan las teclas una a una, como en un teclado: Ctrl (0x11), Alt (0x12), Mayús (0x10), Q (0x51).
[Win]::Pulsar(0x11, 0x12, 0x10, 0x51)
$salioDesdeFuera = $app.WaitForExit(6000)
# Si las teclas enviadas desde este script no llegan, el propio programa las pulsa a los 25 s de arrancar.
$salio = $salioDesdeFuera -or $app.WaitForExit(20000)
Start-Sleep -Seconds 1
$barraDespues = BarraVisible
Capturar "3-despues-de-salir"
if (-not $salio) { Stop-Process -Id $app.Id -Force }
Copy-Item "$demo\data\redlevel.log" prueba\ -ErrorAction SilentlyContinue

$resultado = [ordered]@{
    pantalla               = "$($pantalla.Width)x$($pantalla.Height)"
    sigueAbiertoA12s       = $vivo
    ventanaAlFrenteEsRedLevel = ($pidFrente -eq $app.Id)
    ventana                = "$($rect.Right - $rect.Left)x$($rect.Bottom - $rect.Top)"
    cubreLaPantalla        = (($rect.Right - $rect.Left) -ge $pantalla.Width -and ($rect.Bottom - $rect.Top) -ge $pantalla.Height)
    barraDeTareasAntes     = $barraAntes
    barraDeTareasDurante   = $barraDurante
    teclasDesdeElScript    = $salioDesdeFuera
    salioConLaCombinacion  = $salio
    barraDeTareasDespues   = $barraDespues
}
$resultado | ConvertTo-Json | Tee-Object prueba\ventana.json

# Segunda pasada: la interfaz del segundo monitor. La máquina de pruebas tiene una sola pantalla,
# así que se le dice a Red Level que trate la mitad derecha como si fuera el segundo monitor.
$mitad = [int]($pantalla.Width / 2)
$env:REDLEVEL_SEGUNDO_FALSO = "$mitad,0,$mitad,$($pantalla.Height)"
# Dos programas cualquiera del PC, como los que añadirá cada usuario a su barra, con el monitor dividido en 4.
$env:REDLEVEL_PRUEBA_SEGUNDO = "$env:WINDIR\System32\notepad.exe;$env:WINDIR\System32\charmap.exe"
$env:REDLEVEL_PRUEBA_DIVISION = "4"
$env:REDLEVEL_PRUEBA_SALIDA = "55"
$app2 = Start-Process "$PWD\target\release\red-level.exe" -PassThru
Start-Sleep -Seconds 9
Capturar "4-segundo-monitor-barra"
Start-Sleep -Seconds 17
Capturar "5-segundo-monitor-cuadricula"
# Un toque en el primer cuadro (arriba a la izquierda del segundo monitor) abre esa app en grande.
[Win]::Clic($mitad + [int]($mitad / 4), 56 + [int](($pantalla.Height - 56) / 4))
Start-Sleep -Seconds 4
Capturar "6-segundo-monitor-en-grande"
[Win]::Pulsar(0x11, 0x12, 0x10, 0x51)
if (-not $app2.WaitForExit(20000)) { Stop-Process -Id $app2.Id -Force }
Copy-Item "$demo\data\redlevel.log" prueba\ -ErrorAction SilentlyContinue

if (-not $vivo) { Write-Error "Red Level se cerró solo al arrancar"; exit 1 }
if (-not $resultado.cubreLaPantalla) { Write-Error "La ventana no cubre la pantalla"; exit 1 }
if (-not $salio) { Write-Error "La salida de emergencia no cerró Red Level"; exit 1 }
if ($barraAntes -and -not $barraDespues) { Write-Error "La barra de tareas no volvió al salir"; exit 1 }
Get-Process notepad, charmap -ErrorAction SilentlyContinue | Stop-Process -Force
$registro = Get-Content "$demo\data\redlevel.log" -ErrorAction SilentlyContinue
$abierta = $registro | Select-String "prueba: ventanas de .* en el segundo monitor: [1-9]"
if (-not $abierta) { throw "El programa añadido a la barra no llegó a mostrarse en el segundo monitor." }
$enGrande = $registro | Select-String "segundo monitor: .* en grande tras tocar su cuadro"
if (-not $enGrande) { throw "Tocar un cuadro del segundo monitor no abrió la app en grande." }
