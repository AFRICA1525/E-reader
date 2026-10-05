$videoIds = @('0uzIT-woqPk','e2_9PspS438','-FwgqBZ4pzg','NhNSnighWDE','2COP9mhhuFo','1cCErm7m9uI','Adfis0xegGY','J15ZmrZ0eKY','5P1JN5l7saI','ymEk7l1pDXk','Oy8iUj-t0ME','_0wTQlUfyog','PaLsYuio9uA')
$videoResults = foreach ($videoId in $videoIds) {
    try {
        $videoUrl = 'https://www.youtube.com/watch?v=' + $videoId
        $metadataUrl = 'https://www.youtube.com/oembed?format=json&url=' + [uri]::EscapeDataString($videoUrl)
        $metadata = Invoke-RestMethod -Uri $metadataUrl -TimeoutSec 20
        [PSCustomObject]@{id=$videoId; title=$metadata.title; author=$metadata.author_name; url=$videoUrl}
    } catch { [PSCustomObject]@{id=$videoId; error=$_.Exception.Message} }
}
$videoResults | ConvertTo-Json | Set-Content -Encoding utf8 tmp/pdfs/video-metadata.json
$videoResults | Format-Table -AutoSize
