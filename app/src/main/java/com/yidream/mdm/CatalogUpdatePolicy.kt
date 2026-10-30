package com.yidream.mdm
internal object CatalogUpdatePolicy {
    fun shouldUpdate(installed: Long?, available: Long): Boolean = installed != null && available > 0 && available > installed
    fun isReady(url: String, checksum: String, version: Long): Boolean = url.startsWith("https://") && checksum.matches(Regex("(?i)[a-f0-9]{64}")) && version > 0
}
