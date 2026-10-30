package com.yidream.mdm

import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import java.security.MessageDigest

internal class ApkMetadata(private val manager: PackageManager) {
    @Suppress("DEPRECATION")
    private val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES

    @Suppress("DEPRECATION")
    fun archive(path: String): ApkIdentity? = manager.getPackageArchiveInfo(path, flags)?.let(::identity)

    @Suppress("DEPRECATION")
    fun installed(packageName: String): ApkIdentity? = try {
        identity(manager.getPackageInfo(packageName, flags))
    } catch (_: PackageManager.NameNotFoundException) { null }

    @Suppress("DEPRECATION")
    private fun identity(info: PackageInfo): ApkIdentity {
        val current = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
        val history = if (Build.VERSION.SDK_INT >= 28 && info.signingInfo?.hasMultipleSigners() == false)
            info.signingInfo?.signingCertificateHistory else null
        fun digests(signatures: Array<android.content.pm.Signature>?) = signatures.orEmpty().map {
            MessageDigest.getInstance("SHA-256").digest(it.toByteArray()).joinToString("") { byte -> "%02x".format(byte.toInt() and 255) }
        }.toSet()
        val version = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
        return ApkIdentity(info.packageName, version, digests(current), digests(history))
    }
}
