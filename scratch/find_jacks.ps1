Add-Type -AssemblyName System.Drawing
$imgPath = 'c:\resume_projects\DIGIWAVE_ X\DigiwaveX\DigiWave-X\frontend\assets\sigma_com122n_front_panel.png'
$bmp = [System.Drawing.Bitmap]::FromFile($imgPath)
$w = $bmp.Width
$h = $bmp.Height
Write-Host "Image dimensions: W=$w, H=$h"

# In the front panel, let's locate the jacks in the line coding section
# They have concentric circles: outer circle radius ~8-10px, inner solid dot radius ~3px
# Let's search x between 500 and 700, y between 50 and 600
# A jack center typically has dark pixel (R<80, G<80, B<80) with symmetry around it

function Test-JackCenter($cx, $cy) {
    # Check if (cx, cy) is dark
    $center = $bmp.GetPixel($cx, $cy)
    if ($center.R -gt 70 -or $center.G -gt 70 -or $center.B -gt 70) { return $false }

    # Check that pixels at radius 4-5 are bright/white
    $whiteCount = 0
    foreach ($angle in 0, 45, 90, 135, 180, 225, 270, 315) {
        $rad = $angle * [Math]::PI / 180.0
        $px = [int]($cx + 5 * [Math]::Cos($rad))
        $py = [int]($cy + 5 * [Math]::Sin($rad))
        if ($px -ge 0 -and $px -lt $w -and $py -ge 0 -and $py -lt $h) {
            $p = $bmp.GetPixel($px, $py)
            if ($p.R -gt 180 -and $p.G -gt 180 -and $p.B -gt 180) { $whiteCount++ }
        }
    }
    if ($whiteCount -lt 5) { return $false }

    # Check that pixels at radius 8-10 are dark (outer circle ring)
    $darkRingCount = 0
    foreach ($angle in 0, 45, 90, 135, 180, 225, 270, 315) {
        $rad = $angle * [Math]::PI / 180.0
        $px = [int]($cx + 8 * [Math]::Cos($rad))
        $py = [int]($cy + 8 * [Math]::Sin($rad))
        if ($px -ge 0 -and $px -lt $w -and $py -ge 0 -and $py -lt $h) {
            $p = $bmp.GetPixel($px, $py)
            if ($p.R -lt 120 -and $p.G -lt 120 -and $p.B -lt 120) { $darkRingCount++ }
        }
    }
    return ($darkRingCount -ge 4)
}

$candidates = @()
for ($y = 40; $y -lt $h - 20; $y += 2) {
    for ($x = 40; $x -lt $w - 20; $x += 2) {
        if (Test-JackCenter $x $y) {
            # Check if close to an existing candidate
            $already = $false
            foreach ($c in $candidates) {
                $dist = [Math]::Sqrt([Math]::Pow($c.X - $x, 2) + [Math]::Pow($c.Y - $y, 2))
                if ($dist -lt 12) { $already = $true; break }
            }
            if (-not $already) {
                $pctX = [Math]::Round(($x / $w) * 100, 2)
                $pctY = [Math]::Round(($y / $h) * 100, 2)
                $candidates += [PSCustomObject]@{ X = $x; Y = $y; PctX = $pctX; PctY = $pctY }
            }
        }
    }
}

Write-Host "Found $($candidates.Count) candidate jacks:"
$candidates | Sort-Object X, Y | Format-Table -AutoSize
$bmp.Dispose()
