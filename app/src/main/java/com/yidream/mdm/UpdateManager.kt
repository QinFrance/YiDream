package com.yidream.mdm

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Vérifie et installe les mises à jour de YiDream lui-même — SILENCIEUSEMENT,
 * via SilentInstaller (capacité Device Owner confirmée, aucune confirmation
 * utilisateur requise, contrairement à ce qu'on pensait au début du projet).
 *
 * The manifest is hosted with the public YiDream Pages site and includes
 * the checksum of the APK produced by the deployment workflow.
 */
class UpdateManager(private val context: Context) {

    data class UpdateInfo(
        val versionCode: Int,
        val versionName: String,
        val apkUrl: String,
        val apkSha256: String,
        val changelog: String
    )

    companion object {
        // À adapter : URL de ton fichier version.json (voir VERSIONING.md)
        const val MANIFEST_URL = "https://qinfrance.github.io/YiDream/version.json"
        const val APPROVED_APK_URL = "https://qinfrance.github.io/YiDream/admin/yidream.apk"
    }

    private val silentInstaller = SilentInstaller(context)

    suspend fun checkForUpdate(): UpdateInfo? = withContext(Dispatchers.IO) {
        try {
            val connection = URL(MANIFEST_URL).openConnection() as HttpURLConnection
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 8000
            connection.readTimeout = 8000
            if (connection.responseCode !in 200..299) {
                connection.disconnect()
                return@withContext null
            }
            val body = connection.inputStream.bufferedReader().readText()
            connection.disconnect()

            val json = JSONObject(body)
            val remoteVersionCode = json.getInt("versionCode")
            val currentVersionCode = context.packageManager
                .getPackageInfo(context.packageName, 0).let {
                    if (android.os.Build.VERSION.SDK_INT >= 28) it.longVersionCode.toInt()
                    else @Suppress("DEPRECATION") it.versionCode
                }

            val apkUrl = json.getString("apkUrl")
            val apkSha256 = json.optString("apkSha256", "")
            if (apkUrl != APPROVED_APK_URL || !apkSha256.matches(Regex("(?i)[0-9a-f]{64}"))) {
                return@withContext null
            }

            if (remoteVersionCode > currentVersionCode) {
                UpdateInfo(
                    versionCode = remoteVersionCode,
                    versionName = json.getString("versionName"),
                    apkUrl = apkUrl,
                    apkSha256 = apkSha256,
                    changelog = json.optString("changelog", "")
                )
            } else null
        } catch (e: Exception) {
            null
        }
    }

    suspend fun installUpdate(update: UpdateInfo): SilentInstaller.Result {
        return silentInstaller.downloadAndInstall(update.apkUrl, update.apkSha256)
    }
}
