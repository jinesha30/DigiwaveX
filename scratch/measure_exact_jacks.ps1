Add-Type -AssemblyName System.Drawing
$imgPath = 'c:\resume_projects\DIGIWAVE_ X\DigiwaveX\DigiWave-X\frontend\assets\sigma_com122n_front_panel.png'
$bmp = [System.Drawing.Bitmap]::FromFile($imgPath)
$w = $bmp.Width
$h = $bmp.Height

function Find-CircleCenter($targetX, $targetY, $searchRadius = 15) {
    # Find minimum brightness / center dot within search box
    $minVal = 999
    $bestX = $targetX
    $bestY = $targetY
    
    for ($y = [Math]::Max(0, $targetY - $searchRadius); $y -le [Math]::Min($h - 1, $targetY + $searchRadius); $y++) {
        for ($x = [Math]::Max(0, $targetX - $searchRadius); $x -le [Math]::Min($w - 1, $targetX + $searchRadius); $x++) {
            $p = $bmp.GetPixel($x, $y)
            $bright = ($p.R + $p.G + $p.B) / 3.0
            if ($bright -lt $minVal) {
                $minVal = $bright
                $bestX = $x
                $bestY = $y
            }
        }
    }
    
    # Check ring symmetry around (bestX, bestY)
    $pctX = [Math]::Round(($bestX / $w) * 100, 2)
    $pctY = [Math]::Round(($bestY / $h) * 100, 2)
    return [PSCustomObject]@{ PixelX = $bestX; PixelY = $bestY; PctX = $pctX; PctY = $pctY }
}

$jackDefinitions = @(
    # Generator
    @{ Name = "gen_ck"; X = 325; Y = 72 },
    @{ Name = "gen_bk"; X = 325; Y = 121 },
    @{ Name = "gen_wk"; X = 325; Y = 169 },
    @{ Name = "source.out"; X = 325; Y = 217 },
    @{ Name = "gen_gnd"; X = 325; Y = 265 },

    # Line Codes
    @{ Name = "line_nrz_unipolar"; X = 593; Y = 80 },
    @{ Name = "line_nrz_m"; X = 593; Y = 131 },
    @{ Name = "line_nrz_bipolar"; X = 593; Y = 179 },
    @{ Name = "line_rz_unipolar"; X = 593; Y = 231 },
    @{ Name = "line_rz_bipolar"; X = 593; Y = 281 },
    @{ Name = "line_biphase_manchester"; X = 593; Y = 336 },
    @{ Name = "line_biphase_mark"; X = 593; Y = 386 },
    @{ Name = "line_ami_bipolar"; X = 593; Y = 430 },

    # Comparators
    @{ Name = "comp_ip1"; X = 639; Y = 80 },
    @{ Name = "comp_ip2"; X = 639; Y = 131 },
    @{ Name = "comp_gnd"; X = 639; Y = 170 },
    @{ Name = "comp_op1"; X = 780; Y = 176 },
    @{ Name = "comp_op2"; X = 780; Y = 221 },
    @{ Name = "comp_op3"; X = 780; Y = 264 },

    # Bit Clock Decoder
    @{ Name = "dec_sw"; X = 660; Y = 313 },
    @{ Name = "decoder.in"; X = 660; Y = 400 },
    @{ Name = "dec_nrz_op"; X = 780; Y = 321 },
    @{ Name = "dec_gnd"; X = 780; Y = 400 },

    # Bit Clock Recovery
    @{ Name = "rec_ip"; X = 639; Y = 496 },
    @{ Name = "rec_bk_op"; X = 780; Y = 500 },
    @{ Name = "rec_gnd"; X = 780; Y = 540 }
)

Write-Host "--- EXACT MEASURED JACK POSITIONS ---"
$outList = @()
foreach ($j in $jackDefinitions) {
    $res = Find-CircleCenter $j.X $j.Y 12
    $outList += [PSCustomObject]@{
        Name = $j.Name
        PixelX = $res.PixelX
        PixelY = $res.PixelY
        PctX = "$($res.PctX)%"
        PctY = "$($res.PctY)%"
    }
}

$outList | Format-Table -AutoSize
$bmp.Dispose()
