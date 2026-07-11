[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Supervise', 'Terminate')]
  [string]$Mode,
  [Parameter(Mandatory = $true)]
  [string]$RuntimeDir,
  [Parameter(Mandatory = $true)]
  [string]$ConfigPath,
  [Parameter(Mandatory = $true)]
  [string]$StatePath,
  [Parameter(Mandatory = $true)]
  [string]$SourcePath,
  [Parameter(Mandatory = $true)]
  [string]$SourceSha256,
  [Parameter(Mandatory = $true)]
  [string]$JobName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Resolve-FullPath {
  param([string]$Value, [string]$Label)
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value.Length -gt 32767 -or $Value.IndexOf([char]0) -ge 0) {
    throw "$Label is invalid"
  }
  return [System.IO.Path]::GetFullPath($Value)
}

function Assert-DirectRuntimeFile {
  param([string]$Candidate, [string]$ExpectedName, [string]$Label, [bool]$MustExist)
  $full = Resolve-FullPath $Candidate $Label
  $parent = [System.IO.Path]::GetDirectoryName($full)
  if (-not [string]::Equals($parent, $script:ResolvedRuntimeDir, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "$Label must be a direct runtime file"
  }
  if (-not [string]::Equals([System.IO.Path]::GetFileName($full), $ExpectedName, [System.StringComparison]::Ordinal)) {
    throw "$Label name does not match the ownership token"
  }
  if ($MustExist -and -not (Test-Path -LiteralPath $full -PathType Leaf)) {
    throw "$Label is missing"
  }
  if (Test-Path -LiteralPath $full) {
    $attributes = [System.IO.File]::GetAttributes($full)
    if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "$Label cannot be a reparse point"
    }
  }
  return $full
}

function Assert-BoundedString {
  param([AllowNull()][object]$Value, [string]$Label, [int]$Maximum, [bool]$AllowEmpty)
  if ($null -eq $Value -or -not ($Value -is [string])) {
    throw "$Label must be a string"
  }
  $text = [string]$Value
  if ((-not $AllowEmpty -and $text.Length -eq 0) -or $text.Length -gt $Maximum -or $text.IndexOf([char]0) -ge 0) {
    throw "$Label is outside its allowed bounds"
  }
  return $text
}

