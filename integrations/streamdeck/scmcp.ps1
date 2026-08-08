<#
.SYNOPSIS
    Query the SCMCP daemon from a Stream Deck key and optionally speak the answer.

.DESCRIPTION
    Bind this to a Stream Deck "System > Open" action, or to a Multi Action, with
    the App/File set to powershell.exe and the arguments set to:

        -ExecutionPolicy Bypass -File "C:\path\to\scmcp.ps1" -Preset sell -Arg commodity=Gold

    The daemon must already be running (npm run daemon).

.PARAMETER Preset
    A voice preset name: sell, buy, route, top. Returns one spoken sentence.

.PARAMETER Tool
    A raw tool name instead of a preset (e.g. uex_get_commodity_prices).
    Returns JSON, which is useful with -Raw but not with -Speak.

.PARAMETER Ask
    A natural-language question, routed through the model. Slower and costs
    API credit; use a preset where one exists.

.PARAMETER Arg
    Repeatable key=value query parameters, e.g. -Arg commodity=Gold -Arg system=Stanton

.PARAMETER Speak
    Read the answer aloud through the Windows speech synthesiser. On by default
    for presets and questions; ignored for -Tool.

.EXAMPLE
    .\scmcp.ps1 -Preset sell -Arg commodity=Gold

.EXAMPLE
    .\scmcp.ps1 -Preset route -Arg scu=96 -Arg investment=1000000

.EXAMPLE
    .\scmcp.ps1 -Ask "what shields does a Carrack come with?"
#>
[CmdletBinding(DefaultParameterSetName = 'Preset')]
param(
    [Parameter(ParameterSetName = 'Preset', Mandatory = $true)]
    [string]$Preset,

    [Parameter(ParameterSetName = 'Tool', Mandatory = $true)]
    [string]$Tool,

    [Parameter(ParameterSetName = 'Ask', Mandatory = $true)]
    [string]$Ask,

    [string[]]$Arg = @(),

    [string]$BaseUrl = $(if ($env:SCMCP_URL) { $env:SCMCP_URL } else { 'http://127.0.0.1:7331' }),

    [string]$Token = $env:SCMCP_HTTP_TOKEN,

    [int]$TimeoutSec = 20,

    [switch]$Raw,

    [switch]$NoSpeak
)

$ErrorActionPreference = 'Stop'

function Get-QueryString {
    param([string[]]$Pairs)
    if (-not $Pairs -or $Pairs.Count -eq 0) { return '' }
    $encoded = foreach ($pair in $Pairs) {
        $split = $pair -split '=', 2
        if ($split.Count -ne 2) { throw "Argument '$pair' must be in key=value form." }
        '{0}={1}' -f [uri]::EscapeDataString($split[0]), [uri]::EscapeDataString($split[1])
    }
    '?' + ($encoded -join '&')
}

function Invoke-Scmcp {
    param([string]$Path)
    $headers = @{}
    if ($Token) { $headers['X-SCMCP-Token'] = $Token }
    # -UseBasicParsing keeps this working on hosts without Internet Explorer,
    # and the loopback address is never proxied.
    $response = Invoke-WebRequest -Uri ($BaseUrl + $Path) -Headers $headers `
        -TimeoutSec $TimeoutSec -UseBasicParsing
    return $response.Content
}

function Out-Speech {
    param([string]$Text)
    Add-Type -AssemblyName System.Speech
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    try { $synth.Speak($Text) } finally { $synth.Dispose() }
}

$query = Get-QueryString -Pairs $Arg

switch ($PSCmdlet.ParameterSetName) {
    'Preset' { $path = "/say/$([uri]::EscapeDataString($Preset))$query"; $speakable = $true }
    'Tool'   { $path = "/q/$([uri]::EscapeDataString($Tool))$query";     $speakable = $false }
    'Ask'    { $path = "/ask?q=$([uri]::EscapeDataString($Ask))";        $speakable = $true }
}

try {
    $answer = Invoke-Scmcp -Path $path
}
catch {
    # A dead daemon or a timeout should still tell you something out loud rather
    # than opening a red console window you cannot read mid-flight.
    $answer = 'The Star Citizen daemon did not respond.'
    if (-not $NoSpeak -and $speakable) { Out-Speech -Text $answer }
    Write-Error $_
    exit 1
}

if ($Raw -or -not $speakable) {
    Write-Output $answer
}

if ($speakable -and -not $NoSpeak) {
    Out-Speech -Text $answer
}
