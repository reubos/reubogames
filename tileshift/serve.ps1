param([int]$Port = 3456)
$root = $PSScriptRoot
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$Port/"
while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request; $res = $ctx.Response
    $path = $req.Url.LocalPath -replace '^/', ''
    if ($path -eq '') { $path = 'index.html' }
    $file = Join-Path $root $path
    if (Test-Path $file -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($file)
        $mime = switch ($ext) {
            '.html' { 'text/html' } '.js' { 'application/javascript' }
            '.css'  { 'text/css'  } '.png' { 'image/png' }
            '.ico'  { 'image/x-icon' } default { 'application/octet-stream' }
        }
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $res.ContentType = $mime; $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $res.StatusCode = 404
    }
    $res.OutputStream.Close()
}
