package com.yidream.mdm

import android.content.Context
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Installe une APK SANS aucune confirmation utilisateur, en s'appuyant sur
 * le fait que YiDream est Device Owner. C'est une capacité réelle et
 * documentée d'Android depuis la version 6 : un Device Owner peut committer
 * une session PackageInstaller sans que le système affiche de popup de
 * confirmation — contrairement à une app normale.
 *
 * Utilisé pour la whitelist d'apps autorisées : ces apps s'installent/se
 * mettent à jour d'un tap, sans jamais lever la restriction générale
 * d'installation (qui reste active en permanence pour tout le reste).
 */
class SilentInstaller(private val context: Context) {

    sealed class Result {
        object Success : Result()
        data class Failure(val message: String) : Result()
    }

    suspend fun downloadAndInstall(apkUrl: String): Result = withContext(Dispatchers.IO) {
        try {
            val tempFile = File(context.cacheDir, "whitelist_install.apk")
            val connection = URL(apkUrl).openConnection() as HttpURLConnection
            connection.connect()
            if (connection.responseCode !in 200..299) {
                return@withContext Result.Failure("Téléchargement échoué (code ${connection.responseCode})")
            }
            connection.inputStream.use { input ->
                tempFile.outputStream().use { output -> input.copyTo(output) }
            }
            connection.disconnect()

            installSilently(tempFile)
        } catch (e: Exception) {
            Result.Failure(e.message ?: "Erreur inconnue")
        }
    }

    private fun installSilently(apkFile: File): Result {
        return try {
            val packageInstaller = context.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setInstallReason(PackageManager.INSTALL_REASON_POLICY)

            val sessionId = packageInstaller.createSession(params)
            val session = packageInstaller.openSession(sessionId)

            session.openWrite("yidream_whitelist_install", 0, apkFile.length()).use { out ->
                apkFile.inputStream().use { input -> input.copyTo(out) }
                session.fsync(out)
            }

            // Device Owner : le commit s'exécute sans popup de confirmation système.
            val intent = android.content.Intent(context, MyDeviceAdminReceiver::class.java)
            val pendingIntent = android.app.PendingIntent.getBroadcast(
                context, sessionId, intent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_MUTABLE
            )
            session.commit(pendingIntent.intentSender)
            session.close()

            Result.Success
        } catch (e: Exception) {
            Result.Failure(e.message ?: "Échec de l'installation silencieuse")
        }
    }
}
