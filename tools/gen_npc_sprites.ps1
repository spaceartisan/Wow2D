# Procedurally generate 48x48 top-down NPC sprites.
# Composition: torso/shoulders ellipse (garment color), two arm nubs (skin),
# head circle (skin), upper-head cap (hair/hat color), optional accent dot
# (hat band, bandana knot, etc.), all with a dark outline.
Add-Type -AssemblyName System.Drawing

$outDir = 'c:\Users\wclif\OneDrive\SharedFiles\Wow2D\public\assets\sprites\entities'

# id => @{ skin, hair, garment, accent, accentShape }
# accentShape: none | band (horizontal band across top of head) | dot (small centered dot on crown)
$npcs = @(
    @{ id = 'elder_rowan';     skin = '#e0bda0'; hair = '#d8d2c2'; garment = '#8a6b3a'; accent = '#5a4020'; accentShape = 'band' },   # elder: grey hair, brown robe
    @{ id = 'captain_brenn';   skin = '#d9ae85'; hair = '#9a9aa8'; garment = '#5a6a7a'; accent = '#c8c8d0'; accentShape = 'band' },   # guard: steel helm, leather
    @{ id = 'innkeeper_lora';  skin = '#edc9a8'; hair = '#8a5a30'; garment = '#c8915a'; accent = '#f0e0c0'; accentShape = 'band' },   # innkeeper: brown hair, apron
    @{ id = 'blacksmith_kael'; skin = '#caa078'; hair = '#4a3020'; garment = '#5a3a24'; accent = '#8a5a30'; accentShape = 'band' },   # smith: dark bandana
    @{ id = 'banker_tomas';    skin = '#e2bf9d'; hair = '#b0b0b0'; garment = '#3f6a4a'; accent = '#d8b850'; accentShape = 'dot'  },   # banker: green coat, gold pin
    @{ id = 'miner_gruff';     skin = '#d0a078'; hair = '#6a4a2a'; garment = '#7a5a32'; accent = '#e8d060'; accentShape = 'dot'  },   # miner: helmet with lamp
    @{ id = 'logger_thorne';   skin = '#d8b088'; hair = '#4a2e1c'; garment = '#5a7a35'; accent = '#3a5020'; accentShape = 'band' },   # logger: green cap
    @{ id = 'fisherman_wade';  skin = '#e0b890'; hair = '#6a7a8a'; garment = '#3a5a8a'; accent = '#d8d0b0'; accentShape = 'band' },   # fisherman: blue hat
    @{ id = 'smelter_hilda';   skin = '#ecc3a0'; hair = '#b05a28'; garment = '#b86030'; accent = '#6a3820'; accentShape = 'none' },   # smelter: red-orange hair
    @{ id = 'sawyer_brom';     skin = '#d4a078'; hair = '#6a4030'; garment = '#8a6030'; accent = '#4a2e1c'; accentShape = 'none' },   # sawyer: brown vest
    @{ id = 'cook_marta';      skin = '#edc8a8'; hair = '#a07040'; garment = '#c85a4a'; accent = '#f4f0e0'; accentShape = 'band' }    # cook: white cap
)

function HexToColor([string]$hex) {
    $h = $hex.TrimStart('#')
    $r = [Convert]::ToInt32($h.Substring(0,2),16)
    $g = [Convert]::ToInt32($h.Substring(2,2),16)
    $b = [Convert]::ToInt32($h.Substring(4,2),16)
    [System.Drawing.Color]::FromArgb(255,$r,$g,$b)
}

function Shade([System.Drawing.Color]$c, [double]$factor) {
    $r = [int]([Math]::Max(0, [Math]::Min(255, $c.R * $factor)))
    $g = [int]([Math]::Max(0, [Math]::Min(255, $c.G * $factor)))
    $b = [int]([Math]::Max(0, [Math]::Min(255, $c.B * $factor)))
    [System.Drawing.Color]::FromArgb(255, $r, $g, $b)
}

