# OCR con posiciones (motor nativo de Windows) de todas las imágenes de una carpeta.
#   powershell -File kb/tools/ocr_boxes.ps1 <carpeta con .png> <carpeta salida .json>
# Cada JSON: { w, h, lines: [ { text, words: [ { text, x, y, w, h } ] } ] } en píxeles de la imagen.
param([string]$inDir, [string]$outDir)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
$eng = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('es-MX'))
New-Item -ItemType Directory -Force $outDir | Out-Null
Get-ChildItem $inDir -Filter *.png | ForEach-Object {
  $dst = Join-Path $outDir ($_.BaseName + '.json')
  if (Test-Path $dst) { return }
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($_.FullName)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $res = Await ($eng.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
  $lines = @($res.Lines | ForEach-Object {
    @{ text = $_.Text; words = @($_.Words | ForEach-Object { $r = $_.BoundingRect; @{ text = $_.Text; x = $r.X; y = $r.Y; w = $r.Width; h = $r.Height } }) }
  })
  @{ w = $dec.PixelWidth; h = $dec.PixelHeight; lines = $lines } | ConvertTo-Json -Depth 6 -Compress | Out-File -FilePath $dst -Encoding utf8
  $stream.Dispose()
  Write-Output $_.BaseName
}
