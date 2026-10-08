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
 * Downloads only the YiDream APK from its fixed HTTPS Pages URL and verifies
 * the SHA-256 published alongside it before handing it to PackageInstaller.
 */
class SilentInstaller(private val context: Context) {

    sealed class Result {
        object Success : Result()
        data class Failure(val message: String) : Result()
    }

    suspend fun downloadAndInstall(apkUrl: String, expectedSha256: String): Result = withContext(Dispatchers.IO) {
        if (apkUrl != UpdateManager.APPROVED_APK_URL) {
            return@withContext Result.Failure("Source d'installation non autorisée.")
        }
        if (!expectedSha256.matches(Regex("(?i)[0-9a-f]{64}"))) {
            return@withContext Result.Failure("Empreinte de vérification invalide.")
        }

        val tempFile = File(context.cacheDir, "yidream_update.apk")
        var connection: HttpURLConnection? = null
        try {
            connection = URL(apkUrl).openConnection() as HttpURLConnection
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 15000
            connection.readTimeout = 20000
            val response = connection.responseCode
            if (response !in 200..299) {
                return@withContext Result.Failure("Téléchargement refusé (HTTP $response).")
            }

            val digest = MessageDigest.getInstance("SHA-256")
            connection.inputStream.use { input ->
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
                return@withContext Result.Failure("La vérification de l'APK a échoué.")
            }

            installSilently(tempFile).also { tempFile.delete() }
        } catch (e: Exception) {
            tempFile.delete()
            Result.Failure(e.message ?: "Erreur inconnue")
        } finally {
            connection?.disconnect()
        }
    }

    private fun installSilently(apkFile: File): Result {
        return try {
            val packageInstaller = context.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setInstallReason(PackageManager.INSTALL_REASON_POLICY)

            val sessionId = packageInstaller.createSession(params)
            val session = packageInstaller.openSession(sessionId)

            session.openWrite("yidream_update", 0, apkFile.length()).use { out ->
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

            Result.Success
        } catch (e: Exception) {
            Result.Failure(e.message ?: "Échec de l'installation")
        }
    }
}