foreach ($n in $npcs) {
    $bmp = New-Object System.Drawing.Bitmap 48, 48
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $skin     = HexToColor $n.skin
    $skinDark = Shade $skin 0.7
    $hair     = HexToColor $n.hair
    $hairDark = Shade $hair 0.65
    $garm     = HexToColor $n.garment
    $garmDark = Shade $garm 0.65
    $accent   = HexToColor $n.accent
    $outline  = [System.Drawing.Color]::FromArgb(255, 30, 20, 12)

    $skinB     = New-Object System.Drawing.SolidBrush $skin
    $skinShB   = New-Object System.Drawing.SolidBrush $skinDark
    $hairB     = New-Object System.Drawing.SolidBrush $hair
    $hairShB   = New-Object System.Drawing.SolidBrush $hairDark
    $garmB     = New-Object System.Drawing.SolidBrush $garm
    $garmShB   = New-Object System.Drawing.SolidBrush $garmDark
    $accentB   = New-Object System.Drawing.SolidBrush $accent
    $outlineP  = New-Object System.Drawing.Pen $outline, 1.2

    # Torso / shoulders ellipse — centered lower on the sprite.
    # Torso bbox ≈ x:5..43, y:22..46  (width 38, height 24)
    $g.FillEllipse($garmShB, 5, 26, 38, 20)  # shadow band (lower half)
    $g.FillEllipse($garmB,   5, 22, 38, 22)  # main torso
    $g.DrawEllipse($outlineP, 5, 22, 38, 22)

    # Collar / neckline — small dark V at top center of torso.
    $collar = New-Object System.Drawing.Drawing2D.GraphicsPath
    $collar.AddPolygon(@(
        (New-Object System.Drawing.Point 20, 22),
        (New-Object System.Drawing.Point 28, 22),
        (New-Object System.Drawing.Point 24, 27)
    ))
    $g.FillPath($garmShB, $collar)

    # Arm nubs (skin) — two small circles poking out at shoulder sides.
    $g.FillEllipse($skinB, 2,  26, 10, 10)
    $g.DrawEllipse($outlineP, 2, 26, 10, 10)
    $g.FillEllipse($skinB, 36, 26, 10, 10)
    $g.DrawEllipse($outlineP, 36, 26, 10, 10)

    # Head circle — centered above torso. Diameter 22, bbox (13..35, 4..26).
    $g.FillEllipse($skinShB, 13, 10, 22, 20)  # chin-side shadow
    $g.FillEllipse($skinB,   13, 4,  22, 20)  # face area
    $g.DrawEllipse($outlineP, 13, 4, 22, 20)

    # Hair / hat — fills the upper crown (top ~60% of head).
    # Use a clipping region equal to the head circle so the hair matches contour.
    $headPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $headPath.AddEllipse(13, 4, 22, 20)
    $g.SetClip($headPath)
    $g.FillRectangle($hairB, 11, 3, 26, 13)    # hair top
    # Side locks (bring hair down past temples slightly)
    $g.FillEllipse($hairB, 11, 6,  8, 10)
    $g.FillEllipse($hairB, 29, 6,  8, 10)
    # Darker shadow band where the hair meets the face
    $g.FillRectangle($hairShB, 11, 13, 26, 3)
    $g.ResetClip()

    # Optional accent (hat band, bandana knot, gold pin).
    switch ($n.accentShape) {
        'band' {
            $g.SetClip($headPath)
            $g.FillRectangle($accentB, 11, 10, 26, 3)
            $g.ResetClip()
        }
        'dot' {
            $g.FillEllipse($accentB, 22, 5, 4, 4)
        }
        default { }
    }

    # Eyes — two small dark dots just below the hairline.
    $eyeB = New-Object System.Drawing.SolidBrush $outline
    $g.FillEllipse($eyeB, 18, 17, 3, 3)
    $g.FillEllipse($eyeB, 27, 17, 3, 3)

    # Re-outline the head over the hair so contour stays crisp.
    $g.DrawEllipse($outlineP, 13, 4, 22, 20)

    $outPath = Join-Path $outDir "$($n.id).png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $eyeB.Dispose(); $skinB.Dispose(); $skinShB.Dispose(); $hairB.Dispose()
    $hairShB.Dispose(); $garmB.Dispose(); $garmShB.Dispose(); $accentB.Dispose()
    $outlineP.Dispose(); $g.Dispose(); $bmp.Dispose()
    Write-Host "wrote $outPath"
}
