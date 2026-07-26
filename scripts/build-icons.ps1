<#
  build-icons.ps1 — превращает сгенерированные nano banana картинки в CSS-маски.

  Вход:  1024x1024 PNG/JFIF, неоновый рисунок на СПЛОШНОМ ЧЁРНОМ фоне.
  Выход: 256x256 PNG, RGB=белый, alpha = яркость исходника.

  Почему маски, а не цветные картинки: цвет иконки берётся из токенов Neon Strip
  через CSS (`background: var(--color-*)` + `mask-image`), а не запекается в PNG.
  Тогда оттенки гарантированно совпадают с остальным интерфейсом, а свечение
  добавляется через `filter: drop-shadow()` с теми же токенами.

  Нормализация: каждая иконка обрезается по bbox альфы и вписывается так, чтобы
  большая сторона занимала ICON_FILL от холста. Без этого иконки едут друг
  относительно друга — модель оставляет разный отступ (у A1v2 контент 46% холста,
  у остальных 71–85%).

  Запуск:  pwsh -File scripts/build-icons.ps1
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# Путь строим от $env:USERPROFILE, а не литералом: имя пользователя кириллическое,
# и Windows PowerShell 5.1 без BOM прочитал бы его как ANSI и сломал.
$SRC_DIR = Join-Path $env:USERPROFILE "Downloads\tgp-icons"
$OUT_DIR = Join-Path $PSScriptRoot "..\client\public\icons"
$CANVAS   = 256
$ICON_FILL = 0.88   # доля холста под большую сторону контента
$ALPHA_CUTOFF = 40  # ниже — считаем фоном (съедает JPEG-грязь и остаточный bloom)

# source basename -> output icon name
$MAP = [ordered]@{
  'A1v2' = 'tier-funnel'
  'A2'   = 'tier-beginner'
  'A3'   = 'tier-standard'
  'A4'   = 'tier-pro'
  'A5'   = 'tier-highstakes'
  'B1'   = 'deposit-success'
  'B2'   = 'history-empty'
  'B3v2' = 'edit-pencil'
  'B4'   = 'chat-luck'
  'B5'   = 'play-cards'
  'C1'   = 'admin-ok'
  'C2'   = 'admin-warn'
  'C3'   = 'admin-flag'
}

$csharp = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class IconBuild {
  // alpha = max(R,G,B); ниже cutoff -> 0. RGB принудительно белый: маске важен только alpha.
  public static Bitmap ToMask(string src, int cutoff) {
    Bitmap b = new Bitmap(src);
    int w = b.Width, h = b.Height;
    Bitmap d = new Bitmap(w, h, PixelFormat.Format32bppArgb);
    Rectangle r = new Rectangle(0, 0, w, h);
    BitmapData sb = b.LockBits(r, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    BitmapData db = d.LockBits(r, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
    int st = sb.Stride;
    byte[] s = new byte[st * h];
    byte[] o = new byte[st * h];
    Marshal.Copy(sb.Scan0, s, 0, s.Length);
    for (int i = 0; i < s.Length; i += 4) {
      int B = s[i], G = s[i + 1], R = s[i + 2];
      int mx = Math.Max(R, Math.Max(G, B));
      if (mx < cutoff) { o[i] = 0; o[i + 1] = 0; o[i + 2] = 0; o[i + 3] = 0; }
      else { o[i] = 255; o[i + 1] = 255; o[i + 2] = 255; o[i + 3] = (byte)mx; }
    }
    Marshal.Copy(o, 0, db.Scan0, o.Length);
    b.UnlockBits(sb); d.UnlockBits(db); b.Dispose();
    return d;
  }

  // bbox по alpha > 12 (мягкий порог, чтобы не срезать края штриха)
  public static int[] Bbox(Bitmap d) {
    int w = d.Width, h = d.Height;
    Rectangle r = new Rectangle(0, 0, w, h);
    BitmapData bd = d.LockBits(r, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    int st = bd.Stride; byte[] p = new byte[st * h];
    Marshal.Copy(bd.Scan0, p, 0, p.Length); d.UnlockBits(bd);
    int minX = w, minY = h, maxX = -1, maxY = -1;
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
      if (p[y * st + x * 4 + 3] > 12) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return new int[] { minX, minY, maxX, maxY };
  }
}
'@
Add-Type -TypeDefinition $csharp -ReferencedAssemblies System.Drawing

if (-not (Test-Path $OUT_DIR)) { New-Item -ItemType Directory -Force -Path $OUT_DIR | Out-Null }

foreach ($key in $MAP.Keys) {
  $srcFile = Get-ChildItem $SRC_DIR -Filter "$key.*" | Select-Object -First 1
  if (-not $srcFile) { Write-Warning "source not found: $key"; continue }

  $mask = [IconBuild]::ToMask($srcFile.FullName, $ALPHA_CUTOFF)
  $bb = [IconBuild]::Bbox($mask)
  $bw = $bb[2] - $bb[0] + 1
  $bh = $bb[3] - $bb[1] + 1

  # вписываем контент так, чтобы большая сторона = ICON_FILL * CANVAS
  $scale = ($CANVAS * $ICON_FILL) / [Math]::Max($bw, $bh)
  $dw = [int][Math]::Round($bw * $scale)
  $dh = [int][Math]::Round($bh * $scale)
  $dx = [int][Math]::Round(($CANVAS - $dw) / 2.0)
  $dy = [int][Math]::Round(($CANVAS - $dh) / 2.0)

  $out = New-Object System.Drawing.Bitmap($CANVAS, $CANVAS, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'HighQuality'
  $g.CompositingQuality = 'HighQuality'
  $srcRect = New-Object System.Drawing.Rectangle($bb[0], $bb[1], $bw, $bh)
  $dstRect = New-Object System.Drawing.Rectangle($dx, $dy, $dw, $dh)
  $g.DrawImage($mask, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()

  $outPath = Join-Path $OUT_DIR "$($MAP[$key]).png"
  $out.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose(); $mask.Dispose()

  "{0,-16} <- {1,-9} bbox {2}x{3} -> {4}x{5}" -f $MAP[$key], $srcFile.Name, $bw, $bh, $dw, $dh
}

"`nDone: $OUT_DIR"
