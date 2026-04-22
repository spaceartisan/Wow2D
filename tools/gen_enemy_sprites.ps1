# Procedurally generate 48x48 top-down sprites for "boar" and "bandit"
# matching the visual style of the placeholder NPCs.
Add-Type -AssemblyName System.Drawing

$outDir = 'c:\Users\wclif\OneDrive\SharedFiles\Wow2D\public\assets\sprites\entities'

function HexToColor([string]$hex) {
    $h = $hex.TrimStart('#')
    [System.Drawing.Color]::FromArgb(255,
        [Convert]::ToInt32($h.Substring(0,2),16),
        [Convert]::ToInt32($h.Substring(2,2),16),
        [Convert]::ToInt32($h.Substring(4,2),16))
}
function Shade([System.Drawing.Color]$c, [double]$f) {
    [System.Drawing.Color]::FromArgb(255,
        [int]([Math]::Max(0,[Math]::Min(255, $c.R * $f))),
        [int]([Math]::Max(0,[Math]::Min(255, $c.G * $f))),
        [int]([Math]::Max(0,[Math]::Min(255, $c.B * $f))))
}

# ── Boar ───────────────────────────────────────────────────────────
# Top-down view: rounded body (bigger than human), snout at the "front"
# (down = +Y since sprites face down), two pointy ears, small tusks,
# small dark eyes, pink snout tip.
$bmp = New-Object System.Drawing.Bitmap 48,48
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

$fur       = HexToColor '#6a4a2a'
$furDark   = Shade $fur 0.6
$furLight  = Shade $fur 1.15
$skin      = HexToColor '#c88a70'   # snout / nose
$skinDark  = Shade $skin 0.7
$tusk      = HexToColor '#f0e6c8'
$outline   = [System.Drawing.Color]::FromArgb(255, 25, 15, 8)

$furB      = New-Object System.Drawing.SolidBrush $fur
$furDarkB  = New-Object System.Drawing.SolidBrush $furDark
$furLightB = New-Object System.Drawing.SolidBrush $furLight
$skinB     = New-Object System.Drawing.SolidBrush $skin
$skinDarkB = New-Object System.Drawing.SolidBrush $skinDark
$tuskB     = New-Object System.Drawing.SolidBrush $tusk
$outlineP  = New-Object System.Drawing.Pen $outline, 1.2
$eyeB      = New-Object System.Drawing.SolidBrush $outline

# Body (bulkier than human): wide oval across the middle/back of the frame.
# Because sprite faces DOWN, the "head/snout" is at the top of the image
# and the hindquarters at the bottom. Actually — sprites face down meaning
# forward motion points DOWN on screen before rotation. So the snout belongs
# at the BOTTOM of the unrotated sprite (+Y = forward). We'll put the head
# at the bottom.
# Haunches/body: ellipse upper 2/3
$g.FillEllipse($furDarkB, 6, 8,  36, 26)   # shadow body
$g.FillEllipse($furB,     6, 6,  36, 26)   # main body
$g.DrawEllipse($outlineP, 6, 6,  36, 26)

# Spine ridge (lighter stripe down middle)
$g.FillRectangle($furLightB, 22, 8, 4, 22)

# Ears — two triangular tufts pointing outward near the head (bottom).
$ear1 = New-Object System.Drawing.Drawing2D.GraphicsPath
$ear1.AddPolygon(@(
    (New-Object System.Drawing.Point 14, 28),
    (New-Object System.Drawing.Point 18, 28),
    (New-Object System.Drawing.Point 12, 34)
))
$g.FillPath($furDarkB, $ear1); $g.DrawPath($outlineP, $ear1)

$ear2 = New-Object System.Drawing.Drawing2D.GraphicsPath
$ear2.AddPolygon(@(
    (New-Object System.Drawing.Point 30, 28),
    (New-Object System.Drawing.Point 34, 28),
    (New-Object System.Drawing.Point 36, 34)
))
$g.FillPath($furDarkB, $ear2); $g.DrawPath($outlineP, $ear2)

# Head (smaller oval overlapping the body's bottom half).
$g.FillEllipse($furB, 14, 26, 20, 18)
$g.DrawEllipse($outlineP, 14, 26, 20, 18)

# Snout (lighter) at the very bottom of the head.
$g.FillEllipse($skinDarkB, 18, 37, 12, 8)
$g.FillEllipse($skinB,     18, 36, 12, 7)
$g.DrawEllipse($outlineP,  18, 36, 12, 8)

# Nostrils
$g.FillEllipse($eyeB, 21, 39, 2, 2)
$g.FillEllipse($eyeB, 26, 39, 2, 2)

# Tusks — two small curved whites sticking out of the snout's sides.
$g.FillPolygon($tuskB, @(
    (New-Object System.Drawing.Point 17, 40),
    (New-Object System.Drawing.Point 15, 44),
    (New-Object System.Drawing.Point 18, 43)
))
$g.FillPolygon($tuskB, @(
    (New-Object System.Drawing.Point 30, 40),
    (New-Object System.Drawing.Point 33, 44),
    (New-Object System.Drawing.Point 30, 43)
))

# Eyes — small dark dots on the head flanks.
$g.FillEllipse($eyeB, 17, 31, 3, 3)
$g.FillEllipse($eyeB, 28, 31, 3, 3)

$outPath = Join-Path $outDir 'boar.png'
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$furB.Dispose(); $furDarkB.Dispose(); $furLightB.Dispose(); $skinB.Dispose()
$skinDarkB.Dispose(); $tuskB.Dispose(); $outlineP.Dispose(); $eyeB.Dispose()
$g.Dispose(); $bmp.Dispose()
Write-Host "wrote $outPath"

