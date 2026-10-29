Add-Type -AssemblyName System.Drawing
$imgPath = 'c:\resume_projects\DIGIWAVE_ X\DigiwaveX\DigiWave-X\frontend\assets\sigma_com122n_front_panel.png'
$bmp = [System.Drawing.Bitmap]::FromFile($imgPath)
$out = New-Object System.Drawing.Bitmap($bmp)
$g = [System.Drawing.Graphics]::FromImage($out)
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Red, 2)
$bluePen = New-Object System.Drawing.Pen([System.Drawing.Color]::Blue, 2)
$font = New-Object System.Drawing.Font('Arial', 8)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Red)

# Let's draw horizontal lines across the image every 5% Y and vertical lines every 5% X to get a grid
for ($pctX = 5; $pctX -le 95; $pctX += 5) {
    $x = [int]($pctX * $bmp.Width / 100.0)
    $g.DrawLine($bluePen, $x, 0, $x, $bmp.Height)
    $g.DrawString("${pctX}%", $font, $brush, $x + 2, 5)
}
for ($pctY = 5; $pctY -le 95; $pctY += 5) {
    $y = [int]($pctY * $bmp.Height / 100.0)
    $g.DrawLine($bluePen, 0, $y, $bmp.Width, $y)
    $g.DrawString("${pctY}%", $font, $brush, 5, $y + 2)
}

$out.Save('c:\resume_projects\DIGIWAVE_ X\DigiwaveX\DigiWave-X\scratch\grid_overlay.png')
$g.Dispose()
$out.Dispose()
$bmp.Dispose()
Write-Host "Grid overlay saved successfully."
