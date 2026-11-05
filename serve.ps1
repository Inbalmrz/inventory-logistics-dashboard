# Optional local preview server. The app also works by double-clicking index.html.
$port = 8765
$root = $PSScriptRoot
$types = @{ '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8' }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Serving on http://localhost:$port/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
  if (-not $rel) { $rel = 'index.html' }
  $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
  if ($path.StartsWith($root) -and (Test-Path -LiteralPath $path -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($path)
    $type = $types[[IO.Path]::GetExtension($path)]
    if ($type) { $ctx.Response.ContentType = $type }
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.Close()
}
