Add-Type -AssemblyName System.Drawing
$imgPath = 'c:\resume_projects\DIGIWAVE_ X\DigiwaveX\DigiWave-X\frontend\assets\sigma_com122n_front_panel.png'
$bmp = [System.Drawing.Bitmap]::FromFile($imgPath)
$w = $bmp.Width
$h = $bmp.Height

# We want to find the exact circle centers for:
# Column 1: Generator section (CK, BK, WK, NRZ, GND)
# Let's search x around 325 (39.7% of 819 is 325)
Write-Host "--- GENERATOR JACKS (x ~ 325) ---"
for ($y = 50; $y -lt 300; $y++) {
    $c = $bmp.GetPixel(325, $y)
    # Print if dark center
}

# Let's search the Line Coding Section jacks:
# In the original image, where are the text strings "NRZ UNIPOLAR", "NRZ-M", "NRZ BIPOLAR", "RZ UNIPOLAR", "RZ BIPOLAR", "MANCHESTER", "MARK", "AMI"?
# Let's find all circles where X is between 500 and 650.
# A circle has black border, white interior, black center dot.
$lcJacks = @()

for ($x = 520; $x -lt 620; $x += 1) {
    for ($y = 60; $y -lt 480; $y += 1) {
        $center = $bmp.GetPixel($x, $y)
        if ($center.R -lt 50 -and $center.G -lt 50 -and $center.B -lt 50) {
            # Check 4 directions for white ring (radius 4 to 6)
            $isWhite = $true
            foreach ($dx in -5, 5) {
                $p = $bmp.GetPixel($x + $dx, $y)
                if ($p.R -lt 150) { $isWhite = $false; break }
            }
            foreach ($dy in -5, 5) {
                $p = $bmp.GetPixel($x, $y + $dy)
                if ($p.R -lt 150) { $isWhite = $false; break }
            }
            if ($isWhite) {
                # Check dark outer border at radius 8 to 10
                $isDark = $true
                foreach ($dx in -9, 9) {
                    $p = $bmp.GetPixel($x + $dx, $y)
                    if ($p.R -gt 150) { $isDark = $false; break }
                }
                foreach ($dy in -9, 9) {
                    $p = $bmp.GetPixel($x, $y + $dy)
                    if ($p.R -gt 150) { $isDark = $false; break }
                }
                if ($isDark) {
                    $lcJacks += [PSCustomObject]@{ X = $x; Y = $y }
                }
            }
        }
    }
}

# Cluster nearby points
$clustered = @()
foreach ($j in $lcJacks) {
    $found = $false
    for ($i = 0; $i -lt $clustered.Count; $i++) {
        $c = $clustered[$i]
        $dist = [Math]::Sqrt([Math]::Pow($c.X - $j.X, 2) + [Math]::Pow($c.Y - $j.Y, 2))
        if ($dist -lt 10) {
            $clustered[$i].Count++
            $clustered[$i].SumX += $j.X
            $clustered[$i].SumY += $j.Y
            $found = $true
            break
        }
    }
    if (-not $found) {
        $clustered += [PSCustomObject]@{ SumX = $j.X; SumY = $j.Y; Count = 1 }
    }
}

Write-Host "Clustered Line Coding Jacks:"
$results = @()
foreach ($c in $clustered) {
    $avgX = [int]($c.SumX / $c.Count)
    $avgY = [int]($c.SumY / $c.Count)
    $pctX = [Math]::Round(($avgX / $w) * 100, 2)
    $pctY = [Math]::Round(($avgY / $h) * 100, 2)
    $results += [PSCustomObject]@{ X = $avgX; Y = $avgY; PctX = $pctX; PctY = $pctY }
}

$results | Sort-Object Y | Format-Table -AutoSize
$bmp.Dispose()
