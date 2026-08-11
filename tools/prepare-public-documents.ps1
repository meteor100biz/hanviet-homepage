$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$projectRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
$outputDir = Join-Path $projectRoot 'assets\images\credentials'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

function Add-PublicWatermark {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [switch]$RedactBirthDate
  )

  $sourceImage = [System.Drawing.Image]::FromFile($Source)
  try {
    $bitmap = New-Object System.Drawing.Bitmap $sourceImage.Width, $sourceImage.Height,
      ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $bitmap.SetResolution($sourceImage.HorizontalResolution, $sourceImage.VerticalResolution)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.DrawImageUnscaled($sourceImage, 0, 0)
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

      if ($RedactBirthDate) {
        # Cover only the value 1975.09.30. The label and all other certificate data remain untouched.
        $redactionBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 223, 239, 237))
        $redactionRect = New-Object System.Drawing.RectangleF 169, 267, 91, 24
        $graphics.FillRectangle($redactionBrush, $redactionRect)
        $redactionBrush.Dispose()

        $privacyFont = New-Object System.Drawing.Font 'Malgun Gothic', 10,
          ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
        $privacyBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 72, 87, 92))
        $privacyFormat = New-Object System.Drawing.StringFormat
        $privacyFormat.Alignment = [System.Drawing.StringAlignment]::Center
        $privacyFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
        $graphics.DrawString('비공개', $privacyFont, $privacyBrush, $redactionRect, $privacyFormat)
        $privacyFormat.Dispose()
        $privacyBrush.Dispose()
        $privacyFont.Dispose()
      }

      $watermarkText = '한베커플 홈페이지 공개용 · 복사/제출용 아님'
      $fontSize = [Math]::Max(12, [Math]::Round($bitmap.Width / 28))
      $watermarkFont = New-Object System.Drawing.Font 'Malgun Gothic', $fontSize,
        ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
      $watermarkBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(42, 6, 38, 92))
      $textSize = $graphics.MeasureString($watermarkText, $watermarkFont)

      $state = $graphics.Save()
      $graphics.TranslateTransform($bitmap.Width / 2, $bitmap.Height * 0.62)
      $graphics.RotateTransform(-24)
      $graphics.DrawString($watermarkText, $watermarkFont, $watermarkBrush,
        (-$textSize.Width / 2), (-$textSize.Height / 2))
      $graphics.Restore($state)

      $watermarkBrush.Dispose()
      $watermarkFont.Dispose()
    }
    finally {
      $graphics.Dispose()
    }

    $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
  }
  finally {
    $sourceImage.Dispose()
  }
}

$documents = @(
  @{ Source = 'D:\down\사업자등록증.png'; Destination = 'business-registration-public.png'; Redact = $false },
  @{ Source = 'D:\down\수료증.png'; Destination = 'education-certificate-public.png'; Redact = $false },
  @{ Source = 'D:\down\보험증권.png'; Destination = 'guarantee-insurance-public.png'; Redact = $false },
  @{ Source = 'D:\down\국제결혼중개업 등록증_color-converted.png'; Destination = 'marriage-brokerage-license-public.png'; Redact = $true }
)

foreach ($document in $documents) {
  $parameters = @{
    Source = $document.Source
    Destination = Join-Path $outputDir $document.Destination
  }
  if ($document.Redact) { $parameters.RedactBirthDate = $true }
  Add-PublicWatermark @parameters
}

Write-Output "Prepared public documents in $outputDir"
