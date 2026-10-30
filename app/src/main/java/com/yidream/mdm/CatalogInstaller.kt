package com.yidream.mdm

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.CancellationException
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
                MdmService(context).authorizeDownload(opened, downloadUrl)
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

            PackageSessionInstaller(context).install(tempFile, expectedPackage, app.optLong("version_code", 0L))
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (e: Exception) {
            tempFile.delete()
            SilentInstaller.Result.Failure(e.message ?: "Erreur inconnue")
        } finally {
            tempFile.delete()
            connection?.disconnect()
        }
    }

}

