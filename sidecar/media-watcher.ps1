# Streams the current Windows media session (SMTC) as JSON lines on stdout.
# Runs under Windows PowerShell 5.1, which can load WinRT types directly.
param([int]$IntervalMs = 500, [switch]$Once)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($op, [Type]$resultType) {
    $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($op))
    $task.Wait(-1) | Out-Null
    $task.Result
}

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$manager = Await ($mgrType::RequestAsync()) $mgrType

$last = ''
$sinceEmit = [Diagnostics.Stopwatch]::StartNew()
while ($true) {
    $out = @{ type = 'none' }
    try {
        $session = $manager.GetCurrentSession()
        if ($session) {
            $props = Await ($session.TryGetMediaPropertiesAsync()) $propsType
            $timeline = $session.GetTimelineProperties()
            $playback = $session.GetPlaybackInfo()
            $out = @{
                type        = 'track'
                title       = $props.Title
                artist      = $props.Artist
                album       = $props.AlbumTitle
                sourceApp   = $session.SourceAppUserModelId
                durationMs  = [int64]($timeline.EndTime.TotalMilliseconds)
                positionMs  = [int64]($timeline.Position.TotalMilliseconds)
                # LastUpdatedTime lets the app extrapolate position between sparse updates
                updatedAt   = [int64]($timeline.LastUpdatedTime.ToUnixTimeMilliseconds())
                isPlaying   = ($playback.PlaybackStatus -eq 'Playing')
            }
        }
    } catch {
        $out = @{ type = 'error'; message = $_.Exception.Message }
    }
    $json = $out | ConvertTo-Json -Compress
    # Only emit on change, plus a heartbeat every ~2s so the app knows we're alive
    if ($json -ne $last -or $sinceEmit.ElapsedMilliseconds -ge 2000) {
        $sinceEmit.Restart()
        [Console]::Out.WriteLine($json)
        [Console]::Out.Flush()
        $last = $json
    }
    if ($Once) { break }
    Start-Sleep -Milliseconds $IntervalMs
}