# ── Bandit ────────────────────────────────────────────────────────
# Same humanoid template as NPCs: shoulders ellipse + arm nubs + head,
# but with a dark hood covering most of the head, a cloth mask across
# the face, and a small dagger hint on one shoulder.
$bmp = New-Object System.Drawing.Bitmap 48,48
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

$skin      = HexToColor '#d8aa82'
$skinDark  = Shade $skin 0.7
$hood      = HexToColor '#2a2230'    # dark grey-purple
$hoodDark  = Shade $hood 0.55
$hoodLight = Shade $hood 1.25
$cloak     = HexToColor '#3a3040'
$cloakDark = Shade $cloak 0.6
$mask      = HexToColor '#4a3a40'    # cloth mask
$blade     = HexToColor '#cfd4da'
$bladeDk   = Shade $blade 0.65
$outline   = [System.Drawing.Color]::FromArgb(255, 18, 12, 18)

$skinB     = New-Object System.Drawing.SolidBrush $skin
$skinDB    = New-Object System.Drawing.SolidBrush $skinDark
$hoodB     = New-Object System.Drawing.SolidBrush $hood
$hoodDB    = New-Object System.Drawing.SolidBrush $hoodDark
$hoodLB    = New-Object System.Drawing.SolidBrush $hoodLight
$cloakB    = New-Object System.Drawing.SolidBrush $cloak
$cloakDB   = New-Object System.Drawing.SolidBrush $cloakDark
$maskB     = New-Object System.Drawing.SolidBrush $mask
$bladeB    = New-Object System.Drawing.SolidBrush $blade
$bladeDkB  = New-Object System.Drawing.SolidBrush $bladeDk
$outlineP  = New-Object System.Drawing.Pen $outline, 1.2
$eyeB      = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 240, 210, 90))  # menacing yellow eyes

# Torso / cloak
$g.FillEllipse($cloakDB, 5, 26, 38, 20)
$g.FillEllipse($cloakB,  5, 22, 38, 22)
$g.DrawEllipse($outlineP, 5, 22, 38, 22)

# Cloak fold down the middle
$fold = New-Object System.Drawing.Drawing2D.GraphicsPath
$fold.AddPolygon(@(
    (New-Object System.Drawing.Point 21, 22),
    (New-Object System.Drawing.Point 27, 22),
    (New-Object System.Drawing.Point 24, 46)
))
$g.FillPath($cloakDB, $fold)

# Arm nubs (dark sleeves, not bare skin)
$g.FillEllipse($cloakDB, 2,  26, 10, 10)
$g.DrawEllipse($outlineP, 2, 26, 10, 10)
$g.FillEllipse($cloakDB, 36, 26, 10, 10)
$g.DrawEllipse($outlineP, 36, 26, 10, 10)

# Dagger — a small silver blade tucked against the right shoulder.
$g.FillPolygon($bladeB, @(
    (New-Object System.Drawing.Point 38, 20),
    (New-Object System.Drawing.Point 42, 20),
    (New-Object System.Drawing.Point 40, 30)
))
$g.FillRectangle($bladeDkB, 38, 29, 4, 3)   # crossguard hint

# Head — skin visible in the center, hood wrapping around.
$g.FillEllipse($skinDB, 13, 10, 22, 20)
$g.FillEllipse($skinB,  13, 4,  22, 20)
$g.DrawEllipse($outlineP, 13, 4, 22, 20)

# Hood — covers top & sides of head, forming a peaked silhouette.
$headPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$headPath.AddEllipse(13, 4, 22, 20)
$g.SetClip($headPath)
# Fill most of the head with hood color, leaving a small face opening.
$g.FillRectangle($hoodB, 11, 3, 26, 13)
$g.FillEllipse($hoodB, 10, 6, 12, 14)
$g.FillEllipse($hoodB, 26, 6, 12, 14)
# Hood shadow edge against face opening
$g.FillRectangle($hoodDB, 11, 13, 26, 2)
$g.ResetClip()

# Hood peak — a little point/fold extending up above the head outline.
$peak = New-Object System.Drawing.Drawing2D.GraphicsPath
$peak.AddPolygon(@(
    (New-Object System.Drawing.Point 20, 5),
    (New-Object System.Drawing.Point 28, 5),
    (New-Object System.Drawing.Point 24, 1)
))
$g.FillPath($hoodB, $peak); $g.DrawPath($outlineP, $peak)

# Mask — a dark band across the face below the eyes.
$g.SetClip($headPath)
$g.FillRectangle($maskB, 13, 19, 22, 5)
$g.ResetClip()

# Eyes — glowing yellow slits under the hood.
$g.FillEllipse($eyeB, 18, 16, 3, 3)
$g.FillEllipse($eyeB, 27, 16, 3, 3)

# Re-outline head to keep contour crisp over hood/mask.
$g.DrawEllipse($outlineP, 13, 4, 22, 20)

$outPath = Join-Path $outDir 'bandit.png'
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

$skinB.Dispose(); $skinDB.Dispose(); $hoodB.Dispose(); $hoodDB.Dispose()
$hoodLB.Dispose(); $cloakB.Dispose(); $cloakDB.Dispose(); $maskB.Dispose()
$bladeB.Dispose(); $bladeDkB.Dispose(); $outlineP.Dispose(); $eyeB.Dispose()
$g.Dispose(); $bmp.Dispose()
Write-Host "wrote $outPath"
