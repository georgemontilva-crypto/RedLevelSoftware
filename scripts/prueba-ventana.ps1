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
    $bmp.Save("prueba\$nombre.png")
    $g.Dispose(); $bmp.Dispose()
}

function BarraVisible { [Win]::IsWindowVisible([Win]::FindWindow("Shell_TrayWnd", $null)) }

$demo = "$env:RUNNER_TEMP\demo"
$env:REDLEVEL_STEAM_ROOT = "$demo\steam"
$env:REDLEVEL_EPIC_MANIFESTS = "$demo\epic\Manifests"
$env:REDLEVEL_DATA_DIR = "$demo\data"

$pantalla = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$barraAntes = BarraVisible
$app = Start-Process "$PWD\target\release\red-level.exe" -PassThru
Start-Sleep -Seconds 2
Capturar "1-entrada"
Start-Sleep -Seconds 10
Capturar "2-biblioteca"

$vivo = -not $app.HasExited
$frente = [Win]::GetForegroundWindow()
[uint32]$pidFrente = 0
[void][Win]::GetWindowThreadProcessId($frente, [ref]$pidFrente)
$rect = New-Object Win+RECT
[void][Win]::GetWindowRect($frente, [ref]$rect)
$barraDurante = BarraVisible

# Salida de emergencia: Ctrl+Alt+Mayús+Q. La atiende el mismo gancho que bloquea las teclas.
[System.Windows.Forms.SendKeys]::SendWait("^%+q")
$salio = $app.WaitForExit(15000)
Start-Sleep -Seconds 1
$barraDespues = BarraVisible
Capturar "3-despues-de-salir"
if (-not $salio) { Stop-Process -Id $app.Id -Force }

$resultado = [ordered]@{
    pantalla               = "$($pantalla.Width)x$($pantalla.Height)"
    sigueAbiertoA12s       = $vivo
    ventanaAlFrenteEsRedLevel = ($pidFrente -eq $app.Id)
    ventana                = "$($rect.Right - $rect.Left)x$($rect.Bottom - $rect.Top)"
    cubreLaPantalla        = (($rect.Right - $rect.Left) -ge $pantalla.Width -and ($rect.Bottom - $rect.Top) -ge $pantalla.Height)
    barraDeTareasAntes     = $barraAntes
    barraDeTareasDurante   = $barraDurante
    salioConLaCombinacion  = $salio
    barraDeTareasDespues   = $barraDespues
}
$resultado | ConvertTo-Json | Tee-Object prueba\ventana.json

if (-not $vivo) { Write-Error "Red Level se cerró solo al arrancar"; exit 1 }
if (-not $resultado.cubreLaPantalla) { Write-Error "La ventana no cubre la pantalla"; exit 1 }
if (-not $salio) { Write-Error "La salida de emergencia no cerró Red Level"; exit 1 }
if ($barraAntes -and -not $barraDespues) { Write-Error "La barra de tareas no volvió al salir"; exit 1 }
