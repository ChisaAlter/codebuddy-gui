param(
  [switch]$SkipBuild,
  [switch]$AllowUnsigned,
  [string]$ExpectedSignerSubject = $env:CODEBUDDY_SIGNER_SUBJECT
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $repoRoot
try {
  $package = Get-Content -Raw -LiteralPath 'package.json' | ConvertFrom-Json
  $version = [string]$package.version
  if ($version -notmatch '^\d+\.\d+\.\d+(?:[-+].+)?$') {
    throw "package.json contains an invalid release version: $version"
  }

  if (-not $SkipBuild) {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "Production build failed with exit code $LASTEXITCODE" }
  }

  $sourceName = "CodeBuddy GUI Setup $version.exe"
  $sourceInstaller = Join-Path 'dist' $sourceName
  $sourceBlockmap = "$sourceInstaller.blockmap"
  $assetName = "CodeBuddy-GUI-Setup-$version.exe"
  $assetInstaller = Join-Path 'dist' $assetName
  $assetBlockmap = "$assetInstaller.blockmap"
  $latestMetadata = Join-Path 'dist' 'latest.yml'

  foreach ($requiredPath in @($sourceInstaller, $sourceBlockmap, $latestMetadata)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
      throw "Required release artifact is missing: $requiredPath"
    }
  }

  $signature = Get-AuthenticodeSignature -LiteralPath $sourceInstaller
  $signerCertificate = $signature.SignerCertificate
  $selfSigned = $null -ne $signerCertificate -and $signerCertificate.Subject -eq $signerCertificate.Issuer
  $subjectMismatch = $signature.Status -eq 'Valid' -and -not [string]::IsNullOrWhiteSpace($ExpectedSignerSubject) -and $signerCertificate.Subject -notlike "*$ExpectedSignerSubject*"
  $releaseSignatureValid = $signature.Status -eq 'Valid' -and -not $selfSigned -and -not $subjectMismatch
  if (-not $releaseSignatureValid -and -not $AllowUnsigned) {
    $reason = if ($selfSigned) {
      "self-signed certificate $($signerCertificate.Subject)"
    } elseif ($subjectMismatch) {
      "signer $($signerCertificate.Subject) does not match expected subject $ExpectedSignerSubject"
    } else {
      "signature status $($signature.Status)"
    }
    throw "Installer is not ready for a signed release: $reason. Configure CSC_LINK/CSC_KEY_PASSWORD or rerun with -AllowUnsigned for an explicit preview release."
  }

  Copy-Item -LiteralPath $sourceInstaller -Destination $assetInstaller -Force
  Copy-Item -LiteralPath $sourceBlockmap -Destination $assetBlockmap -Force

  $metadata = Get-Content -Raw -LiteralPath $latestMetadata
  if ($metadata -notmatch [regex]::Escape($assetName)) {
    throw "latest.yml does not reference $assetName"
  }

  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $assetInstaller).Hash.ToLowerInvariant()
  Set-Content -LiteralPath (Join-Path 'dist' 'SHA256SUMS.txt') -Value "$hash  $assetName" -Encoding ASCII

  $releaseNotes = Get-Content -LiteralPath 'RELEASE_NOTES.md' -Encoding UTF8
  $releaseBody = Join-Path 'dist' "release-notes-v$version.md"
  $signatureLine = if ($releaseSignatureValid) {
    "> Installer signature: valid ($($signerCertificate.Subject))"
  } else {
    '> Installer signature: unavailable or not suitable for a trusted release. Windows SmartScreen may show a warning; verify the SHA256 checksum below.'
  }
  $header = @(
    "# CodeBuddy GUI $version",
    '',
    $signatureLine,
    '',
    '## SHA256',
    '',
    '~~~text',
    "$hash  $assetName",
    '~~~',
    ''
  )
  Set-Content -LiteralPath $releaseBody -Value $header -Encoding UTF8
  if ($releaseNotes.Length -gt 4) {
    Add-Content -LiteralPath $releaseBody -Value $releaseNotes[4..($releaseNotes.Length - 1)] -Encoding UTF8
  }

  [pscustomobject]@{
    Version = $version
    Installer = (Resolve-Path $assetInstaller).Path
    Blockmap = (Resolve-Path $assetBlockmap).Path
    Metadata = (Resolve-Path $latestMetadata).Path
    Checksums = (Resolve-Path (Join-Path 'dist' 'SHA256SUMS.txt')).Path
    ReleaseNotes = (Resolve-Path $releaseBody).Path
    Signature = if ($releaseSignatureValid) { 'Valid' } elseif ($selfSigned) { 'SelfSigned' } elseif ($subjectMismatch) { 'SubjectMismatch' } else { [string]$signature.Status }
    Signer = if ($null -ne $signerCertificate) { $signerCertificate.Subject } else { $null }
    SHA256 = $hash
  } | Format-List
} finally {
  Pop-Location
}
