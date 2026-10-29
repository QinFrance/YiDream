package com.yidream.mdm

import android.content.Context
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Installs entries returned by the device catalog API. Verifies HTTPS,
 * the administrator-approved SHA-256 and Android package identity.
 */
class CatalogInstaller(private val context: Context) {



    suspend fun install(app: org.json.JSONObject): SilentInstaller.Result = withContext(Dispatchers.IO) {
        if (!DeviceOwnerManager(context).isDeviceOwner()) return@withContext SilentInstaller.Result.Failure("Configuration MDM requise.")
        val apkUrl = app.getString("apk_url")
        val expectedSha256 = app.getString("sha256")
        val expectedPackage = app.getString("package_name")
        val uri = android.net.Uri.parse(apkUrl)
        if (uri.scheme != "https" || uri.host.isNullOrBlank() || uri.userInfo != null) {
            return@withContext SilentInstaller.Result.Failure("Source d'installation non autorisée.")
        }
        if (!expectedSha256.matches(Regex("(?i)[0-9a-f]{64}"))) {
            return@withContext SilentInstaller.Result.Failure("Empreinte de vérification invalide.")
        }

        val tempFile = File.createTempFile("yidream_catalog_", ".apk", context.cacheDir)
        var connection: HttpURLConnection? = null
        try {
            var downloadUrl = URL(apkUrl)
            var redirects = 0
            while (true) {
                require(downloadUrl.protocol == "https" && downloadUrl.userInfo == null) { "Source HTTPS requise." }
                val opened = downloadUrl.openConnection() as HttpURLConnection
                connection = opened
                opened.instanceFollowRedirects = false
                opened.connectTimeout = 15000
                opened.readTimeout = 20000
                val response = opened.responseCode
                if (response in listOf(301, 302, 303, 307, 308)) {
                    val location = opened.getHeaderField("Location") ?: error("Redirection invalide.")
                    require(++redirects <= 5) { "Trop de redirections." }
                    downloadUrl = URL(downloadUrl, location)
                    opened.disconnect()
                } else {
                    require(response in 200..299) { "Téléchargement refusé (HTTP $response)." }
                    break
                }
            }
            val digest = MessageDigest.getInstance("SHA-256")
            requireNotNull(connection).inputStream.use { input ->
                tempFile.outputStream().use { output ->
                    val buffer = ByteArray(16 * 1024)
                    var totalBytes = 0L
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        totalBytes += count
                        require(totalBytes <= 250L * 1024L * 1024L) { "APK trop volumineux." }
                        digest.update(buffer, 0, count)
                        output.write(buffer, 0, count)
                    }
                }
            }
            val actualSha256 = digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
            if (!actualSha256.equals(expectedSha256, ignoreCase = true)) {
                tempFile.delete()
                return@withContext SilentInstaller.Result.Failure("La vérification de l'APK a échoué.")
            }

            run {
                @Suppress("DEPRECATION")
                val archive = context.packageManager.getPackageArchiveInfo(tempFile.absolutePath, 0)
                require(archive?.packageName == expectedPackage) { "Le paquet ne correspond pas au catalogue." }
                installSilently(tempFile)
            }.also { tempFile.delete() }
        } catch (e: Exception) {
            tempFile.delete()
            SilentInstaller.Result.Failure(e.message ?: "Erreur inconnue")
        } finally {
            connection?.disconnect()
        }
    }

    private fun installSilently(apkFile: File): SilentInstaller.Result {
        return try {
            val packageInstaller = context.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setInstallReason(PackageManager.INSTALL_REASON_POLICY)

            val sessionId = packageInstaller.createSession(params)
            val session = packageInstaller.openSession(sessionId)

            session.openWrite("yidream_catalog", 0, apkFile.length()).use { out ->
                apkFile.inputStream().use { input -> input.copyTo(out) }
                session.fsync(out)
            }

            val intent = android.content.Intent(context, MyDeviceAdminReceiver::class.java)
            val pendingIntent = android.app.PendingIntent.getBroadcast(
                context, sessionId, intent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_MUTABLE
            )
            session.commit(pendingIntent.intentSender)
            session.close()

            SilentInstaller.Result.Success
        } catch (e: Exception) {
            SilentInstaller.Result.Failure(e.message ?: "Échec de l'installation")
        }
    }
}