if ($JobName -notmatch '^CodeBuddyE2E-([0-9a-f]{32})$') {
  throw 'JobName must be a random CodeBuddy E2E name'
}
$token = $Matches[1]
$script:ResolvedRuntimeDir = Resolve-FullPath $RuntimeDir 'RuntimeDir'
if (-not (Test-Path -LiteralPath $script:ResolvedRuntimeDir -PathType Container)) {
  throw 'RuntimeDir is missing'
}
$runtimeAttributes = [System.IO.File]::GetAttributes($script:ResolvedRuntimeDir)
if (($runtimeAttributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw 'RuntimeDir cannot be a reparse point'
}

$resolvedConfigPath = Assert-DirectRuntimeFile $ConfigPath "e2e-job-$token.config.json" 'ConfigPath' $true
$resolvedStatePath = Assert-DirectRuntimeFile $StatePath "e2e-job-$token.state.json" 'StatePath' $false
$resolvedSourcePath = Assert-DirectRuntimeFile $SourcePath "e2e-job-$token.cs" 'SourcePath' $true
if ($SourceSha256 -notmatch '^[0-9a-f]{64}$') {
  throw 'SourceSha256 must be a lowercase SHA-256 digest'
}
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
  $sourceStream = [System.IO.File]::OpenRead($resolvedSourcePath)
  try {
    $actualSourceHash = ([System.BitConverter]::ToString($sha256.ComputeHash($sourceStream))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sourceStream.Dispose()
  }
} finally {
  $sha256.Dispose()
}
if (-not [string]::Equals($actualSourceHash, $SourceSha256, [System.StringComparison]::Ordinal)) {
  throw 'Supervisor source hash mismatch'
}
$sourceInfo = Get-Item -LiteralPath $resolvedSourcePath
if ($sourceInfo.Length -lt 1 -or $sourceInfo.Length -gt 262144) {
  throw 'Supervisor source is outside its allowed bounds'
}
$sourceText = [System.IO.File]::ReadAllText($resolvedSourcePath, [System.Text.Encoding]::UTF8)
Add-Type -TypeDefinition $sourceText -Language CSharp | Out-Null

if ($Mode -eq 'Terminate') {
  $result = [CodeBuddy.E2E.JobSupervisor]::Terminate($JobName)
  if ([string]::IsNullOrWhiteSpace($result) -or $result.Length -gt 4096) {
    throw 'Terminate mode returned an invalid result'
  }
  [Console]::Out.WriteLine($result)
  exit 0
}

$configInfo = Get-Item -LiteralPath $resolvedConfigPath
if ($configInfo.Length -lt 2 -or $configInfo.Length -gt 524288) {
  throw 'ConfigPath is outside its allowed bounds'
}
$configText = [System.IO.File]::ReadAllText($resolvedConfigPath, [System.Text.Encoding]::UTF8)
$config = $configText | ConvertFrom-Json
$requiredProperties = @('version', 'jobName', 'executable', 'arguments', 'workingDirectory', 'environment')
$actualProperties = @($config.PSObject.Properties.Name)
foreach ($required in $requiredProperties) {
  if ($actualProperties -notcontains $required) { throw "Config is missing $required" }
}
foreach ($actual in $actualProperties) {
  if ($requiredProperties -notcontains $actual) { throw 'Config contains an unsupported property' }
}
if ([int]$config.version -ne 1) { throw 'Config version is unsupported' }
$configJobName = Assert-BoundedString $config.jobName 'config.jobName' 64 $false
if (-not [string]::Equals($configJobName, $JobName, [System.StringComparison]::Ordinal)) {
  throw 'Config JobName mismatch'
}
$executable = Assert-BoundedString $config.executable 'config.executable' 32767 $false
$workingDirectory = Assert-BoundedString $config.workingDirectory 'config.workingDirectory' 32767 $false

$arguments = @($config.arguments)
if ($arguments.Count -gt 256) { throw 'Config arguments exceed the allowed count' }
$argumentValues = New-Object 'System.Collections.Generic.List[string]'
$argumentCharacters = 0
foreach ($argument in $arguments) {
  $value = Assert-BoundedString $argument 'config.argument' 32767 $true
  $argumentCharacters += $value.Length + 1
  if ($argumentCharacters -gt 32767) { throw 'Config arguments exceed the allowed size' }
  $argumentValues.Add($value)
}

if ($null -eq $config.environment -or -not ($config.environment -is [psobject])) {
  throw 'Config environment must be an object'
}
$environmentProperties = @($config.environment.PSObject.Properties)
if ($environmentProperties.Count -gt 512) { throw 'Config environment exceeds the allowed count' }
$environmentKeys = New-Object 'System.Collections.Generic.List[string]'
$environmentValues = New-Object 'System.Collections.Generic.List[string]'
$environmentCharacters = 1
foreach ($property in $environmentProperties) {
  $key = Assert-BoundedString ([string]$property.Name) 'config.environment key' 32767 $false
  if ($key.IndexOf('=') -ge 0) { throw 'Config environment key is invalid' }
  $value = Assert-BoundedString ([string]$property.Value) 'config.environment value' 32767 $true
  $environmentCharacters += $key.Length + $value.Length + 2
  if ($environmentCharacters -gt 32760) { throw 'Config environment exceeds the allowed size' }
  $environmentKeys.Add($key)
  $environmentValues.Add($value)
}

$exitCode = [CodeBuddy.E2E.JobSupervisor]::Supervise(
  $JobName,
  $executable,
  $argumentValues.ToArray(),
  $workingDirectory,
  $environmentKeys.ToArray(),
  $environmentValues.ToArray(),
  $resolvedStatePath
)
exit $exitCode
