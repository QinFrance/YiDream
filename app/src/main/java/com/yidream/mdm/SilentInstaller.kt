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
 * Downloads only the YiDream APK from its fixed HTTPS Pages URL and verifies
 * the SHA-256 published alongside it before handing it to PackageInstaller.
 */
class SilentInstaller(private val context: Context) {

    sealed class Result {
        object Success : Result()
        data class Failure(val message: String) : Result()
    }

    suspend fun downloadAndInstall(apkUrl: String, expectedSha256: String, expectedVersion: Long): Result = withContext(Dispatchers.IO) {
        if (!DeviceOwnerManager(context).isDeviceOwner()) {
            return@withContext Result.Failure("L’installation depuis YiDream nécessite la configuration administrateur du téléphone.")
        }
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
            connection.useCaches = false
            connection.setRequestProperty("Cache-Control", "no-cache")
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

            PackageSessionInstaller(context).install(tempFile, context.packageName, expectedVersion)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (e: Exception) {
            tempFile.delete()
            Result.Failure(e.message ?: "Erreur inconnue")
        } finally {
            tempFile.delete()
            connection?.disconnect()
        }
    }

}

