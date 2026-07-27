<#
  build-cards.ps1 — собирает колоду 52 карты + рубашку из сгенерированных
  nano banana ассетов.

  Вход (Downloads\card-imgs):
    spades|hearts|diamonds|clubs.png — 1024x1024, ЧЁРНЫЙ силуэт на БЕЛОМ фоне
    back.png                         — рубашка на СПЛОШНОЙ МАГЕНТЕ (#FF00FF)

  Выход: client\public\cards\{RANK}{SUIT}.png + back.png, 160x224 (ровно 1.4 —
  Card.tsx рисует height = width * 1.4, при другом соотношении карта сплющится).

  Почему гибрид, а не 52 генерации: карты стоят рядом, любой разнобой в толщине
  штриха и положении индекса виден сразу. Нейросеть даёт только 4 силуэта мастей
  и рубашку, сами лица собираются здесь по одному шаблону — тогда все 52
  идентичны.

  Ключевые решения:
  * Нормализация мастей — ПО ПЛОЩАДИ ЗАЛИВКИ, а не по bbox. У червы bbox
    846x769 против 682x768 у пики, но заливки на 55% больше: по bbox она вышла
    бы визуально тяжелее всех.
  * Четырёхцветка (пики чёрные, червы красные, бубны циановые, трефы зелёные) —
    на 28px масть по форме уже не читается, цвет несёт основную нагрузку.
  * Крупный индекс в ЛЕВОМ ВЕРХНЕМ углу: карманные карты накладываются на 42%
    ширины (SeatsDisplay.tsx), у нижней видна только левая половина.
  * Вотермарка Gemini в правом нижнем углу рубашки затирается зеркальным
    патчем из левого нижнего угла — рисунок симметричен.

  Запуск:  powershell -File scripts\build-cards.ps1
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# Путь строим от $env:USERPROFILE, а не литералом: имя пользователя кириллическое.
$SRC_DIR = Join-Path $env:USERPROFILE "Downloads\card-imgs"
$OUT_DIR = Join-Path $PSScriptRoot "..\client\public\cards"
$SHEET   = Join-Path $env:TEMP "cards-sheet.png"

$csharp = @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class Suit {
  public string Name;
  public char Code;
  public Color Col;
  public Bitmap Mask;   // обрезан по bbox; RGB = цвет масти, alpha = силуэт
  public double Ink;    // площадь заливки в пикселях исходника
  public int W, H;
}

public class CardBuild {
  // --- геометрия карты (в пикселях холста 160x224) ---
  public const int W = 160;
  public const int H = 224;
  public const float R = 12f;          // радиус скругления, 7.5% ширины

  const float BORDER_W   = 2.5f;
  const float IDX_CX     = 35f;        // центр колонки индекса
  const float IDX_TOP    = 12f;
  const float RANK_CAP_H = 44f;
  const float RANK_MAX_W = 46f;
  const float IDX_SUIT_W = 36f;        // ширина В ПЕРЕСЧЁТЕ НА ПИКУ
  const float IDX_SUIT_GAP = 4f;
  const float CTR_SUIT_W = 90f;
  const float CTR_CY     = 150f;

  static readonly Color FACE_TOP = Color.FromArgb(0xF7, 0xF9, 0xFC);
  static readonly Color FACE_BOT = Color.FromArgb(0xE3, 0xE8, 0xF0);
  static readonly Color BORDER   = Color.FromArgb(0xB0, 0xBE, 0xC5);
  static readonly Color BACK_BG  = Color.FromArgb(0x0A, 0x0A, 0x0E);

  // ---------- утилиты ----------

  static byte[] Grab(Bitmap b, out int stride) {
    Rectangle r = new Rectangle(0, 0, b.Width, b.Height);
    BitmapData d = b.LockBits(r, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    stride = d.Stride;
    byte[] p = new byte[stride * b.Height];
    Marshal.Copy(d.Scan0, p, 0, p.Length);
    b.UnlockBits(d);
    return p;
  }

  static Bitmap FromBytes(byte[] p, int w, int h, int stride) {
    Bitmap b = new Bitmap(w, h, PixelFormat.Format32bppArgb);
    BitmapData d = b.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
    // stride исходного буфера может отличаться от нового — копируем построчно
    for (int y = 0; y < h; y++)
      Marshal.Copy(p, y * stride, (IntPtr)(d.Scan0.ToInt64() + y * d.Stride), w * 4);
    b.UnlockBits(d);
    return b;
  }

  // Save() поверх существующего файла СОХРАНЯЕТ СТАРЫЙ РЕГИСТР имени в каталоге
  // NTFS. Так в репозитории и завёлся BACK.png при трекаемом back.png: Windows
  // регистронезависима и локально всё работало, а nginx на Linux файл не находил.
  // Удаляем перед записью — тогда запись каталога создаётся с нужным регистром.
  static void SaveExact(Bitmap b, string path) {
    if (System.IO.File.Exists(path)) System.IO.File.Delete(path);
    b.Save(path, ImageFormat.Png);
  }

  static GraphicsPath RoundRect(float x, float y, float w, float h, float r) {
    GraphicsPath p = new GraphicsPath();
    p.AddArc(x, y, 2 * r, 2 * r, 180, 90);
    p.AddArc(x + w - 2 * r, y, 2 * r, 2 * r, 270, 90);
    p.AddArc(x + w - 2 * r, y + h - 2 * r, 2 * r, 2 * r, 0, 90);
    p.AddArc(x, y + h - 2 * r, 2 * r, 2 * r, 90, 90);
    p.CloseFigure();
    return p;
  }

  static Graphics Quality(Bitmap b) {
    Graphics g = Graphics.FromImage(b);
    g.SmoothingMode = SmoothingMode.AntiAlias;
    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
    g.PixelOffsetMode = PixelOffsetMode.HighQuality;
    g.CompositingQuality = CompositingQuality.HighQuality;
    return g;
  }

  // ---------- масти ----------

  // Чёрный силуэт на белом -> ARGB, alpha = 255 - яркость, RGB = цвет масти.
  // RGB заливается ЦЕЛИКОМ (включая прозрачные пиксели), иначе при уменьшении
  // бикубик подмешает белый и по контуру пойдёт светлая кайма.
  public static Suit MakeSuit(string path, string name, char code, int argb, int cutoff) {
    Color col = Color.FromArgb(argb);
    Bitmap src = new Bitmap(path);
    int w = src.Width, h = src.Height, st;
    byte[] s = Grab(src, out st);
    src.Dispose();

    byte[] a = new byte[w * h];
    double ink = 0;
    int x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        int i = y * st + x * 4;
        int lum = (s[i] * 29 + s[i + 1] * 150 + s[i + 2] * 77) >> 8;
        int al = 255 - lum;
        if (al < cutoff) al = 0;
        a[y * w + x] = (byte)al;
        if (al > 0) {
          ink += al / 255.0;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }

    int bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    Bitmap mask = new Bitmap(bw, bh, PixelFormat.Format32bppArgb);
    BitmapData md = mask.LockBits(new Rectangle(0, 0, bw, bh), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
    byte[] m = new byte[md.Stride * bh];
    for (int y = 0; y < bh; y++) {
      for (int x = 0; x < bw; x++) {
        int i = y * md.Stride + x * 4;
        m[i] = col.B; m[i + 1] = col.G; m[i + 2] = col.R;
        m[i + 3] = a[(y + y0) * w + (x + x0)];
      }
    }
    Marshal.Copy(m, 0, md.Scan0, m.Length);
    mask.UnlockBits(md);

    Suit su = new Suit();
    su.Name = name; su.Code = code; su.Col = col; su.Mask = mask;
    su.Ink = ink; su.W = bw; su.H = bh;
    return su;
  }

  // Масштаб, при котором площадь заливки масти равна площади ПИКИ, отрисованной
  // шириной spadeW. Нормализация по массе, а не по габаритам.
  static float ScaleFor(Suit s, Suit spade, float spadeW) {
    double targetInk = spade.Ink * Math.Pow(spadeW / spade.W, 2);
    return (float)Math.Sqrt(targetInk / s.Ink);
  }

  static void DrawSuit(Graphics g, Suit s, Suit spade, float spadeW, float cx, float cy) {
    float k = ScaleFor(s, spade, spadeW);
    float dw = s.W * k, dh = s.H * k;
    g.DrawImage(s.Mask, cx - dw / 2f, cy - dh / 2f, dw, dh);
  }

  // ---------- ранг ----------

  // Общий кегль для всех рангов берём по высоте "0": так 2..9, T, J, Q, K, A
  // получают одинаковую высоту прописной, а не подгоняются каждый под себя.
  static float refCapH = -1;

  static GraphicsPath RankPath(string rank, FontFamily ff, float cx, float top) {
    GraphicsPath p = new GraphicsPath();
    p.AddString(rank, ff, (int)FontStyle.Regular, 100f, new PointF(0, 0), StringFormat.GenericTypographic);
    if (refCapH < 0) {
      GraphicsPath r0 = new GraphicsPath();
      r0.AddString("0", ff, (int)FontStyle.Regular, 100f, new PointF(0, 0), StringFormat.GenericTypographic);
      refCapH = r0.GetBounds().Height;
      r0.Dispose();
    }
    float k = RANK_CAP_H / refCapH;
    RectangleF b = p.GetBounds();
    float sx = k, sy = k;
    if (b.Width * k > RANK_MAX_W) sx = RANK_MAX_W / b.Width;   // "10" поджимаем по ширине

    Matrix m = new Matrix();
    m.Translate(cx, top);
    m.Scale(sx, sy);
    m.Translate(-(b.X + b.Width / 2f), -b.Y);
    p.Transform(m);
    m.Dispose();
    return p;
  }

  // ---------- лицо карты ----------

  public static void RenderFace(string outPath, string rank, Suit s, Suit spade, FontFamily ff) {
    Bitmap bmp = new Bitmap(W, H, PixelFormat.Format32bppArgb);
    Graphics g = Quality(bmp);

    GraphicsPath card = RoundRect(0, 0, W, H, R);
    using (LinearGradientBrush lg = new LinearGradientBrush(new Rectangle(0, -1, W, H + 2), FACE_TOP, FACE_BOT, 90f))
      g.FillPath(lg, card);

    float bi = BORDER_W / 2f;
    using (GraphicsPath bp = RoundRect(bi, bi, W - BORDER_W, H - BORDER_W, R - bi))
    using (Pen pen = new Pen(BORDER, BORDER_W))
      g.DrawPath(pen, bp);

    using (GraphicsPath rp = RankPath(rank, ff, IDX_CX, IDX_TOP))
    using (SolidBrush br = new SolidBrush(s.Col))
      g.FillPath(br, rp);

    float idxSuitH = spade.H * ScaleFor(spade, spade, IDX_SUIT_W);
    DrawSuit(g, s, spade, IDX_SUIT_W, IDX_CX, IDX_TOP + RANK_CAP_H + IDX_SUIT_GAP + idxSuitH / 2f);
    DrawSuit(g, s, spade, CTR_SUIT_W, W / 2f, CTR_CY);

    g.Dispose();
    Bitmap outb = MaskCorners(bmp);
    bmp.Dispose();
    SaveExact(outb, outPath);
    outb.Dispose();
    card.Dispose();
  }

  // Скругление углов через альфу: рисуем в новый холст с клипом по rounded rect.
  static Bitmap MaskCorners(Bitmap src) {
    Bitmap outb = new Bitmap(W, H, PixelFormat.Format32bppArgb);
    Graphics g = Quality(outb);
    using (GraphicsPath p = RoundRect(0, 0, W, H, R)) {
      g.SetClip(p);
      g.DrawImage(src, 0, 0, W, H);
    }
    g.Dispose();
    return outb;
  }

  // ---------- рубашка ----------

  public static string RenderBack(string srcPath, string outPath) {
    Bitmap src = new Bitmap(srcPath);
    int w = src.Width, h = src.Height, st;
    byte[] p = Grab(src, out st);
    src.Dispose();

    // 1. bbox карты = всё, что не магента
    int x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (int y = 0; y < h; y++)
      for (int x = 0; x < w; x++) {
        int i = y * st + x * 4;
        if (!IsMagenta(p[i + 2], p[i + 1], p[i])) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }

    // 2. вотермарка Gemini: зеркалим патч относительно вертикальной оси карты
    int axis2 = x0 + x1;                       // 2 * центр
    int px0 = (int)(x0 + (x1 - x0) * 0.84), px1 = x1;
    int py0 = (int)(y0 + (y1 - y0) * 0.90), py1 = y1;
    byte[] copy = (byte[])p.Clone();
    for (int y = py0; y <= py1; y++)
      for (int x = px0; x <= px1; x++) {
        int sx = axis2 - x;
        if (sx < 0 || sx >= w) continue;
        Buffer.BlockCopy(copy, y * st + sx * 4, p, y * st + x * 4, 4);
      }

    // 3. выбиваем магенту и заливаем её цветом карты, чтобы при уменьшении
    //    бикубик не подмешал розовое по контуру
    for (int y = 0; y < h; y++)
      for (int x = 0; x < w; x++) {
        int i = y * st + x * 4;
        if (IsMagenta(p[i + 2], p[i + 1], p[i])) {
          p[i] = BACK_BG.B; p[i + 1] = BACK_BG.G; p[i + 2] = BACK_BG.R; p[i + 3] = 0;
        }
      }

    Bitmap keyed = FromBytes(p, w, h, st);
    Bitmap bmp = new Bitmap(W, H, PixelFormat.Format32bppArgb);
    Graphics g = Quality(bmp);
    using (GraphicsPath card = RoundRect(0, 0, W, H, R))
    using (SolidBrush br = new SolidBrush(BACK_BG))
      g.FillPath(br, card);
    g.DrawImage(keyed, new Rectangle(0, 0, W, H),
                new Rectangle(x0, y0, x1 - x0 + 1, y1 - y0 + 1), GraphicsUnit.Pixel);
    g.Dispose();
    keyed.Dispose();

    Bitmap outb = MaskCorners(bmp);
    bmp.Dispose();
    SaveExact(outb, outPath);
    outb.Dispose();
    return string.Format("crop ({0},{1})-({2},{3}) {4}x{5} h/w={6:F3}",
                         x0, y0, x1, y1, x1 - x0 + 1, y1 - y0 + 1, (y1 - y0 + 1.0) / (x1 - x0 + 1.0));
  }

  static bool IsMagenta(int r, int g, int b) { return Math.Min(r, b) - g > 30; }

  // ---------- контрольный лист ----------

  // Карты в трёх масштабах: 28px (минимум на мобиле), 40px (карманные),
  // 60px (десктоп). Если на 28px ранг не читается — вёрстка лица не годится.
  public static void Sheet(string dir, string[] files, string outPath) {
    int[] sizes = new int[] { 28, 40, 60 };
    int cols = 13, pad = 6, y = pad;
    int totalH = pad;
    foreach (int s in sizes) totalH += 4 * ((int)(s * 1.4) + pad);
    int totalW = pad + cols * (60 + pad);

    Bitmap sheet = new Bitmap(totalW, totalH, PixelFormat.Format32bppArgb);
    Graphics g = Quality(sheet);
    g.Clear(Color.FromArgb(0x12, 0x1A, 0x16));   // тёмный фон — как сукно стола
    foreach (int s in sizes) {
      int ch = (int)(s * 1.4);
      for (int i = 0; i < files.Length; i++) {
        int col = i % cols, row = i / cols;
        using (Bitmap b = new Bitmap(System.IO.Path.Combine(dir, files[i])))
          g.DrawImage(b, pad + col * (60 + pad), y + row * (ch + pad), s, ch);
      }
      y += 4 * (ch + pad);
    }
    g.Dispose();
    sheet.Save(outPath, ImageFormat.Png);
    sheet.Dispose();
  }
}
'@
Add-Type -TypeDefinition $csharp -ReferencedAssemblies System.Drawing

if (-not (Test-Path $OUT_DIR)) { New-Item -ItemType Directory -Force -Path $OUT_DIR | Out-Null }

# Классическая двухцветка: пики и трефы чёрные, бубны и червы красные.
# Красный ярче палитрового #ff4757 — тот на светлом лице выглядит приглушённо-коралловым.
$INK = 0xFF0A0A0E
$RED = 0xFFFF0F26
$CUTOFF = 24
$spades   = [CardBuild]::MakeSuit((Join-Path $SRC_DIR 'spades.png'),   'spades',   'S', $INK, $CUTOFF)
$hearts   = [CardBuild]::MakeSuit((Join-Path $SRC_DIR 'hearts.png'),   'hearts',   'H', $RED, $CUTOFF)
$diamonds = [CardBuild]::MakeSuit((Join-Path $SRC_DIR 'diamonds.png'), 'diamonds', 'D', $RED, $CUTOFF)
$clubs    = [CardBuild]::MakeSuit((Join-Path $SRC_DIR 'clubs.png'),    'clubs',    'C', $INK, $CUTOFF)
$suits = @($spades, $hearts, $diamonds, $clubs)

"Масти (нормализация по площади заливки, эталон — пика):"
foreach ($s in $suits) {
  "  {0,-9} bbox {1}x{2}  ink {3:N0}  scale x{4:F3}" -f `
    $s.Name, $s.W, $s.H, $s.Ink, [Math]::Sqrt($spades.Ink / $s.Ink)
}

$ff = New-Object System.Drawing.FontFamily('Arial Black')
# T рисуется как "10": файл называется TS.png (server/Deck.ts), а на лице десятка.
$RANKS = [ordered]@{ '2'='2'; '3'='3'; '4'='4'; '5'='5'; '6'='6'; '7'='7'; '8'='8'; '9'='9'; 'T'='10'; 'J'='J'; 'Q'='Q'; 'K'='K'; 'A'='A' }

$files = @()
foreach ($s in $suits) {
  foreach ($code in $RANKS.Keys) {
    $name = "$code$($s.Code).png"
    [CardBuild]::RenderFace((Join-Path $OUT_DIR $name), $RANKS[$code], $s, $spades, $ff)
    $files += $name
  }
}
"`nЛица: $($files.Count) шт. -> $OUT_DIR"

"Рубашка: " + [CardBuild]::RenderBack((Join-Path $SRC_DIR 'back.png'), (Join-Path $OUT_DIR 'back.png'))

[CardBuild]::Sheet($OUT_DIR, $files, $SHEET)
"Контрольный лист (28/40/60px на тёмном фоне): $SHEET"

$ff.Dispose()
foreach ($s in $suits) { $s.Mask.Dispose() }
